import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { getDatabaseProvider, getSupabase } from '../supabase/client'

interface ProdutoPayload {
  empresa_id:     number
  codigo:         string
  nome:           string
  descricao?:     string | null
  unidade?:       string | null
  categoria?:     string | null
  estoque_atual?: number
  estoque_minimo?: number
  valor_unitario?: number
  fornecedor_id?:      number | null
  alugado?:            boolean
  valor_aluguel?:       number | null
  aluguel_periodo?:     string | null
  aluguel_vencimento?:  string | null
}

export function registerProdutosIpc() {
  const db = getDb()

  // ── Listar (com busca) ───────────────────────────────────
  ipcMain.handle('produtos:listar', async (_e, p: { empresa_id: number; busca?: string; categoria?: string }) => {
    if (getDatabaseProvider() === 'supabase') {
      let query = getSupabase().from('produtos').select('*').eq('empresa_id', p.empresa_id).order('nome')
      if (p.busca) query = query.ilike('nome', `%${p.busca.replace(/[%_]/g, '\\$&')}%`)
      if (p.categoria) query = query.eq('categoria', p.categoria)
      const { data, error } = await query; if (error) throw new Error(error.message); return data ?? []
    }
    const conds:  string[] = ['pr.empresa_id = @empresa_id']
    const params: Record<string, unknown> = { empresa_id: p.empresa_id }
    if (p.busca) {
      conds.push(`(pr.codigo LIKE @busca OR pr.nome LIKE @busca)`)
      params.busca = `%${p.busca}%`
    }
    if (p.categoria) {
      conds.push(`pr.categoria = @categoria`)
      params.categoria = p.categoria
    }
    return db.prepare(`
      SELECT pr.*, f.nome AS fornecedor_nome
      FROM produtos pr LEFT JOIN fornecedores f ON f.id = pr.fornecedor_id
      WHERE ${conds.join(' AND ')} ORDER BY pr.nome COLLATE NOCASE ASC
    `).all(params)
  })

  // ── NOVO: categorias já cadastradas (pra alimentar o filtro
  // da página inicial, sem repetir a mesma lista de opções fixas).
  ipcMain.handle('produtos:categorias', async (_e, empresa_id: number) => {
    if (getDatabaseProvider() === 'supabase') {
      const { data, error } = await getSupabase().from('produtos').select('categoria').eq('empresa_id', empresa_id).not('categoria', 'is', null)
      if (error) throw new Error(error.message)
      return [...new Set((data ?? []).map(r => r.categoria).filter((v): v is string => !!v && v !== ''))].sort()
    }
    return db.prepare(`
      SELECT DISTINCT categoria FROM produtos
      WHERE empresa_id = ? AND categoria IS NOT NULL AND categoria != ''
      ORDER BY categoria ASC
    `).all(empresa_id).map(r => (r as { categoria: string }).categoria)
  })

  // ── Buscar por código exato (autocomplete na entrada de nota) ──
  // CORRIGIDO: "01" e "1" agora são tratados como o mesmo código
  // quando ambos são puramente numéricos — antes a comparação era só
  // texto exato, então zero à esquerda fazia a busca falhar.
  ipcMain.handle('produtos:buscarPorCodigo', async (_e, p: { empresa_id: number; codigo: string }) => {
    if(getDatabaseProvider()==='supabase') { const {data,error}=await getSupabase().from('produtos').select('*').eq('empresa_id',p.empresa_id).eq('codigo',p.codigo).maybeSingle();if(error)throw new Error(error.message);return data??null }
    return db.prepare(`
      SELECT * FROM produtos
      WHERE empresa_id = @empresa_id
        AND (
          codigo = @codigo
          OR (
            @codigo GLOB '[0-9]*' AND codigo GLOB '[0-9]*'
            AND CAST(codigo AS INTEGER) = CAST(@codigo AS INTEGER)
          )
        )
    `).get(p) ?? null
  })

  ipcMain.handle('produtos:buscarPorId', async (_e, id: number) => {
    if (getDatabaseProvider() === 'supabase') { const { data, error } = await getSupabase().from('produtos').select('*').eq('id', id).maybeSingle(); if (error) throw new Error(error.message); return data ?? null }
    return db.prepare(`SELECT * FROM produtos WHERE id = ?`).get(id) ?? null
  })

  // ── Resumo para os cards do painel (zerados, acabando, valor total) ──
  ipcMain.handle('produtos:resumo', async (_e, empresa_id: number) => {
    if (getDatabaseProvider() === 'supabase') {
      const { data, error } = await getSupabase().from('produtos').select('id,codigo,nome,estoque_atual,estoque_minimo,unidade,valor_unitario').eq('empresa_id', empresa_id)
      if (error) throw new Error(error.message); const rows = data ?? []
      return { zerados: rows.filter(x => Number(x.estoque_atual) <= 0).sort((a,b) => a.nome.localeCompare(b.nome)), acabando: rows.filter(x => Number(x.estoque_atual) > 0 && Number(x.estoque_atual) <= Number(x.estoque_minimo)).sort((a,b) => Number(a.estoque_atual)-Number(b.estoque_atual)), valorTotal: rows.reduce((s,x) => s + Number(x.estoque_atual)*Number(x.valor_unitario), 0) }
    }
    const zerados = db.prepare(`
      SELECT id, codigo, nome, estoque_atual, unidade FROM produtos
      WHERE empresa_id = ? AND estoque_atual <= 0
      ORDER BY nome COLLATE NOCASE ASC
    `).all(empresa_id)

    const acabando = db.prepare(`
      SELECT id, codigo, nome, estoque_atual, unidade FROM produtos
      WHERE empresa_id = ? AND estoque_atual > 0 AND estoque_atual <= estoque_minimo
      ORDER BY estoque_atual ASC
    `).all(empresa_id)

    const valorTotal = (db.prepare(`
      SELECT COALESCE(SUM(estoque_atual * valor_unitario), 0) AS v FROM produtos WHERE empresa_id = ?
    `).get(empresa_id) as { v: number }).v

    return { zerados, acabando, valorTotal }
  })

  // ── Listar com última entrada/saída (para a página Estoque) ──
  // Se um período for informado, considera só movimentações dentro
  // dele (mas o saldo atual sempre reflete o estoque de agora).
  ipcMain.handle('produtos:listarComMovimentacao', async (_e, p: {
    empresa_id: number; dataInicio?: string; dataFim?: string
  }) => {
    // CORRIGIDO: almoxarifado_saidas virou cabeçalho+itens (pra
    // aceitar vários materiais numa saída só) — essas duas consultas
    // ainda buscavam produto_id/data direto em almoxarifado_saidas,
    // coluna que não existe mais lá (agora fica em
    // almoxarifado_saidas_itens). Por isso o Painel de Estoque parava
    // de mostrar qualquer material (a consulta falhava e o erro era
    // engolido silenciosamente no frontend).
    if(getDatabaseProvider()==='supabase') { const s=getSupabase();const [{data:produtos,error:e1},{data:itens,error:e2},{data:itensSaida,error:e3}]=await Promise.all([s.from('produtos').select('id,codigo,nome,descricao,unidade,estoque_atual').eq('empresa_id',p.empresa_id).order('nome'),s.from('almoxarifado_entradas_itens').select('produto_id,almoxarifado_entradas(data)').eq('almoxarifado_entradas.empresa_id',p.empresa_id),s.from('almoxarifado_saidas_itens').select('produto_id,almoxarifado_saidas(data,empresa_id)')]);for(const e of [e1,e2,e3])if(e)throw new Error(e.message);const dentro=(d:string)=>!p.dataInicio||!p.dataFim||(d>=p.dataInicio&&d<=p.dataFim);const saidasDaObra=(itensSaida??[]).filter((x:any)=>x.almoxarifado_saidas?.empresa_id===p.empresa_id);return (produtos??[]).map(pr=>({...pr,ultima_entrada:(itens??[]).filter((i:any)=>i.produto_id===pr.id&&i.almoxarifado_entradas?.data&&dentro(i.almoxarifado_entradas.data)).map((i:any)=>i.almoxarifado_entradas.data).sort().at(-1)??null,ultima_saida:saidasDaObra.filter((x:any)=>x.produto_id===pr.id&&x.almoxarifado_saidas?.data&&dentro(x.almoxarifado_saidas.data)).map((x:any)=>x.almoxarifado_saidas.data).sort().at(-1)??null})) }
    const filtroData = p.dataInicio && p.dataFim
      ? `AND date(data) BETWEEN date(@dataInicio) AND date(@dataFim)`
      : ''
    return db.prepare(`
      SELECT
        pr.id, pr.codigo, pr.nome, pr.descricao, pr.unidade, pr.estoque_atual,
        (
          SELECT MAX(e.data) FROM almoxarifado_entradas e
          JOIN almoxarifado_entradas_itens ei ON ei.entrada_id = e.id
          WHERE ei.produto_id = pr.id
          ${filtroData.replace('data', 'e.data')}
        ) AS ultima_entrada,
        (
          SELECT MAX(s.data) FROM almoxarifado_saidas s
          JOIN almoxarifado_saidas_itens si ON si.saida_id = s.id
          WHERE si.produto_id = pr.id
          ${filtroData.replace('data', 's.data')}
        ) AS ultima_saida
      FROM produtos pr
      WHERE pr.empresa_id = @empresa_id
      ORDER BY pr.nome COLLATE NOCASE ASC
    `).all({ empresa_id: p.empresa_id, dataInicio: p.dataInicio ?? null, dataFim: p.dataFim ?? null })
  })

  // ── Movimentação (histórico de entradas/saídas) de um produto ──
  ipcMain.handle('produtos:movimentacao', async (_e, p: {
    produto_id: number; dataInicio?: string; dataFim?: string
  }) => {
    // CORRIGIDO: mesma causa do handler acima.
    if(getDatabaseProvider()==='supabase') { const s=getSupabase();const [{data:itens,error:e1},{data:itensSaida,error:e2}]=await Promise.all([s.from('almoxarifado_entradas_itens').select('quantidade,entrada_id,almoxarifado_entradas(data,fornecedor_nome,numero_nota)').eq('produto_id',p.produto_id),s.from('almoxarifado_saidas_itens').select('quantidade,saida_id,almoxarifado_saidas(data,retirado_por_nome,setor)').eq('produto_id',p.produto_id)]);if(e1)throw new Error(e1.message);if(e2)throw new Error(e2.message);const inicio=p.dataInicio,end=p.dataFim;const dentro=(d:string)=>!inicio||!end||(d>=inicio&&d<=end);return [...(itens??[]).map((i:any)=>({tipo:'entrada',data:i.almoxarifado_entradas?.data,quantidade:i.quantidade,pessoa:i.almoxarifado_entradas?.fornecedor_nome,referencia:i.almoxarifado_entradas?.numero_nota})),...(itensSaida??[]).map((x:any)=>({tipo:'saida',data:x.almoxarifado_saidas?.data,quantidade:x.quantidade,pessoa:x.almoxarifado_saidas?.retirado_por_nome,referencia:x.almoxarifado_saidas?.setor}))].filter(x=>x.data&&dentro(x.data)).sort((a,b)=>b.data.localeCompare(a.data)) }
    const condData = p.dataInicio && p.dataFim ? `AND date(data) BETWEEN date(@dataInicio) AND date(@dataFim)` : ''
    return db.prepare(`
      SELECT 'entrada' AS tipo, e.data, ei.quantidade, e.fornecedor_nome AS pessoa, e.numero_nota AS referencia
      FROM almoxarifado_entradas_itens ei
      JOIN almoxarifado_entradas e ON e.id = ei.entrada_id
      WHERE ei.produto_id = @produto_id ${condData.replace('data', 'e.data')}
      UNION ALL
      SELECT 'saida' AS tipo, s.data, si.quantidade, s.retirado_por_nome AS pessoa, s.setor AS referencia
      FROM almoxarifado_saidas_itens si
      JOIN almoxarifado_saidas s ON s.id = si.saida_id
      WHERE si.produto_id = @produto_id ${condData.replace('data', 's.data')}
      ORDER BY data DESC
    `).all({ produto_id: p.produto_id, dataInicio: p.dataInicio ?? null, dataFim: p.dataFim ?? null })
  })

  // ── Produtos com estoque dentro de uma faixa (relatório) ────
  ipcMain.handle('produtos:porFaixaEstoque', async (_e, p: { empresa_id: number; min: number; max: number }) => {
    if(getDatabaseProvider()==='supabase') { const {data,error}=await getSupabase().from('produtos').select('codigo,nome,unidade,estoque_atual,valor_unitario').eq('empresa_id',p.empresa_id).gte('estoque_atual',p.min).lte('estoque_atual',p.max).order('estoque_atual');if(error)throw new Error(error.message);return data??[] }
    return db.prepare(`
      SELECT codigo, nome, unidade, estoque_atual, valor_unitario
      FROM produtos
      WHERE empresa_id = ? AND estoque_atual BETWEEN ? AND ?
      ORDER BY estoque_atual ASC
    `).all(p.empresa_id, p.min, p.max)
  })

  // ── Próximo código disponível (sequência automática) ────
  // NOVO: ao cadastrar um material/ferramenta novo, o código não é
  // mais digitado — segue a sequência numérica automaticamente.
  ipcMain.handle('produtos:proximoCodigo', async (_e, empresa_id: number) => {
    if (getDatabaseProvider() === 'supabase') {
      const { data, error } = await getSupabase().from('produtos').select('codigo').eq('empresa_id', empresa_id)
      if (error) throw new Error(error.message)
      const maior = Math.max(0, ...(data ?? []).map(p => Number(p.codigo.replace(/\D/g, '')) || 0))
      // CORRIGIDO: estava retornando a string pronta em vez de
      // { codigo: ... } (formato que o SQLite sempre retornou, e que
      // o frontend espera — ProdutoModal.tsx faz `r.codigo`). Sem essa
      // correção, `codigo` ficava undefined no formulário, e quebrava
      // mais na frente com "Cannot read properties of undefined
      // (reading 'trim')" ao tentar salvar. Também alinhei pra 3
      // dígitos — estava em 4, diferente do padrão de sempre.
      return { codigo: String(maior + 1).padStart(3, '0') }
    }
    const maior = (db.prepare(`
      SELECT COALESCE(MAX(CAST(codigo AS INTEGER)), 0) AS maior
      FROM produtos
      WHERE empresa_id = ? AND codigo GLOB '[0-9]*'
    `).get(empresa_id) as { maior: number }).maior
    const proximo = maior + 1
    return { codigo: String(proximo).padStart(3, '0') }
  })

  // ── Criar ────────────────────────────────────────────────
  ipcMain.handle('produtos:criar', async (_e, p: ProdutoPayload) => {
    if(getDatabaseProvider()==='supabase') { const {data,error}=await getSupabase().from('produtos').insert({...p,descricao:p.descricao??null,unidade:p.unidade??null,categoria:p.categoria??null,estoque_atual:p.estoque_atual??0,estoque_minimo:p.estoque_minimo??0,valor_unitario:p.valor_unitario??0,fornecedor_id:p.fornecedor_id??null,alugado:p.alugado?1:0,valor_aluguel:p.alugado?p.valor_aluguel??null:null,aluguel_periodo:p.alugado?p.aluguel_periodo??null:null,aluguel_vencimento:p.alugado?p.aluguel_vencimento??null:null}).select('id').single();if(error)throw new Error(error.message);return {id:data.id} }
    const result = db.prepare(`
      INSERT INTO produtos (
        empresa_id, codigo, nome, descricao, unidade, categoria, estoque_atual, estoque_minimo, valor_unitario,
        fornecedor_id, alugado, valor_aluguel, aluguel_periodo, aluguel_vencimento
      )
      VALUES (
        @empresa_id, @codigo, @nome, @descricao, @unidade, @categoria, @estoque_atual, @estoque_minimo, @valor_unitario,
        @fornecedor_id, @alugado, @valor_aluguel, @aluguel_periodo, @aluguel_vencimento
      )
    `).run({
      empresa_id:     p.empresa_id,
      codigo:         p.codigo,
      nome:           p.nome,
      descricao:      p.descricao ?? null,
      unidade:        p.unidade ?? null,
      categoria:      p.categoria ?? null,
      estoque_atual:  p.estoque_atual ?? 0,
      estoque_minimo: p.estoque_minimo ?? 0,
      valor_unitario: p.valor_unitario ?? 0,
      fornecedor_id:      p.fornecedor_id ?? null,
      alugado:            p.alugado ? 1 : 0,
      valor_aluguel:      p.alugado ? (p.valor_aluguel ?? null) : null,
      aluguel_periodo:    p.alugado ? (p.aluguel_periodo ?? null) : null,
      aluguel_vencimento: p.alugado ? (p.aluguel_vencimento ?? null) : null,
    })
    return { id: result.lastInsertRowid }
  })

  // ── Atualizar ────────────────────────────────────────────
  ipcMain.handle('produtos:atualizar', async (_e, p: ProdutoPayload & { id: number }) => {
    if(getDatabaseProvider()==='supabase') { const {id,...dados}=p;const {error}=await getSupabase().from('produtos').update({...dados,descricao:p.descricao??null,unidade:p.unidade??null,categoria:p.categoria??null,estoque_atual:p.estoque_atual??0,estoque_minimo:p.estoque_minimo??0,valor_unitario:p.valor_unitario??0,fornecedor_id:p.fornecedor_id??null,alugado:p.alugado?1:0,valor_aluguel:p.alugado?p.valor_aluguel??null:null,aluguel_periodo:p.alugado?p.aluguel_periodo??null:null,aluguel_vencimento:p.alugado?p.aluguel_vencimento??null:null}).eq('id',id);if(error)throw new Error(error.message);return {ok:true} }
    db.prepare(`
      UPDATE produtos
      SET codigo = @codigo, nome = @nome, descricao = @descricao, unidade = @unidade, categoria = @categoria,
          estoque_atual = @estoque_atual, estoque_minimo = @estoque_minimo, valor_unitario = @valor_unitario,
          fornecedor_id = @fornecedor_id, alugado = @alugado, valor_aluguel = @valor_aluguel,
          aluguel_periodo = @aluguel_periodo, aluguel_vencimento = @aluguel_vencimento
      WHERE id = @id
    `).run({
      id:             p.id,
      codigo:         p.codigo,
      nome:           p.nome,
      descricao:      p.descricao ?? null,
      unidade:        p.unidade ?? null,
      categoria:      p.categoria ?? null,
      estoque_atual:  p.estoque_atual ?? 0,
      estoque_minimo: p.estoque_minimo ?? 0,
      valor_unitario: p.valor_unitario ?? 0,
      fornecedor_id:      p.fornecedor_id ?? null,
      alugado:            p.alugado ? 1 : 0,
      valor_aluguel:      p.alugado ? (p.valor_aluguel ?? null) : null,
      aluguel_periodo:    p.alugado ? (p.aluguel_periodo ?? null) : null,
      aluguel_vencimento: p.alugado ? (p.aluguel_vencimento ?? null) : null,
    })
    return { ok: true }
  })

  // ── NOVO: relatório de Alugados — materiais/ferramentas
  // marcados como alugados, com filtro opcional por vencimento do
  // aluguel (pra ver o que tá vencendo num período).
  ipcMain.handle('produtos:alugados', async (_e, p: { empresa_id: number; vencimentoInicio?: string; vencimentoFim?: string }) => {
    if(getDatabaseProvider()==='supabase') { const s=getSupabase();let q=s.from('produtos').select('codigo,nome,unidade,valor_aluguel,aluguel_periodo,aluguel_vencimento,fornecedor_id').eq('empresa_id',p.empresa_id).eq('alugado',1).order('aluguel_vencimento');if(p.vencimentoInicio&&p.vencimentoFim)q=q.gte('aluguel_vencimento',p.vencimentoInicio).lte('aluguel_vencimento',p.vencimentoFim);const {data,error}=await q;if(error)throw new Error(error.message);const ids=[...(data??[]).map(x=>x.fornecedor_id).filter((x):x is number=>x!==null)];let fornecedores:any[]=[];if(ids.length){const r=await s.from('fornecedores').select('id,nome').in('id',ids);if(r.error)throw new Error(r.error.message);fornecedores=r.data??[]}const nomes=new Map(fornecedores.map(f=>[f.id,f.nome]));return (data??[]).map(x=>({...x,fornecedor_nome:nomes.get(x.fornecedor_id)??null})) }
    const conds = ['pr.empresa_id = @empresa_id', 'pr.alugado = 1']
    const params: Record<string, unknown> = { empresa_id: p.empresa_id }
    if (p.vencimentoInicio && p.vencimentoFim) {
      conds.push(`date(pr.aluguel_vencimento) BETWEEN date(@vencimentoInicio) AND date(@vencimentoFim)`)
      params.vencimentoInicio = p.vencimentoInicio
      params.vencimentoFim = p.vencimentoFim
    }
    return db.prepare(`
      SELECT pr.codigo, pr.nome, pr.unidade, pr.valor_aluguel, pr.aluguel_periodo, pr.aluguel_vencimento,
             f.nome AS fornecedor_nome
      FROM produtos pr LEFT JOIN fornecedores f ON f.id = pr.fornecedor_id
      WHERE ${conds.join(' AND ')}
      ORDER BY pr.aluguel_vencimento ASC NULLS LAST
    `).all(params)
  })

  // ── Excluir ──────────────────────────────────────────────
  ipcMain.handle('produtos:excluir', async (_e, id: number) => {
    if(getDatabaseProvider()==='supabase') {
      const s = getSupabase()
      const { data: produto } = await s.from('produtos').select('nome,codigo,empresa_id').eq('id', id).single()
      if (produto) {
        await s.rpc('registrar_exclusao', {
          p_tabela: 'produtos', p_registro_id: id,
          p_descricao: `Material/Ferramenta - ${produto.nome} (código ${produto.codigo})`,
          p_empresa_id: produto.empresa_id,
        })
      }
      const {error}=await s.from('produtos').delete().eq('id',id);if(error)throw new Error(error.message);return {ok:true}
    }
    db.prepare(`DELETE FROM produtos WHERE id = ?`).run(id)
    return { ok: true }
  })
}
