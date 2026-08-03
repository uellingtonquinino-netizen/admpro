import { ipcMain }        from 'electron'
import { getDb }          from '../database/connection'
import { getDatabaseProvider, getSupabase } from '../supabase/client'

// ── Tipos ─────────────────────────────────────────────────
interface ListarParams {
  empresa_id: number
  mes?:       number
  ano?:       number
  dataInicio?: string
  dataFim?:    string
  tipo?:      'receita' | 'despesa'
  status?:    string
  busca?:     string
  page?:      number
  perPage?:   number
}

interface CriarPayload {
  empresa_id:   number
  descricao:    string
  valor:        number
  tipo:         'receita' | 'despesa'
  status:       string
  data:         string
  data_venc:    string | null
  categoria_id: number
  conta_id:     number
  observacao:   string | null
}

interface AtualizarPayload extends CriarPayload {
  id: number
}

// ── Helpers ───────────────────────────────────────────────
function buildWhere(params: ListarParams) {
  const conds:  string[] = ['l.empresa_id = ?']
  const values: unknown[] = [params.empresa_id]

  // NOVO: filtro por período (De/Até) — quando preenchido, tem
  // prioridade sobre o filtro de mês/ano.
  if (params.dataInicio && params.dataFim) {
    conds.push(`date(l.data) BETWEEN date(?) AND date(?)`)
    values.push(params.dataInicio, params.dataFim)
  } else if (params.mes && params.ano) {
    conds.push(`strftime('%m', l.data) = ? AND strftime('%Y', l.data) = ?`)
    values.push(
      String(params.mes).padStart(2, '0'),
      String(params.ano)
    )
  }

  if (params.tipo) {
    conds.push('l.tipo = ?')
    values.push(params.tipo)
  }

  if (params.status) {
    if (params.status === 'vencido') {
      conds.push(`l.status = 'pendente' AND date(l.data_venc) < date('now')`)
    } else if (params.status === 'a_vencer') {
      conds.push(`l.status = 'pendente' AND date(l.data_venc) >= date('now')`)
    } else {
      conds.push('l.status = ?')
      values.push(params.status)
    }
  }

  if (params.busca) {
    conds.push('(l.descricao LIKE ? OR l.observacao LIKE ?)')
    const like = `%${params.busca}%`
    values.push(like, like)
  }

  return { where: conds.join(' AND '), values }
}

