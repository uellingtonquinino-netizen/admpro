import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { SaveDialogOptions, OpenDialogOptions } from 'electron'
import { copyFile, mkdir, unlink } from 'fs/promises'
import { existsSync, unlinkSync } from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { getDb, getDbPath, closeDatabase, initDatabase } from '../database/connection'

function carimboDataHora(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
}

// Nome de obra num formato seguro pra usar em nome de arquivo (sem
// acento, sem caractere especial, sem espaço).
function nomeParaArquivo(nome: string): string {
  return nome
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()
}

// ─────────────────────────────────────────────────────────
// NOVO: backup individual por obra — pra recuperar só os dados de
// UMA obra específica (ex: se ela foi excluída sem querer), sem
// precisar restaurar o banco inteiro por cima do que as OUTRAS
// obras já lançaram desde o último backup completo.
//
// Descobre sozinho, olhando o próprio schema do banco (não uma lista
// fixa no código — se um dia entrar uma tabela nova ligada a
// `empresa_id`, ou uma tabela nova que aponta pra uma tabela já
// ligada a obra, entra automaticamente):
//   - tabelas com coluna empresa_id direto (ex: colaboradores)
//   - tabelas sem empresa_id mas que têm uma FK pra uma tabela que
//     tem (ex: colaboradores_anexos → colaborador_id → colaboradores)
// ─────────────────────────────────────────────────────────
interface TabelaDireta   { tabela: string; tipo: 'direta' }
interface TabelaIndireta { tabela: string; tipo: 'indireta'; colunaFk: string; tabelaAlvo: string }
type TabelaEscopo = TabelaDireta | TabelaIndireta

function mapearEscopoPorObra(db: Database.Database): TabelaEscopo[] {
  const tabelas = (db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).all() as { name: string }[]).map(t => t.name)

  const colunas = new Map<string, string[]>()
  for (const t of tabelas) {
    colunas.set(t, (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map(c => c.name))
  }

  const diretas = new Set(tabelas.filter(t => colunas.get(t)!.includes('empresa_id') && t !== 'empresas'))

  const resultado: TabelaEscopo[] = [...diretas].map(tabela => ({ tabela, tipo: 'direta' }))

  for (const t of tabelas) {
    if (t === 'empresas' || t === 'migrations' || diretas.has(t)) continue
    const fks = db.prepare(`PRAGMA foreign_key_list(${t})`).all() as { from: string; table: string }[]
    const fkParaTabelaDireta = fks.find(fk => diretas.has(fk.table))
    if (fkParaTabelaDireta) {
      resultado.push({ tabela: t, tipo: 'indireta', colunaFk: fkParaTabelaDireta.from, tabelaAlvo: fkParaTabelaDireta.table })
    }
    // Tabelas que sobrarem sem nenhuma FK até uma tabela de obra
    // (ex: usuario_permissoes_extras, que depende de usuarios, que é
    // caso especial tratado à parte) entram na lista especial abaixo.
  }

  return resultado
}

// Ordena as tabelas na ordem certa pra inserir (quem é referenciado
// primeiro, quem referencia depois) — senão a foreign key barra a
// inserção. Baseado nas FKs de verdade do banco, não numa lista fixa.
function ordemDeInsercao(db: Database.Database, tabelas: string[]): string[] {
  const grafo = new Map<string, Set<string>>()
  for (const t of tabelas) grafo.set(t, new Set())
  for (const t of tabelas) {
    const fks = db.prepare(`PRAGMA foreign_key_list(${t})`).all() as { table: string }[]
    for (const fk of fks) {
      if (grafo.has(fk.table) && fk.table !== t) grafo.get(t)!.add(fk.table)
    }
  }
  const ordenado: string[] = []
  const visitado = new Set<string>()
  function visitar(t: string, pilha: Set<string>) {
    if (visitado.has(t) || pilha.has(t)) return  // pilha.has evita loop infinito em referência circular
    pilha.add(t)
    for (const dep of grafo.get(t) ?? []) visitar(dep, pilha)
    pilha.delete(t)
    visitado.add(t)
    ordenado.push(t)
  }
  for (const t of tabelas) visitar(t, new Set())
  return ordenado
}

