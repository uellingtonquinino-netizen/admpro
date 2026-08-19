import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { getDatabaseProvider, getSupabase } from '../supabase/client'

interface EmitirPayload {
  empresa_id:        number
  beneficiario_nome: string
  valor:             number
  referente?:        string | null
}

// NOVO: número do recibo agora é gerado automaticamente e sequencial
// por obra, em vez de digitado manualmente.
export function registerRecibosIpc() {
  const db = getDb()

  ipcMain.handle('recibos:emitir', async (_e, p: EmitirPayload) => {
    if (getDatabaseProvider() === 'supabase') {
      const { data, error } = await getSupabase().from('recibos').insert({
        empresa_id: p.empresa_id, beneficiario_nome: p.beneficiario_nome, valor: p.valor, referente: p.referente ?? null,
      }).select('id').single()
      if (error) throw new Error(error.message)
      return { numero: data.id }
    }
    const result = db.prepare(`
      INSERT INTO recibos (empresa_id, beneficiario_nome, valor, referente)
      VALUES (@empresa_id, @beneficiario_nome, @valor, @referente)
    `).run({ ...p, referente: p.referente ?? null })

    return { numero: result.lastInsertRowid }
  })
}
