import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { getDatabaseProvider, getSupabase } from '../supabase/client'

interface ListarParams {
  empresa_id: number
  tipo?:      string
}

interface CriarPayload {
  empresa_id: number
  nome:       string
  tipo:       string
  cor:        string
}

interface AtualizarPayload extends CriarPayload {
  id: number
}

export function registerCategoriasIpc() {
  const db = getDb()

  // ── listar ─────────────────────────────────────────────
  ipcMain.handle('categorias:listar', async (_e, params: ListarParams) => {
    if (getDatabaseProvider() === 'supabase') {
      let query = getSupabase().from('categorias').select('*').eq('empresa_id', params.empresa_id).order('nome')
      if (params.tipo) query = query.in('tipo', [params.tipo, 'ambos'])
      const { data, error } = await query; if (error) throw new Error(error.message); return data ?? []
    }
    const conds:  string[] = ['empresa_id = ?']
    const values: unknown[] = [params.empresa_id]

    if (params.tipo) {
      conds.push(`(tipo = ? OR tipo = 'ambos')`)
      values.push(params.tipo)
    }

    return db.prepare(`
      SELECT *
      FROM categorias
      WHERE ${conds.join(' AND ')}
      ORDER BY nome ASC
    `).all(...values)
  })

  // ── criar ──────────────────────────────────────────────
  ipcMain.handle('categorias:criar', async (_e, p: CriarPayload) => {
    if (getDatabaseProvider() === 'supabase') {
      const { data, error } = await getSupabase().rpc('criar_categoria', { p })
      if (error) throw new Error(error.message)
      return { id: data }
    }
    const result = db.prepare(`
      INSERT INTO categorias (empresa_id, nome, tipo, cor)
      VALUES (@empresa_id, @nome, @tipo, @cor)
    `).run(p)
    return { id: result.lastInsertRowid }
  })

  // ── atualizar ─────────────────────────────────────────
  ipcMain.handle('categorias:atualizar', async (_e, p: AtualizarPayload) => {
    if (getDatabaseProvider() === 'supabase') {
      const { error } = await getSupabase().rpc('atualizar_categoria', { p })
      if (error) throw new Error(error.message)
      return { ok: true }
    }
    db.prepare(`
      UPDATE categorias SET
        nome = @nome,
        tipo = @tipo,
        cor  = @cor
      WHERE id = @id
        AND empresa_id = @empresa_id
    `).run(p)
    return { ok: true }
  })

  // ── excluir ────────────────────────────────────────────
  ipcMain.handle('categorias:excluir', async (_e, id: number) => {
    if (getDatabaseProvider() === 'supabase') {
      const { error } = await getSupabase().rpc('excluir_categoria', { p_id: id })
      if (error) throw new Error(error.message)
      return { ok: true }
    }
    // Desvincular lançamentos antes de excluir
    db.prepare(
      'UPDATE lancamentos SET categoria_id = NULL WHERE categoria_id = ?'
    ).run(id)

    db.prepare('DELETE FROM categorias WHERE id = ?').run(id)
    return { ok: true }
  })

  // ── sugestões (autocomplete) ──────────────────────────
  ipcMain.handle('categorias:sugestoes', async (_e, params: {
    empresa_id: number
    busca:      string
    tipo?:      string
  }) => {
    if (getDatabaseProvider() === 'supabase') {
      let query = getSupabase().from('categorias').select('id,nome,tipo,cor').eq('empresa_id', params.empresa_id).ilike('nome', `%${params.busca.replace(/[%_]/g, '\\$&')}%`).order('nome').limit(10)
      if (params.tipo) query = query.in('tipo', [params.tipo, 'ambos'])
      const { data, error } = await query
      if (error) throw new Error(error.message)
      return data ?? []
    }
    const conds  = ['empresa_id = ?', 'nome LIKE ?']
    const values: unknown[] = [params.empresa_id, `%${params.busca}%`]

    if (params.tipo) {
      conds.push(`(tipo = ? OR tipo = 'ambos')`)
      values.push(params.tipo)
    }

    return db.prepare(`
      SELECT id, nome, tipo, cor
      FROM categorias
      WHERE ${conds.join(' AND ')}
      ORDER BY nome ASC
      LIMIT 10
    `).all(...values)
  })
}