// `usuarios` é um caso especial: um Supervisor/Setor Pessoal pode
// estar ligado a VÁRIAS obras — o usuário em si pode "morar" (pelo
// empresa_id dele) numa obra diferente da que está sendo
// exportada/restaurada. Por isso ele entra pelas ligações
// (supervisor_obras / usuario_obras) também, não só pelo empresa_id
// direto — e na restauração usa INSERT OR IGNORE (se ele já existe
// no banco de verdade — o caso normal — não mexe nele).
function idsUsuariosDaObra(db: Database.Database, empresaId: number): number[] {
  const ids = new Set<number>()
  for (const row of db.prepare(`SELECT id FROM usuarios WHERE empresa_id = ?`).all(empresaId) as { id: number }[]) {
    ids.add(row.id)
  }
  for (const tabelaLigacao of ['supervisor_obras', 'usuario_obras']) {
    const existe = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`).get(tabelaLigacao))
    if (!existe) continue
    for (const row of db.prepare(`SELECT usuario_id FROM ${tabelaLigacao} WHERE empresa_id = ?`).all(empresaId) as { usuario_id: number }[]) {
      ids.add(row.usuario_id)
    }
  }
  return [...ids]
}

function copiarLinhas(origem: Database.Database, destino: Database.Database, tabela: string, linhas: Record<string, unknown>[]) {
  if (linhas.length === 0) return
  const colunas = Object.keys(linhas[0])
  const placeholders = colunas.map(() => '?').join(', ')
  const inserir = destino.prepare(`INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${placeholders})`)
  for (const linha of linhas) inserir.run(colunas.map(c => linha[c]))
}

// ── Exportação de uma obra específica pra um arquivo .db próprio ──
function exportarBackupDeObra(db: Database.Database, empresaId: number, caminhoDestino: string) {
  const obra = db.prepare(`SELECT * FROM empresas WHERE id = ?`).get(empresaId) as Record<string, unknown> | undefined
  if (!obra) throw new Error('Obra não encontrada.')

  if (existsSync(caminhoDestino)) unlinkSync(caminhoDestino)
  const destino = new Database(caminhoDestino)
  try {
    // Mesmo schema do banco de verdade, sem checagem de FK ligada
    // durante a montagem do arquivo (ela importa é na hora de
    // restaurar, contra o banco ao vivo).
    destino.pragma('foreign_keys = OFF')
    const definicoes = db.prepare(`
      SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('table','index') AND name NOT LIKE 'sqlite_%'
    `).all() as { sql: string }[]
    for (const { sql } of definicoes) destino.exec(sql)

    copiarLinhas(db, destino, 'empresas', [obra])

    const escopo = mapearEscopoPorObra(db)
    const diretas = escopo.filter((e): e is TabelaDireta => e.tipo === 'direta' && e.tabela !== 'usuarios')
    const indiretas = escopo.filter((e): e is TabelaIndireta => e.tipo === 'indireta')

    for (const { tabela } of diretas) {
      const linhas = db.prepare(`SELECT * FROM ${tabela} WHERE empresa_id = ?`).all(empresaId) as Record<string, unknown>[]
      copiarLinhas(db, destino, tabela, linhas)
    }
    for (const { tabela, colunaFk, tabelaAlvo } of indiretas) {
      const linhas = db.prepare(`
        SELECT t.* FROM ${tabela} t JOIN ${tabelaAlvo} a ON t.${colunaFk} = a.id WHERE a.empresa_id = ?
      `).all(empresaId) as Record<string, unknown>[]
      copiarLinhas(db, destino, tabela, linhas)
    }

    // usuarios — caso especial, ver idsUsuariosDaObra acima
    const idsUsuarios = idsUsuariosDaObra(db, empresaId)
    if (idsUsuarios.length > 0) {
      const placeholders = idsUsuarios.map(() => '?').join(',')
      const linhas = db.prepare(`SELECT * FROM usuarios WHERE id IN (${placeholders})`).all(...idsUsuarios) as Record<string, unknown>[]
      copiarLinhas(db, destino, 'usuarios', linhas)
    }
  } finally {
    destino.close()
  }
}

// ── Restauração de uma obra específica, de volta pro banco ao vivo ──
function importarBackupDeObra(db: Database.Database, caminhoOrigem: string) {
  const origem = new Database(caminhoOrigem, { readonly: true, fileMustExist: true })
  try {
    const obra = origem.prepare(`SELECT * FROM empresas`).get() as Record<string, unknown> | undefined
    if (!obra) throw new Error('Esse arquivo não tem os dados de uma obra.')

    const jaExiste = db.prepare(`SELECT id FROM empresas WHERE id = ?`).get(obra.id)
    if (jaExiste) {
      throw new Error(`Já existe uma obra com esse identificador no sistema atual — a restauração é só pra trazer de volta uma obra que foi excluída, não pra sobrepor uma que já existe.`)
    }

    const escopo = mapearEscopoPorObra(db)
    const tabelasOwned = ['empresas', ...escopo.filter(e => e.tabela !== 'usuarios').map(e => e.tabela)]
    const ordem = ordemDeInsercao(db, [...tabelasOwned, 'usuarios'])

    const transacao = db.transaction(() => {
      for (const tabela of ordem) {
        if (!origem.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`).get(tabela)) continue
        const linhas = origem.prepare(`SELECT * FROM ${tabela}`).all() as Record<string, unknown>[]
        if (linhas.length === 0) continue
        const colunas = Object.keys(linhas[0])
        const placeholders = colunas.map(() => '?').join(', ')
        // usuarios pode já existir de verdade (um Supervisor/Setor
        // Pessoal que também cobre outra obra que não foi excluída)
        // — nesse caso não mexe nele, só religa a obra a ele.
        const comando = tabela === 'usuarios'
          ? `INSERT OR IGNORE INTO usuarios (${colunas.join(', ')}) VALUES (${placeholders})`
          : `INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${placeholders})`
        const inserir = db.prepare(comando)
        for (const linha of linhas) inserir.run(colunas.map(c => linha[c]))
      }
    })
    transacao()

    return { nomeObra: String(obra.nome) }
  } finally {
    origem.close()
  }
}

