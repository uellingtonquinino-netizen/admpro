import { ipcMain } from 'electron'
import { getDatabaseProvider, getSupabase } from '../supabase/client'

// ALTERADO: antes precisava de um clique todo mês pra gerar a fatura
// e o boleto. Agora, com Assinatura no Asaas, isso vira um clique
// ÚNICO por obra ("Ativar Cobrança Automática") — depois disso, o
// Asaas gera a cobrança sozinho todo mês, e o webhook
// (webhook-asaas-fatura) cria a fatura aqui automaticamente. Esse
// módulo só funciona com Supabase (depende das Edge Functions).

export function registerFaturasIpc() {
  ipcMain.handle('faturas:listar', async (_e, empresa_id: number) => {
    if (getDatabaseProvider() !== 'supabase') return []
    const { data, error } = await getSupabase()
      .from('faturas').select('*').eq('empresa_id', empresa_id).order('mes_competencia', { ascending: false })
    if (error) throw new Error(error.message)
    return data ?? []
  })

  // Diz se essa obra já tem a cobrança automática ativada — controla
  // se a tela mostra o botão "Ativar" ou já a lista de faturas.
  ipcMain.handle('faturas:statusAssinatura', async (_e, empresa_id: number) => {
    if (getDatabaseProvider() !== 'supabase') return { ativa: false }
    const { data, error } = await getSupabase().from('empresas').select('asaas_subscription_id').eq('id', empresa_id).single()
    if (error) throw new Error(error.message)
    return { ativa: !!data.asaas_subscription_id }
  })

  ipcMain.handle('faturas:ativarAssinatura', async (_e, empresa_id: number) => {
    if (getDatabaseProvider() !== 'supabase') throw new Error('Faturas só funciona com Supabase configurado.')
    const { data, error } = await getSupabase().functions.invoke('criar-assinatura-fatura', { body: { empresa_id } })
    if (error) {
      // CORRIGIDO: quando a Edge Function responde com erro (status
      // não-2xx), o supabase-js só dá uma mensagem genérica
      // ("Edge Function returned a non-2xx status code") — a causa
      // de verdade fica no corpo da resposta, que precisa ser lido
      // à parte daqui.
      const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null) as { error?: string } | null
      throw new Error(corpo?.error ?? error.message)
    }
    if (data?.error) throw new Error(data.error)
    return data
  })
}
