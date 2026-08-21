import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { getDatabaseProvider, getSupabase } from '../supabase/client'

interface PeriodoParams {
  empresa_id: number
  inicio:     string
  fim:        string
}

interface TopParams extends PeriodoParams {
  tipo:   'receita' | 'despesa'
  limit?: number
}

export function registerRelatoriosIpc() {
  const db = getDb()

  // ── Evolução mensal ────────────────────────────────────
  ipcMain.handle('relatorios:evolucaoMensal', async (_e, p: PeriodoParams) => {
    if (getDatabaseProvider()==='supabase') {
      const {data,error}=await getSupabase().from('lancamentos').select('data,tipo,valor').eq('empresa_id',p.empresa_id).gte('data',p.inicio).lte('data',p.fim).eq('status','confirmado'); if(error) throw new Error(error.message)
      const grupos=new Map<string,{receitas:number;despesas:number}>(); for(const x of data??[]) { const mes=x.data.slice(0,7); const g=grupos.get(mes)??{receitas:0,despesas:0}; x.tipo==='receita'?g.receitas+=Number(x.valor):g.despesas+=Number(x.valor); grupos.set(mes,g) } return [...grupos].sort(([a],[b])=>a.localeCompare(b)).map(([mes,g])=>({mes,...g,saldo:g.receitas-g.despesas}))
    }
    return db.prepare(`
      SELECT
        strftime('%Y-%m', data) AS mes,
        SUM(CASE WHEN tipo = 'receita' THEN valor ELSE 0 END) AS receitas,
        SUM(CASE WHEN tipo = 'despesa' THEN valor ELSE 0 END) AS despesas,
        SUM(CASE
              WHEN tipo = 'receita' THEN  valor
              WHEN tipo = 'despesa' THEN -valor
              ELSE 0
            END)                                               AS saldo
      FROM lancamentos
      WHERE empresa_id = @empresa_id
        AND data BETWEEN @inicio AND @fim
        AND status = 'confirmado'
      GROUP BY mes
      ORDER BY mes ASC
    `).all(p) as {
      mes:      string
      receitas: number
      despesas: number
      saldo:    number
    }[]
  })

  // ── Top categorias ─────────────────────────────────────
  ipcMain.handle('relatorios:topCategorias', async (_e, p: TopParams) => {
    if (getDatabaseProvider()==='supabase') {
      const supabase=getSupabase()
      const [{data:lancamentos,error:lancamentosError},{data:categorias,error:categoriasError}]=await Promise.all([
        supabase.from('lancamentos').select('categoria_id,valor').eq('empresa_id',p.empresa_id).eq('tipo',p.tipo).gte('data',p.inicio).lte('data',p.fim).eq('status','confirmado'),
        supabase.from('categorias').select('id,nome,cor').eq('empresa_id',p.empresa_id),
      ])
      if(lancamentosError) throw new Error(lancamentosError.message); if(categoriasError) throw new Error(categoriasError.message)
      const porId=new Map((categorias??[]).map(c=>[c.id,c])); const grupos=new Map<number|string,{nome:string;cor:string;total:number}>()
      for(const l of lancamentos??[]) { const chave=l.categoria_id??'sem-categoria'; const categoria=porId.get(l.categoria_id); const g=grupos.get(chave)??{nome:categoria?.nome??'Sem categoria',cor:categoria?.cor??'#64748b',total:0}; g.total+=Number(l.valor); grupos.set(chave,g) }
      return [...grupos.values()].sort((a,b)=>b.total-a.total).slice(0,p.limit??6)
    }
    return db.prepare(`
      SELECT
        COALESCE(c.nome, 'Sem categoria') AS nome,
        COALESCE(c.cor,  '#64748b')       AS cor,
        SUM(l.valor)                       AS total
      FROM lancamentos l
      LEFT JOIN categorias c ON c.id = l.categoria_id
      WHERE l.empresa_id  = @empresa_id
        AND l.tipo        = @tipo
        AND l.data BETWEEN @inicio AND @fim
        AND l.status      = 'confirmado'
      GROUP BY l.categoria_id
      ORDER BY total DESC
      LIMIT @limit
    `).all({ ...p, limit: p.limit ?? 6 }) as {
      nome:  string
      cor:   string
      total: number
    }[]
  })

  // ── Fluxo de caixa diário ──────────────────────────────
  ipcMain.handle('relatorios:fluxoDiario', async (_e, p: PeriodoParams) => {
    if (getDatabaseProvider()==='supabase') {
      const {data,error}=await getSupabase().from('lancamentos').select('data,tipo,valor').eq('empresa_id',p.empresa_id).gte('data',p.inicio).lte('data',p.fim).eq('status','confirmado'); if(error) throw new Error(error.message)
      const grupos=new Map<string,{entradas:number;saidas:number}>(); for(const l of data??[]) { const g=grupos.get(l.data)??{entradas:0,saidas:0}; l.tipo==='receita'?g.entradas+=Number(l.valor):g.saidas+=Number(l.valor); grupos.set(l.data,g) } return [...grupos].sort(([a],[b])=>a.localeCompare(b)).map(([data,g])=>({data,...g}))
    }
    return db.prepare(`
      SELECT
        data,
        SUM(CASE WHEN tipo = 'receita' THEN  valor ELSE 0 END) AS entradas,
        SUM(CASE WHEN tipo = 'despesa' THEN  valor ELSE 0 END) AS saidas
      FROM lancamentos
      WHERE empresa_id = @empresa_id
        AND data BETWEEN @inicio AND @fim
        AND status = 'confirmado'
      GROUP BY data
      ORDER BY data ASC
    `).all(p) as {
      data:     string
      entradas: number
      saidas:   number
    }[]
  })

  // ── Comparativo conta a conta ──────────────────────────
  ipcMain.handle('relatorios:porConta', async (_e, p: PeriodoParams) => {
    if (getDatabaseProvider()==='supabase') {
      const supabase=getSupabase()
      const [{data:lancamentos,error:lancamentosError},{data:contas,error:contasError}]=await Promise.all([
        supabase.from('lancamentos').select('conta_id,tipo,valor').eq('empresa_id',p.empresa_id).gte('data',p.inicio).lte('data',p.fim).eq('status','confirmado'),
        supabase.from('contas').select('id,nome').eq('empresa_id',p.empresa_id),
      ])
      if(lancamentosError) throw new Error(lancamentosError.message); if(contasError) throw new Error(contasError.message)
      const porId=new Map((contas??[]).map(c=>[c.id,c.nome])); const grupos=new Map<number|string,{conta:string;receitas:number;despesas:number}>()
      for(const l of lancamentos??[]) { const chave=l.conta_id??'sem-conta'; const g=grupos.get(chave)??{conta:porId.get(l.conta_id)??'Sem conta',receitas:0,despesas:0}; l.tipo==='receita'?g.receitas+=Number(l.valor):g.despesas+=Number(l.valor); grupos.set(chave,g) }
      return [...grupos.values()].sort((a,b)=>b.receitas-a.receitas)
    }
    return db.prepare(`
      SELECT
        COALESCE(ct.nome, 'Sem conta') AS conta,
        SUM(CASE WHEN l.tipo = 'receita' THEN  l.valor ELSE 0 END) AS receitas,
        SUM(CASE WHEN l.tipo = 'despesa' THEN  l.valor ELSE 0 END) AS despesas
      FROM lancamentos l
      LEFT JOIN contas ct ON ct.id = l.conta_id
      WHERE l.empresa_id = @empresa_id
        AND l.data BETWEEN @inicio AND @fim
        AND l.status = 'confirmado'
      GROUP BY l.conta_id
      ORDER BY receitas DESC
    `).all(p) as {
      conta:    string
      receitas: number
      despesas: number
    }[]
  })

  // NOVO: Relatórios Financeiros detalhados (pedido do usuário) —
  // mesma lógica da versão web (webApi.ts), usando 'diferente de
  // cancelado' em vez de 'confirmado' (hoje nenhum lançamento tem
  // esse status — ficaria sempre vazio; vale investigar depois se
  // 'confirmado' ainda é usado em algum lugar do fluxo).
  ipcMain.handle('relatorios:despesasPorData', async (_e, p: PeriodoParams) => {
    if (getDatabaseProvider() === 'supabase') {
      const supabase = getSupabase()
      const { data, error } = await supabase.from('lancamentos')
        .select('id,descricao,valor,data,data_venc,status,fornecedor_id,categoria_id')
        .eq('empresa_id', p.empresa_id).eq('tipo', 'despesa').neq('status', 'cancelado')
        .gte('data', p.inicio).lte('data', p.fim).order('data')
      if (error) throw new Error(error.message)
      const fornecedorIds = [...new Set((data ?? []).map(l => l.fornecedor_id).filter((x): x is number => x !== null))]
      let fornecedoresRows: any[] = []
      if (fornecedorIds.length) {
        const r = await supabase.from('fornecedores').select('id,nome').in('id', fornecedorIds)
        if (r.error) throw new Error(r.error.message)
        fornecedoresRows = r.data ?? []
      }
      const nomesFornecedor = new Map(fornecedoresRows.map(f => [f.id, f.nome]))
      return (data ?? []).map(l => ({ ...l, fornecedor_nome: l.fornecedor_id ? nomesFornecedor.get(l.fornecedor_id) ?? null : null }))
    }
    return db.prepare(`
      SELECT l.id, l.descricao, l.valor, l.data, l.data_venc, l.status, l.fornecedor_id, l.categoria_id, f.nome AS fornecedor_nome
      FROM lancamentos l
      LEFT JOIN fornecedores f ON f.id = l.fornecedor_id
      WHERE l.empresa_id = @empresa_id AND l.tipo = 'despesa' AND l.status <> 'cancelado'
        AND l.data BETWEEN @inicio AND @fim
      ORDER BY l.data ASC
    `).all(p)
  })

  ipcMain.handle('relatorios:porFornecedor', async (_e, p: PeriodoParams) => {
    if (getDatabaseProvider() === 'supabase') {
      const supabase = getSupabase()
      const { data, error } = await supabase.from('lancamentos').select('valor,fornecedor_id')
        .eq('empresa_id', p.empresa_id).eq('tipo', 'despesa').neq('status', 'cancelado')
        .not('fornecedor_id', 'is', null).gte('data', p.inicio).lte('data', p.fim)
      if (error) throw new Error(error.message)
      const fornecedorIds = [...new Set((data ?? []).map(l => l.fornecedor_id).filter((x): x is number => x !== null))]
      let fornecedoresRows: any[] = []
      if (fornecedorIds.length) {
        const r = await supabase.from('fornecedores').select('id,nome,cnpj,cpf').in('id', fornecedorIds)
        if (r.error) throw new Error(r.error.message)
        fornecedoresRows = r.data ?? []
      }
      const porId = new Map(fornecedoresRows.map(f => [f.id, f]))
      const grupos = new Map<number, { fornecedor_nome: string; documento: string | null; total: number; quantidade: number }>()
      for (const l of data ?? []) {
        const fid = l.fornecedor_id as number
        const f = porId.get(fid)
        const g = grupos.get(fid) ?? { fornecedor_nome: f?.nome ?? 'Fornecedor removido', documento: f?.cnpj ?? f?.cpf ?? null, total: 0, quantidade: 0 }
        g.total += Number(l.valor); g.quantidade += 1
        grupos.set(fid, g)
      }
      return [...grupos.values()].sort((a, b) => b.total - a.total)
    }
    return db.prepare(`
      SELECT f.nome AS fornecedor_nome, COALESCE(f.cnpj, f.cpf) AS documento, SUM(l.valor) AS total, COUNT(*) AS quantidade
      FROM lancamentos l
      JOIN fornecedores f ON f.id = l.fornecedor_id
      WHERE l.empresa_id = @empresa_id AND l.tipo = 'despesa' AND l.status <> 'cancelado'
        AND l.fornecedor_id IS NOT NULL AND l.data BETWEEN @inicio AND @fim
      GROUP BY l.fornecedor_id
      ORDER BY total DESC
    `).all(p)
  })

  ipcMain.handle('relatorios:porColaborador', async (_e, p: PeriodoParams) => {
    if (getDatabaseProvider() === 'supabase') {
      const supabase = getSupabase()
      const { data: aps, error } = await supabase.from('autorizacoes_pagamento')
        .select('id,beneficiario_id,beneficiario_nome,valor,data_emissao')
        .eq('empresa_id', p.empresa_id).eq('beneficiario_tipo', 'colaborador')
        .gte('data_emissao', p.inicio).lte('data_emissao', p.fim)
      if (error) throw new Error(error.message)
      const apIds = (aps ?? []).map(a => a.id)
      let boletosRows: any[] = []
      if (apIds.length) {
        const r = await supabase.from('autorizacoes_pagamento_boletos').select('ap_id,valor').in('ap_id', apIds)
        if (r.error) throw new Error(r.error.message)
        boletosRows = r.data ?? []
      }
      const grupos = new Map<number, { colaborador_nome: string; total: number; quantidade: number }>()
      for (const a of aps ?? []) {
        const boletosDaAp = boletosRows.filter(b => b.ap_id === a.id)
        const valorAp = boletosDaAp.length ? boletosDaAp.reduce((s, b) => s + Number(b.valor), 0) : Number(a.valor)
        const cid = a.beneficiario_id as number
        const g = grupos.get(cid) ?? { colaborador_nome: a.beneficiario_nome, total: 0, quantidade: 0 }
        g.total += valorAp; g.quantidade += 1
        grupos.set(cid, g)
      }
      return [...grupos.values()].sort((a, b) => b.total - a.total)
    }
    const aps = db.prepare(`
      SELECT id, beneficiario_id, beneficiario_nome, valor
      FROM autorizacoes_pagamento
      WHERE empresa_id = @empresa_id AND beneficiario_tipo = 'colaborador'
        AND data_emissao BETWEEN @inicio AND @fim
    `).all(p) as { id: number; beneficiario_id: number; beneficiario_nome: string; valor: number }[]
    const grupos = new Map<number, { colaborador_nome: string; total: number; quantidade: number }>()
    for (const a of aps) {
      const boletos = db.prepare(`SELECT valor FROM autorizacoes_pagamento_boletos WHERE ap_id = ?`).all(a.id) as { valor: number }[]
      const valorAp = boletos.length ? boletos.reduce((s, b) => s + Number(b.valor), 0) : Number(a.valor)
      const g = grupos.get(a.beneficiario_id) ?? { colaborador_nome: a.beneficiario_nome, total: 0, quantidade: 0 }
      g.total += valorAp; g.quantidade += 1
      grupos.set(a.beneficiario_id, g)
    }
    return [...grupos.values()].sort((a, b) => b.total - a.total)
  })

  ipcMain.handle('relatorios:consolidado', async (_e, p: PeriodoParams) => {
    const CAMPOS_SOMA = ['h_premio', 'producao', 'vale_transporte', 'insalubridade', 'periculosidade', 'adc_noturno', 'he_50', 'he_80', 'he_100', 'he_110', 'outros_eventos'] as const
    if (getDatabaseProvider() === 'supabase') {
      const supabase = getSupabase()
      const [apRows, apBoletos, nfRows, nfBoletos, folhas] = await Promise.all([
        supabase.from('autorizacoes_pagamento').select('id,valor').eq('empresa_id', p.empresa_id).gte('data_emissao', p.inicio).lte('data_emissao', p.fim),
        supabase.from('autorizacoes_pagamento_boletos').select('ap_id,valor'),
        supabase.from('notas_fiscais').select('id').eq('empresa_id', p.empresa_id).gte('data', p.inicio).lte('data', p.fim),
        supabase.from('notas_fiscais_boletos').select('nota_id,valor'),
        supabase.from('folhas_pagamento').select('id,mes_competencia').eq('empresa_id', p.empresa_id).gte('mes_competencia', p.inicio.slice(0, 7) + '-01').lte('mes_competencia', p.fim.slice(0, 7) + '-01'),
      ])
      for (const r of [apRows, apBoletos, nfRows, nfBoletos, folhas]) if (r.error) throw new Error(r.error.message)
      const apIds = new Set((apRows.data ?? []).map(a => a.id))
      const boletosDeApsNoPeriodo = (apBoletos.data ?? []).filter(b => apIds.has(b.ap_id))
      const totalAP = (apRows.data ?? []).reduce((soma, a) => {
        const boletosDaAp = boletosDeApsNoPeriodo.filter(b => b.ap_id === a.id)
        return soma + (boletosDaAp.length ? boletosDaAp.reduce((s, b) => s + Number(b.valor), 0) : Number(a.valor))
      }, 0)
      const nfIds = new Set((nfRows.data ?? []).map(n => n.id))
      const totalNF = (nfBoletos.data ?? []).filter(b => nfIds.has(b.nota_id)).reduce((s, b) => s + Number(b.valor), 0)
      const folhaIds = (folhas.data ?? []).map(f => f.id)
      let totalFolha = 0
      if (folhaIds.length) {
        const { data: itens, error } = await supabase.from('folhas_pagamento_itens').select('*').in('folha_id', folhaIds)
        if (error) throw new Error(error.message)
        const colaboradorIds = [...new Set((itens ?? []).map((i: any) => i.colaborador_id).filter(Boolean))]
        let salariosPorColaborador = new Map<number, number>()
        if (colaboradorIds.length) {
          const { data: colabs, error: e2 } = await supabase.from('colaboradores').select('id,salario_base').in('id', colaboradorIds)
          if (e2) throw new Error(e2.message)
          salariosPorColaborador = new Map((colabs ?? []).map(c => [c.id, Number(c.salario_base) || 0]))
        }
        totalFolha = (itens ?? []).reduce((soma, item: any) => {
          const salario = salariosPorColaborador.get(item.colaborador_id) ?? 0
          const adicionais = CAMPOS_SOMA.reduce((s, c) => s + (Number(item[c]) || 0), 0)
          const descontos = (Number(item.atrasos) || 0) + (Number(item.faltas) || 0)
          return soma + salario + adicionais - descontos
        }, 0)
      }
      return { totalAP, quantidadeAP: (apRows.data ?? []).length, totalNF, quantidadeNF: (nfRows.data ?? []).length, totalFolha, quantidadeFolha: folhaIds.length, totalGeral: totalAP + totalNF + totalFolha }
    }
    const aps = db.prepare(`SELECT id, valor FROM autorizacoes_pagamento WHERE empresa_id = @empresa_id AND data_emissao BETWEEN @inicio AND @fim`).all(p) as { id: number; valor: number }[]
    const totalAP = aps.reduce((soma, a) => {
      const boletos = db.prepare(`SELECT valor FROM autorizacoes_pagamento_boletos WHERE ap_id = ?`).all(a.id) as { valor: number }[]
      return soma + (boletos.length ? boletos.reduce((s, b) => s + Number(b.valor), 0) : Number(a.valor))
    }, 0)
    const nfs = db.prepare(`SELECT id FROM notas_fiscais WHERE empresa_id = @empresa_id AND data BETWEEN @inicio AND @fim`).all(p) as { id: number }[]
    const totalNF = nfs.reduce((soma, n) => {
      const boletos = db.prepare(`SELECT valor FROM notas_fiscais_boletos WHERE nota_id = ?`).all(n.id) as { valor: number }[]
      return soma + boletos.reduce((s, b) => s + Number(b.valor), 0)
    }, 0)
    const mesInicio = p.inicio.slice(0, 7) + '-01', mesFim = p.fim.slice(0, 7) + '-01'
    const folhas = db.prepare(`SELECT id FROM folhas_pagamento WHERE empresa_id = @empresa_id AND mes_competencia BETWEEN @mesInicio AND @mesFim`).all({ empresa_id: p.empresa_id, mesInicio, mesFim }) as { id: number }[]
    const totalFolha = folhas.reduce((soma, f) => {
      const itens = db.prepare(`SELECT * FROM folhas_pagamento_itens WHERE folha_id = ?`).all(f.id) as any[]
      return soma + itens.reduce((s, item) => {
        const colab = item.colaborador_id ? (db.prepare(`SELECT salario_base FROM colaboradores WHERE id = ?`).get(item.colaborador_id) as { salario_base: number } | undefined) : undefined
        const salario = Number(colab?.salario_base) || 0
        const adicionais = CAMPOS_SOMA.reduce((s2, c) => s2 + (Number(item[c]) || 0), 0)
        const descontos = (Number(item.atrasos) || 0) + (Number(item.faltas) || 0)
        return s + salario + adicionais - descontos
      }, 0)
    }, 0)
    return { totalAP, quantidadeAP: aps.length, totalNF, quantidadeNF: nfs.length, totalFolha, quantidadeFolha: folhas.length, totalGeral: totalAP + totalNF + totalFolha }
  })
}
