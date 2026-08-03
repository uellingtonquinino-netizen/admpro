import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { getDatabaseProvider, getSupabase } from '../supabase/client'

export function registerRelatoriosRHIpc() {
  const db = getDb()

  // ── 1. Colaboradores ativos (lista completa, sem paginação) ──
  ipcMain.handle('relatoriosRH:colaboradoresAtivos', async (_e, p: {
    empresa_id: number; funcao?: string; setor?: string; equipe?: string
  }) => {
    if(getDatabaseProvider()==='supabase') { let q=getSupabase().from('colaboradores').select('nome,matricula_esocial,funcao,setor,equipe,data_admissao,salario_base,telefone,cidade,estado').eq('empresa_id',p.empresa_id).eq('status','ativo').order('nome'); if(p.funcao)q=q.eq('funcao',p.funcao); if(p.setor)q=q.eq('setor',p.setor); if(p.equipe)q=q.eq('equipe',p.equipe); const {data,error}=await q; if(error)throw new Error(error.message); return data }
    const conds:  string[] = ['empresa_id = @empresa_id', `status = 'ativo'`]
    const params: Record<string, unknown> = { empresa_id: p.empresa_id }
    if (p.funcao) { conds.push('funcao = @funcao'); params.funcao = p.funcao }
    if (p.setor)  { conds.push('setor = @setor');   params.setor  = p.setor }
    if (p.equipe) { conds.push('equipe = @equipe'); params.equipe = p.equipe }

    return db.prepare(`
      SELECT nome, matricula_esocial, funcao, setor, equipe, data_admissao,
             salario_base, telefone, cidade, estado
      FROM colaboradores
      WHERE ${conds.join(' AND ')}
      ORDER BY nome ASC
    `).all(params)
  })

  // ── 1b. Colaboradores por data de admissão (período) ────
  // NOVO: mostra quem foi admitido dentro de um período, independente
  // do status atual (ativo, afastado, desligado etc.) — é sobre
  // quando a pessoa entrou, não se ela continua na empresa.
  ipcMain.handle('relatoriosRH:porAdmissao', async (_e, p: {
    empresa_id: number; dataInicio: string; dataFim: string
  }) => {
    if(getDatabaseProvider()==='supabase') { const {data,error}=await getSupabase().from('colaboradores').select('nome,matricula_esocial,funcao,setor,equipe,data_admissao,status').eq('empresa_id',p.empresa_id).not('data_admissao','is',null).gte('data_admissao',p.dataInicio).lte('data_admissao',p.dataFim).order('data_admissao'); if(error)throw new Error(error.message); return data }
    return db.prepare(`
      SELECT nome, matricula_esocial, funcao, setor, equipe, data_admissao, status
      FROM colaboradores
      WHERE empresa_id = ? AND data_admissao IS NOT NULL AND data_admissao != ''
        AND date(data_admissao) BETWEEN date(?) AND date(?)
      ORDER BY data_admissao ASC
    `).all(p.empresa_id, p.dataInicio, p.dataFim)
  })

  // ── 2. Vencimento de experiência ─────────────────────────
  // ALTERADO: o relatório agora filtra por período (De/Até) — mais
  // direto que "dentro de quantos dias". O modo por "dias" continua
  // existindo só pra notificação do sino (que precisa de uma janela
  // relativa a hoje, não um período fixo escolhido na tela).
  ipcMain.handle('relatoriosRH:vencimentoExperiencia', async (_e, p: {
    empresa_id: number; dias?: number; inicio?: string; fim?: string
  }) => {
    if(getDatabaseProvider()==='supabase') { let q=getSupabase().from('colaboradores').select('id,nome,funcao,setor,data_admissao,dias_experiencia,data_vencimento_experiencia').eq('empresa_id',p.empresa_id).eq('status','ativo').not('data_vencimento_experiencia','is',null); if(p.inicio&&p.fim) q=q.gte('data_vencimento_experiencia',p.inicio).lte('data_vencimento_experiencia',p.fim); else { const limite=new Date(); limite.setDate(limite.getDate()+(p.dias??30)); q=q.lte('data_vencimento_experiencia',limite.toISOString().slice(0,10)) } const {data,error}=await q.order('data_vencimento_experiencia'); if(error)throw new Error(error.message); const hoje=new Date(); hoje.setHours(0,0,0,0); return (data??[]).map(c=>({...c,dias_restantes:Math.floor((new Date(`${c.data_vencimento_experiencia}T00:00:00`).getTime()-hoje.getTime())/86400000)})) }
    if (p.inicio && p.fim) {
      return db.prepare(`
        SELECT id, nome, funcao, setor, data_admissao, dias_experiencia, data_vencimento_experiencia,
               CAST(julianday(data_vencimento_experiencia) - julianday(date('now')) AS INTEGER) AS dias_restantes
        FROM colaboradores
        WHERE empresa_id = ? AND status = 'ativo'
          AND data_vencimento_experiencia IS NOT NULL AND data_vencimento_experiencia != ''
          AND date(data_vencimento_experiencia) BETWEEN date(?) AND date(?)
        ORDER BY data_vencimento_experiencia ASC
      `).all(p.empresa_id, p.inicio, p.fim)
    }

    const dias = p.dias ?? 30
    return db.prepare(`
      SELECT id, nome, funcao, setor, data_admissao, dias_experiencia, data_vencimento_experiencia,
             CAST(julianday(data_vencimento_experiencia) - julianday(date('now')) AS INTEGER) AS dias_restantes
      FROM colaboradores
      WHERE empresa_id = ? AND status = 'ativo'
        AND data_vencimento_experiencia IS NOT NULL AND data_vencimento_experiencia != ''
        AND date(data_vencimento_experiencia) <= date('now', '+' || ? || ' days')
      ORDER BY data_vencimento_experiencia ASC
    `).all(p.empresa_id, dias)
  })

  // ── 3. Alojados ──────────────────────────────────────────
  ipcMain.handle('relatoriosRH:alojados', async (_e, empresa_id: number) => {
    if(getDatabaseProvider()==='supabase') { const {data,error}=await getSupabase().from('colaboradores').select('nome,funcao,setor,equipe,cidade,estado,telefone').eq('empresa_id',empresa_id).eq('status','ativo').eq('alojado',1).order('nome'); if(error)throw new Error(error.message); return data }
    return db.prepare(`
      SELECT nome, funcao, setor, equipe, cidade, estado, telefone
      FROM colaboradores
      WHERE empresa_id = ? AND status = 'ativo' AND alojado = 1
      ORDER BY nome ASC
    `).all(empresa_id)
  })

  // ── 3b. Afastados ────────────────────────────────────────
  // NOVO: colaboradores atualmente afastados (ainda no quadro, mas
  // sem estar trabalhando no momento).
  ipcMain.handle('relatoriosRH:afastados', async (_e, empresa_id: number) => {
    if(getDatabaseProvider()==='supabase') { const {data,error}=await getSupabase().from('colaboradores').select('nome,funcao,setor,equipe,data_admissao').eq('empresa_id',empresa_id).eq('status','afastado').order('nome'); if(error)throw new Error(error.message); return data }
    return db.prepare(`
      SELECT nome, funcao, setor, equipe, data_admissao
      FROM colaboradores
      WHERE empresa_id = ? AND status = 'afastado'
      ORDER BY nome ASC
    `).all(empresa_id)
  })

  // ── 3c. Inativos (desligados) ────────────────────────────
  // NOVO: colaboradores desligados — diferente de afastado, aqui o
  // vínculo já encerrou.
  ipcMain.handle('relatoriosRH:inativos', async (_e, empresa_id: number) => {
    if(getDatabaseProvider()==='supabase') { const {data,error}=await getSupabase().from('colaboradores').select('nome,funcao,setor,data_admissao,data_demissao,tipo_demissao').eq('empresa_id',empresa_id).eq('status','desligado').order('data_demissao',{ascending:false}); if(error)throw new Error(error.message); return data }
    return db.prepare(`
      SELECT nome, funcao, setor, data_admissao, data_demissao, tipo_demissao
      FROM colaboradores
      WHERE empresa_id = ? AND status = 'desligado'
      ORDER BY data_demissao DESC
    `).all(empresa_id)
  })

  // ── 4. Aniversariantes do mês ────────────────────────────
  ipcMain.handle('relatoriosRH:aniversariantes', async (_e, p: {
    empresa_id: number; mes?: number
  }) => {
    const mes = p.mes ?? (new Date().getMonth() + 1)
    const mesStr = String(mes).padStart(2, '0')
    if(getDatabaseProvider()==='supabase') { const {data,error}=await getSupabase().from('colaboradores').select('id,nome,funcao,setor,nascimento').eq('empresa_id',p.empresa_id).eq('status','ativo').not('nascimento','is',null); if(error)throw new Error(error.message); return (data??[]).filter(c=>c.nascimento.slice(5,7)===mesStr).map(c=>({...c,dia:Number(c.nascimento.slice(8,10))})).sort((a,b)=>a.dia-b.dia) }
    return db.prepare(`
      SELECT id, nome, funcao, setor, nascimento,
             CAST(strftime('%d', nascimento) AS INTEGER) AS dia
      FROM colaboradores
      WHERE empresa_id = ? AND status = 'ativo'
        AND nascimento IS NOT NULL AND nascimento != ''
        AND strftime('%m', nascimento) = ?
      ORDER BY dia ASC
    `).all(p.empresa_id, mesStr)
  })

  // ── 5. Admissões e demissões no período ──────────────────
  ipcMain.handle('relatoriosRH:movimentacaoPeriodo', async (_e, p: {
    empresa_id: number; inicio: string; fim: string
  }) => {
    if(getDatabaseProvider()==='supabase') { const supabase=getSupabase(); const [{data:admissoes,error:admissoesError},{data:demissoes,error:demissoesError}]=await Promise.all([supabase.from('colaboradores').select('nome,funcao,setor,data:data_admissao').eq('empresa_id',p.empresa_id).gte('data_admissao',p.inicio).lte('data_admissao',p.fim).order('data_admissao'),supabase.from('colaboradores').select('nome,funcao,setor,data:data_demissao,tipo_demissao').eq('empresa_id',p.empresa_id).not('data_demissao','is',null).gte('data_demissao',p.inicio).lte('data_demissao',p.fim).order('data_demissao')]); if(admissoesError)throw new Error(admissoesError.message); if(demissoesError)throw new Error(demissoesError.message); return {admissoes,demissoes} }
    const admissoes = db.prepare(`
      SELECT nome, funcao, setor, data_admissao AS data
      FROM colaboradores
      WHERE empresa_id = ? AND data_admissao BETWEEN ? AND ?
      ORDER BY data_admissao ASC
    `).all(p.empresa_id, p.inicio, p.fim)

    const demissoes = db.prepare(`
      SELECT nome, funcao, setor, data_demissao AS data, tipo_demissao
      FROM colaboradores
      WHERE empresa_id = ? AND data_demissao IS NOT NULL AND data_demissao != ''
        AND data_demissao BETWEEN ? AND ?
      ORDER BY data_demissao ASC
    `).all(p.empresa_id, p.inicio, p.fim)

    return { admissoes, demissoes }
  })

  // ── 6. Colaboradores por Setor ───────────────────────────
  ipcMain.handle('relatoriosRH:porSetor', async (_e, p: { empresa_id: number; setor?: string }) => {
    if(getDatabaseProvider()==='supabase') { let q=getSupabase().from('colaboradores').select('nome,funcao,setor').eq('empresa_id',p.empresa_id).eq('status','ativo').order('setor').order('nome'); if(p.setor)q=q.eq('setor',p.setor); const {data,error}=await q; if(error)throw new Error(error.message); return data }
    const conds:  string[] = ['empresa_id = @empresa_id', `status = 'ativo'`]
    const params: Record<string, unknown> = { empresa_id: p.empresa_id }
    if (p.setor) { conds.push('setor = @setor'); params.setor = p.setor }

    return db.prepare(`
      SELECT nome, funcao, setor
      FROM colaboradores
      WHERE ${conds.join(' AND ')}
      ORDER BY setor ASC, nome ASC
    `).all(params)
  })

  // ── 7. Contas bancárias ──────────────────────────────────
  // NOVO: filtro opcional por período de admissão — sem período,
  // mostra todos os colaboradores ativos como antes.
  ipcMain.handle('relatoriosRH:contasBancarias', async (_e, p: { empresa_id: number; inicio?: string; fim?: string } | number) => {
    const params = typeof p === 'number' ? { empresa_id: p } : p
    if(getDatabaseProvider()==='supabase') { let q=getSupabase().from('colaboradores').select('nome,cpf,banco,agencia,conta,conta_digito,tipo_conta').eq('empresa_id',params.empresa_id).eq('status','ativo').order('nome'); if(params.inicio&&params.fim)q=q.gte('data_admissao',params.inicio).lte('data_admissao',params.fim); const {data,error}=await q; if(error)throw new Error(error.message); return data }
    const conds: string[] = ['empresa_id = @empresa_id', `status = 'ativo'`]
    if (params.inicio && params.fim) {
      conds.push('data_admissao BETWEEN @inicio AND @fim')
    }
    return db.prepare(`
      SELECT nome, cpf, banco, agencia, conta, conta_digito, tipo_conta
      FROM colaboradores
      WHERE ${conds.join(' AND ')}
      ORDER BY nome ASC
    `).all(params)
  })
}
