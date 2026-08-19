import { ipcMain, dialog, app } from 'electron'
import { join }                from 'path'
import ExcelJS                  from 'exceljs'
// ALTERADO: antes usava pdf-parse (só texto solto, sem posição na
// página) — trocado por pdf.js-extract, que devolve cada trecho de
// texto com a posição (x, y) exata na página. É isso que permite
// achar cada coluna pelo RÓTULO dela (ex: "H.E.1") em vez de um
// índice fixo — o índice fixo é exatamente o que causava o erro
// relatado (um colaborador com mais colunas que os outros, tipo o
// vigia, desalinhava tudo silenciosamente).
// CORRIGIDO: essa biblioteca é ESM (formato novo de módulo JS) — o
// processo principal do Electron usa CommonJS (formato antigo). O
// arquivo de compatibilidade dela com CommonJS exporta uma PROMISE
// (não a classe direto) — é assim que ela mesma resolve internamente
// o formato novo. TESTEI diretamente (fora do TypeScript, e depois
// simulando exatamente como o TypeScript compila isso) até achar o
// jeito que funciona de verdade: `require()` normal (não `import()`
// dinâmico — o `import()` compilado pelo TypeScript passa por uma
// camada extra que reintroduz o mesmo erro) e um `await` no
// resultado, que já entrega a classe pronta.
async function carregarPDFExtract() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const modulo = require('pdf.js-extract')
  const Classe = await modulo
  return Classe as { new(): { extract(caminho: string, opcoes: unknown): Promise<{ pages: unknown[] }> } }
}
import { getDb }               from '../database/connection'
import { getDatabaseProvider, getSupabase } from '../supabase/client'

// NOVO: Folha de Pagamento (Recursos Humanos) — o ADM preenche um
// painel parecido com a planilha Excel que a empresa já usa hoje
// ("RELAÇÃO DE VALORES PARA FOLHA DE PAGAMENTO") pra depois exportar
// num arquivo que o programa de folha deles já sabe importar. A
// exportação usa o MODELO de verdade (resources/modelo-folha-pagamento.xlsx,
// convertido do .xls original sem perder nada) e só injeta os valores
// nas células certas — preserva 100% da formatação original (negrito,
// bordas, cor), ao contrário de montar a planilha do zero.
// Uma folha é sempre de UM mês/ano (competência), com um item por
// colaborador ativo daquela obra.

interface ItemFolha {
  colaborador_id:    number | null
  colaborador_nome:  string
  matricula_esocial: string | null
  h_premio:          number | null
  producao:          number | null
  vale_transporte:   number | null
  insalubridade:     number | null
  periculosidade:    number | null
  adc_noturno:       number | null
  he_50:             number | null
  he_80:             number | null
  he_100:            number | null
  he_110:            number | null
  atrasos:           number | null
  faltas:            number | null
  outros_eventos:    number | null
}

interface CriarPayload {
  empresa_id:      number
  mes_competencia: string // 'AAAA-MM-01'
  criado_por:      string | null
  itens:           ItemFolha[]
}

interface AtualizarPayload {
  id:              number
  mes_competencia: string
  itens:           ItemFolha[]
}

const CAMPOS_ITEM: (keyof ItemFolha)[] = [
  'h_premio', 'producao', 'vale_transporte', 'insalubridade', 'periculosidade',
  'adc_noturno', 'he_50', 'he_80', 'he_100', 'he_110', 'atrasos', 'faltas', 'outros_eventos',
]

function normalizarItem(i: ItemFolha): ItemFolha {
  const norm = { ...i }
  for (const campo of CAMPOS_ITEM) {
    const v = norm[campo]
    ;(norm[campo] as number | null) = v === null || v === undefined || (v as unknown as string) === '' ? null : Number(v)
  }
  return norm
}

export function registerFolhaPagamentoIpc() {
  registerImportacaoEspelhoPonto()
  if (getDatabaseProvider() === 'supabase') {
    registerSupabase()
    return
  }
  registerSqlite()
}

