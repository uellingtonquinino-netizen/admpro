import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { getDatabaseProvider, getSupabase } from '../supabase/client'
import { uploadDocumento, storagePath } from '../supabase/storage'
import { basename } from 'path'

interface ListarParams {
  empresa_id: number
  busca?:     string
  funcao?:    string
  setor?:     string
  equipe?:    string
  status?:    string
  page?:      number
  perPage?:   number
}

// Todos os campos do cadastro — ver migration_007 em database/migrations.ts
interface ColaboradorPayload {
  nome:                          string
  cpf?:                          string | null
  rg?:                           string | null
  rg_orgao_emissor?:             string | null
  nascimento?:                   string | null
  estado_civil?:                 string | null
  nacionalidade?:                string | null
  nome_mae?:                     string | null
  nome_pai?:                     string | null
  escolaridade?:                 string | null
  pcd?:                          boolean
  foto_url?:                     string | null
  funcao?:                       string | null
  setor?:                        string | null
  equipe?:                       string | null
  tipo_contrato?:                string | null
  data_admissao?:                string | null
  dias_experiencia?:             number | null
  data_vencimento_experiencia?:  string | null
  data_demissao?:                string | null
  tipo_demissao?:                string | null
  salario_base?:                 number | null
  status?:                       string
  ctps?:                         string | null
  ctps_serie?:                   string | null
  pis?:                          string | null
  telefone?:                     string | null
  email?:                        string | null
  contato_emergencia_nome?:      string | null
  contato_emergencia_telefone?:  string | null
  endereco?:                     string | null
  numero?:                       string | null
  bairro?:                       string | null
  cidade?:                       string | null
  estado?:                       string | null
  cep?:                          string | null
  banco?:                        string | null
  agencia?:                      string | null
  operacao?:                     string | null
  conta?:                        string | null
  conta_digito?:                 string | null
  tipo_conta?:                   string | null
  passagem?:                     string | null
  valor_ida_volta?:              number | null
  alimentacao?:                  number | null
  tamanho_camisa?:               string | null
  tamanho_calca?:                string | null
  numero_calcado?:               string | null
  observacoes?:                  string | null
  titulo_numero?:                string | null
  titulo_zona?:                  string | null
  titulo_secao?:                 string | null
  reservista?:                   string | null
  cnh_numero?:                   string | null
  cnh_categoria?:                string | null
  cnh_vencimento?:               string | null
  cor_raca?:                     string | null
  alojado?:                      boolean
  tem_baixada?:                  boolean
  dias_periodo_baixada?:         number | null
  data_inicio_baixada?:          string | null
  data_vencimento_baixada?:      string | null
  matricula_esocial?:            string | null
  sexo?:                         string | null
  naturalidade?:                 string | null
  cbo?:                          string | null
  rg_data_emissao?:              string | null
  ctps_data_expedicao?:          string | null
  ctps_uf?:                      string | null
}

interface CriarPayload extends ColaboradorPayload {
  empresa_id: number
}

interface AtualizarPayload extends ColaboradorPayload {
  id: number
}

const CAMPOS = [
  'nome', 'cpf', 'rg', 'rg_orgao_emissor', 'nascimento', 'estado_civil',
  'nacionalidade', 'nome_mae', 'nome_pai', 'escolaridade', 'pcd', 'foto_url',
  'funcao', 'setor', 'equipe', 'tipo_contrato', 'data_admissao',
  'dias_experiencia', 'data_vencimento_experiencia', 'data_demissao',
  'tipo_demissao', 'salario_base', 'status', 'ctps', 'ctps_serie', 'pis',
  'telefone', 'email', 'contato_emergencia_nome', 'contato_emergencia_telefone',
  'endereco', 'numero', 'bairro', 'cidade', 'estado', 'cep',
  'banco', 'agencia', 'operacao', 'conta', 'conta_digito', 'tipo_conta',
  'passagem', 'valor_ida_volta', 'alimentacao',
  'tamanho_camisa', 'tamanho_calca', 'numero_calcado', 'observacoes',
  'titulo_numero', 'titulo_zona', 'titulo_secao', 'reservista',
  'cnh_numero', 'cnh_categoria', 'cnh_vencimento', 'cor_raca',
  'alojado', 'tem_baixada', 'dias_periodo_baixada', 'data_inicio_baixada', 'data_vencimento_baixada', 'matricula_esocial',
  'sexo', 'naturalidade', 'cbo', 'rg_data_emissao', 'ctps_data_expedicao', 'ctps_uf',
] as const

