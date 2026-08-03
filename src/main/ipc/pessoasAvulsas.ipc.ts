import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { getDatabaseProvider, getSupabase } from '../supabase/client'

export function registerPessoasAvulsasIpc() {
  const db = getDb()

  ipcMain.handle('pessoasAvulsas:listar', async (_e, p: { empresa_id: number; busca?: string }) => {
    if(getDatabaseProvider()==='supabase') { let q=getSupabase().from('pessoas_avulsas').select('*').eq('empresa_id',p.empresa_id).order('nome');if(p.busca)q=q.ilike('nome',`%${p.busca.replace(/[%_]/g,'\\$&')}%`);const {data,error}=await q;if(error)throw new Error(error.message);return data??[] }
    const conds:  string[] = ['empresa_id = @empresa_id']
    const params: Record<string, unknown> = { empresa_id: p.empresa_id }
    if (p.busca) {
      conds.push(`nome LIKE @busca`)
      params.busca = `%${p.busca}%`
    }
    return db.prepare(`
      SELECT * FROM pessoas_avulsas WHERE ${conds.join(' AND ')} ORDER BY nome COLLATE NOCASE ASC
    `).all(params)
  })

  ipcMain.handle('pessoasAvulsas:criar', async (_e, p: { empresa_id: number; nome: string; cpf?: string | null }) => {
    if(getDatabaseProvider()==='supabase') { const {data,error}=await getSupabase().from('pessoas_avulsas').insert({empresa_id:p.empresa_id,nome:p.nome,cpf:p.cpf??null}).select('id').single();if(error)throw new Error(error.message);return {id:data.id} }
    const result = db.prepare(`
      INSERT INTO pessoas_avulsas (empresa_id, nome, cpf) VALUES (?, ?, ?)
    `).run(p.empresa_id, p.nome, p.cpf ?? null)
    return { id: result.lastInsertRowid }
  })
}
