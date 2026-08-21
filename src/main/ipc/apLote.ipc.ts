import { ipcMain } from 'electron'
import { getDatabaseProvider, getSupabase } from '../supabase/client'
import { uploadDocumento } from '../supabase/storage'
import { basename } from 'path'

// NOVO: Autorização de Pagamento em Lote — um documento cobrindo
// vários fornecedores/colaboradores de uma vez, cada um com só 1
// valor (diferente da AP normal, que aceita vários boletos por
// pessoa). Mesmo fluxo de aprovação Gestor→Supervisor que a AP normal
// já tem.
//
// IMPORTANTE: essa funcionalidade só existe pro modo Supabase (nuvem)
// — não foi replicada pro SQLite local, já que é uma funcionalidade
// nova e o uso real do sistema já é todo via Supabase. Se alguém
// tentar usar no modo local, cai no erro claro abaixo, em vez de
// travar sem explicação.

function exigirSupabase() {
  if (getDatabaseProvider() !== 'supabase') {
    throw new Error('Pagamento em Lote só está disponível no modo online (Supabase) — não existe versão local dessa funcionalidade.')
  }
}

export function registerApLoteIpc() {
  ipcMain.handle('apLote:criar', async (_e, p: Record<string, unknown> & { empresa_id: number; anexos?: { caminho: string }[] }) => {
    exigirSupabase()
    const { data, error } = await getSupabase().rpc('criar_ap_lote', { p: { ...p, anexos: undefined } })
    if (error) throw new Error(error.message)
    const loteId = data
    for (let ordem = 0; ordem < (p.anexos?.length ?? 0); ordem++) {
      const item = p.anexos![ordem]
      const remoto = `${p.empresa_id}/autorizacoes-pagamento-lote/${loteId}/${Date.now()}-${basename(item.caminho).replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const caminho = await uploadDocumento(item.caminho, remoto)
      const resultado = await getSupabase().from('autorizacoes_pagamento_lote_anexos').insert({ autorizacao_lote_id: loteId, caminho, ordem })
      if (resultado.error) throw new Error(resultado.error.message)
    }
    return { id: loteId }
  })

  ipcMain.handle('apLote:listar', async (_e, empresaId: number) => {
    exigirSupabase()
    const supabase = getSupabase()
    const [{ data: lotes, error: e1 }, { data: itens, error: e2 }] = await Promise.all([
      supabase.from('autorizacoes_pagamento_lote').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }),
      supabase.from('autorizacoes_pagamento_lote_itens').select('autorizacao_lote_id,valor'),
    ])
    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)
    return (lotes ?? []).map(l => {
      const doLote = (itens ?? []).filter(i => i.autorizacao_lote_id === l.id)
      return { ...l, quantidade_itens: doLote.length, valor_total: doLote.reduce((s, i) => s + Number(i.valor), 0) }
    })
  })

  ipcMain.handle('apLote:buscarPorId', async (_e, id: number) => {
    exigirSupabase()
    const supabase = getSupabase()
    const [{ data: lote, error: e1 }, { data: itens, error: e2 }, { data: anexosRows, error: e3 }] = await Promise.all([
      supabase.from('autorizacoes_pagamento_lote').select('*').eq('id', id).maybeSingle(),
      supabase.from('autorizacoes_pagamento_lote_itens').select('*').eq('autorizacao_lote_id', id).order('ordem'),
      supabase.from('autorizacoes_pagamento_lote_anexos').select('caminho').eq('autorizacao_lote_id', id).order('ordem'),
    ])
    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)
    if (e3) throw new Error(e3.message)
    if (!lote) return null
    const ids = [lote.aprovado_por_usuario_id, lote.aprovado_supervisor_por_usuario_id].filter((x): x is number => x !== null)
    let carimbos = new Map<number, string | null>()
    if (ids.length) {
      const r = await supabase.rpc('carimbos_usuarios', { p_ids: ids })
      if (r.error) throw new Error(r.error.message)
      carimbos = new Map((r.data ?? []).map((u: any) => [u.id, u.carimbo_url]))
    }
    return {
      ...lote, itens: itens ?? [], anexos: (anexosRows ?? []).map(a => a.caminho),
      aprovado_por_carimbo_url: carimbos.get(lote.aprovado_por_usuario_id) ?? null,
      aprovado_supervisor_carimbo_url: carimbos.get(lote.aprovado_supervisor_por_usuario_id) ?? null,
    }
  })

  ipcMain.handle('apLote:aprovar', async (_e, id: number) => {
    exigirSupabase()
    const { data, error } = await getSupabase().rpc('aprovar_ap_lote', { p_id: id })
    if (error) throw new Error(error.message)
    return { ok: true, aprovado_em: data }
  })

  ipcMain.handle('apLote:salvarCaminhoPdf', async (_e, p: { id: number; pdf_path: string }) => {
    exigirSupabase()
    const { error } = await getSupabase().from('autorizacoes_pagamento_lote').update({ pdf_path: p.pdf_path }).eq('id', p.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

  ipcMain.handle('apLote:excluir', async (_e, id: number) => {
    exigirSupabase()
    const { error } = await getSupabase().rpc('excluir_ap_lote', { p_id: id })
    if (error) throw new Error(error.message)
    return { ok: true }
  })
}
