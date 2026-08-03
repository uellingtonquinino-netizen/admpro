import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { getDatabaseProvider, getSupabase } from '../supabase/client'

interface PainelInicioPayload {
  empresa_ids: number[]
  dataInicio:  string
  dataFim:     string
}

export function registerSupervisorPainelIpc() {
  const db = getDb()

  // ── Painel inicial do Supervisor — dados reais agregados de
  // todas as obras sob a gestão dele. A primeira caixa (obras,
  // colaboradores, idade média) é sempre "agora" — não passa por
  // filtro de período. Admissões/desligamentos e o financeiro
  // (autorizações + notas fiscais) respeitam o período recebido.
  ipcMain.handle('supervisor:painelInicio', async (_e, p: PainelInicioPayload) => {
    if (p.empresa_ids.length === 0) {
      return {
        obras: [], totalColaboradores: 0, idadeMedia: null,
        admissoes: 0, desligamentos: 0, totalAutorizacoes: 0, totalNotasFiscais: 0,
      }
    }
    if(getDatabaseProvider()==='supabase') { const s=getSupabase();const [{data:obras,error:e1},{data:colaboradores,error:e2},{data:aps,error:e3},{data:nfs,error:e4},{data:boletos,error:e5}]=await Promise.all([s.from('empresas').select('id,nome,titulo_obra,estado').in('id',p.empresa_ids).order('nome'),s.from('colaboradores').select('status,nascimento,data_admissao,data_demissao').in('empresa_id',p.empresa_ids),s.from('autorizacoes_pagamento').select('id,valor,created_at').in('empresa_id',p.empresa_ids),s.from('notas_fiscais').select('id,data').in('empresa_id',p.empresa_ids),s.from('notas_fiscais_boletos').select('nota_id,valor')]);for(const e of [e1,e2,e3,e4,e5])if(e)throw new Error(e.message);const periodo=(d:string|null)=>!!d&&d.slice(0,10)>=p.dataInicio&&d.slice(0,10)<=p.dataFim;const ativos=(colaboradores??[]).filter(c=>c.status==='ativo');const idades=ativos.filter(c=>c.nascimento).map(c=>(Date.now()-new Date(`${c.nascimento}T00:00:00`).getTime())/31557600000);const nfIds=new Set((nfs??[]).filter(n=>periodo(n.data)).map(n=>n.id));return {obras:obras??[],totalColaboradores:ativos.length,idadeMedia:idades.length?Math.round(idades.reduce((a,b)=>a+b,0)/idades.length):null,admissoes:(colaboradores??[]).filter(c=>periodo(c.data_admissao)).length,desligamentos:(colaboradores??[]).filter(c=>periodo(c.data_demissao)).length,totalAutorizacoes:(aps??[]).filter(a=>periodo(a.created_at)).reduce((x,a)=>x+Number(a.valor),0),totalNotasFiscais:(boletos??[]).filter(b=>nfIds.has(b.nota_id)).reduce((x,b)=>x+Number(b.valor),0)} }

    const placeholders = p.empresa_ids.map(() => '?').join(',')

    // Obras do supervisor, com o estado — pra montar a lista por UF
    const obras = db.prepare(`
      SELECT id, nome, titulo_obra, estado FROM empresas WHERE id IN (${placeholders}) ORDER BY nome COLLATE NOCASE ASC
    `).all(...p.empresa_ids) as { id: number; nome: string; titulo_obra: string | null; estado: string | null }[]

    // Caixa 1 — sempre "agora", não passa pelo filtro de período
    const totalColaboradores = (db.prepare(`
      SELECT COUNT(*) AS n FROM colaboradores WHERE empresa_id IN (${placeholders}) AND status = 'ativo'
    `).get(...p.empresa_ids) as { n: number }).n

    const idadeMediaRaw = (db.prepare(`
      SELECT AVG((julianday('now') - julianday(nascimento)) / 365.25) AS media
      FROM colaboradores WHERE empresa_id IN (${placeholders}) AND status = 'ativo' AND nascimento IS NOT NULL
    `).get(...p.empresa_ids) as { media: number | null }).media
    const idadeMedia = idadeMediaRaw ? Math.round(idadeMediaRaw) : null

    // Caixa 2 — admissões/desligamentos dentro do período escolhido
    const admissoes = (db.prepare(`
      SELECT COUNT(*) AS n FROM colaboradores
      WHERE empresa_id IN (${placeholders}) AND date(data_admissao) BETWEEN date(?) AND date(?)
    `).get(...p.empresa_ids, p.dataInicio, p.dataFim) as { n: number }).n

    const desligamentos = (db.prepare(`
      SELECT COUNT(*) AS n FROM colaboradores
      WHERE empresa_id IN (${placeholders}) AND data_demissao IS NOT NULL
        AND date(data_demissao) BETWEEN date(?) AND date(?)
    `).get(...p.empresa_ids, p.dataInicio, p.dataFim) as { n: number }).n

    // Caixa 3 — total de AP's e Notas Fiscais emitidas no período
    const totalAutorizacoes = (db.prepare(`
      SELECT COALESCE(SUM(valor), 0) AS total FROM autorizacoes_pagamento
      WHERE empresa_id IN (${placeholders}) AND date(created_at) BETWEEN date(?) AND date(?)
    `).get(...p.empresa_ids, p.dataInicio, p.dataFim) as { total: number }).total

    const totalNotasFiscais = (db.prepare(`
      SELECT COALESCE(SUM(b.valor), 0) AS total
      FROM notas_fiscais n JOIN notas_fiscais_boletos b ON b.nota_id = n.id
      WHERE n.empresa_id IN (${placeholders}) AND date(n.data) BETWEEN date(?) AND date(?)
    `).get(...p.empresa_ids, p.dataInicio, p.dataFim) as { total: number }).total

    return {
      obras, totalColaboradores, idadeMedia,
      admissoes, desligamentos, totalAutorizacoes, totalNotasFiscais,
    }
  })

  // ── Gráficos ao expandir um estado — admissões/desligamentos e
  // despesas mês a mês (últimos N meses), e colaboradores por status
  // (retrato de agora). `empresa_ids` aqui são só as obras daquele
  // estado específico, não a gestão inteira do supervisor.
  ipcMain.handle('supervisor:graficosObras', async (_e, p: { empresa_ids: number[]; meses: number }) => {
    if (p.empresa_ids.length === 0) {
      return { admissoesDesligamentos: [], despesasMensais: [], colaboradores: { ativos: 0, ferias: 0, afastados: 0, desligados: 0, total: 0 } }
    }
    if(getDatabaseProvider()==='supabase') { const s=getSupabase();const [{data:colaboradores,error:e1},{data:aps,error:e2},{data:nfs,error:e3},{data:boletos,error:e4}]=await Promise.all([s.from('colaboradores').select('status,data_admissao,data_demissao').in('empresa_id',p.empresa_ids),s.from('autorizacoes_pagamento').select('id,valor,created_at').in('empresa_id',p.empresa_ids),s.from('notas_fiscais').select('id,data').in('empresa_id',p.empresa_ids),s.from('notas_fiscais_boletos').select('nota_id,valor')]);for(const e of [e1,e2,e3,e4])if(e)throw new Error(e.message);const mesesLista:string[]=[];const hoje=new Date();hoje.setDate(1);for(let i=p.meses-1;i>=0;i--){const d=new Date(hoje.getFullYear(),hoje.getMonth()-i,1);mesesLista.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)}const add=(map:Map<string,number>,d:string|null,v=1)=>{if(d&&mesesLista.includes(d.slice(0,7)))map.set(d.slice(0,7),(map.get(d.slice(0,7))??0)+v)};const adm=new Map<string,number>(),desl=new Map<string,number>(),gastos=new Map<string,number>();for(const c of colaboradores??[]){add(adm,c.data_admissao);add(desl,c.data_demissao)}for(const a of aps??[])add(gastos,a.created_at,Number(a.valor));const nfPorId=new Map((nfs??[]).map(n=>[n.id,n.data]));for(const b of boletos??[])add(gastos,nfPorId.get(b.nota_id)??null,Number(b.valor));const status=new Map<string,number>();for(const c of colaboradores??[])status.set(c.status,(status.get(c.status)??0)+1);const ativos=status.get('ativo')??0,ferias=status.get('ferias')??0,afastados=status.get('afastado')??0,desligados=status.get('desligado')??0;return {admissoesDesligamentos:mesesLista.map(m=>({mes:m,admissoes:adm.get(m)??0,desligamentos:desl.get(m)??0})),despesasMensais:mesesLista.map(m=>({mes:m,total:gastos.get(m)??0})),colaboradores:{ativos,ferias,afastados,desligados,total:ativos+ferias+afastados+desligados}} }
    const placeholders = p.empresa_ids.map(() => '?').join(',')

    // Últimos N meses, do mais antigo pro mais recente, mesmo os sem
    // nenhum lançamento (pra não sumir do eixo do gráfico).
    const mesesLista: string[] = []
    const cursor = new Date()
    cursor.setDate(1)
    for (let i = p.meses - 1; i >= 0; i--) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1)
      mesesLista.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    const mesMaisAntigo = `${mesesLista[0]}-01`

    const admissoesPorMes = db.prepare(`
      SELECT strftime('%Y-%m', data_admissao) AS mes, COUNT(*) AS n FROM colaboradores
      WHERE empresa_id IN (${placeholders}) AND data_admissao IS NOT NULL AND date(data_admissao) >= date(?)
      GROUP BY mes
    `).all(...p.empresa_ids, mesMaisAntigo) as { mes: string; n: number }[]

    const desligamentosPorMes = db.prepare(`
      SELECT strftime('%Y-%m', data_demissao) AS mes, COUNT(*) AS n FROM colaboradores
      WHERE empresa_id IN (${placeholders}) AND data_demissao IS NOT NULL AND date(data_demissao) >= date(?)
      GROUP BY mes
    `).all(...p.empresa_ids, mesMaisAntigo) as { mes: string; n: number }[]

    const mapaAdmissoes = new Map(admissoesPorMes.map(r => [r.mes, r.n]))
    const mapaDesligamentos = new Map(desligamentosPorMes.map(r => [r.mes, r.n]))
    const admissoesDesligamentos = mesesLista.map(mes => ({
      mes, admissoes: mapaAdmissoes.get(mes) ?? 0, desligamentos: mapaDesligamentos.get(mes) ?? 0,
    }))

    const apPorMes = db.prepare(`
      SELECT strftime('%Y-%m', created_at) AS mes, COALESCE(SUM(valor), 0) AS total FROM autorizacoes_pagamento
      WHERE empresa_id IN (${placeholders}) AND date(created_at) >= date(?)
      GROUP BY mes
    `).all(...p.empresa_ids, mesMaisAntigo) as { mes: string; total: number }[]

    const nfPorMes = db.prepare(`
      SELECT strftime('%Y-%m', n.data) AS mes, COALESCE(SUM(b.valor), 0) AS total
      FROM notas_fiscais n JOIN notas_fiscais_boletos b ON b.nota_id = n.id
      WHERE n.empresa_id IN (${placeholders}) AND date(n.data) >= date(?)
      GROUP BY mes
    `).all(...p.empresa_ids, mesMaisAntigo) as { mes: string; total: number }[]

    const mapaAp = new Map(apPorMes.map(r => [r.mes, r.total]))
    const mapaNf = new Map(nfPorMes.map(r => [r.mes, r.total]))
    const despesasMensais = mesesLista.map(mes => ({
      mes, total: (mapaAp.get(mes) ?? 0) + (mapaNf.get(mes) ?? 0),
    }))

    // Colaboradores por status — retrato de agora, não passa por período
    const porStatus = db.prepare(`
      SELECT status, COUNT(*) AS n FROM colaboradores WHERE empresa_id IN (${placeholders}) GROUP BY status
    `).all(...p.empresa_ids) as { status: string; n: number }[]
    const mapaStatus = new Map(porStatus.map(r => [r.status, r.n]))
    const ativos    = mapaStatus.get('ativo') ?? 0
    const ferias    = mapaStatus.get('ferias') ?? 0
    const afastados = mapaStatus.get('afastado') ?? 0
    const desligados = mapaStatus.get('desligado') ?? 0

    return {
      admissoesDesligamentos, despesasMensais,
      colaboradores: { ativos, ferias, afastados, desligados, total: ativos + ferias + afastados + desligados },
    }
  })

  // ── NOVO: o gráfico de Colaboradores agora tem um filtro de
  // verdade — Status, Setor ou Função — cada um agrupando e contando
  // os colaboradores dessa forma. Retrato de agora, sem filtro de
  // período (igual o resto da 1ª caixa).
  ipcMain.handle('supervisor:colaboradoresPorDimensao', async (_e, p: { empresa_ids: number[]; dimensao: 'status' | 'setor' | 'funcao' }) => {
    if (p.empresa_ids.length === 0) return { itens: [], total: 0 }
    if(getDatabaseProvider()==='supabase') { const coluna=p.dimensao;const {data,error}=await getSupabase().from('colaboradores').select(coluna).in('empresa_id',p.empresa_ids);if(error)throw new Error(error.message);const grupos=new Map<string,number>();for(const c of data??[]){const chave=String((c as Record<string,unknown>)[coluna]??'').trim()||'Não informado';grupos.set(chave,(grupos.get(chave)??0)+1)}const itens=[...grupos].map(([chave,total])=>({chave,total})).sort((a,b)=>b.total-a.total);return {itens,total:itens.reduce((x,i)=>x+i.total,0)} }
    const placeholders = p.empresa_ids.map(() => '?').join(',')
    const coluna = p.dimensao === 'setor' ? 'setor' : p.dimensao === 'funcao' ? 'funcao' : 'status'

    const linhas = db.prepare(`
      SELECT COALESCE(NULLIF(TRIM(${coluna}), ''), 'Não informado') AS chave, COUNT(*) AS total
      FROM colaboradores WHERE empresa_id IN (${placeholders})
      GROUP BY chave ORDER BY total DESC
    `).all(...p.empresa_ids) as { chave: string; total: number }[]

    const total = linhas.reduce((soma, l) => soma + l.total, 0)
    return { itens: linhas, total }
  })

  // ── Notificações por obra — pro selo na caixa de cada obra na
  // grade do estado. Conta o que precisa de atenção do Supervisor:
  // AP's/Notas pendentes da aprovação dele, e admissões/desligamentos
  // recentes (últimos 7 dias) — um número só, resumindo tudo.
  ipcMain.handle('supervisor:notificacoesObras', async (_e, empresa_ids: number[]) => {
    if (empresa_ids.length === 0) return []
    if(getDatabaseProvider()==='supabase') { const s=getSupabase();const [{data:aps,error:e1},{data:nfs,error:e2},{data:colaboradores,error:e3}]=await Promise.all([s.from('autorizacoes_pagamento').select('empresa_id,lote_id,aprovado_supervisor_por').in('empresa_id',empresa_ids),s.from('notas_fiscais').select('empresa_id,lote_id,aprovado_supervisor_por').in('empresa_id',empresa_ids),s.from('colaboradores').select('empresa_id,data_admissao,data_demissao').in('empresa_id',empresa_ids)]);for(const e of [e1,e2,e3])if(e)throw new Error(e.message);const limite=new Date();limite.setDate(limite.getDate()-7);const dataLimite=limite.toISOString().slice(0,10);return empresa_ids.map(empresa_id=>{const aps_pendentes=(aps??[]).filter(a=>a.empresa_id===empresa_id&&a.lote_id!==null&&a.aprovado_supervisor_por===null).length;const nfs_pendentes=(nfs??[]).filter(n=>n.empresa_id===empresa_id&&n.lote_id!==null&&n.aprovado_supervisor_por===null).length;const admissoes_recentes=(colaboradores??[]).filter(c=>c.empresa_id===empresa_id&&!!c.data_admissao&&c.data_admissao>=dataLimite).length;const desligamentos_recentes=(colaboradores??[]).filter(c=>c.empresa_id===empresa_id&&!!c.data_demissao&&c.data_demissao>=dataLimite).length;return {empresa_id,aps_pendentes,nfs_pendentes,admissoes_recentes,desligamentos_recentes,total:aps_pendentes+nfs_pendentes+admissoes_recentes+desligamentos_recentes}}) }

    return empresa_ids.map(empresaId => {
      const apsPendentes = (db.prepare(`
        SELECT COUNT(*) AS n FROM autorizacoes_pagamento
        WHERE empresa_id = ? AND lote_id IS NOT NULL AND aprovado_supervisor_por IS NULL
      `).get(empresaId) as { n: number }).n

      const nfsPendentes = (db.prepare(`
        SELECT COUNT(*) AS n FROM notas_fiscais
        WHERE empresa_id = ? AND lote_id IS NOT NULL AND aprovado_supervisor_por IS NULL
      `).get(empresaId) as { n: number }).n

      const admissoesRecentes = (db.prepare(`
        SELECT COUNT(*) AS n FROM colaboradores
        WHERE empresa_id = ? AND data_admissao IS NOT NULL AND date(data_admissao) >= date('now', '-7 days')
      `).get(empresaId) as { n: number }).n

      const desligamentosRecentes = (db.prepare(`
        SELECT COUNT(*) AS n FROM colaboradores
        WHERE empresa_id = ? AND data_demissao IS NOT NULL AND date(data_demissao) >= date('now', '-7 days')
      `).get(empresaId) as { n: number }).n

      return {
        empresa_id: empresaId,
        aps_pendentes: apsPendentes,
        nfs_pendentes: nfsPendentes,
        admissoes_recentes: admissoesRecentes,
        desligamentos_recentes: desligamentosRecentes,
        total: apsPendentes + nfsPendentes + admissoesRecentes + desligamentosRecentes,
      }
    })
  })
}
