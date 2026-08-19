import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { getDatabaseProvider, getSupabase } from '../supabase/client'

interface ListarParams {
  empresa_id: number
  busca?:     string
  ativo?:     boolean
}

interface FornecedorPayload {
  nome:            string
  tipo_pessoa:     'pj' | 'pf'
  cnpj?:           string | null
  cpf?:            string | null
  email?:          string | null
  telefone?:       string | null
  endereco?:       string | null
  categoria?:      string | null
  forma_pagamento: 'boleto' | 'conta'
  banco?:          string | null
  agencia?:        string | null
  operacao?:       string | null
  conta?:          string | null
  conta_digito?:   string | null
  tipo_conta?:     string | null
  chave_pix?:      string | null
  ativo?:          boolean
}

interface CriarPayload extends FornecedorPayload { empresa_id: number }
interface AtualizarPayload extends FornecedorPayload { id: number }

const CAMPOS = [
  'nome', 'tipo_pessoa', 'cnpj', 'cpf', 'email', 'telefone', 'endereco',
  'categoria', 'forma_pagamento', 'banco', 'agencia', 'operacao', 'conta',
  'conta_digito', 'tipo_conta', 'chave_pix', 'ativo',
] as const

export function registerFornecedoresIpc() {
  const db = getDb()

  ipcMain.handle('fornecedores:listar', async (_e, p: ListarParams) => {
    if (getDatabaseProvider() === 'supabase') {
      let query = getSupabase().from('fornecedores').select('*').eq('empresa_id', p.empresa_id).order('nome')
      if (p.ativo !== undefined) query = query.eq('ativo', p.ativo ? 1 : 0)
      if (p.busca) query = query.ilike('nome', `%${p.busca.replace(/[%_]/g, '\\$&')}%`)
      const { data, error } = await query; if (error) throw new Error(error.message); return data ?? []
    }
    const conds:  string[] = ['empresa_id = @empresa_id']
    const params: Record<string, unknown> = { empresa_id: p.empresa_id }

    if (p.busca) {
      conds.push(`(nome LIKE @busca OR cnpj LIKE @busca OR cpf LIKE @busca)`)
      params.busca = `%${p.busca}%`
    }
    if (p.ativo !== undefined) {
      conds.push('ativo = @ativo')
      params.ativo = p.ativo ? 1 : 0
    }

    return db.prepare(`
      SELECT * FROM fornecedores
      WHERE ${conds.join(' AND ')}
      ORDER BY nome ASC
    `).all(params)
  })

  // ── Listagem leve (para o seletor de beneficiário na AP) ──
  ipcMain.handle('fornecedores:listarResumo', async (_e, empresa_id: number) => {
    if (getDatabaseProvider() === 'supabase') { const { data, error } = await getSupabase().from('fornecedores').select('id,nome,cnpj,cpf,tipo_pessoa').eq('empresa_id', empresa_id).eq('ativo', 1).order('nome'); if (error) throw new Error(error.message); return data ?? [] }
    return db.prepare(`
      SELECT id, nome, cnpj, cpf, tipo_pessoa
      FROM fornecedores
      WHERE empresa_id = ? AND ativo = 1
      ORDER BY nome ASC
    `).all(empresa_id)
  })

  ipcMain.handle('fornecedores:buscarPorId', async (_e, id: number) => {
    if (getDatabaseProvider() === 'supabase') { const { data, error } = await getSupabase().from('fornecedores').select('*').eq('id', id).maybeSingle(); if (error) throw new Error(error.message); return data ?? null }
    return db.prepare(`SELECT * FROM fornecedores WHERE id = ?`).get(id)
  })

  ipcMain.handle('fornecedores:criar', async (_e, p: CriarPayload) => {
    if (getDatabaseProvider() === 'supabase') { const { data, error } = await getSupabase().from('fornecedores').insert({ ...p, ativo: p.ativo === false ? 0 : 1 }).select('id').single(); if (error) throw new Error(error.message); return { id: data.id } }
    const cols  = ['empresa_id', ...CAMPOS]
    const binds = cols.map(c => `@${c}`).join(', ')
    const data: Record<string, unknown> = { empresa_id: p.empresa_id }
    for (const c of CAMPOS) {
      const v = (p as unknown as Record<string, unknown>)[c]
      data[c] = c === 'ativo' ? (v === undefined ? 1 : (v ? 1 : 0)) : (v ?? null)
    }

    const result = db.prepare(`
      INSERT INTO fornecedores (${cols.join(', ')})
      VALUES (${binds})
    `).run(data)

    return { id: result.lastInsertRowid }
  })

  ipcMain.handle('fornecedores:atualizar', async (_e, p: AtualizarPayload) => {
    if (getDatabaseProvider() === 'supabase') { const { id, ...dados } = p; const { error } = await getSupabase().from('fornecedores').update({ ...dados, ativo: p.ativo === false ? 0 : 1 }).eq('id', id); if (error) throw new Error(error.message); return { ok: true } }
    const sets: string[] = []
    const data: Record<string, unknown> = { id: p.id }
    for (const c of CAMPOS) {
      const v = (p as unknown as Record<string, unknown>)[c]
      sets.push(`${c} = @${c}`)
      data[c] = c === 'ativo' ? (v ? 1 : 0) : (v ?? null)
    }

    db.prepare(`
      UPDATE fornecedores SET ${sets.join(', ')} WHERE id = @id
    `).run(data)

    return { ok: true }
  })

  ipcMain.handle('fornecedores:excluir', async (_e, id: number) => {
    if (getDatabaseProvider() === 'supabase') {
      const s = getSupabase()
      const { data: fornecedor } = await s.from('fornecedores').select('nome,cnpj,cpf,empresa_id').eq('id', id).single()
      if (fornecedor) {
        await s.rpc('registrar_exclusao', {
          p_tabela: 'fornecedores', p_registro_id: id,
          p_descricao: `Fornecedor - ${fornecedor.nome}`,
          p_empresa_id: fornecedor.empresa_id,
        })
      }
      const { error } = await s.from('fornecedores').delete().eq('id', id); if (error) throw new Error(error.message); return { ok: true }
    }
    db.prepare('DELETE FROM fornecedores WHERE id = ?').run(id)
    return { ok: true }
  })
}
