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
}
