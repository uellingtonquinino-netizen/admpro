import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { criarNotificacaoEvento } from './notificacoes.ipc'
import { getDatabaseProvider, getSupabase } from '../supabase/client'

interface ItemSaida {
  produto_id:     number
  produto_codigo: string
  produto_nome:   string
  quantidade:     number
}

interface SaidaPayload {
  empresa_id:          number
  data:                string
  itens:               ItemSaida[]
  retirado_por_tipo:   'colaborador' | 'avulso'
  retirado_por_id?:    number | null
  retirado_por_nome:   string
  setor?:              string | null
  solicitado_por_id?:  number | null
  solicitado_por_nome?: string | null
  liberado_por?:       string | null
}

export function registerAlmoxarifadoSaidasIpc() {
  const db = getDb()

  // ── Listar (com busca e período) ─────────────────────────
  ipcMain.handle('almoxarifadoSaidas:listar', async (_e, p: {
    empresa_id: number; busca?: string; dataInicio?: string; dataFim?: string
  }) => {
    if(getDatabaseProvider()==='supabase') {
      let q=getSupabase().from('almoxarifado_saidas').select('*,almoxarifado_saidas_itens(*)').eq('empresa_id',p.empresa_id).order('data',{ascending:false}).order('id',{ascending:false})
      if(p.dataInicio&&p.dataFim)q=q.gte('data',p.dataInicio).lte('data',p.dataFim)
      const {data,error}=await q;if(error)throw new Error(error.message)
      let linhas=(data??[]).map(s=>({...s,itens:s.almoxarifado_saidas_itens}))
      // CORRIGIDO: a busca por produto agora precisa olhar dentro dos
      // itens (não é mais um campo direto na linha da saída).
      if(p.busca){
        const termo=p.busca.toLowerCase()
        linhas=linhas.filter((s:any)=>
          s.retirado_por_nome?.toLowerCase().includes(termo) ||
          s.itens.some((it:any)=>it.produto_nome?.toLowerCase().includes(termo) || it.produto_codigo?.toLowerCase().includes(termo))
        )
      }
      return linhas
    }
    const conds:  string[] = ['s.empresa_id = @empresa_id']
    const params: Record<string, unknown> = { empresa_id: p.empresa_id }

    if (p.busca) {
      conds.push(`(s.retirado_por_nome LIKE @busca OR EXISTS (
        SELECT 1 FROM almoxarifado_saidas_itens si
        WHERE si.saida_id = s.id AND (si.produto_nome LIKE @busca OR si.produto_codigo LIKE @busca)
      ))`)
      params.busca = `%${p.busca}%`
    }
    if (p.dataInicio && p.dataFim) {
      conds.push(`date(s.data) BETWEEN date(@dataInicio) AND date(@dataFim)`)
      params.dataInicio = p.dataInicio
      params.dataFim = p.dataFim
    }

    const saidas = db.prepare(`
      SELECT s.* FROM almoxarifado_saidas s WHERE ${conds.join(' AND ')}
      ORDER BY s.data DESC, s.id DESC
    `).all(params) as { id: number }[]

    const buscarItens = db.prepare(`SELECT * FROM almoxarifado_saidas_itens WHERE saida_id = ?`)
    return saidas.map(s => ({ ...s, itens: buscarItens.all(s.id) }))
  })

  ipcMain.handle('almoxarifadoSaidas:buscarPorId', async (_e, id: number) => {
    if(getDatabaseProvider()==='supabase') {
      const {data,error}=await getSupabase().from('almoxarifado_saidas').select('*,almoxarifado_saidas_itens(*)').eq('id',id).maybeSingle()
      if(error)throw new Error(error.message)
      return data?{...data,itens:data.almoxarifado_saidas_itens}:null
    }
    const saida = db.prepare(`SELECT * FROM almoxarifado_saidas WHERE id = ?`).get(id)
    if (!saida) return null
    const itens = db.prepare(`SELECT * FROM almoxarifado_saidas_itens WHERE saida_id = ?`).all(id)
    return { ...saida, itens }
  })

  // ── Registrar saída: desconta do estoque (um ou vários itens) ──
  ipcMain.handle('almoxarifadoSaidas:criar', async (_e, p: SaidaPayload) => {
    if (getDatabaseProvider() === 'supabase') {
      const { data, error } = await getSupabase().rpc('criar_saida_almoxarifado', { p })
      if (error) throw new Error(error.message)
      return { id: data }
    }
    if (!p.itens || p.itens.length === 0) {
      throw new Error('Inclua ao menos um material/ferramenta.')
    }

    // Confere estoque de TODOS os itens antes de descontar qualquer um.
    const buscarEstoque = db.prepare(`SELECT estoque_atual FROM produtos WHERE id = ?`)
    for (const item of p.itens) {
      const produto = buscarEstoque.get(item.produto_id) as { estoque_atual: number } | undefined
      if (!produto) throw new Error(`Material/ferramenta não encontrado: ${item.produto_nome}`)
      if (produto.estoque_atual < item.quantidade) throw new Error(`Estoque insuficiente para ${item.produto_nome}.`)
    }

    const criar = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO almoxarifado_saidas (
          empresa_id, data, retirado_por_tipo, retirado_por_id, retirado_por_nome, setor,
          solicitado_por_id, solicitado_por_nome, liberado_por
        ) VALUES (
          @empresa_id, @data, @retirado_por_tipo, @retirado_por_id, @retirado_por_nome, @setor,
          @solicitado_por_id, @solicitado_por_nome, @liberado_por
        )
      `).run({
        empresa_id:          p.empresa_id,
        data:                p.data,
        retirado_por_tipo:   p.retirado_por_tipo,
        retirado_por_id:     p.retirado_por_id ?? null,
        retirado_por_nome:   p.retirado_por_nome,
        setor:               p.setor ?? null,
        solicitado_por_id:   p.solicitado_por_id ?? null,
        solicitado_por_nome: p.solicitado_por_nome ?? null,
        liberado_por:        p.liberado_por ?? null,
      })
      const saidaId = result.lastInsertRowid as number

      const inserirItem = db.prepare(`
        INSERT INTO almoxarifado_saidas_itens (saida_id, produto_id, produto_codigo, produto_nome, quantidade)
        VALUES (@saida_id, @produto_id, @produto_codigo, @produto_nome, @quantidade)
      `)
      const atualizarEstoque = db.prepare(`UPDATE produtos SET estoque_atual = estoque_atual - ? WHERE id = ?`)

      for (const item of p.itens) {
        inserirItem.run({ saida_id: saidaId, produto_id: item.produto_id, produto_codigo: item.produto_codigo, produto_nome: item.produto_nome, quantidade: item.quantidade })
        atualizarEstoque.run(item.quantidade, item.produto_id)
      }

      return saidaId
    })

    const id = criar()

    // NOVO: avisa o ADM e o Gestor que o Almoxarife deu saída de material.
    const resumoItens = p.itens.map(i => `${i.produto_nome} (${i.quantidade})`).join(', ')
    for (const destinatario of ['admin', 'gestor']) {
      criarNotificacaoEvento(db, {
        empresa_id: p.empresa_id,
        tipo: 'almox_saida',
        destinatario_perfil: destinatario,
        titulo: 'Saída de material registrada',
        mensagem: `${resumoItens} — retirado por ${p.retirado_por_nome}`,
      })
    }

    return { id }
  })

  // ── Guardar o caminho do PDF gerado (documento de retirada) ──
  ipcMain.handle('almoxarifadoSaidas:salvarCaminhoPdf', async (_e, p: { id: number; pdf_path: string }) => {
    if (getDatabaseProvider() === 'supabase') {
      const { error } = await getSupabase().from('almoxarifado_saidas').update({ pdf_path: p.pdf_path }).eq('id', p.id)
      if (error) throw new Error(error.message)
      return { ok: true }
    }
    db.prepare(`UPDATE almoxarifado_saidas SET pdf_path = ? WHERE id = ?`).run(p.pdf_path, p.id)
    return { ok: true }
  })

  // ── Excluir: devolve as quantidades ao estoque ───────────
  ipcMain.handle('almoxarifadoSaidas:excluir', async (_e, id: number) => {
    if(getDatabaseProvider()==='supabase') { const {error}=await getSupabase().rpc('excluir_saida_almoxarifado',{p_saida_id:id}); if(error)throw new Error(error.message); return {ok:true} }
    const itens = db.prepare(`SELECT produto_id, quantidade FROM almoxarifado_saidas_itens WHERE saida_id = ?`)
      .all(id) as { produto_id: number; quantidade: number }[]

    const excluir = db.transaction(() => {
      const atualizarEstoque = db.prepare(`UPDATE produtos SET estoque_atual = estoque_atual + ? WHERE id = ?`)
      for (const item of itens) {
        atualizarEstoque.run(item.quantidade, item.produto_id)
      }
      db.prepare(`DELETE FROM almoxarifado_saidas WHERE id = ?`).run(id)
    })
    excluir()
    return { ok: true }
  })
}
