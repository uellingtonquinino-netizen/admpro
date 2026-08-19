import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { getDatabaseProvider, getSupabase } from '../supabase/client'

// ALTERADO: o painel do Administrador Master não dá acesso às MESMAS
// telas operacionais do ADM (RH, Financeiro, Almoxarifado) — ele tem
// uma visão de GESTÃO: Escritório → Supervisores → Obras, nessa
// ordem (respeitando a hierarquia), com visão geral de cada obra e
// gerenciamento de usuários, sem entrar no operacional do dia a dia.
export function registerMasterIpc() {
  const db = getDb()

  // ── Escritório Central: quem são, quanto aprovaram, último acesso ──
  ipcMain.handle('master:escritorio', async () => {
    if(getDatabaseProvider()==='supabase') { const s=getSupabase();const [{data:centrais,error:e1},{data:aps,error:e2},{data:nfs,error:e3}]=await Promise.all([s.from('usuarios').select('id,nome,email,ativo,last_login_at').eq('perfil','central').order('nome'),s.from('autorizacoes_pagamento').select('aprovado_central_por'),s.from('notas_fiscais').select('aprovado_central_por')]);for(const e of [e1,e2,e3])if(e)throw new Error(e.message);return (centrais??[]).map(c=>({...c,ativo:!!c.ativo,itens_aprovados:(aps??[]).filter(a=>a.aprovado_central_por===c.nome).length+(nfs??[]).filter(n=>n.aprovado_central_por===c.nome).length})) }
    const centrais = db.prepare(`
      SELECT id, nome, email, ativo, last_login_at FROM usuarios WHERE perfil = 'central' ORDER BY nome COLLATE NOCASE ASC
    `).all() as { id: number; nome: string; email: string; ativo: number; last_login_at: string | null }[]

    return centrais.map(c => {
      const ap = (db.prepare(`SELECT COUNT(*) AS n FROM autorizacoes_pagamento WHERE aprovado_central_por = ?`).get(c.nome) as { n: number }).n
      const nf = (db.prepare(`SELECT COUNT(*) AS n FROM notas_fiscais WHERE aprovado_central_por = ?`).get(c.nome) as { n: number }).n
      return { ...c, ativo: !!c.ativo, itens_aprovados: ap + nf }
    })
  })

  // ── Setor Pessoal: quantas solicitações já responderam, último acesso ──
  ipcMain.handle('master:setorPessoal', async () => {
    if(getDatabaseProvider()==='supabase') { const s=getSupabase();const [{data:usuarios,error:e1},{data:solicitacoes,error:e2}]=await Promise.all([s.from('usuarios').select('id,nome,email,ativo,last_login_at').eq('perfil','setor_pessoal').order('nome'),s.from('solicitacoes_pessoal').select('respondido_por')]);for(const e of [e1,e2])if(e)throw new Error(e.message);return (usuarios??[]).map(u=>({...u,ativo:!!u.ativo,solicitacoes_respondidas:(solicitacoes??[]).filter(x=>x.respondido_por===u.nome).length})) }
    const usuarios = db.prepare(`
      SELECT id, nome, email, ativo, last_login_at FROM usuarios WHERE perfil = 'setor_pessoal' ORDER BY nome COLLATE NOCASE ASC
    `).all() as { id: number; nome: string; email: string; ativo: number; last_login_at: string | null }[]

    return usuarios.map(u => {
      const respondidas = (db.prepare(`SELECT COUNT(*) AS n FROM solicitacoes_pessoal WHERE respondido_por = ?`).get(u.nome) as { n: number }).n
      return { ...u, ativo: !!u.ativo, solicitacoes_respondidas: respondidas }
    })
  })

  // ── Supervisores: obras sob gestão, quanto aprovaram, último acesso ──
  ipcMain.handle('master:supervisores', async () => {
    if(getDatabaseProvider()==='supabase') { const s=getSupabase();const [{data:supervisores,error:e1},{data:links,error:e2},{data:obras,error:e3},{data:aps,error:e4},{data:nfs,error:e5}]=await Promise.all([s.from('usuarios').select('id,nome,email,ativo,last_login_at').eq('perfil','supervisor').order('nome'),s.from('supervisor_obras').select('usuario_id,empresa_id'),s.from('empresas').select('id,nome'),s.from('autorizacoes_pagamento').select('aprovado_supervisor_por'),s.from('notas_fiscais').select('aprovado_supervisor_por')]);for(const e of [e1,e2,e3,e4,e5])if(e)throw new Error(e.message);const obraPorId=new Map((obras??[]).map(o=>[o.id,o]));return (supervisores??[]).map(u=>({...u,ativo:!!u.ativo,obras:(links??[]).filter(l=>l.usuario_id===u.id).map(l=>obraPorId.get(l.empresa_id)).filter(Boolean),itens_aprovados:(aps??[]).filter(a=>a.aprovado_supervisor_por===u.nome).length+(nfs??[]).filter(n=>n.aprovado_supervisor_por===u.nome).length})) }
    const supervisores = db.prepare(`
      SELECT id, nome, email, ativo, last_login_at FROM usuarios WHERE perfil = 'supervisor' ORDER BY nome COLLATE NOCASE ASC
    `).all() as { id: number; nome: string; email: string; ativo: number; last_login_at: string | null }[]

    return supervisores.map(s => {
      const obras = db.prepare(`
        SELECT e.id, e.nome FROM supervisor_obras so JOIN empresas e ON e.id = so.empresa_id
        WHERE so.usuario_id = ? ORDER BY e.nome COLLATE NOCASE ASC
      `).all(s.id) as { id: number; nome: string }[]
      const ap = (db.prepare(`SELECT COUNT(*) AS n FROM autorizacoes_pagamento WHERE aprovado_supervisor_por = ?`).get(s.nome) as { n: number }).n
      const nf = (db.prepare(`SELECT COUNT(*) AS n FROM notas_fiscais WHERE aprovado_supervisor_por = ?`).get(s.nome) as { n: number }).n
      return { ...s, ativo: !!s.ativo, obras, itens_aprovados: ap + nf }
    })
  })

  // ── Definir as obras de um supervisor (adicionar/remover) ────
  // Mesmo mecanismo que usuarios:definirObrasSupervisor já usa —
  // exposto aqui também pra ficar direto no painel de gestão.
  ipcMain.handle('master:definirObrasSupervisor', async (_e, p: { usuario_id: number; empresa_ids: number[] }) => {
    if(getDatabaseProvider()==='supabase') {
      const supabase = getSupabase()
      const { error: apagarErro } = await supabase.from('supervisor_obras').delete().eq('usuario_id', p.usuario_id)
      if (apagarErro) throw new Error(apagarErro.message)
      if (p.empresa_ids.length) {
        const { error } = await supabase.from('supervisor_obras').insert(
          p.empresa_ids.map(empresa_id => ({ usuario_id: p.usuario_id, empresa_id }))
        )
        if (error) throw new Error(error.message)
      }
      return { ok: true }
    }
    const definir = db.transaction(() => {
      db.prepare(`DELETE FROM supervisor_obras WHERE usuario_id = ?`).run(p.usuario_id)
      const inserir = db.prepare(`INSERT INTO supervisor_obras (usuario_id, empresa_id) VALUES (?, ?)`)
      for (const empresaId of p.empresa_ids) inserir.run(p.usuario_id, empresaId)
    })
    definir()
    return { ok: true }
  })

  // ── Lista simples de obras, pra tela de gestão de obras ──────
  ipcMain.handle('master:obras', async () => {
    if(getDatabaseProvider()==='supabase') { const {data,error}=await getSupabase().from('empresas').select('id,nome,cnpj,cidade,estado,logo_url').order('nome');if(error)throw new Error(error.message);return data??[] }
    return db.prepare(`
      SELECT id, nome, cnpj, cidade, estado, logo_url FROM empresas ORDER BY nome COLLATE NOCASE ASC
    `).all()
  })

  // ── Visão geral de UMA obra: RH, Financeiro, quem ocupa cada
  // função, e a lista de usuários pra gerenciar ──────────────
  ipcMain.handle('master:obraDetalhe', async (_e, empresa_id: number) => {
    if(getDatabaseProvider()==='supabase') {
      const s=getSupabase()
      const [{data:empresa,error:e1},{data:colaboradores,error:e2},{data:lancamentos,error:e3},{data:usuariosCasa,error:e4},{data:vinculosExtras,error:e4b},{data:links,error:e5}]=await Promise.all([
        s.from('empresas').select('*').eq('id',empresa_id).maybeSingle(),
        s.from('colaboradores').select('status,salario_base').eq('empresa_id',empresa_id),
        s.from('lancamentos').select('valor,data,status,tipo').eq('empresa_id',empresa_id),
        s.from('usuarios').select('id,nome,email,perfil,ativo,last_login_at').eq('empresa_id',empresa_id).in('perfil',['admin','gestor','almoxarife']).order('perfil').order('nome'),
        s.from('usuario_obras').select('usuario_id').eq('empresa_id',empresa_id),
        s.from('supervisor_obras').select('usuario_id').eq('empresa_id',empresa_id),
      ])
      for(const e of [e1,e2,e3,e4,e4b,e5])if(e)throw new Error(e.message)
      if(!empresa)return null
      // CORRIGIDO: só buscava quem tem essa obra como "casa" — quem
      // foi vinculado depois como obra EXTRA (usuario_obras) nunca
      // aparecia aqui, mesmo action tendo acesso de verdade.
      const idsUsuariosExtras=(vinculosExtras??[]).map(v=>v.usuario_id).filter(id=>!(usuariosCasa??[]).some(u=>u.id===id))
      let usuariosExtras:typeof usuariosCasa=[]
      if(idsUsuariosExtras.length){
        const {data,error}=await s.from('usuarios').select('id,nome,email,perfil,ativo,last_login_at').in('id',idsUsuariosExtras).in('perfil',['admin','gestor','almoxarife'])
        if(error)throw new Error(error.message)
        usuariosExtras=data
      }
      const usuarios=[...(usuariosCasa??[]),...usuariosExtras].sort((a,b)=>a.perfil.localeCompare(b.perfil)||a.nome.localeCompare(b.nome,'pt-BR'))
      const ativos=(colaboradores??[]).filter(c=>c.status==='ativo');const inicio=new Date();inicio.setDate(1);const inicioMes=inicio.toISOString().slice(0,10);const gastos_mes=(lancamentos??[]).filter(l=>l.tipo==='despesa'&&l.status!=='cancelado'&&l.data>=inicioMes).reduce((x,l)=>x+Number(l.valor),0);const ids=(links??[]).map(l=>l.usuario_id);let supervisores:unknown[]=[];if(ids.length){const {data,error}=await s.from('usuarios').select('id,nome').in('id',ids);if(error)throw new Error(error.message);supervisores=data??[]}
      return {empresa,colaboradores:ativos.length,custo_folha:ativos.reduce((x,c)=>x+Number(c.salario_base),0),gastos_mes,usuarios:usuarios.map(u=>({...u,ativo:!!u.ativo})),supervisores}
    }
    const empresa = db.prepare(`SELECT * FROM empresas WHERE id = ?`).get(empresa_id)
    if (!empresa) return null

    const colaboradores = (db.prepare(
      `SELECT COUNT(*) AS n FROM colaboradores WHERE empresa_id = ? AND status = 'ativo'`
    ).get(empresa_id) as { n: number }).n

    const custoFolha = (db.prepare(
      `SELECT COALESCE(SUM(salario_base), 0) AS v FROM colaboradores WHERE empresa_id = ? AND status = 'ativo'`
    ).get(empresa_id) as { v: number }).v

    const inicioMes = new Date()
    inicioMes.setDate(1)
    const gastosMes = (db.prepare(`
      SELECT COALESCE(SUM(valor), 0) AS v FROM lancamentos
      WHERE empresa_id = ? AND tipo = 'despesa' AND status != 'cancelado' AND date(data) >= date(?)
    `).get(empresa_id, inicioMes.toISOString().slice(0, 10)) as { v: number }).v

    // CORRIGIDO: mesma correção do lado Supabase — considera também
    // quem foi vinculado depois como obra EXTRA (usuario_obras).
    const usuarios = db.prepare(`
      SELECT DISTINCT u.id, u.nome, u.email, u.perfil, u.ativo, u.last_login_at
      FROM usuarios u
      LEFT JOIN usuario_obras uo ON uo.usuario_id = u.id
      WHERE (u.empresa_id = ? OR uo.empresa_id = ?) AND u.perfil IN ('admin','gestor','almoxarife')
      ORDER BY u.perfil ASC, u.nome COLLATE NOCASE ASC
    `).all(empresa_id, empresa_id) as { id: number; nome: string; email: string; perfil: string; ativo: number; last_login_at: string | null }[]

    const supervisores = db.prepare(`
      SELECT u.id, u.nome FROM supervisor_obras so JOIN usuarios u ON u.id = so.usuario_id
      WHERE so.empresa_id = ?
    `).all(empresa_id)

    return {
      empresa,
      colaboradores,
      custo_folha: custoFolha,
      gastos_mes: gastosMes,
      usuarios: usuarios.map(u => ({ ...u, ativo: !!u.ativo })),
      supervisores,
    }
  })

  // ── Log de exclusões (quem apagou o quê, quando) ──────────
  // NOVO: só funciona de verdade no Supabase (produção) — a tabela
  // auditoria existia no banco mas nunca tinha sido usada; agora as
  // exclusões de AP, Nota Fiscal, Colaborador, Material/Ferramenta,
  // Fornecedor e Usuário passam a registrar aqui antes de apagar de
  // verdade (ver registrar_exclusao no banco). No SQLite (só
  // desenvolvimento/local) essa lista sempre volta vazia — não fazia
  // sentido duplicar o mesmo mecanismo lá.
  ipcMain.handle('master:listarExclusoes', async () => {
    if (getDatabaseProvider() === 'supabase') {
      const s = getSupabase()
      const { data, error } = await s
        .from('auditoria')
        .select('id,tabela,descricao,usuario_nome,empresa_id,created_at,empresas(nome)')
        .eq('acao', 'delete')
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw new Error(error.message)
      return (data ?? []).map(row => {
        const { empresas, ...resto } = row as typeof row & { empresas: { nome: string } | null }
        return { ...resto, empresa_nome: empresas?.nome ?? '—' }
      })
    }
    return []
  })
}
