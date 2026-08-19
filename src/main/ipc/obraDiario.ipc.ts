import { ipcMain, dialog } from 'electron'
import { basename }        from 'path'
import { getDb }           from '../database/connection'
import { getDatabaseProvider, getSupabase } from '../supabase/client'
import { uploadDocumento, isStorageUri } from '../supabase/storage'

// NOVO: Diário de Obra (RDO) — cabeçalho do dia (clima, mão de obra,
// ocorrências) + atividades lançadas naquele dia (item da EAP +
// quanto avançou HOJE + fotos). Restrito a Gestor/Master (RLS já
// garante isso no banco — aqui só implementa o CRUD).

interface FotoPayload {
  caminho:  string // caminho LOCAL (novo, precisa subir) ou já supabase:// (existente, mantém)
  legenda:  string | null
}
interface AtividadePayload {
  eap_item_id:           number
  percentual_incremento: number
  observacao:            string | null
  fotos:                 FotoPayload[]
}
interface DiarioPayload {
  id?:                   number
  empresa_id:            number
  data:                  string // 'AAAA-MM-DD'
  clima:                 string | null
  condicao_trabalho:     string | null
  mao_de_obra_presente:  string | null
  ocorrencias:           string | null
  criado_por:            string | null
  criado_por_usuario_id: number | null
  atividades:            AtividadePayload[]
}