function normalizarSupabase(p: Record<string, unknown>) {
  return { ...p, pcd: p.pcd ? 1 : 0, alojado: p.alojado ? 1 : 0, tem_baixada: p.tem_baixada ? 1 : 0 }
}

export function registerColaboradoresIpc() {
  const db = getDb()

  // ── Listar (com filtros e paginação) ───────────────────
  ipcMain.handle('colaboradores:listar', async (_e, p: ListarParams) => {
    if (getDatabaseProvider() === 'supabase') {
      const page = p.page ?? 1, perPage = p.perPage ?? 50
      let query = getSupabase().from('colaboradores').select('*', { count: 'exact' }).eq('empresa_id', p.empresa_id).order('nome').range((page-1)*perPage, page*perPage-1)
      if (p.funcao) query=query.eq('funcao',p.funcao); if (p.setor) query=query.eq('setor',p.setor); if (p.equipe) query=query.eq('equipe',p.equipe); if (p.status) query=query.eq('status',p.status)
      if (p.busca) query=query.ilike('nome', `%${p.busca.replace(/[%_]/g,'\\$&')}%`)
      const { data,error,count }=await query; if(error) throw new Error(error.message); return {items:data??[],total:count??0}
    }
    const conds:  string[] = ['empresa_id = @empresa_id']
    const params: Record<string, unknown> = {
      empresa_id: p.empresa_id,
      limit:      p.perPage ?? 50,
      offset:     ((p.page ?? 1) - 1) * (p.perPage ?? 50),
    }

    if (p.busca) {
      conds.push(`(nome LIKE @busca OR cpf LIKE @busca OR funcao LIKE @busca)`)
      params.busca = `%${p.busca}%`
    }
    if (p.funcao) { conds.push('funcao = @funcao'); params.funcao = p.funcao }
    if (p.setor)  { conds.push('setor  = @setor');  params.setor  = p.setor }
    if (p.equipe) { conds.push('equipe = @equipe'); params.equipe = p.equipe }
    if (p.status) { conds.push('status = @status'); params.status = p.status }

    const where = conds.join(' AND ')

    const total = (db.prepare(
      `SELECT COUNT(*) AS n FROM colaboradores WHERE ${where}`
    ).get(params) as { n: number }).n

    const items = db.prepare(`
      SELECT *
      FROM colaboradores
      WHERE ${where}
      ORDER BY nome ASC
      LIMIT @limit OFFSET @offset
    `).all(params)

    return { items, total }
  })

  // ── Listagem leve (para combos/seletores, ex: módulo de AP) ──
  ipcMain.handle('colaboradores:listarResumo', async (_e, empresa_id: number) => {
    if (getDatabaseProvider() === 'supabase') { const {data,error}=await getSupabase().from('colaboradores').select('id,nome,cpf,funcao').eq('empresa_id',empresa_id).neq('status','desligado').order('nome'); if(error) throw new Error(error.message); return data??[] }
    return db.prepare(`
      SELECT id, nome, cpf, funcao
      FROM colaboradores
      WHERE empresa_id = ? AND status != 'desligado'
      ORDER BY nome ASC
    `).all(empresa_id)
  })

  // ── Buscar por id ───────────────────────────────────────
  ipcMain.handle('colaboradores:buscarPorId', async (_e, id: number) => {
    if (getDatabaseProvider() === 'supabase') { const {data,error}=await getSupabase().from('colaboradores').select('*').eq('id',id).maybeSingle(); if(error) throw new Error(error.message); return data??null }
    return db.prepare(`SELECT * FROM colaboradores WHERE id = ?`).get(id)
  })

  // ── Criar ───────────────────────────────────────────────
  ipcMain.handle('colaboradores:criar', async (_e, p: CriarPayload) => {
    if (getDatabaseProvider() === 'supabase') {
      const { data, error } = await getSupabase().from('colaboradores').insert(normalizarSupabase(p as unknown as Record<string, unknown>)).select('id').single()
      if (error) throw new Error(error.message)
      return { id: data.id }
    }
    const cols  = ['empresa_id', ...CAMPOS]
    const binds = cols.map(c => `@${c}`).join(', ')
    const data: Record<string, unknown> = { empresa_id: p.empresa_id }
    for (const c of CAMPOS) {
      const v = (p as unknown as Record<string, unknown>)[c]
      data[c] = ['pcd','alojado','tem_baixada'].includes(c) ? (v ? 1 : 0) : (v ?? null)
    }

    const result = db.prepare(`
      INSERT INTO colaboradores (${cols.join(', ')})
      VALUES (${binds})
    `).run(data)

    return { id: result.lastInsertRowid }
  })

  // ── Atualizar ───────────────────────────────────────────
  ipcMain.handle('colaboradores:atualizar', async (_e, p: AtualizarPayload) => {
    if (getDatabaseProvider() === 'supabase') {
      const { id, ...dados } = p
      const { error } = await getSupabase().from('colaboradores').update(normalizarSupabase(dados as unknown as Record<string, unknown>)).eq('id', id)
      if (error) throw new Error(error.message)
      return { ok: true }
    }
    const sets: string[] = []
    const data: Record<string, unknown> = { id: p.id }
    for (const c of CAMPOS) {
      const v = (p as unknown as Record<string, unknown>)[c]
      sets.push(`${c} = @${c}`)
      data[c] = ['pcd','alojado','tem_baixada'].includes(c) ? (v ? 1 : 0) : (v ?? null)
    }

    db.prepare(`
      UPDATE colaboradores SET ${sets.join(', ')} WHERE id = @id
    `).run(data)

    return { ok: true }
  })

  // ── Excluir ─────────────────────────────────────────────
  ipcMain.handle('colaboradores:excluir', async (_e, id: number) => {
    if (getDatabaseProvider() === 'supabase') {
      const s = getSupabase()
      const { data: colaborador } = await s.from('colaboradores').select('nome,cpf,empresa_id').eq('id', id).single()
      if (colaborador) {
        await s.rpc('registrar_exclusao', {
          p_tabela: 'colaboradores', p_registro_id: id,
          p_descricao: `Colaborador - ${colaborador.nome}${colaborador.cpf ? ` (CPF ${colaborador.cpf})` : ''}`,
          p_empresa_id: colaborador.empresa_id,
        })
      }
      const { error } = await s.from('colaboradores').delete().eq('id', id)
      if (error) throw new Error(error.message)
      return { ok: true }
    }
    db.prepare('DELETE FROM colaboradores WHERE id = ?').run(id)
    return { ok: true }
  })

  // ── Valores distintos p/ filtros (função, setor, equipe) ──
  ipcMain.handle('colaboradores:opcoesFiltro', async (_e, empresa_id: number) => {
    if (getDatabaseProvider() === 'supabase') {
      const s = getSupabase()
      const distintos = async (campo: 'funcao' | 'setor' | 'equipe') => {
        const { data, error } = await s.from('colaboradores').select(campo).eq('empresa_id', empresa_id).not(campo, 'is', null)
        if (error) throw new Error(error.message)
        const linhas = (data ?? []) as unknown as Record<string, string>[]
        const valores = new Set(linhas.map(r => r[campo]).filter(v => v && v !== ''))
        return [...valores].sort()
      }
      const [funcoes, setores, equipes] = await Promise.all([distintos('funcao'), distintos('setor'), distintos('equipe')])
      return { funcoes, setores, equipes }
    }
    const col = (campo: string) => db.prepare(`
      SELECT DISTINCT ${campo} AS v FROM colaboradores
      WHERE empresa_id = ? AND ${campo} IS NOT NULL AND ${campo} != ''
      ORDER BY ${campo} ASC
    `).all(empresa_id).map((r) => (r as { v: string }).v)

    return {
      funcoes: col('funcao'),
      setores: col('setor'),
      equipes: col('equipe'),
    }
  })

  // ── Histórico de documentos gerados ────────────────────
  ipcMain.handle('colaboradores:historicoDocumentos', async (_e, colaborador_id: number) => {
    if (getDatabaseProvider() === 'supabase') {
      const { data, error } = await getSupabase().from('colaborador_documentos').select('id,tipo,created_at').eq('colaborador_id', colaborador_id).order('created_at', { ascending: false }).limit(20)
      if (error) throw new Error(error.message)
      return data ?? []
    }
    return db.prepare(`
      SELECT id, tipo, created_at
      FROM colaborador_documentos
      WHERE colaborador_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(colaborador_id)
  })

  // ── Registrar geração de documento (para auditoria) ────
  ipcMain.handle('colaboradores:registrarDocumento', async (_e, p: {
    colaborador_id: number
    empresa_id:     number
    tipo:           string
    dados_json:     string
  }) => {
    if (getDatabaseProvider() === 'supabase') {
      const { error } = await getSupabase().from('colaborador_documentos').insert({
        colaborador_id: p.colaborador_id, empresa_id: p.empresa_id, tipo: p.tipo, dados_json: p.dados_json,
      })
      if (error) throw new Error(error.message)
      return { ok: true }
    }
    db.prepare(`
      INSERT INTO colaborador_documentos (colaborador_id, empresa_id, tipo, dados_json)
      VALUES (@colaborador_id, @empresa_id, @tipo, @dados_json)
    `).run(p)
    return { ok: true }
  })

  // ── Resumo de RH para a tela Início (equivalente à aba RESUMO) ──
  // CORRIGIDO: o filtro de mês/ano do Início nunca fazia nada — esse
  // handler sempre usava o mês REAL de hoje pra achar aniversariante,
  // ignorando qualquer mês escolhido na tela. Agora aceita um `mes`
  // (1-12) opcional; se não vier, cai no mês atual (mesmo
  // comportamento de antes).
  ipcMain.handle('colaboradores:resumoRH', async (_e, p: number | { empresa_id: number; mes?: number }) => {
    const empresa_id = typeof p === 'number' ? p : p.empresa_id
    const mesFiltro   = typeof p === 'number' ? undefined : p.mes
    if (getDatabaseProvider() === 'supabase') {
      const { data, error } = await getSupabase()
        .from('colaboradores')
        .select('nome, funcao, nascimento, salario_base, status')
        .eq('empresa_id', empresa_id)
      if (error) throw new Error(error.message)
      const rows = data ?? []
      const ativos = rows.filter(row => row.status === 'ativo')
      const porFuncao = new Map<string, { quantidade: number; custo_salarial: number }>()
      const porStatus = new Map<string, number>()
      for (const row of rows) {
        porStatus.set(row.status ?? 'sem_status', (porStatus.get(row.status ?? 'sem_status') ?? 0) + 1)
        if (row.status === 'ativo' && row.funcao) {
          const atual = porFuncao.get(row.funcao) ?? { quantidade: 0, custo_salarial: 0 }
          atual.quantidade += 1; atual.custo_salarial += Number(row.salario_base ?? 0); porFuncao.set(row.funcao, atual)
        }
      }
      const hoje = new Date()
      const idades = ativos.filter(row => row.nascimento).map(row => (hoje.getTime() - new Date(`${row.nascimento}T00:00:00`).getTime()) / 31557600000)
      const mesBusca = String(mesFiltro ?? hoje.getMonth() + 1).padStart(2, '0')
      return {
        totalAtivos: ativos.length,
        custoFolha: ativos.reduce((total, row) => total + Number(row.salario_base ?? 0), 0),
        mediaIdade: idades.length ? Math.round(idades.reduce((a, b) => a + b, 0) / idades.length) : null,
        porFuncao: [...porFuncao].map(([funcao, dados]) => ({ funcao, ...dados })).sort((a, b) => b.quantidade - a.quantidade),
        porStatus: [...porStatus].map(([status, quantidade]) => ({ status, quantidade })),
        aniversariantes: ativos.filter(row => row.nascimento?.slice(5, 7) === mesBusca).sort((a, b) => (a.nascimento ?? '').slice(8, 10).localeCompare((b.nascimento ?? '').slice(8, 10))).map(row => ({ nome: row.nome, funcao: row.funcao, nascimento: row.nascimento })),
      }
    }
    const totais = db.prepare(`
      SELECT
        COUNT(*) AS total_ativos,
        COALESCE(SUM(salario_base), 0) AS custo_folha,
        AVG((julianday('now') - julianday(nascimento)) / 365.25) AS media_idade
      FROM colaboradores
      WHERE empresa_id = ? AND status = 'ativo'
    `).get(empresa_id) as { total_ativos: number; custo_folha: number; media_idade: number | null }

    const porFuncao = db.prepare(`
      SELECT
        funcao,
        COUNT(*) AS quantidade,
        COALESCE(SUM(salario_base), 0) AS custo_salarial
      FROM colaboradores
      WHERE empresa_id = ? AND status = 'ativo' AND funcao IS NOT NULL AND funcao != ''
      GROUP BY funcao
      ORDER BY quantidade DESC
    `).all(empresa_id)

    const porStatus = db.prepare(`
      SELECT status, COUNT(*) AS quantidade
      FROM colaboradores
      WHERE empresa_id = ?
      GROUP BY status
    `).all(empresa_id)

    const mesBuscaSqlite = String(mesFiltro ?? new Date().getMonth() + 1).padStart(2, '0')
    const aniversariantes = db.prepare(`
      SELECT nome, funcao, nascimento
      FROM colaboradores
      WHERE empresa_id = ? AND status = 'ativo' AND nascimento IS NOT NULL
        AND strftime('%m', nascimento) = ?
      ORDER BY strftime('%d', nascimento) ASC
    `).all(empresa_id, mesBuscaSqlite)

    return {
      totalAtivos:    totais.total_ativos,
      custoFolha:     totais.custo_folha,
      mediaIdade:     totais.media_idade ? Math.round(totais.media_idade) : null,
      porFuncao,
      porStatus,
      aniversariantes,
    }
  })

  // ── Anexos soltos no cadastro (ex: certidão de nascimento de
  // filho) — não dependem de nenhuma solicitação ao Setor Pessoal.
  ipcMain.handle('colaboradores:listarAnexos', async (_e, colaborador_id: number) => {
    if (getDatabaseProvider() === 'supabase') { const {data,error}=await getSupabase().from('colaboradores_anexos').select('*').eq('colaborador_id',colaborador_id).order('created_at',{ascending:false}); if(error) throw new Error(error.message); return data??[] }
    return db.prepare(`
      SELECT id, caminho, nome, descricao, created_at FROM colaboradores_anexos
      WHERE colaborador_id = ? ORDER BY created_at DESC
    `).all(colaborador_id)
  })

  ipcMain.handle('colaboradores:adicionarAnexo', async (_e, p: { colaborador_id: number; caminho: string; nome: string; descricao?: string | null }) => {
    if (getDatabaseProvider() === 'supabase') { const {data:c,error:ce}=await getSupabase().from('colaboradores').select('empresa_id').eq('id',p.colaborador_id).single(); if(ce) throw new Error(ce.message); const remote=`${c.empresa_id}/${p.colaborador_id}/${Date.now()}-${basename(p.nome).replace(/[^a-zA-Z0-9._-]/g,'_')}`; const caminho=await uploadDocumento(p.caminho,remote); const {data,error}=await getSupabase().from('colaboradores_anexos').insert({colaborador_id:p.colaborador_id,caminho,nome:p.nome,descricao:p.descricao??null}).select('id').single(); if(error) throw new Error(error.message); return {id:data.id} }
    const result = db.prepare(`
      INSERT INTO colaboradores_anexos (colaborador_id, caminho, nome, descricao)
      VALUES (@colaborador_id, @caminho, @nome, @descricao)
    `).run({ ...p, descricao: p.descricao ?? null })
    return { id: result.lastInsertRowid }
  })

  ipcMain.handle('colaboradores:removerAnexo', async (_e, id: number) => {
    if (getDatabaseProvider() === 'supabase') { const {data,error}=await getSupabase().from('colaboradores_anexos').select('caminho').eq('id',id).single(); if(error) throw new Error(error.message); if(data.caminho.startsWith('supabase://')) await getSupabase().storage.from('documentos-rh').remove([storagePath(data.caminho)]); const r=await getSupabase().from('colaboradores_anexos').delete().eq('id',id); if(r.error) throw new Error(r.error.message); return {ok:true} }
    db.prepare(`DELETE FROM colaboradores_anexos WHERE id = ?`).run(id)
    return { ok: true }
  })
}
