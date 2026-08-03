import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { criarNotificacaoEvento } from './notificacoes.ipc'
import { getDatabaseProvider, getSupabase } from '../supabase/client'

interface SaidaPayload {
  empresa_id:          number
  data:                string
  produto_id:          number
  produto_codigo:      string
  produto_nome:        string
  quantidade:          number
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
    if(getDatabaseProvider()==='supabase') { let q=getSupabase().from('almoxarifado_saidas').select('*').eq('empresa_id',p.empresa_id).order('data',{ascending:false}).order('id',{ascending:false});if(p.busca){const termo=p.busca.replace(/[(),.]/g,' ');q=q.or(`produto_nome.ilike.%${termo}%,produto_codigo.ilike.%${termo}%,retirado_por_nome.ilike.%${termo}%`)}if(p.dataInicio&&p.dataFim)q=q.gte('data',p.dataInicio).lte('data',p.dataFim);const {data,error}=await q;if(error)throw new Error(error.message);return data??[] }
    const conds:  string[] = ['empresa_id = @empresa_id']
    const params: Record<string, unknown> = { empresa_id: p.empresa_id }

    if (p.busca) {
      conds.push(`(produto_nome LIKE @busca OR produto_codigo LIKE @busca OR retirado_por_nome LIKE @busca)`)
      params.busca = `%${p.busca}%`
    }
    if (p.dataInicio && p.dataFim) {
      conds.push(`date(data) BETWEEN date(@dataInicio) AND date(@dataFim)`)
      params.dataInicio = p.dataInicio
      params.dataFim = p.dataFim
    }

    return db.prepare(`
      SELECT * FROM almoxarifado_saidas WHERE ${conds.join(' AND ')}
      ORDER BY data DESC, id DESC
    `).all(params)
  })

  ipcMain.handle('almoxarifadoSaidas:buscarPorId', async (_e, id: number) => {
    if(getDatabaseProvider()==='supabase') { const {data,error}=await getSupabase().from('almoxarifado_saidas').select('*').eq('id',id).maybeSingle();if(error)throw new Error(error.message);return data??null }
    return db.prepare(`SELECT * FROM almoxarifado_saidas WHERE id = ?`).get(id) ?? null
  })

  // ── Registrar saída: desconta do estoque ─────────────────
  ipcMain.handle('almoxarifadoSaidas:criar', async (_e, p: SaidaPayload) => {
    if (getDatabaseProvider() === 'supabase') {
      const { data, error } = await getSupabase().rpc('criar_saida_almoxarifado', { p })
      if (error) throw new Error(error.message)
      return { id: data }
    }
    const produto = db.prepare(`SELECT estoque_atual FROM produtos WHERE id = ?`).get(p.produto_id) as
      { estoque_atual: number } | undefined
    if (!produto) throw new Error('Produto não encontrado.')

    const criar = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO almoxarifado_saidas (
          empresa_id, data, produto_id, produto_codigo, produto_nome, quantidade,
          retirado_por_tipo, retirado_por_id, retirado_por_nome, setor,
          solicitado_por_id, solicitado_por_nome, liberado_por
        ) VALUES (
          @empresa_id, @data, @produto_id, @produto_codigo, @produto_nome, @quantidade,
          @retirado_por_tipo, @retirado_por_id, @retirado_por_nome, @setor,
          @solicitado_por_id, @solicitado_por_nome, @liberado_por
        )
      `).run({
        empresa_id:          p.empresa_id,
        data:                p.data,
        produto_id:          p.produto_id,
        produto_codigo:      p.produto_codigo,
        produto_nome:        p.produto_nome,
        quantidade:          p.quantidade,
        retirado_por_tipo:   p.retirado_por_tipo,
        retirado_por_id:     p.retirado_por_id ?? null,
        retirado_por_nome:   p.retirado_por_nome,
        setor:               p.setor ?? null,
        solicitado_por_id:   p.solicitado_por_id ?? null,
        solicitado_por_nome: p.solicitado_por_nome ?? null,
        liberado_por:        p.liberado_por ?? null,
      })

      db.prepare(`UPDATE produtos SET estoque_atual = estoque_atual - ? WHERE id = ?`)
        .run(p.quantidade, p.produto_id)

      return result.lastInsertRowid as number
    })

    const id = criar()

    // NOVO: avisa o ADM e o Gestor que o Almoxarife deu saída de material.
    for (const destinatario of ['admin', 'gestor']) {
      criarNotificacaoEvento(db, {
        empresa_id: p.empresa_id,
        tipo: 'almox_saida',
        destinatario_perfil: destinatario,
        titulo: 'Saída de material registrada',
        mensagem: `${p.produto_nome} (${p.quantidade}) — retirado por ${p.retirado_por_nome}`,
      })
    }

    return { id }
  })

  // ── Guardar o caminho do PDF gerado (documento de retirada) ──
  ipcMain.handle('almoxarifadoSaidas:salvarCaminhoPdf', (_e, p: { id: number; pdf_path: string }) => {
    db.prepare(`UPDATE almoxarifado_saidas SET pdf_path = ? WHERE id = ?`).run(p.pdf_path, p.id)
    return { ok: true }
  })

  // ── Excluir: devolve a quantidade ao estoque ─────────────
  ipcMain.handle('almoxarifadoSaidas:excluir', async (_e, id: number) => {
    if(getDatabaseProvider()==='supabase') { const {error}=await getSupabase().rpc('excluir_saida_almoxarifado',{p_saida_id:id}); if(error)throw new Error(error.message); return {ok:true} }
    const saida = db.prepare(`SELECT produto_id, quantidade FROM almoxarifado_saidas WHERE id = ?`)
      .get(id) as { produto_id: number; quantidade: number } | undefined

    const excluir = db.transaction(() => {
      if (saida) {
        db.prepare(`UPDATE produtos SET estoque_atual = estoque_atual + ? WHERE id = ?`)
          .run(saida.quantidade, saida.produto_id)
      }
      db.prepare(`DELETE FROM almoxarifado_saidas WHERE id = ?`).run(id)
    })
    excluir()
    return { ok: true }
  })
}
