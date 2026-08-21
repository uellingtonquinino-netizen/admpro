import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { criarNotificacaoEvento } from './notificacoes.ipc'
import { getDatabaseProvider, getSupabase } from '../supabase/client'

interface ItemEntrada {
  produto_id:      number
  produto_codigo:  string
  produto_nome:    string
  quantidade:      number
  valor_unitario:  number
}

interface EntradaPayload {
  empresa_id:      number
  numero_nota?:    string | null
  numero_pedido?:  string | null
  data:            string
  fornecedor_id?:  number | null
  fornecedor_nome: string
  valor_desconto?: number
  valor_acrescimo?: number
  itens:           ItemEntrada[]
}

export function registerAlmoxarifadoEntradasIpc() {
  const db = getDb()

  // ── Listar ───────────────────────────────────────────────
  ipcMain.handle('almoxarifadoEntradas:listar', async (_e, p: { empresa_id: number; busca?: string }) => {
    if(getDatabaseProvider()==='supabase') { let q=getSupabase().from('almoxarifado_entradas').select('*').eq('empresa_id',p.empresa_id).order('data',{ascending:false}).order('id',{ascending:false}); if(p.busca){const termo=p.busca.replace(/[(),.]/g,' ');q=q.or(`numero_nota.ilike.%${termo}%,numero_pedido.ilike.%${termo}%,fornecedor_nome.ilike.%${termo}%`)} const {data,error}=await q;if(error)throw new Error(error.message);return data??[] }
    const conds:  string[] = ['empresa_id = @empresa_id']
    const params: Record<string, unknown> = { empresa_id: p.empresa_id }
    if (p.busca) {
      conds.push(`(numero_nota LIKE @busca OR numero_pedido LIKE @busca OR fornecedor_nome LIKE @busca)`)
      params.busca = `%${p.busca}%`
    }
    return db.prepare(`
      SELECT * FROM almoxarifado_entradas WHERE ${conds.join(' AND ')}
      ORDER BY data DESC, id DESC
    `).all(params)
  })

  ipcMain.handle('almoxarifadoEntradas:buscarPorId', async (_e, id: number) => {
    if(getDatabaseProvider()==='supabase') { const supabase=getSupabase();const [{data:entrada,error:entradaError},{data:itens,error:itensError}]=await Promise.all([supabase.from('almoxarifado_entradas').select('*').eq('id',id).maybeSingle(),supabase.from('almoxarifado_entradas_itens').select('*').eq('entrada_id',id)]);if(entradaError)throw new Error(entradaError.message);if(itensError)throw new Error(itensError.message);return entrada?{...entrada,itens:itens??[]}:null }
    const entrada = db.prepare(`SELECT * FROM almoxarifado_entradas WHERE id = ?`).get(id)
    if (!entrada) return null
    const itens = db.prepare(`SELECT * FROM almoxarifado_entradas_itens WHERE entrada_id = ?`).all(id)
    return { ...entrada, itens }
  })

  // ── Registrar entrada: soma ao estoque e atualiza o valor
  // unitário do produto (última compra). ALTERADO: não lança mais
  // despesa automática no Financeiro — Despesas/Receitas ficam só
  // por conta de AP e Nota Fiscal lançadas pelo ADM (pedido do
  // usuário, antes seguia o mesmo padrão de AP/Nota Fiscal).
  ipcMain.handle('almoxarifadoEntradas:criar', async (_e, p: EntradaPayload) => {
    if (getDatabaseProvider() === 'supabase') {
      const { data, error } = await getSupabase().rpc('criar_entrada_almoxarifado', { p })
      if (error) throw new Error(error.message)
      return { id: data }
    }
    if (!p.itens || p.itens.length === 0) {
      throw new Error('Inclua ao menos um produto.')
    }

    const subtotal = p.itens.reduce((soma, i) => soma + i.quantidade * i.valor_unitario, 0)
    const desconto = p.valor_desconto ?? 0
    const acrescimo = p.valor_acrescimo ?? 0
    const total = Math.max(subtotal - desconto + acrescimo, 0)

    const criar = db.transaction(() => {
      const resultEntrada = db.prepare(`
        INSERT INTO almoxarifado_entradas (
          empresa_id, numero_nota, numero_pedido, data, fornecedor_id, fornecedor_nome,
          valor_desconto, valor_acrescimo, valor_total
        ) VALUES (
          @empresa_id, @numero_nota, @numero_pedido, @data, @fornecedor_id, @fornecedor_nome,
          @valor_desconto, @valor_acrescimo, @valor_total
        )
      `).run({
        empresa_id:      p.empresa_id,
        numero_nota:     p.numero_nota ?? null,
        numero_pedido:   p.numero_pedido ?? null,
        data:            p.data,
        fornecedor_id:   p.fornecedor_id ?? null,
        fornecedor_nome: p.fornecedor_nome,
        valor_desconto:  desconto,
        valor_acrescimo: acrescimo,
        valor_total:     total,
      })
      const entradaId = resultEntrada.lastInsertRowid as number

      const inserirItem = db.prepare(`
        INSERT INTO almoxarifado_entradas_itens
          (entrada_id, produto_id, produto_codigo, produto_nome, quantidade, valor_unitario, valor_total)
        VALUES (@entrada_id, @produto_id, @produto_codigo, @produto_nome, @quantidade, @valor_unitario, @valor_total)
      `)
      const atualizarEstoque = db.prepare(`
        UPDATE produtos SET estoque_atual = estoque_atual + ?, valor_unitario = ? WHERE id = ?
      `)

      for (const item of p.itens) {
        inserirItem.run({
          entrada_id:     entradaId,
          produto_id:     item.produto_id,
          produto_codigo: item.produto_codigo,
          produto_nome:   item.produto_nome,
          quantidade:     item.quantidade,
          valor_unitario: item.valor_unitario,
          valor_total:    item.quantidade * item.valor_unitario,
        })
        atualizarEstoque.run(item.quantidade, item.valor_unitario, item.produto_id)
      }

      // REMOVIDO: entrada de almoxarifado não gera mais lançamento
      // automático no Financeiro — Despesas/Receitas ficam só por
      // conta de AP e Nota Fiscal lançadas pelo ADM (pedido do
      // usuário).

      return entradaId
    })

    const id = criar()

    // NOVO: avisa o ADM e o Gestor que o Almoxarife deu entrada de material.
    for (const destinatario of ['admin', 'gestor']) {
      criarNotificacaoEvento(db, {
        empresa_id: p.empresa_id,
        tipo: 'almox_entrada',
        destinatario_perfil: destinatario,
        titulo: 'Entrada de material registrada',
        mensagem: `Nota ${p.numero_nota ?? '—'} — ${p.fornecedor_nome} (${p.itens.length} ${p.itens.length === 1 ? 'item' : 'itens'})`,
      })
    }

    return { id }
  })

  // ── Excluir entrada: desfaz o estoque somado e remove a despesa ──
  ipcMain.handle('almoxarifadoEntradas:excluir', async (_e, id: number) => {
    if(getDatabaseProvider()==='supabase') { const {error}=await getSupabase().rpc('excluir_entrada_almoxarifado',{p_entrada_id:id}); if(error)throw new Error(error.message); return {ok:true} }
    const entrada = db.prepare(`SELECT lancamento_id FROM almoxarifado_entradas WHERE id = ?`)
      .get(id) as { lancamento_id: number | null } | undefined
    const itens = db.prepare(`SELECT produto_id, quantidade FROM almoxarifado_entradas_itens WHERE entrada_id = ?`)
      .all(id) as { produto_id: number; quantidade: number }[]

    const excluir = db.transaction(() => {
      for (const item of itens) {
        db.prepare(`UPDATE produtos SET estoque_atual = estoque_atual - ? WHERE id = ?`)
          .run(item.quantidade, item.produto_id)
      }
      db.prepare(`DELETE FROM almoxarifado_entradas WHERE id = ?`).run(id)
      if (entrada?.lancamento_id) {
        db.prepare(`DELETE FROM lancamentos WHERE id = ?`).run(entrada.lancamento_id)
      }
    })
    excluir()
    return { ok: true }
  })
}