// ── SQLite (fallback local/dev) ──────────────────────────
function registerSqlite() {
  const db = getDb()

  // Cria as tabelas na primeira vez que o app roda em modo local —
  // não depende de mexer no arquivo central de migrations.
  db.exec(`
    CREATE TABLE IF NOT EXISTS folhas_pagamento (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      mes_competencia TEXT NOT NULL,
      criado_por TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS folhas_pagamento_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folha_id INTEGER NOT NULL,
      colaborador_id INTEGER,
      ordem INTEGER NOT NULL DEFAULT 0,
      colaborador_nome TEXT NOT NULL,
      matricula_esocial TEXT,
      h_premio REAL, producao REAL, vale_transporte REAL, insalubridade REAL,
      periculosidade REAL, adc_noturno REAL, he_50 REAL, he_80 REAL, he_100 REAL,
      he_110 REAL, atrasos REAL, faltas REAL, outros_eventos REAL
    );
  `)

  ipcMain.handle('folhaPagamento:colaboradoresAtivos', (_e, empresa_id: number) => {
    return db.prepare(`
      SELECT id, nome, matricula_esocial, cpf, salario_base FROM colaboradores
      WHERE empresa_id = ? AND status = 'ativo' ORDER BY nome COLLATE NOCASE ASC
    `).all(empresa_id)
  })

  ipcMain.handle('folhaPagamento:listar', (_e, empresa_id: number) => {
    return db.prepare(`
      SELECT id, mes_competencia, criado_por, created_at FROM folhas_pagamento
      WHERE empresa_id = ? ORDER BY mes_competencia DESC
    `).all(empresa_id)
  })

  ipcMain.handle('folhaPagamento:buscarPorId', (_e, id: number) => {
    const folha = db.prepare(`SELECT * FROM folhas_pagamento WHERE id = ?`).get(id)
    if (!folha) return null
    const itens = db.prepare(`
      SELECT * FROM folhas_pagamento_itens WHERE folha_id = ? ORDER BY ordem ASC
    `).all(id)
    return { ...folha, itens }
  })

  // NOVO: usado no card "Total Aproximado da Folha" (Início e Painel
  // do Supervisor) — acha a folha salva daquele mês/ano (se existir)
  // já com o salário-base de cada colaborador junto, pra calcular o
  // valor total sem precisar de mais uma ida e volta. Busca o
  // salário DIRETO na tabela de colaboradores (não só nos ativos) —
  // uma folha de um mês passado continua precisando do salário de
  // alguém que já foi desligado depois.
  ipcMain.handle('folhaPagamento:buscarPorCompetencia', (_e, p: { empresa_id: number; mes_competencia: string }) => {
    const folha = db.prepare(`
      SELECT * FROM folhas_pagamento WHERE empresa_id = ? AND mes_competencia = ?
    `).get(p.empresa_id, p.mes_competencia)
    if (!folha) return null
    const itens = db.prepare(`
      SELECT * FROM folhas_pagamento_itens WHERE folha_id = ? ORDER BY ordem ASC
    `).all((folha as any).id) as any[]
    const ids = itens.map(i => i.colaborador_id).filter((id): id is number => id !== null)
    const salarios = ids.length
      ? db.prepare(`SELECT id, salario_base FROM colaboradores WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as { id: number; salario_base: number }[]
      : []
    const salarioPorId = new Map(salarios.map(s => [s.id, s.salario_base]))
    return {
      ...(folha as any),
      itens: itens.map(i => ({ ...i, salario_base: i.colaborador_id ? salarioPorId.get(i.colaborador_id) ?? null : null })),
    }
  })

  ipcMain.handle('folhaPagamento:criar', (_e, p: CriarPayload) => {
    const inserir = db.transaction(() => {
      const r = db.prepare(`
        INSERT INTO folhas_pagamento (empresa_id, mes_competencia, criado_por)
        VALUES (?, ?, ?)
      `).run(p.empresa_id, p.mes_competencia, p.criado_por)
      const folhaId = r.lastInsertRowid
      const inserirItem = db.prepare(`
        INSERT INTO folhas_pagamento_itens (
          folha_id, colaborador_id, ordem, colaborador_nome, matricula_esocial,
          h_premio, producao, vale_transporte, insalubridade, periculosidade,
          adc_noturno, he_50, he_80, he_100, he_110, atrasos, faltas, outros_eventos
        ) VALUES (@folha_id, @colaborador_id, @ordem, @colaborador_nome, @matricula_esocial,
          @h_premio, @producao, @vale_transporte, @insalubridade, @periculosidade,
          @adc_noturno, @he_50, @he_80, @he_100, @he_110, @atrasos, @faltas, @outros_eventos)
      `)
      p.itens.forEach((item, ordem) => {
        const n = normalizarItem(item)
        inserirItem.run({ folha_id: folhaId, ordem, ...n })
      })
      return folhaId
    })
    const id = inserir()
    return { id }
  })

  ipcMain.handle('folhaPagamento:atualizar', (_e, p: AtualizarPayload) => {
    const atualizar = db.transaction(() => {
      db.prepare(`UPDATE folhas_pagamento SET mes_competencia = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(p.mes_competencia, p.id)
      db.prepare(`DELETE FROM folhas_pagamento_itens WHERE folha_id = ?`).run(p.id)
      const inserirItem = db.prepare(`
        INSERT INTO folhas_pagamento_itens (
          folha_id, colaborador_id, ordem, colaborador_nome, matricula_esocial,
          h_premio, producao, vale_transporte, insalubridade, periculosidade,
          adc_noturno, he_50, he_80, he_100, he_110, atrasos, faltas, outros_eventos
        ) VALUES (@folha_id, @colaborador_id, @ordem, @colaborador_nome, @matricula_esocial,
          @h_premio, @producao, @vale_transporte, @insalubridade, @periculosidade,
          @adc_noturno, @he_50, @he_80, @he_100, @he_110, @atrasos, @faltas, @outros_eventos)
      `)
      p.itens.forEach((item, ordem) => {
        const n = normalizarItem(item)
        inserirItem.run({ folha_id: p.id, ordem, ...n })
      })
    })
    atualizar()
    return { ok: true }
  })

  ipcMain.handle('folhaPagamento:excluir', (_e, id: number) => {
    db.prepare(`DELETE FROM folhas_pagamento WHERE id = ?`).run(id)
    return { ok: true }
  })

  ipcMain.handle('folhaPagamento:exportarExcel', async (_e, id: number) => {
    const folha = db.prepare(`SELECT * FROM folhas_pagamento WHERE id = ?`).get(id) as any
    if (!folha) return { ok: false, erro: 'Folha não encontrada.' }
    const itens = db.prepare(`SELECT * FROM folhas_pagamento_itens WHERE folha_id = ? ORDER BY ordem ASC`).all(id)
    const empresa = db.prepare(`SELECT * FROM empresas WHERE id = ?`).get(folha.empresa_id) as any
    return exportar(folha, empresa, itens)
  })
}

