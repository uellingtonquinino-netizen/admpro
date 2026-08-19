import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { getDatabaseProvider, getSupabase } from '../supabase/client'

// ALTERADO: sistema de notificações reorganizado — ficam só estas:
// aniversariante do dia, experiência vencendo (5 dias e no dia),
// AP nova (avisa o Gestor) e AP autorizada (avisa o ADM), entrada e
// saída de material no Almoxarifado (avisa o ADM), e estoque
// mínimo/zerado (avisa ADM e Almoxarife). As de boleto/AP vencendo
// por data de pagamento saíram — não fazem mais parte da lista.
export function registerNotificacoesIpc() {
  const db = getDb()

  // ── Estoque mínimo (produtos com estoque baixo, mas não zerado) ──
  ipcMain.handle('notificacoes:estoqueMinimo', async (_e, empresa_id: number) => {
    if(getDatabaseProvider()==='supabase') { const {data,error}=await getSupabase().from('produtos').select('id,codigo,nome,estoque_atual,unidade,estoque_minimo').eq('empresa_id',empresa_id).gt('estoque_atual',0).order('estoque_atual');if(error)throw new Error(error.message);return (data??[]).filter(p=>Number(p.estoque_atual)<=Number(p.estoque_minimo)).map(({estoque_minimo,...p})=>p) }
    return db.prepare(`
      SELECT id, codigo, nome, estoque_atual, unidade
      FROM produtos
      WHERE empresa_id = ? AND estoque_atual > 0 AND estoque_atual <= estoque_minimo
      ORDER BY estoque_atual ASC
    `).all(empresa_id)
  })

  // ── Estoque zerado ────────────────────────────────────────
  ipcMain.handle('notificacoes:estoqueZerado', async (_e, empresa_id: number) => {
    if(getDatabaseProvider()==='supabase') { const {data,error}=await getSupabase().from('produtos').select('id,codigo,nome,estoque_atual,unidade').eq('empresa_id',empresa_id).lte('estoque_atual',0).order('nome');if(error)throw new Error(error.message);return data??[] }
    return db.prepare(`
      SELECT id, codigo, nome, estoque_atual, unidade
      FROM produtos
      WHERE empresa_id = ? AND estoque_atual <= 0
      ORDER BY nome COLLATE NOCASE ASC
    `).all(empresa_id)
  })

  // ── Faturas vencendo hoje / já vencidas ──────────────────
  // NOVO: mesmo princípio do estoque mínimo/zerado acima — calculado
  // na hora que o sino é aberto, não fica guardado numa tabela. Some
  // sozinho quando a fatura for paga (não precisa "marcar como
  // lida").
  ipcMain.handle('notificacoes:faturas', async (_e, empresa_id: number) => {
    const hoje = new Date().toISOString().slice(0, 10)
    if (getDatabaseProvider() === 'supabase') {
      const { data, error } = await getSupabase()
        .from('faturas').select('id,mes_competencia,vencimento,valor')
        .eq('empresa_id', empresa_id).eq('status', 'aberta').order('vencimento')
      if (error) throw new Error(error.message)
      const todas = data ?? []
      return {
        vencidas:  todas.filter(f => f.vencimento < hoje),
        venceHoje: todas.filter(f => f.vencimento === hoje),
      }
    }
    const todas = db.prepare(`
      SELECT id, mes_competencia, vencimento, valor FROM faturas
      WHERE empresa_id = ? AND status = 'aberta' ORDER BY vencimento
    `).all(empresa_id) as { vencimento: string }[]
    return {
      vencidas:  todas.filter(f => f.vencimento < hoje),
      venceHoje: todas.filter(f => f.vencimento === hoje),
    }
  })

  // ── Eventos não lidos, para o perfil do usuário logado ────
  // (AP nova, AP autorizada, entrada/saída de material, lote novo,
  // solicitação ao Setor Pessoal)
  // NOVO: Setor Pessoal não tem obra própria (igual Central/Master) —
  // enxerga solicitações de TODAS as obras, então ignora o filtro de
  // empresa_id nesse caso específico.
  ipcMain.handle('notificacoes:eventos', async (_e, p: { empresa_id?: number; empresa_ids?: number[]; perfil: string }) => {
    if(getDatabaseProvider()==='supabase') { let q=getSupabase().from('notificacoes_eventos').select('id,tipo,titulo,mensagem,referencia_id,created_at').eq('destinatario_perfil',p.perfil).eq('lida',0).order('created_at',{ascending:false});if(p.perfil!=='setor_pessoal'){const ids=p.empresa_ids?.length?p.empresa_ids:p.empresa_id?[p.empresa_id]:[];if(!ids.length)return [];q=q.in('empresa_id',ids)}const {data,error}=await q;if(error)throw new Error(error.message);return data??[] }
    if (p.perfil === 'setor_pessoal') {
      return db.prepare(`
        SELECT id, tipo, titulo, mensagem, referencia_id, created_at
        FROM notificacoes_eventos
        WHERE destinatario_perfil = ? AND lida = 0
        ORDER BY created_at DESC
      `).all(p.perfil)
    }
    const ids = p.empresa_ids && p.empresa_ids.length > 0 ? p.empresa_ids : (p.empresa_id ? [p.empresa_id] : [])
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    return db.prepare(`
      SELECT id, tipo, titulo, mensagem, referencia_id, created_at
      FROM notificacoes_eventos
      WHERE empresa_id IN (${placeholders}) AND destinatario_perfil = ? AND lida = 0
      ORDER BY created_at DESC
    `).all(...ids, p.perfil)
  })

  // ── Marcar eventos como lidos (ao abrir o sino) ───────────
  ipcMain.handle('notificacoes:marcarEventosComoLidos', async (_e, p: { empresa_id?: number; empresa_ids?: number[]; perfil: string }) => {
    if(getDatabaseProvider()==='supabase') { let q=getSupabase().from('notificacoes_eventos').update({lida:1}).eq('destinatario_perfil',p.perfil).eq('lida',0);if(p.perfil!=='setor_pessoal'){const ids=p.empresa_ids?.length?p.empresa_ids:p.empresa_id?[p.empresa_id]:[];if(!ids.length)return {ok:true};q=q.in('empresa_id',ids)}const {error}=await q;if(error)throw new Error(error.message);return {ok:true} }
    if (p.perfil === 'setor_pessoal') {
      db.prepare(`UPDATE notificacoes_eventos SET lida = 1 WHERE destinatario_perfil = ? AND lida = 0`).run(p.perfil)
      return { ok: true }
    }
    const ids = p.empresa_ids && p.empresa_ids.length > 0 ? p.empresa_ids : (p.empresa_id ? [p.empresa_id] : [])
    if (ids.length === 0) return { ok: true }
    const placeholders = ids.map(() => '?').join(',')
    db.prepare(`
      UPDATE notificacoes_eventos SET lida = 1 WHERE empresa_id IN (${placeholders}) AND destinatario_perfil = ? AND lida = 0
    `).run(...ids, p.perfil)
    return { ok: true }
  })
}

// Helper reaproveitado pelos outros módulos (AP, Entradas, Saídas)
// pra criar um evento de notificação sem duplicar essa lógica.
export function criarNotificacaoEvento(db: ReturnType<typeof getDb>, p: {
  empresa_id: number; tipo: string; destinatario_perfil: string; titulo: string; mensagem?: string | null
  referencia_id?: number | null
}) {
  db.prepare(`
    INSERT INTO notificacoes_eventos (empresa_id, tipo, destinatario_perfil, titulo, mensagem, referencia_id)
    VALUES (@empresa_id, @tipo, @destinatario_perfil, @titulo, @mensagem, @referencia_id)
  `).run({ ...p, mensagem: p.mensagem ?? null, referencia_id: p.referencia_id ?? null })
}
