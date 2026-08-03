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

interface NotaPayload {
  empresa_id:      number
  numero_pedido?:  string | null
  data:            string
  numero_nf?:      string | null
  data_emissao_nf?: string | null  // NOVO: data que a NF física foi emitida — só informativa, não entra no filtro de período
  fornecedor_id?:  number | null
  fornecedor_nome: string
  boletos:         Boleto[]
  anexos_nota?:    string[]  // caminhos dos arquivos da nota física (escaneada)
  anexos_boletos?: string[]  // caminhos dos arquivos do(s) boleto(s)
}

// ALTERADO: Nota Fiscal segue o mesmo padrão da AP — anexos e fluxo
// de aprovação do Gestor — mas sem gerar documento nenhum (a nota é
// física, escaneada); anexos ficam em duas categorias separadas
// (nota e boleto), que viram DOIS PDFs distintos ao salvar.
export function registerNotasFiscaisIpc() {
  const db = getDb()

  // ── Listar (com busca) ───────────────────────────────────
  ipcMain.handle('notasFiscais:listar', async (_e, p: { empresa_id: number; busca?: string; dataInicio?: string; dataFim?: string }) => {
    if (getDatabaseProvider() === 'supabase') {
      let query=getSupabase().from('notas_fiscais').select('*,notas_fiscais_boletos(valor)').eq('empresa_id',p.empresa_id).order('data',{ascending:false})
      if(p.dataInicio&&p.dataFim) query=query.gte('data',p.dataInicio).lte('data',p.dataFim)
      if(p.busca) query=query.ilike('fornecedor_nome',`%${p.busca.replace(/[%_]/g,'\\$&')}%`)
      const {data,error}=await query; if(error) throw new Error(error.message); return (data??[]).map((n:any)=>({...n,valor_total:(n.notas_fiscais_boletos??[]).reduce((s:number,b:any)=>s+Number(b.valor),0),qtd_boletos:n.notas_fiscais_boletos?.length??0}))
    }
    const conds:  string[] = ['n.empresa_id = @empresa_id']
    const params: Record<string, unknown> = { empresa_id: p.empresa_id }
    if (p.busca) {
      conds.push(`(n.fornecedor_nome LIKE @busca OR n.numero_nf LIKE @busca OR n.numero_pedido LIKE @busca)`)
      params.busca = `%${p.busca}%`
    }
    if (p.dataInicio && p.dataFim) {
      conds.push(`date(n.data) BETWEEN date(@dataInicio) AND date(@dataFim)`)
      params.dataInicio = p.dataInicio
      params.dataFim = p.dataFim
    }

    const notas = db.prepare(`
      SELECT n.*, COALESCE(SUM(b.valor), 0) AS valor_total, COUNT(b.id) AS qtd_boletos
      FROM notas_fiscais n
      LEFT JOIN notas_fiscais_boletos b ON b.nota_id = n.id
      WHERE ${conds.join(' AND ')}
      GROUP BY n.id
      ORDER BY n.data DESC, n.id DESC
    `).all(params)

    return notas
  })

  // ── Dados das notas selecionadas, prontos pra "capa" ─────
  // NOVO: mesma ideia do ap:capaPorIds — uma lista em ids escolhida
  // na hora (não precisa estar dentro de um lote enviado). Cada nota
  // traz os próprios boletos (parcelas), em ordem de vencimento.
  ipcMain.handle('notasFiscais:capaPorIds', async (_e, nota_ids: number[]) => {
    if (nota_ids.length === 0) return []
    if(getDatabaseProvider()==='supabase') { const s=getSupabase();const [{data:notas,error:e1},{data:boletos,error:e2}]=await Promise.all([s.from('notas_fiscais').select('id,numero_pedido,numero_nf,data_emissao_nf,fornecedor_nome').in('id',nota_ids).order('id'),s.from('notas_fiscais_boletos').select('nota_id,valor,vencimento').in('nota_id',nota_ids).order('vencimento')]);if(e1)throw new Error(e1.message);if(e2)throw new Error(e2.message);return (notas??[]).map(n=>{const itens=(boletos??[]).filter(b=>b.nota_id===n.id);return {...n,boletos:itens,valor_total:itens.reduce((x,b)=>x+Number(b.valor),0)}}) }
    const placeholders = nota_ids.map(() => '?').join(',')
    const notas = db.prepare(`
      SELECT id, numero_pedido, numero_nf, data_emissao_nf, fornecedor_nome
      FROM notas_fiscais
      WHERE id IN (${placeholders})
      ORDER BY id ASC
    `).all(...nota_ids) as {
      id: number; numero_pedido: string | null; numero_nf: string | null
      data_emissao_nf: string | null; fornecedor_nome: string
    }[]

    const buscarBoletos = db.prepare(`
      SELECT valor, vencimento FROM notas_fiscais_boletos WHERE nota_id = ? ORDER BY vencimento ASC
    `)

    return notas.map(n => {
      const boletos = buscarBoletos.all(n.id) as { valor: number; vencimento: string }[]
      return {
        ...n,
        boletos,
        valor_total: boletos.reduce((soma, b) => soma + b.valor, 0),
      }
    })
  })

  // ── Buscar uma nota com seus boletos e anexos ────────────
  ipcMain.handle('notasFiscais:buscarPorId', async (_e, id: number) => {
    if(getDatabaseProvider()==='supabase') { const s=getSupabase();const [{data:nota,error:e1},{data:boletos,error:e2},{data:anexos,error:e3}]=await Promise.all([s.from('notas_fiscais').select('*').eq('id',id).maybeSingle(),s.from('notas_fiscais_boletos').select('*').eq('nota_id',id).order('vencimento'),s.from('notas_fiscais_anexos').select('*').eq('nota_id',id).order('categoria').order('ordem')]);for(const e of [e1,e2,e3])if(e)throw new Error(e.message);if(!nota)return null;const ids=[nota.aprovado_por_usuario_id,nota.aprovado_supervisor_por_usuario_id].filter((x):x is number=>x!==null);let usuarios:any[]=[];if(ids.length){const r=await s.from('usuarios').select('id,carimbo_url').in('id',ids);if(r.error)throw new Error(r.error.message);usuarios=r.data??[]}const carimbos=new Map(usuarios.map(u=>[u.id,u.carimbo_url]));return {...nota,aprovado_por_carimbo_url:carimbos.get(nota.aprovado_por_usuario_id)??null,aprovado_supervisor_carimbo_url:carimbos.get(nota.aprovado_supervisor_por_usuario_id)??null,boletos:boletos??[],anexos_nota:(anexos??[]).filter(a=>a.categoria==='nota').map(a=>a.caminho),anexos_boletos:(anexos??[]).filter(a=>a.categoria==='boleto').map(a=>a.caminho)} }
    const nota = db.prepare(`
      SELECT n.*, ug.carimbo_url AS aprovado_por_carimbo_url, us.carimbo_url AS aprovado_supervisor_carimbo_url
      FROM notas_fiscais n
      LEFT JOIN usuarios ug ON ug.id = n.aprovado_por_usuario_id
      LEFT JOIN usuarios us ON us.id = n.aprovado_supervisor_por_usuario_id
      WHERE n.id = ?
    `).get(id)
    if (!nota) return null
    const boletos = db.prepare(`SELECT * FROM notas_fiscais_boletos WHERE nota_id = ? ORDER BY vencimento ASC`).all(id)
    const anexos  = db.prepare(`SELECT * FROM notas_fiscais_anexos WHERE nota_id = ? ORDER BY categoria, ordem ASC`).all(id) as
      { id: number; caminho: string; categoria: 'nota' | 'boleto'; ordem: number }[]
    return {
      ...nota,
      boletos,
      anexos_nota:    anexos.filter(a => a.categoria === 'nota').map(a => a.caminho),
      anexos_boletos: anexos.filter(a => a.categoria === 'boleto').map(a => a.caminho),
    }
  })

  function salvarAnexos(notaId: number, p: NotaPayload) {
    const inserirAnexo = db.prepare(`
      INSERT INTO notas_fiscais_anexos (nota_id, caminho, categoria, ordem) VALUES (?, ?, ?, ?)
    `)
    ;(p.anexos_nota ?? []).forEach((caminho, i) => inserirAnexo.run(notaId, caminho, 'nota', i))
    ;(p.anexos_boletos ?? []).forEach((caminho, i) => inserirAnexo.run(notaId, caminho, 'boleto', i))
  }

  // ── Criar nota + boletos + despesa por boleto + anexos ───
  ipcMain.handle('notasFiscais:criar', async (_e, p: NotaPayload) => {
    if (getDatabaseProvider() === 'supabase') {
      const { data: notaId, error } = await getSupabase().rpc('criar_nota_fiscal', { p })
      if (error) throw new Error(error.message)
      const enviar = async (caminhos: string[], categoria: 'nota' | 'boleto') => {
        for (let ordem = 0; ordem < caminhos.length; ordem++) {
          const local = caminhos[ordem]
          const remoto = `${p.empresa_id}/notas-fiscais/${notaId}/${categoria}-${Date.now()}-${basename(local).replace(/[^a-zA-Z0-9._-]/g, '_')}`
          const caminho = await uploadDocumento(local, remoto)
          const resultado = await getSupabase().from('notas_fiscais_anexos').insert({ nota_id: notaId, caminho, categoria, ordem })
          if (resultado.error) throw new Error(resultado.error.message)
        }
      }
      await enviar(p.anexos_nota ?? [], 'nota')
      await enviar(p.anexos_boletos ?? [], 'boleto')
      return { id: notaId }
    }
    if (!p.boletos || p.boletos.length === 0) {
      throw new Error('Inclua ao menos um valor e vencimento.')
    }

    const criar = db.transaction(() => {
      const resultNota = db.prepare(`
        INSERT INTO notas_fiscais (empresa_id, numero_pedido, data, numero_nf, data_emissao_nf, fornecedor_id, fornecedor_nome)
        VALUES (@empresa_id, @numero_pedido, @data, @numero_nf, @data_emissao_nf, @fornecedor_id, @fornecedor_nome)
      `).run({
        empresa_id:      p.empresa_id,
        numero_pedido:   p.numero_pedido ?? null,
        data:            p.data,
        numero_nf:       p.numero_nf ?? null,
        data_emissao_nf: p.data_emissao_nf ?? null,
        fornecedor_id:   p.fornecedor_id ?? null,
        fornecedor_nome: p.fornecedor_nome,
      })
      const notaId = resultNota.lastInsertRowid as number

      const inserirBoleto = db.prepare(`
        INSERT INTO notas_fiscais_boletos (nota_id, valor, vencimento) VALUES (?, ?, ?)
      `)
      const inserirLancamento = db.prepare(`
        INSERT INTO lancamentos (descricao, tipo, valor, data, data_venc, status, fornecedor_id, empresa_id)
        VALUES (@descricao, 'despesa', @valor, @data, @data_venc, 'pendente', @fornecedor_id, @empresa_id)
      `)
      const vincular = db.prepare(`UPDATE notas_fiscais_boletos SET lancamento_id = ? WHERE id = ?`)

      for (const b of p.boletos) {
        const boletoId = inserirBoleto.run(notaId, b.valor, b.vencimento).lastInsertRowid
        const resultLanc = inserirLancamento.run({
          descricao:     `NF ${p.numero_nf ?? ''} - ${p.fornecedor_nome}`.trim(),
          valor:         b.valor,
          data:          p.data,
          data_venc:     b.vencimento,
          fornecedor_id: p.fornecedor_id ?? null,
          empresa_id:    p.empresa_id,
        })
        vincular.run(resultLanc.lastInsertRowid, boletoId)
      }

      salvarAnexos(notaId, p)

      return notaId
    })

    const id = criar()

    // NOVO: avisa o Gestor que tem uma NF nova pra autorizar.
    criarNotificacaoEvento(db, {
      empresa_id: p.empresa_id,
      tipo: 'nf_nova',
      destinatario_perfil: 'gestor',
      titulo: 'Nova Nota Fiscal para autorizar',
      mensagem: `NF ${p.numero_nf ?? '—'} — ${p.fornecedor_nome}`,
    })

    return { id }
  })

  // ── Atualizar nota — recria boletos, despesas e anexos do zero ──
  ipcMain.handle('notasFiscais:atualizar', async (_e, p: NotaPayload & { id: number }) => {
    if(getDatabaseProvider()==='supabase') { const {error}=await getSupabase().rpc('atualizar_nota_fiscal',{p});if(error)throw new Error(error.message);return {ok:true} }
    if (!p.boletos || p.boletos.length === 0) {
      throw new Error('Inclua ao menos um valor e vencimento.')
    }

    const atualizar = db.transaction(() => {
      db.prepare(`
        UPDATE notas_fiscais
        SET numero_pedido = @numero_pedido, data = @data, numero_nf = @numero_nf,
            data_emissao_nf = @data_emissao_nf, fornecedor_id = @fornecedor_id, fornecedor_nome = @fornecedor_nome
        WHERE id = @id
      `).run({
        id:              p.id,
        numero_pedido:   p.numero_pedido ?? null,
        data:            p.data,
        numero_nf:       p.numero_nf ?? null,
        data_emissao_nf: p.data_emissao_nf ?? null,
        fornecedor_id:   p.fornecedor_id ?? null,
        fornecedor_nome: p.fornecedor_nome,
      })

      const boletosAntigos = db.prepare(
        `SELECT lancamento_id FROM notas_fiscais_boletos WHERE nota_id = ?`
      ).all(p.id) as { lancamento_id: number | null }[]
      for (const b of boletosAntigos) {
        if (b.lancamento_id) db.prepare(`DELETE FROM lancamentos WHERE id = ?`).run(b.lancamento_id)
      }
      db.prepare(`DELETE FROM notas_fiscais_boletos WHERE nota_id = ?`).run(p.id)

      const inserirBoleto = db.prepare(`
        INSERT INTO notas_fiscais_boletos (nota_id, valor, vencimento) VALUES (?, ?, ?)
      `)
      const inserirLancamento = db.prepare(`
        INSERT INTO lancamentos (descricao, tipo, valor, data, data_venc, status, fornecedor_id, empresa_id)
        VALUES (@descricao, 'despesa', @valor, @data, @data_venc, 'pendente', @fornecedor_id, @empresa_id)
      `)
      const vincular = db.prepare(`UPDATE notas_fiscais_boletos SET lancamento_id = ? WHERE id = ?`)

      for (const b of p.boletos) {
        const boletoId = inserirBoleto.run(p.id, b.valor, b.vencimento).lastInsertRowid
        const resultLanc = inserirLancamento.run({
          descricao:     `NF ${p.numero_nf ?? ''} - ${p.fornecedor_nome}`.trim(),
          valor:         b.valor,
          data:          p.data,
          data_venc:     b.vencimento,
          fornecedor_id: p.fornecedor_id ?? null,
          empresa_id:    p.empresa_id,
        })
        vincular.run(resultLanc.lastInsertRowid, boletoId)
      }

      db.prepare(`DELETE FROM notas_fiscais_anexos WHERE nota_id = ?`).run(p.id)
      salvarAnexos(p.id, p)
    })

    atualizar()
    return { ok: true }
  })

  // ── Salvar os caminhos dos dois PDFs gerados (nota e boletos) ──
  ipcMain.handle('notasFiscais:salvarCaminhosPdf', (_e, p: {
    id: number; nota_pdf_path?: string | null; boletos_pdf_path?: string | null
  }) => {
    db.prepare(`
      UPDATE notas_fiscais
      SET nota_pdf_path = COALESCE(@nota_pdf_path, nota_pdf_path),
          boletos_pdf_path = COALESCE(@boletos_pdf_path, boletos_pdf_path)
      WHERE id = @id
    `).run({ id: p.id, nota_pdf_path: p.nota_pdf_path ?? null, boletos_pdf_path: p.boletos_pdf_path ?? null })
    return { ok: true }
  })

  // ── Autorizar (aprovar) uma Nota Fiscal ──────────────────
  // NOVO: mesmo fluxo da AP — o Gestor autoriza, o ADM é avisado.
  ipcMain.handle('notasFiscais:aprovar', async (_e, p: { id: number; aprovado_por: string; aprovado_perfil?: string; usuario_id?: number | null }) => {
    if(getDatabaseProvider()==='supabase') { const {data,error}=await getSupabase().rpc('aprovar_nota_fiscal',{p_id:p.id});if(error)throw new Error(error.message);return {ok:true,aprovado_em:data} }
    const agora = new Date().toISOString()
    const ehSupervisor = p.aprovado_perfil === 'supervisor'
    const ehCentral     = p.aprovado_perfil === 'central'

    if (ehCentral) {
      db.prepare(`UPDATE notas_fiscais SET aprovado_central_por = ?, aprovado_central_em = ? WHERE id = ?`)
        .run(p.aprovado_por, agora, p.id)
    } else if (ehSupervisor) {
      db.prepare(`UPDATE notas_fiscais SET aprovado_supervisor_por = ?, aprovado_supervisor_em = ?, aprovado_supervisor_por_usuario_id = ? WHERE id = ?`)
        .run(p.aprovado_por, agora, p.usuario_id ?? null, p.id)
    } else {
      db.prepare(`UPDATE notas_fiscais SET aprovado_por = ?, aprovado_em = ?, aprovado_por_usuario_id = ? WHERE id = ?`)
        .run(p.aprovado_por, agora, p.usuario_id ?? null, p.id)
    }

    const nota = db.prepare(`SELECT empresa_id, fornecedor_nome, numero_nf, lote_id FROM notas_fiscais WHERE id = ?`)
      .get(p.id) as { empresa_id: number; fornecedor_nome: string; numero_nf: string | null; lote_id: number | null } | undefined
    if (nota) {
      const destinatarios = ehCentral ? ['admin', 'gestor', 'supervisor'] : ehSupervisor ? ['admin', 'gestor'] : ['admin']
      const tituloEvento = ehCentral ? 'Nota Fiscal aprovada pelo Escritório' : 'Nota Fiscal autorizada'
      for (const destinatario of destinatarios) {
        criarNotificacaoEvento(db, {
          empresa_id: nota.empresa_id,
          tipo: 'nf_aprovada',
          destinatario_perfil: destinatario,
          titulo: tituloEvento,
          mensagem: `${p.aprovado_por} autorizou a NF ${nota.numero_nf ?? '—'} de ${nota.fornecedor_nome}`,
          referencia_id: nota.lote_id,
        })
      }
      if (ehSupervisor) verificarLoteConcluido(db, nota.lote_id)
    }

    return { ok: true, aprovado_em: agora }
  })

  // ── Resumo para os cards da página (total, valor, por fornecedor) ──
  // ALTERADO: os cards agora respeitam o mesmo filtro de período (De/
  // Até) da lista abaixo — sem dataInicio/dataFim, cai no total geral
  // da empresa, igual antes.
  ipcMain.handle('notasFiscais:resumo', async (_e, p: number | { empresa_id: number; dataInicio?: string; dataFim?: string }) => {
    const empresa_id = typeof p === 'number' ? p : p.empresa_id
    const dataInicio  = typeof p === 'number' ? undefined : p.dataInicio
    const dataFim     = typeof p === 'number' ? undefined : p.dataFim
    if(getDatabaseProvider()==='supabase') { let q=getSupabase().from('notas_fiscais').select('id,fornecedor_nome,data').eq('empresa_id',empresa_id);if(dataInicio&&dataFim)q=q.gte('data',dataInicio).lte('data',dataFim);const {data:notas,error}=await q;if(error)throw new Error(error.message);const ids=(notas??[]).map(n=>n.id);let boletos:any[]=[];if(ids.length){const r=await getSupabase().from('notas_fiscais_boletos').select('nota_id,valor').in('nota_id',ids);if(r.error)throw new Error(r.error.message);boletos=r.data??[]}const nomes=new Map((notas??[]).map(n=>[n.id,n.fornecedor_nome]));const grupos=new Map<string,number>();for(const b of boletos){const nome=nomes.get(b.nota_id)??'Sem fornecedor';grupos.set(nome,(grupos.get(nome)??0)+Number(b.valor))}return {total:(notas??[]).length,valorTotal:boletos.reduce((x,b)=>x+Number(b.valor),0),porFornecedor:[...grupos].sort(([a],[b])=>a.localeCompare(b)).map(([nome,total])=>({nome,total}))} }

    const conds:  string[] = ['n.empresa_id = @empresa_id']
    const params: Record<string, unknown> = { empresa_id }
    if (dataInicio && dataFim) {
      conds.push(`date(n.data) BETWEEN date(@dataInicio) AND date(@dataFim)`)
      params.dataInicio = dataInicio
      params.dataFim = dataFim
    }
    const where = conds.join(' AND ')

    const total = (db.prepare(`
      SELECT COUNT(*) AS n FROM notas_fiscais n WHERE ${where}
    `).get(params) as { n: number }).n

    const valorTotal = (db.prepare(`
      SELECT COALESCE(SUM(b.valor), 0) AS v
      FROM notas_fiscais n
      JOIN notas_fiscais_boletos b ON b.nota_id = n.id
      WHERE ${where}
    `).get(params) as { v: number }).v

    const porFornecedor = db.prepare(`
      SELECT n.fornecedor_nome AS nome, COALESCE(SUM(b.valor), 0) AS total
      FROM notas_fiscais n
      LEFT JOIN notas_fiscais_boletos b ON b.nota_id = n.id
      WHERE ${where}
      GROUP BY n.fornecedor_nome
      ORDER BY n.fornecedor_nome COLLATE NOCASE ASC
    `).all(params)

    return { total, valorTotal, porFornecedor }
  })

  // ── Excluir nota (remove boletos, despesas e anexos vinculados) ──
  ipcMain.handle('notasFiscais:excluir', async (_e, id: number) => {
    if(getDatabaseProvider()==='supabase') { const {error}=await getSupabase().rpc('excluir_nota_fiscal',{p_id:id});if(error)throw new Error(error.message);return {ok:true} }
    const boletos = db.prepare(
      `SELECT lancamento_id FROM notas_fiscais_boletos WHERE nota_id = ?`
    ).all(id) as { lancamento_id: number | null }[]

    const excluir = db.transaction(() => {
      db.prepare(`DELETE FROM notas_fiscais WHERE id = ?`).run(id)
      for (const b of boletos) {
        if (b.lancamento_id) db.prepare(`DELETE FROM lancamentos WHERE id = ?`).run(b.lancamento_id)
      }
    })
    excluir()
    return { ok: true }
  })
}