// URL temporária pra visualizar uma foto — direto pela API do
// Supabase (bucket privado, precisa de URL assinada com validade).
function registerUrlFoto() {
  ipcMain.handle('obraDiario:urlFoto', async (_e, caminho: string) => {
    if (!isStorageUri(caminho)) return caminho // já é um caminho local, devolve como está
    const semPrefixo = caminho.replace(/^supabase:\/\//, '')
    const { data, error } = await getSupabase().storage.from('documentos-rh').createSignedUrl(semPrefixo, 3600)
    if (error) throw new Error(error.message)
    return data.signedUrl
  })
}

export function registerObraDiarioIpc() {
  registerSelecionarFotos()
  registerUrlFoto()
  if (getDatabaseProvider() === 'supabase') {
    registerSupabase()
    return
  }
  registerSqlite()
}

// Diálogo nativo de seleção de fotos — igual pros dois provedores,
// não mexe em banco nenhum.
function registerSelecionarFotos() {
  ipcMain.handle('obraDiario:selecionarFotos', async () => {
    const resultado = await dialog.showOpenDialog({
      title: 'Selecionar fotos',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic'] }],
    })
    if (resultado.canceled) return []
    return resultado.filePaths
  })
}

async function subirFotosNovas(empresaId: number, diarioId: number, atividadeIndex: number, fotos: FotoPayload[]) {
  const resultado: FotoPayload[] = []
  for (const foto of fotos) {
    if (isStorageUri(foto.caminho)) { resultado.push(foto); continue }
    const remoto = `${empresaId}/diario-obra/${diarioId}/${atividadeIndex}/${Date.now()}-${basename(foto.caminho).replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const caminho = await uploadDocumento(foto.caminho, remoto)
    resultado.push({ caminho, legenda: foto.legenda })
  }
  return resultado
}

// ── SQLite (fallback local/dev) ──────────────────────────
function registerSqlite() {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS obra_diarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      data TEXT NOT NULL,
      clima TEXT, condicao_trabalho TEXT, mao_de_obra_presente TEXT, ocorrencias TEXT,
      criado_por TEXT, criado_por_usuario_id INTEGER,
      UNIQUE(empresa_id, data)
    );
    CREATE TABLE IF NOT EXISTS obra_diario_atividades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      diario_id INTEGER NOT NULL,
      eap_item_id INTEGER NOT NULL,
      percentual_incremento REAL NOT NULL DEFAULT 0,
      observacao TEXT
    );
    CREATE TABLE IF NOT EXISTS obra_diario_fotos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      atividade_id INTEGER NOT NULL,
      caminho TEXT NOT NULL,
      legenda TEXT
    );
  `)

  ipcMain.handle('obraDiario:listar', (_e, empresa_id: number) => {
    const diarios = db.prepare(`SELECT * FROM obra_diarios WHERE empresa_id = ? ORDER BY data DESC`).all(empresa_id) as any[]
    return diarios.map(d => ({
      ...d,
      quantidade_atividades: (db.prepare(`SELECT COUNT(*) as n FROM obra_diario_atividades WHERE diario_id = ?`).get(d.id) as any).n,
    }))
  })

  function buscarCompleto(diario: any) {
    if (!diario) return null
    const atividades = db.prepare(`SELECT * FROM obra_diario_atividades WHERE diario_id = ?`).all(diario.id) as any[]
    return {
      ...diario,
      atividades: atividades.map(a => ({
        ...a,
        fotos: db.prepare(`SELECT * FROM obra_diario_fotos WHERE atividade_id = ?`).all(a.id),
      })),
    }
  }

  ipcMain.handle('obraDiario:buscarPorData', (_e, p: { empresa_id: number; data: string }) => {
    const diario = db.prepare(`SELECT * FROM obra_diarios WHERE empresa_id = ? AND data = ?`).get(p.empresa_id, p.data)
    return buscarCompleto(diario)
  })

  ipcMain.handle('obraDiario:buscarPorId', (_e, id: number) => {
    const diario = db.prepare(`SELECT * FROM obra_diarios WHERE id = ?`).get(id)
    return buscarCompleto(diario)
  })

  ipcMain.handle('obraDiario:percentuaisAcumulados', (_e, empresa_id: number) => {
    const linhas = db.prepare(`
      SELECT a.eap_item_id, SUM(a.percentual_incremento) as total
      FROM obra_diario_atividades a
      JOIN obra_diarios d ON d.id = a.diario_id
      WHERE d.empresa_id = ?
      GROUP BY a.eap_item_id
    `).all(empresa_id) as { eap_item_id: number; total: number }[]
    return Object.fromEntries(linhas.map(l => [l.eap_item_id, l.total]))
  })

  // NOVO: todos os lançamentos com a data — usado pra montar a curva
  // de avanço ao longo do tempo (não precisa de fotos/observação
  // aqui, só o essencial pro cálculo).
  ipcMain.handle('obraDiario:todasAtividades', (_e, empresa_id: number) => {
    return db.prepare(`
      SELECT d.data, a.eap_item_id, a.percentual_incremento
      FROM obra_diario_atividades a
      JOIN obra_diarios d ON d.id = a.diario_id
      WHERE d.empresa_id = ?
      ORDER BY d.data ASC
    `).all(empresa_id)
  })

  ipcMain.handle('obraDiario:salvar', async (_e, p: DiarioPayload) => {
    let diarioId = p.id
    if (diarioId) {
      db.prepare(`
        UPDATE obra_diarios SET clima=@clima, condicao_trabalho=@condicao_trabalho,
          mao_de_obra_presente=@mao_de_obra_presente, ocorrencias=@ocorrencias
        WHERE id=@id
      `).run({ ...p, id: diarioId })
      db.prepare(`DELETE FROM obra_diario_atividades WHERE diario_id = ?`).run(diarioId)
    } else {
      const r = db.prepare(`
        INSERT INTO obra_diarios (empresa_id, data, clima, condicao_trabalho, mao_de_obra_presente, ocorrencias, criado_por, criado_por_usuario_id)
        VALUES (@empresa_id, @data, @clima, @condicao_trabalho, @mao_de_obra_presente, @ocorrencias, @criado_por, @criado_por_usuario_id)
      `).run(p)
      diarioId = Number(r.lastInsertRowid)
    }

    if (diarioId === undefined) throw new Error('Erro interno: diário sem id definido.')

    for (let i = 0; i < p.atividades.length; i++) {
      const ativ = p.atividades[i]
      const r = db.prepare(`
        INSERT INTO obra_diario_atividades (diario_id, eap_item_id, percentual_incremento, observacao)
        VALUES (?, ?, ?, ?)
      `).run(diarioId, ativ.eap_item_id, ativ.percentual_incremento, ativ.observacao)
      const atividadeId = Number(r.lastInsertRowid)

      const fotosProntas = await subirFotosNovas(p.empresa_id, diarioId, i, ativ.fotos)
      for (const foto of fotosProntas) {
        db.prepare(`INSERT INTO obra_diario_fotos (atividade_id, caminho, legenda) VALUES (?, ?, ?)`)
          .run(atividadeId, foto.caminho, foto.legenda)
      }
    }
    return { id: diarioId }
  })

  ipcMain.handle('obraDiario:excluir', (_e, id: number) => {
    const atividades = db.prepare(`SELECT id FROM obra_diario_atividades WHERE diario_id = ?`).all(id) as { id: number }[]
    for (const a of atividades) db.prepare(`DELETE FROM obra_diario_fotos WHERE atividade_id = ?`).run(a.id)
    db.prepare(`DELETE FROM obra_diario_atividades WHERE diario_id = ?`).run(id)
    db.prepare(`DELETE FROM obra_diarios WHERE id = ?`).run(id)
    return { ok: true }
  })
}

// ── Supabase (produção) ──────────────────────────────────
function registerSupabase() {
  ipcMain.handle('obraDiario:listar', async (_e, empresa_id: number) => {
    const s = getSupabase()
    const { data: diarios, error } = await s.from('obra_diarios').select('*').eq('empresa_id', empresa_id).order('data', { ascending: false })
    if (error) throw new Error(error.message)
    const resultado = []
    for (const d of diarios ?? []) {
      const { count } = await s.from('obra_diario_atividades').select('id', { count: 'exact', head: true }).eq('diario_id', d.id)
      resultado.push({ ...d, quantidade_atividades: count ?? 0 })
    }
    return resultado
  })

  async function buscarCompleto(s: ReturnType<typeof getSupabase>, diario: any) {
    if (!diario) return null
    const { data: atividades, error } = await s.from('obra_diario_atividades').select('*').eq('diario_id', diario.id)
    if (error) throw new Error(error.message)
    const comFotos = []
    for (const a of atividades ?? []) {
      const { data: fotos, error: e2 } = await s.from('obra_diario_fotos').select('*').eq('atividade_id', a.id)
      if (e2) throw new Error(e2.message)
      comFotos.push({ ...a, fotos: fotos ?? [] })
    }
    return { ...diario, atividades: comFotos }
  }

  ipcMain.handle('obraDiario:buscarPorData', async (_e, p: { empresa_id: number; data: string }) => {
    const s = getSupabase()
    const { data: diario, error } = await s.from('obra_diarios').select('*').eq('empresa_id', p.empresa_id).eq('data', p.data).maybeSingle()
    if (error) throw new Error(error.message)
    return buscarCompleto(s, diario)
  })

  ipcMain.handle('obraDiario:buscarPorId', async (_e, id: number) => {
    const s = getSupabase()
    const { data: diario, error } = await s.from('obra_diarios').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    return buscarCompleto(s, diario)
  })

  ipcMain.handle('obraDiario:percentuaisAcumulados', async (_e, empresa_id: number) => {
    const s = getSupabase()
    const { data: diarios, error } = await s.from('obra_diarios').select('id').eq('empresa_id', empresa_id)
    if (error) throw new Error(error.message)
    const diarioIds = (diarios ?? []).map(d => d.id)
    if (diarioIds.length === 0) return {}
    const { data: atividades, error: e2 } = await s.from('obra_diario_atividades').select('eap_item_id,percentual_incremento').in('diario_id', diarioIds)
    if (e2) throw new Error(e2.message)
    const totais: Record<number, number> = {}
    for (const a of atividades ?? []) totais[a.eap_item_id] = (totais[a.eap_item_id] ?? 0) + Number(a.percentual_incremento)
    return totais
  })

  // NOVO: todos os lançamentos com a data — usado pra montar a curva
  // de avanço ao longo do tempo.
  ipcMain.handle('obraDiario:todasAtividades', async (_e, empresa_id: number) => {
    const s = getSupabase()
    const { data: diarios, error } = await s.from('obra_diarios').select('id,data').eq('empresa_id', empresa_id).order('data')
    if (error) throw new Error(error.message)
    const dataPorDiarioId = new Map((diarios ?? []).map(d => [d.id, d.data]))
    const diarioIds = [...dataPorDiarioId.keys()]
    if (diarioIds.length === 0) return []
    const { data: atividades, error: e2 } = await s.from('obra_diario_atividades')
      .select('diario_id,eap_item_id,percentual_incremento').in('diario_id', diarioIds)
    if (e2) throw new Error(e2.message)
    return (atividades ?? []).map(a => ({
      data: dataPorDiarioId.get(a.diario_id), eap_item_id: a.eap_item_id, percentual_incremento: a.percentual_incremento,
    }))
  })

  ipcMain.handle('obraDiario:salvar', async (_e, p: DiarioPayload) => {
    const s = getSupabase()
    let diarioId = p.id

    if (diarioId) {
      const { error } = await s.from('obra_diarios').update({
        clima: p.clima, condicao_trabalho: p.condicao_trabalho,
        mao_de_obra_presente: p.mao_de_obra_presente, ocorrencias: p.ocorrencias,
        updated_at: new Date().toISOString(),
      }).eq('id', diarioId)
      if (error) throw new Error(error.message)
      const { error: e2 } = await s.from('obra_diario_atividades').delete().eq('diario_id', diarioId)
      if (e2) throw new Error(e2.message)
    } else {
      const { data: novo, error } = await s.from('obra_diarios').insert({
        empresa_id: p.empresa_id, data: p.data, clima: p.clima, condicao_trabalho: p.condicao_trabalho,
        mao_de_obra_presente: p.mao_de_obra_presente, ocorrencias: p.ocorrencias,
        criado_por: p.criado_por, criado_por_usuario_id: p.criado_por_usuario_id,
      }).select('id').single()
      if (error) throw new Error(error.message)
      diarioId = novo.id
    }

    // CORRIGIDO: mesmo com diarioId sempre preenchido nos dois ramos
    // acima, o TypeScript (com o tsconfig mais rígido do processo
    // principal) não conseguia garantir isso sozinho depois do loop
    // com await — essa checagem explícita resolve o erro de
    // compilação sem precisar de "as number"/"!".
    if (diarioId === undefined) throw new Error('Erro interno: diário sem id definido.')

    for (let i = 0; i < p.atividades.length; i++) {
      const ativ = p.atividades[i]
      const { data: novaAtividade, error } = await s.from('obra_diario_atividades').insert({
        diario_id: diarioId, eap_item_id: ativ.eap_item_id,
        percentual_incremento: ativ.percentual_incremento, observacao: ativ.observacao,
      }).select('id').single()
      if (error) throw new Error(error.message)

      const fotosProntas = await subirFotosNovas(p.empresa_id, diarioId, i, ativ.fotos)
      if (fotosProntas.length) {
        const { error: e2 } = await s.from('obra_diario_fotos').insert(
          fotosProntas.map(f => ({ atividade_id: novaAtividade.id, caminho: f.caminho, legenda: f.legenda }))
        )
        if (e2) throw new Error(e2.message)
      }
    }
    return { id: diarioId }
  })

  ipcMain.handle('obraDiario:excluir', async (_e, id: number) => {
    const { error } = await getSupabase().from('obra_diarios').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })
}
