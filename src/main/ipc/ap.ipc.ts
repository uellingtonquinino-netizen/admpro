import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { criarNotificacaoEvento } from './notificacoes.ipc'
import { verificarLoteConcluido } from './lotes.ipc'
import { getDatabaseProvider, getSupabase } from '../supabase/client'
import { uploadDocumento } from '../supabase/storage'
import { basename } from 'path'

interface Boleto {
  valor:      number
  vencimento: string
}

interface RegistrarPayload {
  empresa_id:         number
  beneficiario_tipo:  'fornecedor' | 'colaborador'
  beneficiario_id:    number
  beneficiario_nome:  string
  descricao?:         string | null
  boletos:            Boleto[]
  observacoes?:       string | null
  solicitante?:       string | null
  autorizado_por?:    string | null
  anexos?:            string[]
}

export function registerApIpc() {
  const db = getDb()

  // ── Última AP emitida para um beneficiário (puxa descrição/valor) ──
  ipcMain.handle('ap:buscarUltima', async (_e, p: { beneficiario_tipo: string; beneficiario_id: number }) => {
    if(getDatabaseProvider()==='supabase') { const s=getSupabase();const {data:ap,error}=await s.from('autorizacoes_pagamento').select('*').eq('beneficiario_tipo',p.beneficiario_tipo).eq('beneficiario_id',p.beneficiario_id).order('created_at',{ascending:false}).limit(1).maybeSingle();if(error)throw new Error(error.message);if(!ap)return undefined;const {data:boletos,error:boletosError}=await s.from('autorizacoes_pagamento_boletos').select('valor,vencimento').eq('ap_id',ap.id).order('vencimento');if(boletosError)throw new Error(boletosError.message);return {...ap,boletos:boletos??[]} }
    const ap = db.prepare(`
      SELECT * FROM autorizacoes_pagamento
      WHERE beneficiario_tipo = ? AND beneficiario_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(p.beneficiario_tipo, p.beneficiario_id) as { id: number } | undefined
    if (!ap) return undefined

    const boletos = db.prepare(
      `SELECT valor, vencimento FROM autorizacoes_pagamento_boletos WHERE ap_id = ? ORDER BY vencimento ASC`
    ).all(ap.id)
    return { ...ap, boletos }
  })

  // ── Registrar uma AP emitida (histórico + auditoria) ────
  // ALTERADO: cada boleto agora vira sua PRÓPRIA despesa (não mais uma
  // única despesa somando tudo), para permitir dar baixa/pagamento
  // parcial por boleto — mesmo padrão da Nota Fiscal. CORRIGIDO: a
  // despesa nasce "pendente" (não mais "pago" automático), usando a
  // data de EMISSÃO como "data" (conta em Despesas do Mês) e o
  // vencimento de cada boleto como "data_venc" (define Situação:
  // A vencer / Vencido / Pago).
  ipcMain.handle('ap:registrar', async (_e, p: RegistrarPayload) => {
    if (getDatabaseProvider() === 'supabase') {
      const { data: apId, error } = await getSupabase().rpc('criar_ap', { p })
      if (error) throw new Error(error.message)
      for (let ordem = 0; ordem < (p.anexos?.length ?? 0); ordem++) {
        const local = p.anexos![ordem]
        const remoto = `${p.empresa_id}/autorizacoes-pagamento/${apId}/${Date.now()}-${basename(local).replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const caminho = await uploadDocumento(local, remoto)
        const resultado = await getSupabase().from('autorizacoes_pagamento_anexos').insert({ ap_id: apId, caminho, ordem })
        if (resultado.error) throw new Error(resultado.error.message)
      }
      return { id: apId }
    }
    if (!p.boletos || p.boletos.length === 0) {
      throw new Error('Inclua ao menos um valor e vencimento.')
    }
    const total = p.boletos.reduce((soma, b) => soma + b.valor, 0)
    const hoje  = new Date().toISOString().slice(0, 10)

    const registrar = db.transaction(() => {
      const resultAp = db.prepare(`
        INSERT INTO autorizacoes_pagamento (
          empresa_id, beneficiario_tipo, beneficiario_id, beneficiario_nome,
          descricao, valor, observacoes, vencimento, solicitante, autorizado_por
        ) VALUES (
          @empresa_id, @beneficiario_tipo, @beneficiario_id, @beneficiario_nome,
          @descricao, @valor, @observacoes, @vencimento, @solicitante, @autorizado_por
        )
      `).run({
        empresa_id:        p.empresa_id,
        beneficiario_tipo: p.beneficiario_tipo,
        beneficiario_id:   p.beneficiario_id,
        beneficiario_nome: p.beneficiario_nome,
        descricao:         p.descricao ?? null,
        valor:             total,
        observacoes:       p.observacoes ?? null,
        vencimento:        p.boletos[0].vencimento,
        solicitante:       p.solicitante ?? null,
        autorizado_por:    p.autorizado_por ?? null,
      })
      const apId = resultAp.lastInsertRowid as number

      const inserirBoleto = db.prepare(`
        INSERT INTO autorizacoes_pagamento_boletos (ap_id, valor, vencimento) VALUES (?, ?, ?)
      `)
      const inserirLancamento = db.prepare(`
        INSERT INTO lancamentos (descricao, tipo, valor, data, data_venc, status, empresa_id)
        VALUES (@descricao, 'despesa', @valor, @data, @data_venc, 'pendente', @empresa_id)
      `)
      const vincular = db.prepare(`UPDATE autorizacoes_pagamento_boletos SET lancamento_id = ? WHERE id = ?`)

      for (const b of p.boletos) {
        const boletoId = inserirBoleto.run(apId, b.valor, b.vencimento).lastInsertRowid
        const resultLanc = inserirLancamento.run({
          descricao:  `AP - ${p.beneficiario_nome}${p.descricao ? `: ${p.descricao}` : ''}`,
          valor:      b.valor,
          data:       hoje,
          data_venc:  b.vencimento,
          empresa_id: p.empresa_id,
        })
        vincular.run(resultLanc.lastInsertRowid, boletoId)
      }

      // NOVO: guarda os caminhos dos anexos (nota/recibo, boletos,
      // medição), na ordem escolhida — permite reimprimir a AP junto
      // com eles depois, sem precisar anexar tudo de novo.
      if (p.anexos && p.anexos.length > 0) {
        const inserirAnexo = db.prepare(`
          INSERT INTO autorizacoes_pagamento_anexos (ap_id, caminho, ordem) VALUES (?, ?, ?)
        `)
        p.anexos.forEach((caminho, i) => inserirAnexo.run(apId, caminho, i))
      }

      return apId
    })

    const id = registrar()

    // NOVO: avisa o Gestor que tem uma AP nova pra autorizar.
    criarNotificacaoEvento(db, {
      empresa_id: p.empresa_id,
      tipo: 'ap_nova',
      destinatario_perfil: 'gestor',
      titulo: 'Nova AP para autorizar',
      mensagem: `${p.beneficiario_nome} — R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    })

    return { id }
  })

  // ── Dados completos das AP's selecionadas, prontos pra "capa" ──
  // NOVO: mesma ideia do lotes:apsParaCapa, mas por uma lista de ids
  // escolhida na hora (não precisa estar dentro de um lote enviado).
  ipcMain.handle('ap:capaPorIds', (_e, ap_ids: number[]) => {
    if (ap_ids.length === 0) return []
    const placeholders = ap_ids.map(() => '?').join(',')
    return db.prepare(`
      SELECT
        a.id, a.created_at, a.beneficiario_nome, a.descricao,
        CASE WHEN a.beneficiario_tipo = 'fornecedor' THEN f.cnpj ELSE NULL END AS cnpj,
        CASE WHEN a.beneficiario_tipo = 'fornecedor' THEN f.cpf ELSE c.cpf END AS cpf,
        CASE WHEN a.beneficiario_tipo = 'fornecedor' THEN f.forma_pagamento ELSE NULL END AS forma_pagamento,
        CASE WHEN a.beneficiario_tipo = 'fornecedor' THEN f.banco ELSE c.banco END AS banco,
        CASE WHEN a.beneficiario_tipo = 'fornecedor' THEN f.agencia ELSE c.agencia END AS agencia,
        CASE WHEN a.beneficiario_tipo = 'fornecedor' THEN f.operacao ELSE c.operacao END AS operacao,
        CASE WHEN a.beneficiario_tipo = 'fornecedor' THEN f.conta ELSE c.conta END AS conta,
        CASE WHEN a.beneficiario_tipo = 'fornecedor' THEN f.conta_digito ELSE c.conta_digito END AS conta_digito,
        (SELECT vencimento FROM autorizacoes_pagamento_boletos WHERE ap_id = a.id ORDER BY vencimento ASC LIMIT 1) AS primeiro_vencimento,
        COALESCE((SELECT SUM(valor) FROM autorizacoes_pagamento_boletos WHERE ap_id = a.id), a.valor) AS valor_total
      FROM autorizacoes_pagamento a
      LEFT JOIN fornecedores f ON f.id = a.beneficiario_id AND a.beneficiario_tipo = 'fornecedor'
      LEFT JOIN colaboradores c ON c.id = a.beneficiario_id AND a.beneficiario_tipo = 'colaborador'
      WHERE a.id IN (${placeholders})
      ORDER BY a.id ASC
    `).all(...ap_ids)
  })

  // ── Resumo para os cards da página (total, valor, por fornecedor) ──
  // ALTERADO: os cards agora respeitam o mesmo filtro de período (De/
  // Até) da lista abaixo — sem dataInicio/dataFim, cai no total geral
  // da empresa, igual antes.
  ipcMain.handle('ap:resumo', async (_e, p: number | { empresa_id: number; dataInicio?: string; dataFim?: string }) => {
    const empresa_id = typeof p === 'number' ? p : p.empresa_id
    const dataInicio  = typeof p === 'number' ? undefined : p.dataInicio
    const dataFim     = typeof p === 'number' ? undefined : p.dataFim
    if(getDatabaseProvider()==='supabase') { let q=getSupabase().from('autorizacoes_pagamento').select('beneficiario_nome,valor,created_at').eq('empresa_id',empresa_id);if(dataInicio&&dataFim)q=q.gte('created_at',dataInicio).lte('created_at',`${dataFim}T23:59:59.999Z`);const {data,error}=await q;if(error)throw new Error(error.message);const grupos=new Map<string,number>();for(const a of data??[])grupos.set(a.beneficiario_nome,(grupos.get(a.beneficiario_nome)??0)+Number(a.valor));return {total:(data??[]).length,valorTotal:(data??[]).reduce((x,a)=>x+Number(a.valor),0),porFornecedor:[...grupos].sort(([a],[b])=>a.localeCompare(b)).map(([nome,total])=>({nome,total}))} }

    const conds:  string[] = ['empresa_id = @empresa_id']
    const params: Record<string, unknown> = { empresa_id }
    if (dataInicio && dataFim) {
      conds.push(`date(created_at) BETWEEN date(@dataInicio) AND date(@dataFim)`)
      params.dataInicio = dataInicio
      params.dataFim = dataFim
    }
    const where = conds.join(' AND ')

    const total = (db.prepare(`
      SELECT COUNT(*) AS n FROM autorizacoes_pagamento WHERE ${where}
    `).get(params) as { n: number }).n

    const valorTotal = (db.prepare(`
      SELECT COALESCE(SUM(valor), 0) AS v FROM autorizacoes_pagamento WHERE ${where}
    `).get(params) as { v: number }).v

    const porFornecedor = db.prepare(`
      SELECT beneficiario_nome AS nome, SUM(valor) AS total
      FROM autorizacoes_pagamento
      WHERE ${where}
      GROUP BY beneficiario_nome
      ORDER BY beneficiario_nome COLLATE NOCASE ASC
    `).all(params)

    return { total, valorTotal, porFornecedor }
  })

  // ── Histórico geral de APs da empresa (com busca opcional) ──
  ipcMain.handle('ap:listar', async (_e, p: {
    empresa_id: number; page?: number; perPage?: number; busca?: string
    dataInicio?: string; dataFim?: string
  }) => {
    const perPage = p.perPage ?? 20
    const offset  = ((p.page ?? 1) - 1) * perPage
    if(getDatabaseProvider()==='supabase') { let q=getSupabase().from('autorizacoes_pagamento').select('*').eq('empresa_id',p.empresa_id).order('created_at',{ascending:false});if(p.dataInicio&&p.dataFim)q=q.gte('created_at',p.dataInicio).lte('created_at',`${p.dataFim}T23:59:59.999Z`);const {data,error}=await q;if(error)throw new Error(error.message);let filtradas=data??[];if(p.busca){const b=p.busca.toLowerCase();filtradas=filtradas.filter(a=>a.beneficiario_nome.toLowerCase().includes(b)||(a.descricao??'').toLowerCase().includes(b)||String(a.valor).includes(b))}const ids=filtradas.map(a=>a.id);let boletos:any[]=[];if(ids.length){const r=await getSupabase().from('autorizacoes_pagamento_boletos').select('id,ap_id,valor').in('ap_id',ids);if(r.error)throw new Error(r.error.message);boletos=r.data??[]}const items=filtradas.slice(offset,offset+perPage).map(a=>{const bs=boletos.filter(b=>b.ap_id===a.id);return {...a,valor_total:bs.length?bs.reduce((x,b)=>x+Number(b.valor),0):Number(a.valor),qtd_boletos:bs.length}});return {items,total:filtradas.length} }

    const conds:  string[] = ['a.empresa_id = @empresa_id']
    const params: Record<string, unknown> = { empresa_id: p.empresa_id }

    if (p.busca) {
      conds.push(`(
        a.beneficiario_nome LIKE @busca
        OR a.descricao LIKE @busca
        OR CAST(a.valor AS TEXT) LIKE @busca
      )`)
      params.busca = `%${p.busca}%`
    }

    // NOVO: filtro por período — pela data de EMISSÃO da AP (quando
    // ela foi registrada), não pelo vencimento dos boletos.
    if (p.dataInicio && p.dataFim) {
      conds.push(`date(a.created_at) BETWEEN date(@dataInicio) AND date(@dataFim)`)
      params.dataInicio = p.dataInicio
      params.dataFim = p.dataFim
    }

    const where = conds.join(' AND ')

    const total = (db.prepare(
      `SELECT COUNT(*) AS n FROM autorizacoes_pagamento a WHERE ${where}`
    ).get(params) as { n: number }).n

    const items = db.prepare(`
      SELECT a.*, COALESCE(SUM(b.valor), a.valor) AS valor_total, COUNT(b.id) AS qtd_boletos
      FROM autorizacoes_pagamento a
      LEFT JOIN autorizacoes_pagamento_boletos b ON b.ap_id = a.id
      WHERE ${where}
      GROUP BY a.id
      ORDER BY a.created_at DESC
      LIMIT @perPage OFFSET @offset
    `).all({ ...params, perPage, offset })

    return { items, total }
  })

  // ── Buscar uma AP com seus boletos e anexos ──────────────
  ipcMain.handle('ap:buscarPorId', async (_e, id: number) => {
    if(getDatabaseProvider()==='supabase') { const s=getSupabase();const [{data:ap,error:e1},{data:boletos,error:e2},{data:anexosRows,error:e3}]=await Promise.all([s.from('autorizacoes_pagamento').select('*').eq('id',id).maybeSingle(),s.from('autorizacoes_pagamento_boletos').select('*').eq('ap_id',id).order('vencimento'),s.from('autorizacoes_pagamento_anexos').select('caminho').eq('ap_id',id).order('ordem')]);for(const e of [e1,e2,e3])if(e)throw new Error(e.message);if(!ap)return null;const ids=[ap.aprovado_por_usuario_id,ap.aprovado_supervisor_por_usuario_id].filter((x):x is number=>x!==null);let usuarios:any[]=[];if(ids.length){const r=await s.from('usuarios').select('id,carimbo_url').in('id',ids);if(r.error)throw new Error(r.error.message);usuarios=r.data??[]}const carimbos=new Map(usuarios.map(u=>[u.id,u.carimbo_url]));return {...ap,aprovado_por_carimbo_url:carimbos.get(ap.aprovado_por_usuario_id)??null,aprovado_supervisor_carimbo_url:carimbos.get(ap.aprovado_supervisor_por_usuario_id)??null,boletos:boletos??[],anexos:(anexosRows??[]).map(a=>a.caminho)} }
    const ap = db.prepare(`
      SELECT a.*, ug.carimbo_url AS aprovado_por_carimbo_url, us.carimbo_url AS aprovado_supervisor_carimbo_url
      FROM autorizacoes_pagamento a
      LEFT JOIN usuarios ug ON ug.id = a.aprovado_por_usuario_id
      LEFT JOIN usuarios us ON us.id = a.aprovado_supervisor_por_usuario_id
      WHERE a.id = ?
    `).get(id)
    if (!ap) return null
    const boletos = db.prepare(
      `SELECT * FROM autorizacoes_pagamento_boletos WHERE ap_id = ? ORDER BY vencimento ASC`
    ).all(id)
    const anexosRows = db.prepare(
      `SELECT caminho FROM autorizacoes_pagamento_anexos WHERE ap_id = ? ORDER BY ordem ASC`
    ).all(id) as { caminho: string }[]
    return { ...ap, boletos, anexos: anexosRows.map(a => a.caminho) }
  })

  // ── Editar uma AP já registrada no histórico ────────────
  // Recria os boletos e as despesas vinculadas do zero — mais simples
  // e seguro do que tentar casar boleto por boleto com o que já
  // existia antes da edição.
  ipcMain.handle('ap:atualizar', async (_e, p: {
    id: number; beneficiario_nome: string; descricao?: string | null
    boletos: Boleto[]
    observacoes?: string | null
    solicitante?: string | null; autorizado_por?: string | null
    anexos?: string[]
  }) => {
    if(getDatabaseProvider()==='supabase') { const {error}=await getSupabase().rpc('atualizar_ap',{p});if(error)throw new Error(error.message);return {ok:true} }
    if (!p.boletos || p.boletos.length === 0) {
      throw new Error('Inclua ao menos um valor e vencimento.')
    }
    const total = p.boletos.reduce((soma, b) => soma + b.valor, 0)

    const atualizar = db.transaction(() => {
      const ap = db.prepare(`SELECT empresa_id FROM autorizacoes_pagamento WHERE id = ?`)
        .get(p.id) as { empresa_id: number }

      db.prepare(`
        UPDATE autorizacoes_pagamento
        SET beneficiario_nome = @beneficiario_nome,
            descricao         = @descricao,
            valor             = @valor,
            observacoes       = @observacoes,
            vencimento        = @vencimento,
            solicitante       = @solicitante,
            autorizado_por    = @autorizado_por
        WHERE id = @id
      `).run({
        id:                p.id,
        beneficiario_nome: p.beneficiario_nome,
        descricao:         p.descricao ?? null,
        valor:             total,
        observacoes:       p.observacoes ?? null,
        vencimento:        p.boletos[0].vencimento,
        solicitante:       p.solicitante ?? null,
        autorizado_por:    p.autorizado_por ?? null,
      })

      // Remove despesas ligadas aos boletos antigos e os próprios boletos
      const boletosAntigos = db.prepare(
        `SELECT lancamento_id FROM autorizacoes_pagamento_boletos WHERE ap_id = ?`
      ).all(p.id) as { lancamento_id: number | null }[]
      for (const b of boletosAntigos) {
        if (b.lancamento_id) db.prepare(`DELETE FROM lancamentos WHERE id = ?`).run(b.lancamento_id)
      }
      db.prepare(`DELETE FROM autorizacoes_pagamento_boletos WHERE ap_id = ?`).run(p.id)

      const inserirBoleto = db.prepare(`
        INSERT INTO autorizacoes_pagamento_boletos (ap_id, valor, vencimento) VALUES (?, ?, ?)
      `)
      const inserirLancamento = db.prepare(`
        INSERT INTO lancamentos (descricao, tipo, valor, data, data_venc, status, empresa_id)
        VALUES (@descricao, 'despesa', @valor, @data, @data_venc, 'pendente', @empresa_id)
      `)
      const vincular = db.prepare(`UPDATE autorizacoes_pagamento_boletos SET lancamento_id = ? WHERE id = ?`)
      const hoje = new Date().toISOString().slice(0, 10)

      for (const b of p.boletos) {
        const boletoId = inserirBoleto.run(p.id, b.valor, b.vencimento).lastInsertRowid
        const resultLanc = inserirLancamento.run({
          descricao:  `AP - ${p.beneficiario_nome}${p.descricao ? `: ${p.descricao}` : ''}`,
          valor:      b.valor,
          data:       hoje,
          data_venc:  b.vencimento,
          empresa_id: ap.empresa_id,
        })
        vincular.run(resultLanc.lastInsertRowid, boletoId)
      }

      // Só mexe nos anexos se a chamada explicitamente informou uma
      // lista nova — assim uma edição comum (só texto/valores) não
      // apaga os anexos já salvos sem querer.
      if (p.anexos !== undefined) {
        db.prepare(`DELETE FROM autorizacoes_pagamento_anexos WHERE ap_id = ?`).run(p.id)
        const inserirAnexo = db.prepare(`
          INSERT INTO autorizacoes_pagamento_anexos (ap_id, caminho, ordem) VALUES (?, ?, ?)
        `)
        p.anexos.forEach((caminho, i) => inserirAnexo.run(p.id, caminho, i))
      }
    })

    atualizar()
    return { ok: true }
  })

  // ── Guardar o caminho do PDF já salvo (AP + anexos) ──────
  ipcMain.handle('ap:salvarCaminhoPdf', (_e, p: { id: number; pdf_path: string }) => {
    db.prepare(`UPDATE autorizacoes_pagamento SET pdf_path = ? WHERE id = ?`).run(p.pdf_path, p.id)
    return { ok: true }
  })

  // ── Autorizar (aprovar) uma AP ───────────────────────────
  // NOVO: registra quem aprovou e quando — usado pelo GESTOR depois
  // de visualizar a AP. O carimbo vai pro documento na próxima vez
  // que ele for gerado/salvo.
  ipcMain.handle('ap:aprovar', async (_e, p: { id: number; aprovado_por: string; aprovado_perfil?: string; usuario_id?: number | null }) => {
    if(getDatabaseProvider()==='supabase') { const {data,error}=await getSupabase().rpc('aprovar_ap',{p_id:p.id});if(error)throw new Error(error.message);return {ok:true,aprovado_em:data} }
    const agora = new Date().toISOString()
    const ehSupervisor = p.aprovado_perfil === 'supervisor'
    const ehCentral     = p.aprovado_perfil === 'central'

    // ALTERADO: a aprovação do Supervisor e a do Escritório Central
    // vão pra colunas PRÓPRIAS, separadas da do Gestor — assim as três
    // assinaturas podem existir ao mesmo tempo no mesmo documento,
    // sem uma apagar a outra.
    if (ehCentral) {
      db.prepare(`UPDATE autorizacoes_pagamento SET aprovado_central_por = ?, aprovado_central_em = ? WHERE id = ?`)
        .run(p.aprovado_por, agora, p.id)
    } else if (ehSupervisor) {
      db.prepare(`UPDATE autorizacoes_pagamento SET aprovado_supervisor_por = ?, aprovado_supervisor_em = ?, aprovado_supervisor_por_usuario_id = ? WHERE id = ?`)
        .run(p.aprovado_por, agora, p.usuario_id ?? null, p.id)
    } else {
      db.prepare(`UPDATE autorizacoes_pagamento SET aprovado_por = ?, aprovado_em = ?, aprovado_por_usuario_id = ? WHERE id = ?`)
        .run(p.aprovado_por, agora, p.usuario_id ?? null, p.id)
    }

    // NOVO: avisa o ADM (e o Gestor também, se quem aprovou foi o
    // Supervisor ou o Central; e o Supervisor também, se foi o
    // Central) que a AP foi autorizada.
    const ap = db.prepare(`SELECT empresa_id, beneficiario_nome, lote_id FROM autorizacoes_pagamento WHERE id = ?`)
      .get(p.id) as { empresa_id: number; beneficiario_nome: string; lote_id: number | null } | undefined
    if (ap) {
      const destinatarios = ehCentral ? ['admin', 'gestor', 'supervisor'] : ehSupervisor ? ['admin', 'gestor'] : ['admin']
      const tituloEvento = ehCentral ? 'AP aprovada pelo Escritório' : 'AP autorizada'
      for (const destinatario of destinatarios) {
        criarNotificacaoEvento(db, {
          empresa_id: ap.empresa_id,
          tipo: 'ap_aprovada',
          destinatario_perfil: destinatario,
          titulo: tituloEvento,
          mensagem: `${p.aprovado_por} autorizou a AP de ${ap.beneficiario_nome}`,
          referencia_id: ap.lote_id,
        })
      }
      if (ehSupervisor) verificarLoteConcluido(db, ap.lote_id)
    }

    return { ok: true, aprovado_em: agora }
  })

  // ── Excluir uma AP do histórico (remove também as despesas vinculadas) ──
  ipcMain.handle('ap:excluir', async (_e, id: number) => {
    if(getDatabaseProvider()==='supabase') { const {error}=await getSupabase().rpc('excluir_ap',{p_id:id});if(error)throw new Error(error.message);return {ok:true} }
    const boletos = db.prepare(
      `SELECT lancamento_id FROM autorizacoes_pagamento_boletos WHERE ap_id = ?`
    ).all(id) as { lancamento_id: number | null }[]

    const excluir = db.transaction(() => {
      db.prepare(`DELETE FROM autorizacoes_pagamento WHERE id = ?`).run(id)
      for (const b of boletos) {
        if (b.lancamento_id) db.prepare(`DELETE FROM lancamentos WHERE id = ?`).run(b.lancamento_id)
      }
    })
    excluir()
    return { ok: true }
  })
}
