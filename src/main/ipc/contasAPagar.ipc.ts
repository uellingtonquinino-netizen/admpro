import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { getDatabaseProvider, getSupabase } from '../supabase/client'

export function registerContasAPagarIpc() {
  const db = getDb()

  // ── Listar despesas (a vencer / vencidas / pagas) ────────
  ipcMain.handle('contasAPagar:listar', async (_e, p: {
    empresa_id: number; situacao?: 'a_vencer' | 'vencido' | 'pago'; busca?: string
  }) => {
    if (getDatabaseProvider()==='supabase') {
      let q=getSupabase().from('lancamentos').select('id,descricao,valor,data,data_venc,status,data_pgto,fornecedor_id').eq('empresa_id',p.empresa_id).eq('tipo','despesa').neq('status','cancelado').order('data_venc')
      if(p.situacao==='pago') q=q.eq('status','pago'); else if(p.situacao==='vencido') q=q.eq('status','pendente').lt('data_venc',new Date().toISOString().slice(0,10)); else if(p.situacao==='a_vencer') q=q.eq('status','pendente').gte('data_venc',new Date().toISOString().slice(0,10)); if(p.busca) q=q.ilike('descricao',`%${p.busca.replace(/[%_]/g,'\\$&')}%`)
      const {data,error}=await q; if(error) throw new Error(error.message); const hoje=new Date().toISOString().slice(0,10); return (data??[]).map(x=>({...x,situacao:x.status==='pago'?'pago':x.data_venc<hoje?'vencido':'a_vencer',origem:'outro'}))
    }
    const conds:  string[] = [`l.empresa_id = @empresa_id`, `l.tipo = 'despesa'`, `l.status != 'cancelado'`]
    const params: Record<string, unknown> = { empresa_id: p.empresa_id }

    if (p.busca) {
      conds.push(`(l.descricao LIKE @busca OR CAST(l.valor AS TEXT) LIKE @busca)`)
      params.busca = `%${p.busca}%`
    }

    const situacaoSql = `
      CASE
        WHEN l.status = 'pago' THEN 'pago'
        WHEN l.status = 'pendente' AND date(l.data_venc) < date('now') THEN 'vencido'
        ELSE 'a_vencer'
      END
    `
    if (p.situacao) {
      conds.push(`${situacaoSql} = @situacao`)
      params.situacao = p.situacao
    }

    return db.prepare(`
      SELECT
        l.id, l.descricao, l.valor, l.data, l.data_venc, l.status, l.data_pgto,
        f.nome AS fornecedor_nome,
        ${situacaoSql} AS situacao,
        CASE
          WHEN apb.id IS NOT NULL THEN 'ap'
          WHEN nfb.id IS NOT NULL THEN 'nf'
          ELSE 'outro'
        END AS origem
      FROM lancamentos l
      LEFT JOIN fornecedores f ON f.id = l.fornecedor_id
      LEFT JOIN autorizacoes_pagamento_boletos apb ON apb.lancamento_id = l.id
      LEFT JOIN notas_fiscais_boletos nfb ON nfb.lancamento_id = l.id
      WHERE ${conds.join(' AND ')}
      ORDER BY l.data_venc ASC
    `).all(params)
  })

  // ── Dar baixa (marcar como pago) ─────────────────────────
  ipcMain.handle('contasAPagar:darBaixa', async (_e, p: { id: number; data_pgto?: string }) => {
    if (getDatabaseProvider()==='supabase') { const {error}=await getSupabase().rpc('atualizar_baixa_lancamento',{p_id:p.id,p_status:'pago',p_data:p.data_pgto??null}); if(error) throw new Error(error.message); return {ok:true} }
    const dataPgto = p.data_pgto || new Date().toISOString().slice(0, 10)
    db.prepare(`UPDATE lancamentos SET status = 'pago', data_pgto = ? WHERE id = ?`)
      .run(dataPgto, p.id)
    return { ok: true }
  })

  // ── Reabrir (desfazer baixa) ──────────────────────────────
  ipcMain.handle('contasAPagar:reabrir', async (_e, id: number) => {
    if (getDatabaseProvider()==='supabase') { const {error}=await getSupabase().rpc('atualizar_baixa_lancamento',{p_id:id,p_status:'pendente',p_data:null}); if(error) throw new Error(error.message); return {ok:true} }
    db.prepare(`UPDATE lancamentos SET status = 'pendente', data_pgto = NULL WHERE id = ?`).run(id)
    return { ok: true }
  })

  // ── Pagamento parcial: baixa o valor pago e gera uma nova
  // parcela com o restante, no vencimento escolhido. O valor total
  // continua contando no mês de emissão original (só o vencimento da
  // parte restante muda).
  ipcMain.handle('contasAPagar:pagarParcial', async (_e, p: {
    id: number; valor_pago: number; novo_vencimento: string; data_pgto?: string
  }) => {
    if (getDatabaseProvider()==='supabase') { const {data,error}=await getSupabase().rpc('pagamento_parcial',{p}); if(error) throw new Error(error.message); return {ok:true,novoId:data} }
    const lanc = db.prepare(`SELECT * FROM lancamentos WHERE id = ?`).get(p.id) as
      { id: number; descricao: string; valor: number; data: string; empresa_id: number; fornecedor_id: number | null } | undefined
    if (!lanc) throw new Error('Lançamento não encontrado.')
    if (p.valor_pago <= 0 || p.valor_pago >= lanc.valor) {
      throw new Error('O valor pago deve ser maior que zero e menor que o valor total.')
    }

    const restante = lanc.valor - p.valor_pago
    const dataPgto = p.data_pgto || new Date().toISOString().slice(0, 10)

    const executar = db.transaction(() => {
      db.prepare(`UPDATE lancamentos SET valor = ?, status = 'pago', data_pgto = ? WHERE id = ?`)
        .run(p.valor_pago, dataPgto, p.id)

      const resultNovo = db.prepare(`
        INSERT INTO lancamentos (descricao, tipo, valor, data, data_venc, status, fornecedor_id, empresa_id)
        VALUES (@descricao, 'despesa', @valor, @data, @data_venc, 'pendente', @fornecedor_id, @empresa_id)
      `).run({
        descricao:     `${lanc.descricao} (restante)`,
        valor:         restante,
        data:          lanc.data,
        data_venc:     p.novo_vencimento,
        fornecedor_id: lanc.fornecedor_id,
        empresa_id:    lanc.empresa_id,
      })

      return resultNovo.lastInsertRowid
    })

    const novoId = executar()
    return { ok: true, novoId }
  })
}
