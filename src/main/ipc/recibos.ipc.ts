import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'

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

  ipcMain.handle('recibos:emitir', (_e, p: EmitirPayload) => {
    const result = db.prepare(`
      INSERT INTO recibos (empresa_id, beneficiario_nome, valor, referente)
      VALUES (@empresa_id, @beneficiario_nome, @valor, @referente)
    `).run({ ...p, referente: p.referente ?? null })

    return { numero: result.lastInsertRowid }
  })
}
