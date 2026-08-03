import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { getDatabaseProvider, getSupabase } from '../supabase/client'

type TipoOpcao = 'funcao' | 'setor' | 'equipe'

export function registerOpcoesIpc() {
  const db = getDb()

  // ── Listar (por tipo) ────────────────────────────────────
  ipcMain.handle('opcoes:listar', async (_e, p: { empresa_id: number; tipo: TipoOpcao }) => {
    if(getDatabaseProvider()==='supabase') { const {data,error}=await getSupabase().from('opcoes_colaborador').select('*').eq('empresa_id',p.empresa_id).eq('tipo',p.tipo).eq('ativo',1).order('nome');if(error)throw new Error(error.message);return data??[] }
    return db.prepare(`
      SELECT * FROM opcoes_colaborador
      WHERE empresa_id = ? AND tipo = ? AND ativo = 1
      ORDER BY nome ASC
    `).all(p.empresa_id, p.tipo)
  })

  // ── Criar ─────────────────────────────────────────────────
  ipcMain.handle('opcoes:criar', async (_e, p: { empresa_id: number; tipo: TipoOpcao; nome: string }) => {
    if(getDatabaseProvider()==='supabase') { const nome=p.nome.trim();const {data:existente,error:consultaError}=await getSupabase().from('opcoes_colaborador').select('id').eq('empresa_id',p.empresa_id).eq('tipo',p.tipo).eq('nome',nome).maybeSingle();if(consultaError)throw new Error(consultaError.message);if(existente)throw new Error('Já existe um item com esse nome.');const {data,error}=await getSupabase().from('opcoes_colaborador').insert({...p,nome}).select('id').single();if(error)throw new Error(error.message);return {id:data.id,nome} }
    const existente = db.prepare(`
      SELECT id FROM opcoes_colaborador WHERE empresa_id = ? AND tipo = ? AND nome = ?
    `).get(p.empresa_id, p.tipo, p.nome.trim())

    if (existente) throw new Error('Já existe um item com esse nome.')

    const result = db.prepare(`
      INSERT INTO opcoes_colaborador (empresa_id, tipo, nome)
      VALUES (@empresa_id, @tipo, @nome)
    `).run({ ...p, nome: p.nome.trim() })

    return { id: result.lastInsertRowid, nome: p.nome.trim() }
  })

  // ── Renomear ──────────────────────────────────────────────
  ipcMain.handle('opcoes:atualizar', async (_e, p: { id: number; nome: string }) => {
    if(getDatabaseProvider()==='supabase') { const {error}=await getSupabase().from('opcoes_colaborador').update({nome:p.nome.trim()}).eq('id',p.id);if(error)throw new Error(error.message);return {ok:true} }
    db.prepare(`UPDATE opcoes_colaborador SET nome = ? WHERE id = ?`).run(p.nome.trim(), p.id)
    return { ok: true }
  })

  // ── Excluir (soft-delete, não afeta colaboradores já cadastrados) ──
  ipcMain.handle('opcoes:excluir', async (_e, id: number) => {
    if(getDatabaseProvider()==='supabase') { const {error}=await getSupabase().from('opcoes_colaborador').update({ativo:0}).eq('id',id);if(error)throw new Error(error.message);return {ok:true} }
    db.prepare(`UPDATE opcoes_colaborador SET ativo = 0 WHERE id = ?`).run(id)
    return { ok: true }
  })
}
