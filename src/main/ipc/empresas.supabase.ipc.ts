import { ipcMain } from 'electron'
import { getSupabase } from '../supabase/client'

interface CriarPayload {
  nome: string
  titulo_obra?: string | null
  razao_social?: string | null
  cnpj: string | null
  email: string | null
  telefone: string | null
  endereco: string | null
  cidade?: string | null
  estado?: string | null
  logo_url?: string | null
  solicitante_padrao?: string | null
  autorizado_por_padrao?: string | null
}

interface AtualizarPayload extends CriarPayload { id: number }

function normalizar(payload: CriarPayload) {
  return {
    ...payload,
    titulo_obra: payload.titulo_obra ?? null,
    razao_social: payload.razao_social ?? null,
    cidade: payload.cidade ?? null,
    estado: payload.estado ?? null,
    logo_url: payload.logo_url ?? null,
    solicitante_padrao: payload.solicitante_padrao ?? null,
    autorizado_por_padrao: payload.autorizado_por_padrao ?? null,
  }
}

export function registerSupabaseEmpresasIpc() {
  ipcMain.handle('empresas:listar', async () => {
    const { data, error } = await getSupabase().from('empresas').select('*').eq('ativo', 1).order('nome')
    if (error) throw new Error(error.message)
    return data ?? []
  })

  ipcMain.handle('empresas:buscarPorId', async (_event, id: number) => {
    const { data, error } = await getSupabase().from('empresas').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    return data ?? null
  })

  ipcMain.handle('empresas:criar', async (_event, payload: CriarPayload) => {
    const { data, error } = await getSupabase()
      .from('empresas').insert({ ...normalizar(payload), ativo: 1 }).select('id').single()
    if (error) throw new Error(error.message)
    return { id: data.id }
  })

  ipcMain.handle('empresas:atualizar', async (_event, payload: AtualizarPayload) => {
    const { id, ...dados } = payload
    const { error } = await getSupabase().from('empresas').update(normalizar(dados)).eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

  ipcMain.handle('empresas:excluir', async (_event, id: number) => {
    const { error } = await getSupabase().from('empresas').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })
}
