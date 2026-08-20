import type { SupabaseClient } from '@supabase/supabase-js'

// PORTADO de src/main/supabase/storage.ts (Electron) — mesma lógica,
// só trabalhando com Buffer em memória em vez de caminho de arquivo
// local (não faz sentido escrever em disco numa função serverless
// pra logo em seguida ler de volta).
const PREFIXO = 'supabase://documentos-rh/'

export function ehStorageUri(v: string): boolean {
  return v.startsWith(PREFIXO)
}

export function caminhoStorage(v: string): string {
  return v.slice(PREFIXO.length)
}

export async function baixarDocumentoBuffer(supabase: SupabaseClient, uri: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from('documentos-rh').download(caminhoStorage(uri))
  if (error || !data) throw new Error(error?.message ?? 'Arquivo não encontrado no Storage.')
  return Buffer.from(await data.arrayBuffer())
}

export async function subirDocumentoBuffer(supabase: SupabaseClient, remoto: string, bytes: Buffer | Uint8Array): Promise<string> {
  const { error } = await supabase.storage.from('documentos-rh').upload(remoto, bytes, { upsert: true, contentType: 'application/pdf' })
  if (error) throw new Error(error.message)
  return PREFIXO + remoto
}