// ── Supabase (produção) ──────────────────────────────────
function registerSupabase() {
  ipcMain.handle('folhaPagamento:colaboradoresAtivos', async (_e, empresa_id: number) => {
    const { data, error } = await getSupabase()
      .from('colaboradores').select('id,nome,matricula_esocial,cpf,salario_base')
      .eq('empresa_id', empresa_id).eq('status', 'ativo').order('nome')
    if (error) throw new Error(error.message)
    return data ?? []
  })

  ipcMain.handle('folhaPagamento:listar', async (_e, empresa_id: number) => {
    const { data, error } = await getSupabase()
      .from('folhas_pagamento').select('id,mes_competencia,criado_por,created_at')
      .eq('empresa_id', empresa_id).order('mes_competencia', { ascending: false })
    if (error) throw new Error(error.message)
    return data ?? []
  })

  ipcMain.handle('folhaPagamento:buscarPorId', async (_e, id: number) => {
    const s = getSupabase()
    const [{ data: folha, error: e1 }, { data: itens, error: e2 }] = await Promise.all([
      s.from('folhas_pagamento').select('*').eq('id', id).maybeSingle(),
      s.from('folhas_pagamento_itens').select('*').eq('folha_id', id).order('ordem'),
    ])
    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)
    if (!folha) return null
    return { ...folha, itens: itens ?? [] }
  })

  // NOVO: usado no card "Total Aproximado da Folha" (Início e Painel
  // do Supervisor) — acha a folha salva daquele mês/ano (se existir)
  // já com o salário-base de cada colaborador junto. Busca o salário
  // DIRETO na tabela de colaboradores (não filtra por ativo) — uma
  // folha de um mês passado continua precisando do salário de alguém
  // que já foi desligado depois.
  ipcMain.handle('folhaPagamento:buscarPorCompetencia', async (_e, p: { empresa_id: number; mes_competencia: string }) => {
    const s = getSupabase()
    const { data: folha, error: e1 } = await s.from('folhas_pagamento')
      .select('*').eq('empresa_id', p.empresa_id).eq('mes_competencia', p.mes_competencia).maybeSingle()
    if (e1) throw new Error(e1.message)
    if (!folha) return null

    const { data: itens, error: e2 } = await s.from('folhas_pagamento_itens')
      .select('*').eq('folha_id', folha.id).order('ordem')
    if (e2) throw new Error(e2.message)

    const ids = (itens ?? []).map(i => i.colaborador_id).filter((id): id is number => id !== null)
    let salarioPorId = new Map<number, number>()
    if (ids.length) {
      const { data: colaboradores, error: e3 } = await s.from('colaboradores').select('id,salario_base').in('id', ids)
      if (e3) throw new Error(e3.message)
      salarioPorId = new Map((colaboradores ?? []).map(c => [c.id, c.salario_base]))
    }

    return {
      ...folha,
      itens: (itens ?? []).map(i => ({ ...i, salario_base: i.colaborador_id ? salarioPorId.get(i.colaborador_id) ?? null : null })),
    }
  })

  ipcMain.handle('folhaPagamento:criar', async (_e, p: CriarPayload) => {
    const s = getSupabase()
    const { data: folha, error: e1 } = await s.from('folhas_pagamento')
      .insert({ empresa_id: p.empresa_id, mes_competencia: p.mes_competencia, criado_por: p.criado_por })
      .select('id').single()
    if (e1) throw new Error(e1.message)
    if (p.itens.length) {
      const linhas = p.itens.map((item, ordem) => ({ folha_id: folha.id, ordem, ...normalizarItem(item) }))
      const { error: e2 } = await s.from('folhas_pagamento_itens').insert(linhas)
      if (e2) throw new Error(e2.message)
    }
    return { id: folha.id }
  })

  ipcMain.handle('folhaPagamento:atualizar', async (_e, p: AtualizarPayload) => {
    const s = getSupabase()
    const { error: e1 } = await s.from('folhas_pagamento')
      .update({ mes_competencia: p.mes_competencia, updated_at: new Date().toISOString() }).eq('id', p.id)
    if (e1) throw new Error(e1.message)
    const { error: e2 } = await s.from('folhas_pagamento_itens').delete().eq('folha_id', p.id)
    if (e2) throw new Error(e2.message)
    if (p.itens.length) {
      const linhas = p.itens.map((item, ordem) => ({ folha_id: p.id, ordem, ...normalizarItem(item) }))
      const { error: e3 } = await s.from('folhas_pagamento_itens').insert(linhas)
      if (e3) throw new Error(e3.message)
    }
    return { ok: true }
  })

  ipcMain.handle('folhaPagamento:excluir', async (_e, id: number) => {
    const { error } = await getSupabase().from('folhas_pagamento').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

  ipcMain.handle('folhaPagamento:exportarExcel', async (_e, id: number) => {
    const s = getSupabase()
    const { data: folha, error: e1 } = await s.from('folhas_pagamento').select('*').eq('id', id).maybeSingle()
    if (e1) throw new Error(e1.message)
    if (!folha) return { ok: false, erro: 'Folha não encontrada.' }
    const { data: itens, error: e2 } = await s.from('folhas_pagamento_itens').select('*').eq('folha_id', id).order('ordem')
    if (e2) throw new Error(e2.message)
    const { data: empresa, error: e3 } = await s.from('empresas').select('*').eq('id', folha.empresa_id).maybeSingle()
    if (e3) throw new Error(e3.message)
    return exportar(folha, empresa, itens ?? [])
  })
}

// Onde fica o modelo — mesmo padrão já usado em templates.ipc.ts pra
// achar arquivo empacotado dentro do .exe (electron-builder.yml já
// copia a pasta resources/ pra dentro do instalador).
function caminhoModelo(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', 'modelo-folha-pagamento.xlsx')
    : join(process.cwd(), 'resources', 'modelo-folha-pagamento.xlsx')
}

// Posições fixas no modelo (conferidas célula a célula com o arquivo
// original da empresa) — cabeçalho e onde a lista de colaboradores
// começa. A última linha de colaborador já pronta no modelo é
// descoberta na hora (ws.rowCount), então não importa se o modelo for
// atualizado no futuro com mais ou menos linhas prontas.
const CELULA_CODIGO_EMPRESA = 'C3'
const CELULA_RAZAO_SOCIAL   = 'C4'
const CELULA_CNPJ           = 'C5'
const CELULA_COMPETENCIA    = 'C6'
const PRIMEIRA_LINHA_DADO   = 11

// ── Exportação — abre o MODELO de verdade (não remonta do zero) e só
// injeta os valores nas células certas, preservando toda a
// formatação original. Se a obra tiver mais colaboradores do que
// linhas já prontas no modelo, duplica a última linha (com a mesma
// formatação) quantas vezes for preciso; se tiver menos, limpa o
// conteúdo das linhas que sobrarem (sem apagar a formatação, só o
// texto de exemplo do modelo).
async function exportar(folha: any, empresa: any, itens: any[]) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(caminhoModelo())
  const planilha = workbook.getWorksheet(1)
  if (!planilha) return { ok: false, erro: 'Modelo da planilha não encontrado.' }

  planilha.getCell(CELULA_CODIGO_EMPRESA).value = empresa?.codigo_empresa ?? ''
  planilha.getCell(CELULA_RAZAO_SOCIAL).value   = empresa?.razao_social || empresa?.nome || ''
  planilha.getCell(CELULA_CNPJ).value           = empresa?.cnpj ?? ''
  const celulaCompetencia = planilha.getCell(CELULA_COMPETENCIA)
  celulaCompetencia.value  = competenciaComoSerial(folha.mes_competencia)
  celulaCompetencia.numFmt = 'dd/mm/yyyy'

  const ultimaLinhaModelo  = planilha.rowCount
  const linhasProntas      = ultimaLinhaModelo - PRIMEIRA_LINHA_DADO + 1
  if (itens.length > linhasProntas) {
    planilha.duplicateRow(ultimaLinhaModelo, itens.length - linhasProntas, true)
  }

  itens.forEach((item, i) => {
    const linha = PRIMEIRA_LINHA_DADO + i
    planilha.getCell(`A${linha}`).value = item.matricula_esocial ? 11 : null
    planilha.getCell(`B${linha}`).value = item.matricula_esocial || null
    planilha.getCell(`C${linha}`).value = item.colaborador_nome
    planilha.getCell(`D${linha}`).value = item.h_premio
    planilha.getCell(`E${linha}`).value = item.producao
    planilha.getCell(`F${linha}`).value = item.vale_transporte
    planilha.getCell(`G${linha}`).value = item.insalubridade
    planilha.getCell(`H${linha}`).value = item.periculosidade
    planilha.getCell(`I${linha}`).value = item.adc_noturno
    planilha.getCell(`J${linha}`).value = item.he_50
    planilha.getCell(`K${linha}`).value = item.he_80
    planilha.getCell(`L${linha}`).value = item.he_100
    planilha.getCell(`M${linha}`).value = item.he_110
    planilha.getCell(`N${linha}`).value = item.atrasos
    planilha.getCell(`O${linha}`).value = item.faltas
    planilha.getCell(`P${linha}`).value = item.outros_eventos
  })

  // limpa (só o conteúdo, mantém a formatação) as linhas do modelo
  // que sobraram sem colaborador nenhum
  const linhaFinalUsada = PRIMEIRA_LINHA_DADO + itens.length - 1
  for (let l = linhaFinalUsada + 1; l <= planilha.rowCount; l++) {
    for (let col = 1; col <= 16; col++) planilha.getCell(l, col).value = null
  }

  const nomeSugerido = `Folha - ${empresa?.nome || 'Obra'} - ${competenciaComoTexto(folha.mes_competencia)}.xlsx`
  const resultado = await dialog.showSaveDialog({ defaultPath: nomeSugerido, filters: [{ name: 'Excel', extensions: ['xlsx'] }] })
  if (resultado.canceled || !resultado.filePath) return { canceled: true }
  await workbook.xlsx.writeFile(resultado.filePath)
  return { ok: true, filePath: resultado.filePath }
}

