// RECONSTRUÍDO: este arquivo é referenciado (import) em outros pontos da
// conversa original (ipc/index.ts, preload/index.ts), mas seu código nunca
// foi enviado em nenhuma das PARTEs. Implementação abaixo inferida a partir
// do esquema de banco (migrations.ts) e do padrão dos demais handlers
// (contas.ipc.ts, categorias.ipc.ts) para manter o projeto compilável.
import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { getDatabaseProvider, getSupabase } from '../supabase/client'

interface Params {
  empresa_id: number
  mes?:       number
  ano?:       number
}

export function registerDashboardIpc() {
  const db = getDb()

  // ── Resumo (totais do período) ─────────────────────────
  // CORRIGIDO: "Despesas do mês" agora soma pela data de EMISSÃO
  // (coluna "data") das despesas ainda pendentes + já pagas (não só
  // as pagas) — antes usava o vencimento e só contava as pagas, o que
  // fazia APs e Notas Fiscais recém-lançadas (nascem "pendente") não
  // aparecerem no mês certo. Receitas continuam pelo vencimento e só
  // as recebidas, sem alteração.
  ipcMain.handle('dashboard:resumo', async (_e, p: Params) => {
    if(getDatabaseProvider()==='supabase') { const {data,error}=await getSupabase().from('lancamentos').select('tipo,status,valor,data,data_venc').eq('empresa_id',p.empresa_id); if(error)throw new Error(error.message); const noPeriodo=(valor:string|null)=>!p.mes&&!p.ano||!!valor&&(!p.mes||Number(valor.slice(5,7))===p.mes)&&(!p.ano||Number(valor.slice(0,4))===p.ano); let receitas=0,despesas=0,pendentes=0; for(const l of data??[]) { const valor=Number(l.valor); if(l.tipo==='receita'&&l.status==='pago'&&noPeriodo(l.data_venc))receitas+=valor; if(l.tipo==='despesa'&&l.status!=='cancelado'&&noPeriodo(l.data))despesas+=valor; if(l.status==='pendente'&&noPeriodo(l.data_venc))pendentes+=valor } return {receitas,despesas,pendentes,saldo:receitas-despesas} }
    const row = db.prepare(`
      SELECT
        COALESCE(SUM(CASE
          WHEN tipo = 'receita' AND status = 'pago'
           AND (@mes IS NULL OR strftime('%m', data_venc) = printf('%02d', @mes))
           AND (@ano IS NULL OR strftime('%Y', data_venc) = printf('%04d', @ano))
          THEN valor END), 0) AS receitas,
        COALESCE(SUM(CASE
          WHEN tipo = 'despesa' AND status != 'cancelado'
           AND (@mes IS NULL OR strftime('%m', data) = printf('%02d', @mes))
           AND (@ano IS NULL OR strftime('%Y', data) = printf('%04d', @ano))
          THEN valor END), 0) AS despesas,
        COALESCE(SUM(CASE
          WHEN status = 'pendente'
           AND (@mes IS NULL OR strftime('%m', data_venc) = printf('%02d', @mes))
           AND (@ano IS NULL OR strftime('%Y', data_venc) = printf('%04d', @ano))
          THEN valor END), 0) AS pendentes
      FROM lancamentos
      WHERE empresa_id = @empresa_id
    `).get(p) as { receitas: number; despesas: number; pendentes: number }

    return { ...row, saldo: row.receitas - row.despesas }
  })

  // ── Gráfico mensal (últimos 6 meses) ───────────────────
  // Mesma lógica do resumo: despesas por data de emissão (pendentes +
  // pagas), receitas por vencimento (só recebidas).
  ipcMain.handle('dashboard:graficomensal', async (_e, p: { empresa_id: number }) => {
    if(getDatabaseProvider()==='supabase') { const {data,error}=await getSupabase().from('lancamentos').select('tipo,status,valor,data,data_venc').eq('empresa_id',p.empresa_id); if(error)throw new Error(error.message); const inicio=new Date(); inicio.setMonth(inicio.getMonth()-6); const limite=inicio.toISOString().slice(0,10); const grupos=new Map<string,{receitas:number;despesas:number}>(); for(const l of data??[]) { const dataRef=l.tipo==='receita'?l.data_venc:l.data; if(!dataRef||dataRef<limite)continue; if(l.tipo==='receita'&&l.status!=='pago')continue; if(l.tipo==='despesa'&&l.status==='cancelado')continue; const mes=dataRef.slice(0,7); const g=grupos.get(mes)??{receitas:0,despesas:0}; l.tipo==='receita'?g.receitas+=Number(l.valor):g.despesas+=Number(l.valor); grupos.set(mes,g) } return [...grupos].sort(([a],[b])=>a.localeCompare(b)).map(([mes,g])=>({mes,...g})) }
    return db.prepare(`
      WITH meses AS (
        SELECT DISTINCT strftime('%Y-%m', data) AS mes
        FROM lancamentos
        WHERE empresa_id = @empresa_id AND tipo = 'despesa' AND status != 'cancelado'
          AND data >= date('now', '-6 months')
        UNION
        SELECT DISTINCT strftime('%Y-%m', data_venc) AS mes
        FROM lancamentos
        WHERE empresa_id = @empresa_id AND tipo = 'receita' AND status = 'pago'
          AND data_venc >= date('now', '-6 months')
      )
      SELECT
        m.mes,
        COALESCE((
          SELECT SUM(valor) FROM lancamentos
          WHERE empresa_id = @empresa_id AND tipo = 'receita' AND status = 'pago'
            AND strftime('%Y-%m', data_venc) = m.mes
        ), 0) AS receitas,
        COALESCE((
          SELECT SUM(valor) FROM lancamentos
          WHERE empresa_id = @empresa_id AND tipo = 'despesa' AND status != 'cancelado'
            AND strftime('%Y-%m', data) = m.mes
        ), 0) AS despesas
      FROM meses m
      ORDER BY m.mes ASC
    `).all({ empresa_id: p.empresa_id })
  })

  // ── Últimos lançamentos ─────────────────────────────────
  // ALTERADO: agora devolve também "situacao" já calculada (a_vencer /
  // vencido / pago / cancelado) — pendente com vencimento passado
  // vira "vencido" automaticamente, sem precisar de outro campo no
  // banco.
  ipcMain.handle('dashboard:ultimoslanc', async (_e, p: { empresa_id: number; limite?: number }) => {
    if(getDatabaseProvider()==='supabase') { const supabase=getSupabase(); const [{data:lancamentos,error:lancamentosError},{data:categorias,error:categoriasError},{data:contas,error:contasError}]=await Promise.all([supabase.from('lancamentos').select('*').eq('empresa_id',p.empresa_id).order('created_at',{ascending:false}).limit(p.limite??5),supabase.from('categorias').select('id,nome').eq('empresa_id',p.empresa_id),supabase.from('contas').select('id,nome').eq('empresa_id',p.empresa_id)]); if(lancamentosError)throw new Error(lancamentosError.message);if(categoriasError)throw new Error(categoriasError.message);if(contasError)throw new Error(contasError.message);const categoriasPorId=new Map((categorias??[]).map(c=>[c.id,c.nome]));const contasPorId=new Map((contas??[]).map(c=>[c.id,c.nome]));const hoje=new Date().toISOString().slice(0,10);return (lancamentos??[]).map(l=>({...l,categoria:categoriasPorId.get(l.categoria_id)??null,conta:contasPorId.get(l.conta_id)??null,situacao:l.status==='pago'?'pago':l.status==='cancelado'?'cancelado':l.status==='pendente'&&l.data_venc<hoje?'vencido':'a_vencer'})) }
    return db.prepare(`
      SELECT l.*, c.nome AS categoria, ct.nome AS conta,
        CASE
          WHEN l.status = 'pago' THEN 'pago'
          WHEN l.status = 'cancelado' THEN 'cancelado'
          WHEN l.status = 'pendente' AND date(l.data_venc) < date('now') THEN 'vencido'
          ELSE 'a_vencer'
        END AS situacao
      FROM lancamentos l
      LEFT JOIN categorias c ON c.id = l.categoria_id
      LEFT JOIN contas     ct ON ct.id = l.conta_id
      WHERE l.empresa_id = ?
      ORDER BY l.created_at DESC
      LIMIT ?
    `).all(p.empresa_id, p.limite ?? 5)
  })

  // ── Top categorias por gasto ────────────────────────────
  ipcMain.handle('dashboard:topCategorias', async (_e, p: { empresa_id: number }) => {
    if(getDatabaseProvider()==='supabase') { const supabase=getSupabase(); const [{data:lancamentos,error:lancamentosError},{data:categorias,error:categoriasError}]=await Promise.all([supabase.from('lancamentos').select('categoria_id,valor').eq('empresa_id',p.empresa_id).eq('tipo','despesa').eq('status','pago'),supabase.from('categorias').select('id,nome,cor').eq('empresa_id',p.empresa_id)]);if(lancamentosError)throw new Error(lancamentosError.message);if(categoriasError)throw new Error(categoriasError.message);const porId=new Map((categorias??[]).map(c=>[c.id,c]));const grupos=new Map<number,{nome:string;cor:string;total:number}>();for(const l of lancamentos??[]){if(l.categoria_id===null)continue;const c=porId.get(l.categoria_id);if(!c)continue;const g=grupos.get(l.categoria_id)??{nome:c.nome,cor:c.cor,total:0};g.total+=Number(l.valor);grupos.set(l.categoria_id,g)}return [...grupos.values()].sort((a,b)=>b.total-a.total).slice(0,5) }
    return db.prepare(`
      SELECT c.nome, c.cor, SUM(l.valor) AS total
      FROM lancamentos l
      JOIN categorias c ON c.id = l.categoria_id
      WHERE l.empresa_id = ? AND l.tipo = 'despesa' AND l.status = 'pago'
      GROUP BY c.id
      ORDER BY total DESC
      LIMIT 5
    `).all(p.empresa_id)
  })
}
