import { app } from 'electron'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { basename, join } from 'path'
import { getSupabase } from './client'
const prefix='supabase://documentos-rh/'
export const isStorageUri=(v:string)=>v.startsWith(prefix)
export const storagePath=(v:string)=>v.slice(prefix.length)
export async function uploadDocumento(local:string, remote:string) { const {error}=await getSupabase().storage.from('documentos-rh').upload(remote,await readFile(local)); if(error) throw new Error(error.message); return prefix+remote }
export async function baixarDocumento(uri:string) { const {data,error}=await getSupabase().storage.from('documentos-rh').download(storagePath(uri)); if(error||!data) throw new Error(error?.message??'Arquivo não encontrado.'); const dir=join(app.getPath('temp'),'otimizzai-supabase'); await mkdir(dir,{recursive:true}); const local=join(dir,`${Date.now()}-${basename(storagePath(uri))}`); await writeFile(local,Buffer.from(await data.arrayBuffer())); return local }
