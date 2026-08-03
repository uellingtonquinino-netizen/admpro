import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

export type DatabaseProvider = 'sqlite' | 'supabase'

let client: SupabaseClient | undefined

export function getDatabaseProvider(): DatabaseProvider {
  const provider = process.env.DATABASE_PROVIDER?.trim().toLowerCase()
  if (!provider || provider === 'sqlite') return 'sqlite'
  if (provider === 'supabase') return 'supabase'
  throw new Error('DATABASE_PROVIDER deve ser "sqlite" ou "supabase".')
}

/**
 * Cliente com a chave publica do projeto. Ele nao possui poderes administrativos:
 * todas as permissoes precisam ser aplicadas por RLS no Supabase.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client

  const url = process.env.SUPABASE_URL?.trim()
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) {
    throw new Error(
      'Supabase nao configurado. Defina SUPABASE_URL e SUPABASE_ANON_KEY no ambiente do aplicativo.'
    )
  }

  client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
      detectSessionInUrl: false,
    },
    realtime: {
      transport: WebSocket as unknown as never,
    },
  })
  return client
}

export async function checkSupabaseConnection(): Promise<
  { ok: true; authenticated: boolean } | { ok: false; erro: string }
> {
  try {
    const { data, error } = await getSupabase().auth.getSession()
    if (error) return { ok: false, erro: error.message }
    return { ok: true, authenticated: Boolean(data.session) }
  } catch (error) {
    return { ok: false, erro: error instanceof Error ? error.message : 'Falha ao conectar ao Supabase.' }
  }
}