// ── Registro dos handlers ─────────────────────────────────
export function registerLancamentosIpc() {
  const db = getDb()

  // ── listar ─────────────────────────────────────────────
  ipcMain.handle('lancamentos:listar', async (_e, params: ListarParams) => {
    if (getDatabaseProvider() === 'supabase') {
      const page = params.page ?? 1, perPage = params.perPage ?? 15
      let query = getSupabase().from('lancamentos').select('id, descricao, valor, tipo, status, data, data_venc, observacao, categoria_id, conta_id', { count: 'exact' }).eq('empresa_id', params.empresa_id)
      if (params.dataInicio && params.dataFim) query = query.gte('data', params.dataInicio).lte('data', params.dataFim)
      else if (params.mes && params.ano) { const start = `${params.ano}-${String(params.mes).padStart(2, '0')}-01`; const next = new Date(params.ano, params.mes, 1).toISOString().slice(0, 10); query = query.gte('data', start).lt('data', next) }
      if (params.tipo) query = query.eq('tipo', params.tipo)
      if (params.status === 'vencido') query = query.eq('status', 'pendente').lt('data_venc', new Date().toISOString().slice(0, 10))
      else if (params.status === 'a_vencer') query = query.eq('status', 'pendente').gte('data_venc', new Date().toISOString().slice(0, 10))
      else if (params.status) query = query.eq('status', params.status)
      if (params.busca) query = query.ilike('descricao', `%${params.busca.replace(/[%_]/g, '\\$&')}%`)
      const { data, error, count } = await query.order('data', { ascending: false }).order('id', { ascending: false }).range((page - 1) * perPage, page * perPage - 1)
      if (error) throw new Error(error.message)
      const categoryIds = [...new Set((data ?? []).map(row => row.categoria_id).filter(Boolean))]
      const accountIds = [...new Set((data ?? []).map(row => row.conta_id).filter(Boolean))]
      const [categories, accounts] = await Promise.all([
        categoryIds.length ? getSupabase().from('categorias').select('id,nome').in('id', categoryIds) : Promise.resolve({ data: [] as any[], error: null }),
        accountIds.length ? getSupabase().from('contas').select('id,nome').in('id', accountIds) : Promise.resolve({ data: [] as any[], error: null }),
      ])
      if (categories.error || accounts.error) throw new Error(categories.error?.message ?? accounts.error?.message)
      const cats = new Map(categories.data.map(row => [row.id, row.nome])), contas = new Map(accounts.data.map(row => [row.id, row.nome]))
      return { total: count ?? 0, items: (data ?? []).map(row => ({ ...row, categoria: cats.get(row.categoria_id) ?? null, conta: contas.get(row.conta_id) ?? null, situacao: row.status === 'pago' || row.status === 'cancelado' ? row.status : (row.data_venc && row.data_venc < new Date().toISOString().slice(0, 10) ? 'vencido' : 'a_vencer') })) }
    }
    const page    = params.page    ?? 1
    const perPage = params.perPage ?? 15
    const offset  = (page - 1) * perPage

    const { where, values } = buildWhere(params)

    const total = (db.prepare(`
      SELECT COUNT(*) as cnt
      FROM lancamentos l
      WHERE ${where}
    `).get(...values) as { cnt: number }).cnt

    const items = db.prepare(`
      SELECT
        l.id,
        l.descricao,
        l.valor,
        l.tipo,
        l.status,
        CASE
          WHEN l.status = 'pago' THEN 'pago'
          WHEN l.status = 'cancelado' THEN 'cancelado'
          WHEN l.status = 'pendente' AND date(l.data_venc) < date('now') THEN 'vencido'
          ELSE 'a_vencer'
        END AS situacao,
        l.data,
        l.data_venc,
        l.observacao,
        c.nome  AS categoria,
        ct.nome AS conta
      FROM lancamentos l
      LEFT JOIN categorias c  ON c.id  = l.categoria_id
      LEFT JOIN contas     ct ON ct.id = l.conta_id
      WHERE ${where}
      ORDER BY l.data DESC, l.id DESC
      LIMIT ? OFFSET ?
    `).all(...values, perPage, offset)

    return { items, total }
  })

  // ── buscarPorId ────────────────────────────────────────
  ipcMain.handle('lancamentos:buscarPorId', async (_e, id: number) => {
    if(getDatabaseProvider()==='supabase') { const s=getSupabase();const {data:l,error}=await s.from('lancamentos').select('*').eq('id',id).maybeSingle();if(error)throw new Error(error.message);if(!l)return null;const [{data:c,error:e1},{data:ct,error:e2}]=await Promise.all([l.categoria_id?s.from('categorias').select('nome').eq('id',l.categoria_id).maybeSingle():Promise.resolve({data:null,error:null}),l.conta_id?s.from('contas').select('nome').eq('id',l.conta_id).maybeSingle():Promise.resolve({data:null,error:null})]);if(e1)throw new Error(e1.message);if(e2)throw new Error(e2.message);return {...l,categoria:c?.nome??null,conta:ct?.nome??null} }
    return db.prepare(`
      SELECT
        l.*,
        c.nome  AS categoria,
        ct.nome AS conta
      FROM lancamentos l
      LEFT JOIN categorias c  ON c.id  = l.categoria_id
      LEFT JOIN contas     ct ON ct.id = l.conta_id
      WHERE l.id = ?
    `).get(id) ?? null
  })

  // ── criar ──────────────────────────────────────────────
  ipcMain.handle('lancamentos:criar', async (_e, p: CriarPayload) => {
    if (getDatabaseProvider() === 'supabase') {
      const { data, error } = await getSupabase().rpc('criar_lancamento', { p })
      if (error) throw new Error(error.message)
      return { id: data }
    }
    const stmt = db.prepare(`
      INSERT INTO lancamentos
        (empresa_id, descricao, valor, tipo, status,
         data, data_venc, categoria_id, conta_id, observacao)
      VALUES
        (@empresa_id, @descricao, @valor, @tipo, @status,
         @data, @data_venc, @categoria_id, @conta_id, @observacao)
    `)
    const result = stmt.run(p)

    // Atualiza saldo da conta
    _atualizarSaldoConta(db, p.conta_id, p.valor, p.tipo, 'creditar')

    return { id: result.lastInsertRowid }
  })

  // ── atualizar ─────────────────────────────────────────
  ipcMain.handle('lancamentos:atualizar', async (_e, p: AtualizarPayload) => {
    if (getDatabaseProvider() === 'supabase') {
      const { error } = await getSupabase().rpc('atualizar_lancamento', { p })
      if (error) throw new Error(error.message)
      return { ok: true }
    }
    // Buscar lançamento anterior para reverter saldo
    const anterior = db.prepare(
      'SELECT valor, tipo, conta_id FROM lancamentos WHERE id = ?'
    ).get(p.id) as { valor: number; tipo: string; conta_id: number } | undefined

    if (anterior) {
      _atualizarSaldoConta(
        db, anterior.conta_id,
        anterior.valor,
        anterior.tipo as 'receita' | 'despesa',
        'reverter'
      )
    }

    db.prepare(`
      UPDATE lancamentos SET
        descricao    = @descricao,
        valor        = @valor,
        tipo         = @tipo,
        status       = @status,
        data         = @data,
        data_venc    = @data_venc,
        categoria_id = @categoria_id,
        conta_id     = @conta_id,
        observacao   = @observacao
      WHERE id = @id
    `).run(p)

    // Aplicar novo saldo
    _atualizarSaldoConta(db, p.conta_id, p.valor, p.tipo, 'creditar')

    return { ok: true }
  })

  // ── excluir ────────────────────────────────────────────
  ipcMain.handle('lancamentos:excluir', async (_e, id: number) => {
    if (getDatabaseProvider() === 'supabase') {
      const { error } = await getSupabase().rpc('excluir_lancamento', { p_id: id })
      if (error) throw new Error(error.message)
      return { ok: true }
    }
    const row = db.prepare(
      'SELECT valor, tipo, conta_id FROM lancamentos WHERE id = ?'
    ).get(id) as { valor: number; tipo: string; conta_id: number } | undefined

    if (row) {
      _atualizarSaldoConta(
        db, row.conta_id,
        row.valor,
        row.tipo as 'receita' | 'despesa',
        'reverter'
      )
    }

    db.prepare('DELETE FROM lancamentos WHERE id = ?').run(id)
    return { ok: true }
  })
}

// ── Utilitário: atualiza saldo da conta ───────────────────
function _atualizarSaldoConta(
  db:      ReturnType<typeof getDb>,
  contaId: number,
  valor:   number,
  tipo:    'receita' | 'despesa',
  modo:    'creditar' | 'reverter'
) {
  const sinal =
    (tipo === 'receita' && modo === 'creditar') ||
    (tipo === 'despesa' && modo === 'reverter')
      ? '+'
      : '-'

  db.prepare(`
    UPDATE contas SET saldo = saldo ${sinal} ? WHERE id = ?
  `).run(valor, contaId)
}