export function registerBackupIpc() {

  // ── Exportar: uma cópia completa e consistente do banco, num
  // arquivo .db que o usuário escolhe onde salvar (HD externo, pasta
  // sincronizada com a nuvem, pendrive etc.) ─────────────────
  ipcMain.handle('backup:exportar', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const opcoesDialogo: SaveDialogOptions = {
      title:       'Exportar backup completo do ADM PRO',
      defaultPath: `admpro-backup-completo-${carimboDataHora()}.db`,
      filters:     [{ name: 'Backup ADM PRO', extensions: ['db'] }],
    }
    const { filePath, canceled } = win
      ? await dialog.showSaveDialog(win, opcoesDialogo)
      : await dialog.showSaveDialog(opcoesDialogo)
    if (canceled || !filePath) return { ok: false, canceled: true }

    // NOVO: db.backup() usa a API de backup do próprio SQLite — cuida
    // sozinho de copiar tudo que ainda só está no WAL (não gravado no
    // arquivo principal ainda), diferente de uma cópia de arquivo
    // simples, que poderia sair incompleta com o programa aberto.
    await getDb().backup(filePath)

    return { ok: true, path: filePath }
  })

  // ── Importar: substitui o banco atual por um arquivo de backup
  // escolhido pelo usuário. Guarda uma cópia de segurança do banco
  // atual antes de sobrescrever, e reabre já rodando as migrations
  // em cima do backup restaurado (cobre o caso de restaurar um
  // backup mais antigo, de antes de alguma atualização do sistema).
  ipcMain.handle('backup:importar', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const opcoesDialogo: OpenDialogOptions = {
      title:      'Selecionar arquivo de backup',
      filters:    [{ name: 'Backup ADM PRO', extensions: ['db'] }],
      properties: ['openFile'],
    }
    const { filePaths, canceled } = win
      ? await dialog.showOpenDialog(win, opcoesDialogo)
      : await dialog.showOpenDialog(opcoesDialogo)
    if (canceled || filePaths.length === 0) return { ok: false, canceled: true }
    const origem = filePaths[0]

    // Validação simples — evita restaurar por engano um arquivo que
    // não é um backup de verdade do sistema.
    try {
      const teste = new Database(origem, { readonly: true, fileMustExist: true })
      const tabelas = teste.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]
      teste.close()
      const nomes = new Set(tabelas.map(t => t.name))
      if (!nomes.has('empresas') || !nomes.has('usuarios') || !nomes.has('colaboradores')) {
        return { ok: false, erro: 'Esse arquivo não parece ser um backup do ADM PRO — faltam tabelas essenciais do sistema.' }
      }
    } catch {
      return { ok: false, erro: 'Não foi possível abrir esse arquivo. Confira se é mesmo um backup do ADM PRO (.db) e se não está corrompido.' }
    }

    const dbPath = getDbPath()

    // Cópia de segurança do banco atual, antes de sobrescrever —
    // se algo der errado na restauração, dá pra voltar a partir dela.
    const pastaSeguranca = path.join(path.dirname(dbPath), 'backups-automaticos')
    if (!existsSync(pastaSeguranca)) await mkdir(pastaSeguranca, { recursive: true })
    if (existsSync(dbPath)) {
      await copyFile(dbPath, path.join(pastaSeguranca, `antes-de-restaurar-${carimboDataHora()}.db`))
    }

    closeDatabase()
    await copyFile(origem, dbPath)
    // Os arquivos de WAL/SHM do banco anterior não valem mais depois
    // da troca — remove pra não conflitar com o arquivo restaurado.
    for (const sufixo of ['-wal', '-shm']) {
      const caminho = dbPath + sufixo
      if (existsSync(caminho)) await unlink(caminho).catch(() => {})
    }
    initDatabase()

    return { ok: true }
  })

  // ── NOVO: backup de uma obra específica ──────────────────
  ipcMain.handle('backup:exportarObra', async (_e, empresaId: number) => {
    const db = getDb()
    const obra = db.prepare(`SELECT nome FROM empresas WHERE id = ?`).get(empresaId) as { nome: string } | undefined
    if (!obra) return { ok: false, erro: 'Obra não encontrada.' }

    const win = BrowserWindow.getFocusedWindow()
    const opcoesDialogo: SaveDialogOptions = {
      title:       'Exportar backup desta obra',
      defaultPath: `admpro-backup-obra-${nomeParaArquivo(obra.nome)}-${carimboDataHora()}.db`,
      filters:     [{ name: 'Backup de obra — ADM PRO', extensions: ['db'] }],
    }
    const { filePath, canceled } = win
      ? await dialog.showSaveDialog(win, opcoesDialogo)
      : await dialog.showSaveDialog(opcoesDialogo)
    if (canceled || !filePath) return { ok: false, canceled: true }

    try {
      exportarBackupDeObra(db, empresaId, filePath)
      return { ok: true, path: filePath }
    } catch (err) {
      return { ok: false, erro: err instanceof Error ? err.message : 'Erro ao exportar o backup da obra.' }
    }
  })

  // ── NOVO: restaurar uma obra específica (ex: excluída sem querer) ──
  ipcMain.handle('backup:importarObra', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const opcoesDialogo: OpenDialogOptions = {
      title:      'Selecionar arquivo de backup de obra',
      filters:    [{ name: 'Backup de obra — ADM PRO', extensions: ['db'] }],
      properties: ['openFile'],
    }
    const { filePaths, canceled } = win
      ? await dialog.showOpenDialog(win, opcoesDialogo)
      : await dialog.showOpenDialog(opcoesDialogo)
    if (canceled || filePaths.length === 0) return { ok: false, canceled: true }

    try {
      const resultado = importarBackupDeObra(getDb(), filePaths[0])
      return { ok: true, nomeObra: resultado.nomeObra }
    } catch (err) {
      return { ok: false, erro: err instanceof Error ? err.message : 'Erro ao restaurar o backup da obra.' }
    }
  })
}