// mes_competencia vem como 'AAAA-MM-01' — a planilha original guarda
// como data de verdade (serial do Excel), não como texto.
// CORRIGIDO: antes isso passava por `new Date(...)` e deixava o
// SheetJS converter pra serial sozinho — só que essa conversão
// arredondava errado (saía ~28 segundos a menos que a meia-noite
// certa, virando "31/07" em vez de "01/08" em alguns leitores).
// Calculando o serial na mão (dias desde 30/12/1899, a data-base
// clássica do Excel) sai sempre exato, sem esse problema.
function competenciaComoSerial(mesCompetencia: string): number {
  const [ano, mes, dia] = mesCompetencia.split('-').map(Number)
  const ms = Date.UTC(ano, mes - 1, dia) - Date.UTC(1899, 11, 30)
  return Math.round(ms / 86400000)
}

function competenciaComoTexto(mesCompetencia: string): string {
  const [ano, mes] = mesCompetencia.split('-')
  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${MESES[Number(mes) - 1]}-${ano}`
}

// ── Importação de Espelho de Ponto (Pontomais) ───────────
// NOVO: lê um ou mais PDFs de espelho de ponto e devolve, pra cada
// COLABORADOR encontrado dentro deles (um arquivo pode ter vários —
// um espelho por página, por exemplo), o nome/CPF + horas extras
// (80%/100%, só trocando ":" por "," — 9:42 vira 9,42, sem conta de
// hora decimal nenhuma) + quantidade de faltas. Quem faz a
// correspondência com a linha certa da folha (por CPF, com nome como
// reforço) é o lado da tela, não aqui.
interface EspelhoPontoLido {
  arquivo:  string
  nome:     string | null
  cpf:      string | null
  he80:     string | null
  he100:    string | null
  faltas:   number
  erro?:    string
  // NOVO: qualquer situação que mereça revisão manual antes de
  // confirmar — usado pela tela de conferência (sempre exibida,
  // mesmo sem avisos, mas destacando essas linhas primeiro).
  avisos:   string[]
}

function registerImportacaoEspelhoPonto() {
  ipcMain.handle('folhaPagamento:importarEspelhosPonto', async () => {
    const resultado = await dialog.showOpenDialog({
      title: 'Selecionar espelho(s) de ponto',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (resultado.canceled || resultado.filePaths.length === 0) return { canceled: true }

    const PDFExtract = await carregarPDFExtract()
    const pdfExtract = new PDFExtract()
    const lidos: EspelhoPontoLido[] = []

    for (const caminho of resultado.filePaths) {
      const nomeArquivo = caminho.split(/[\\/]/).pop() ?? caminho
      try {
        const dados = await pdfExtract.extract(caminho, {})
        // Ponte de tipo — só nos interessa o formato (x, y, str por
        // item, dentro de "pages"), sem depender do nome exato do
        // tipo que a biblioteca exporta.
        const espelhos = extrairEspelhosPorPosicao(dados.pages as unknown as PaginaExtraida[])
        if (espelhos.length === 0) {
          lidos.push({
            arquivo: nomeArquivo, nome: null, cpf: null, he80: null, he100: null, faltas: 0,
            erro: 'Não achei nenhum colaborador nesse PDF — confere se é um espelho de ponto do Pontomais.',
            avisos: [],
          })
        } else {
          for (const espelho of espelhos) lidos.push({ arquivo: nomeArquivo, ...espelho })
        }
      } catch (erro) {
        lidos.push({
          arquivo: nomeArquivo, nome: null, cpf: null, he80: null, he100: null, faltas: 0,
          erro: erro instanceof Error ? erro.message : 'Não foi possível ler esse PDF.',
          avisos: [],
        })
      }
    }
    return { ok: true, itens: lidos }
  })
}

// ── Extração posicional ──────────────────────────────────────
// NOVO: substitui inteiramente a extração por texto solto de antes.
// A ideia central: pra cada colaborador, primeiro acha a LINHA DE
// CABEÇALHO da tabela dele (pode ter colunas diferentes de outro
// colaborador — é exatamente o caso do vigia relatado), guarda a
// posição X de cada rótulo reconhecido, e só então lê a linha
// TOTAIS casando cada valor com o rótulo que está bem acima dele —
// nunca com "a Nª coluna".

interface ItemPosicional { x: number; y: number; str: string }
// Tipagem própria, mais solta — não depende do nome exato do tipo
// exportado pela biblioteca (que não tenho 100% de certeza), só do
// formato dos dados em si (x, y, str por item de texto, agrupados
// por página).
interface PaginaExtraida { content: ItemPosicional[] }

function normalizarTexto(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
}

// Palavras-chave reconhecidas por coluna — várias variações, porque
// o relatório pode abreviar de formas diferentes dependendo do
// cargo/config (foi exatamente essa diferença que causou o erro
// original, com o vigia tendo colunas a mais).
// CORRIGIDO: o rótulo real do Pontomais é "H.E. 1" (com espaço antes
// do número) — confirmado testando com PDF de verdade. "h.e.1" (sem
// espaço) nunca ia bater.
const PALAVRAS_HE80  = ['h.e. 1', 'h.e.1', 'he1', '(80%)', '80%', 'extra 80']
const PALAVRAS_HE100 = ['h.e. 2', 'h.e.2', 'he2', '(100%)', '100%', 'extra 100']

// Agrupa itens da página em "linhas" visuais — itens cujo Y é bem
// próximo pertencem à mesma linha da tabela, não importa a ordem
// bruta em que o PDF guarda o texto internamente.
function agruparEmLinhas(items: ItemPosicional[]): ItemPosicional[][] {
  const TOLERANCIA_Y = 3
  const ordenados = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const linhas: ItemPosicional[][] = []
  for (const item of ordenados) {
    const ultima = linhas[linhas.length - 1]
    if (ultima && Math.abs(ultima[0].y - item.y) <= TOLERANCIA_Y) {
      ultima.push(item)
    } else {
      linhas.push([item])
    }
  }
  linhas.forEach(l => l.sort((a, b) => a.x - b.x))
  return linhas
}

// Acha, numa linha, o item cujo texto contém alguma das palavras-chave.
function acharColunaPorRotulo(linha: ItemPosicional[], palavras: string[]): ItemPosicional | null {
  for (const item of linha) {
    const texto = normalizarTexto(item.str)
    if (palavras.some(p => texto.includes(p))) return item
  }
  return null
}

// Acha, numa linha, o valor no formato hora (H:MM) mais próximo (em
// X) de uma coluna de referência — é assim que casa "o número embaixo
// do rótulo", sem depender de posição fixa nenhuma.
function valorHoraMaisProximo(linha: ItemPosicional[], xAlvo: number, distanciaMaxima = 40): string | null {
  let melhor: string | null = null
  let menorDistancia = Infinity
  for (const item of linha) {
    const texto = item.str.trim()
    if (!/^\d{1,3}:\d{2}$/.test(texto)) continue
    const distancia = Math.abs(item.x - xAlvo)
    if (distancia < menorDistancia && distancia <= distanciaMaxima) { menorDistancia = distancia; melhor = texto }
  }
  return melhor
}

function extrairEspelhosPorPosicao(paginas: PaginaExtraida[]): Omit<EspelhoPontoLido, 'arquivo'>[] {
  const resultado: Omit<EspelhoPontoLido, 'arquivo'>[] = []

  for (const pagina of paginas) {
    const linhas = agruparEmLinhas(pagina.content.map(c => ({ x: c.x, y: c.y, str: c.str })))

    // Uma página pode ter mais de um colaborador — cada um começa
    // numa linha que tem "Nome" seguido do nome em maiúsculas.
    const indicesDeInicio: number[] = []
    linhas.forEach((linha, i) => {
      const textoLinha = normalizarTexto(linha.map(it => it.str).join(' '))
      if (/^nome\s+[a-zà-ü]/.test(textoLinha) || linha.some(it => /^nome$/i.test(it.str.trim()))) {
        indicesDeInicio.push(i)
      }
    })
    if (indicesDeInicio.length === 0) continue

    for (let b = 0; b < indicesDeInicio.length; b++) {
      const inicio = indicesDeInicio[b]
      const fim    = b + 1 < indicesDeInicio.length ? indicesDeInicio[b + 1] : linhas.length
      const bloco  = linhas.slice(inicio, fim)
      resultado.push(extrairColaboradorDoBloco(bloco))
    }
  }

  return resultado
}

function extrairColaboradorDoBloco(bloco: ItemPosicional[][]): Omit<EspelhoPontoLido, 'arquivo'> {
  const avisos: string[] = []

  // Nome e CPF ainda saem do texto corrido do bloco (isso nunca foi
  // o problema relatado — só a leitura das colunas de hora era
  // frágil).
  const textoBloco = bloco.map(l => l.map(it => it.str).join(' ')).join('\n')
  // Corta o nome antes de "PIS"/"CPF" (próximo campo) ou de um dia da
  // semana abreviado (Dom/Seg/Ter/Qua/Qui/Sex/Sáb) — esse último
  // aparece colado ao nome porque, na mesma altura da linha, fica
  // também a tabela de horário semanal (que começa com o dia).
  const nome = textoBloco
    .match(/Nome\s*:?\s*([^\n]+?)(?:\s{2,}|\s+PIS\b|\s+CPF\b|\s+(?:Dom|Seg|Ter|Qua|Qui|Sex|S[aá]b|Dia)\b|$)/i)?.[1]?.trim() ?? null
  const cpf  = textoBloco.match(/CPF\s*:?\s*([\d.\-]+)/i)?.[1]?.trim() ?? null

  if (!nome) avisos.push('Não consegui identificar o nome do colaborador nesse bloco — confira manualmente.')

  // CORRIGIDO: dois bugs achados testando com PDF real do Pontomais.
  // 1) A comparação era sem diferenciar maiúscula/minúscula — o
  // cabeçalho da tabela tem uma coluna "Horas totais", e o "totais"
  // dela (minúsculo) batia com essa checagem antes da linha TOTAIS
  // de verdade (maiúscula) aparecer, pegando a linha errada.
  // 2) O cabeçalho de verdade fica no TOPO da tabela, não logo acima
  // da linha TOTAIS — tem até 30+ linhas de dias no meio (um por dia
  // do mês). Antes só olhava as últimas linhas antes de TOTAIS, o
  // que nunca alcançava o cabeçalho de verdade.
  const indiceTotais = bloco.findIndex(linha => linha.some(it => it.str.trim() === 'TOTAIS'))
  if (indiceTotais === -1) {
    avisos.push('Não encontrei a linha "TOTAIS" — os valores de hora extra precisam ser conferidos e lançados manualmente.')
    const faltas = (textoBloco.match(/Falta(?!ntes)/g) ?? []).length
    return { nome, cpf, he80: null, he100: null, faltas, avisos }
  }
  const linhaTotais = bloco[indiceTotais]

  // Procura o cabeçalho em TODO o bloco, do início até a linha
  // TOTAIS (o cabeçalho aparece só uma vez, perto do topo da
  // tabela).
  let colunaHe80: ItemPosicional | null = null
  let colunaHe100: ItemPosicional | null = null
  for (let i = 0; i < indiceTotais; i++) {
    if (!colunaHe80)  colunaHe80  = acharColunaPorRotulo(bloco[i], PALAVRAS_HE80)
    if (!colunaHe100) colunaHe100 = acharColunaPorRotulo(bloco[i], PALAVRAS_HE100)
  }

  let he80: string | null = null
  let he100: string | null = null

  if (colunaHe80) {
    const valor = valorHoraMaisProximo(linhaTotais, colunaHe80.x)
    if (valor) he80 = valor.replace(':', ',')
    else avisos.push('Achei a coluna "H.E.1 (80%)" no cabeçalho, mas não achei um valor de hora alinhado com ela na linha TOTAIS.')
  } else {
    avisos.push('Não achei a coluna "H.E.1 (80%)" no cabeçalho desse colaborador — confira se o layout do relatório mudou.')
  }

  if (colunaHe100) {
    const valor = valorHoraMaisProximo(linhaTotais, colunaHe100.x)
    if (valor) he100 = valor.replace(':', ',')
    else avisos.push('Achei a coluna "H.E.2 (100%)" no cabeçalho, mas não achei um valor de hora alinhado com ela na linha TOTAIS.')
  } else {
    avisos.push('Não achei a coluna "H.E.2 (100%)" no cabeçalho desse colaborador — confira se o layout do relatório mudou.')
  }

  // Checagem de consistência: se o texto do bloco menciona hora
  // extra em algum lugar (ex: legenda, resumo) mas os dois campos
  // deram em branco, alguma coisa não bateu — vale revisão mesmo sem
  // ter dado erro técnico nenhum.
  const mencionaExtra = /extra/i.test(textoBloco)
  if (mencionaExtra && !he80 && !he100) {
    avisos.push('O documento menciona "extra" em algum lugar, mas nenhum valor de hora extra foi extraído — confira manualmente antes de confirmar.')
  }

  const faltas = (textoBloco.match(/Falta(?!ntes)/g) ?? []).length

  return { nome, cpf, he80, he100, faltas, avisos }
}
