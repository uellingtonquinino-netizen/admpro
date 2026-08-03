import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { getDatabaseProvider, getSupabase } from '../supabase/client'

// ── Tipos ─────────────────────────────────────────────────
interface ListarParams {
  empresa_id: number
  ativo?:     number
}

interface CriarPayload {
  empresa_id: number
  nome:       string
  tipo:       string
  saldo:      number
  banco:      string | null
  agencia:    string | null
  numero:     string | null
  ativo:      number
}

interface AtualizarPayload extends CriarPayload {
  id: number
}

// ── Registro ──────────────────────────────────────────────
export function registerContasIpc() {
  const db = getDb()

  // ── listar ─────────────────────────────────────────────
  ipcMain.handle('contas:listar', async (_e, params: ListarParams) => {
    if (getDatabaseProvider() === 'supabase') {
      let query = getSupabase().from('contas').select('*').eq('empresa_id', params.empresa_id).order('nome')
      if (params.ativo !== undefined) query = query.eq('ativo', params.ativo)
      const { data, error } = await query; if (error) throw new Error(error.message); return data ?? []
    }
    const conds:  string[] = ['empresa_id = ?']
    const values: unknown[] = [params.empresa_id]

    if (params.ativo !== undefined) {
      conds.push('ativo = ?')
      values.push(params.ativo)
    }

    return db.prepare(`
      SELECT *
      FROM contas
      WHERE ${conds.join(' AND ')}
      ORDER BY nome ASC
    `).all(...values)
  })

  // ── buscarPorId ────────────────────────────────────────
  ipcMain.handle('contas:buscarPorId', async (_e, id: number) => {
    if (getDatabaseProvider() === 'supabase') {
      const { data, error } = await getSupabase().from('contas').select('*').eq('id', id).maybeSingle()
      if (error) throw new Error(error.message)
      return data ?? null
    }
    return db.prepare(
      'SELECT * FROM contas WHERE id = ?'
    ).get(id) ?? null
  })

  // ── criar ──────────────────────────────────────────────
  ipcMain.handle('contas:criar', async (_e, p: CriarPayload) => {
    if (getDatabaseProvider() === 'supabase') {
      const { data, error } = await getSupabase().rpc('criar_conta', { p })
      if (error) throw new Error(error.message)
      return { id: data }
    }
    const result = db.prepare(`
      INSERT INTO contas
        (empresa_id, nome, tipo, saldo, banco, agencia, numero, ativo)
      VALUES
        (@empresa_id, @nome, @tipo, @saldo, @banco, @agencia, @numero, @ativo)
    `).run(p)

    return { id: result.lastInsertRowid }
  })

  // ── atualizar ─────────────────────────────────────────
  ipcMain.handle('contas:atualizar', async (_e, p: AtualizarPayload) => {
    if (getDatabaseProvider() === 'supabase') {
      const { error } = await getSupabase().rpc('atualizar_conta', { p })
      if (error) throw new Error(error.message)
      return { ok: true }
    }
    db.prepare(`
      UPDATE contas SET
        nome    = @nome,
        tipo    = @tipo,
        saldo   = @saldo,
        banco   = @banco,
        agencia = @agencia,
        numero  = @numero,
        ativo   = @ativo
      WHERE id = @id
        AND empresa_id = @empresa_id
    `).run(p)

    return { ok: true }
  })

  // ── excluir ────────────────────────────────────────────
  ipcMain.handle('contas:excluir', async (_e, id: number) => {
    if (getDatabaseProvider() === 'supabase') {
      const { error } = await getSupabase().rpc('excluir_conta', { p_id: id })
      if (error) throw new Error(error.message)
      return { ok: true }
    }
    // Desvincular lançamentos antes de excluir
    db.prepare(
      'UPDATE lancamentos SET conta_id = NULL WHERE conta_id = ?'
    ).run(id)

    db.prepare('DELETE FROM contas WHERE id = ?').run(id)

    return { ok: true }
  })

  // ── saldoTotal ─────────────────────────────────────────
  ipcMain.handle('contas:saldoTotal', async (_e, empresa_id: number) => {
    if (getDatabaseProvider() === 'supabase') {
      const { data, error } = await getSupabase().from('contas').select('saldo').eq('empresa_id', empresa_id).eq('ativo', 1)
      if (error) throw new Error(error.message)
      return (data ?? []).reduce((r, c) => { const saldo = Number(c.saldo); r.total += saldo; saldo >= 0 ? r.positivo += saldo : r.negativo += saldo; return r }, { positivo: 0, negativo: 0, total: 0 })
    }
    const row = db.prepare(`
      SELECT
        SUM(CASE WHEN saldo >= 0 THEN saldo ELSE 0 END) AS positivo,
        SUM(CASE WHEN saldo <  0 THEN saldo ELSE 0 END) AS negativo,
        SUM(saldo)                                       AS total
      FROM contas
      WHERE empresa_id = ? AND ativo = 1
    `).get(empresa_id) as {
      positivo: number
      negativo: number
      total:    number
    }

    return {
      positivo: row.positivo ?? 0,
      negativo: row.negativo ?? 0,
      total:    row.total    ?? 0,
    }
  })
}
