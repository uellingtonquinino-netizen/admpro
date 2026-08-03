import { ipcMain } from 'electron'
import { checkSupabaseConnection, getDatabaseProvider } from '../supabase/client'

/** Canal diagnóstico. Não expõe credenciais ao renderer. */
export function registerSupabaseIpc() {
  ipcMain.handle('supabase:status', async () => {
    const provider = getDatabaseProvider()
    if (provider === 'sqlite') {
      return { provider, configured: false, connected: false, authenticated: false }
    }

    const result = await checkSupabaseConnection()
    return result.ok
      ? { provider, configured: true, connected: true, authenticated: result.authenticated }
      : { provider, configured: true, connected: false, authenticated: false, erro: result.erro }
  })
}
