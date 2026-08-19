import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { criarNotificacaoEvento } from './notificacoes.ipc'
import { getDatabaseProvider, getSupabase } from '../supabase/client'
import { uploadDocumento } from '../supabase/storage'
import { basename } from 'path'

interface CriarPayload {
  empresa_id:     number
  colaborador_id: number
  tipo:           'admissao' | 'desligamento' | 'alteracao_salarial' | 'outro'
  observacoes?:   string | null
  solicitado_por: string
  anexos?:        { caminho: string; nome: string }[]
}

interface ResponderPayload {
  id:                    number
  respondido_por:        string
  resposta_observacoes?: string | null
  anexos?:               { caminho: string; nome: string }[]
}

const TITULO_TIPO: Record<string, string> = {
  admissao:            'Admissão',
  desligamento:        'Desligamento',
  alteracao_salarial:  'Alteração salarial',
  outro:               'Movimentação',
}

export function registerSolicitacoesPessoalIpc() {
  const db = getDb()

  // ── Criar solicitação (ADM → Setor Pessoal) ──────────────
  ipcMain.handle('solicitacoesPessoal:criar', async (_e, p: CriarPayload) => {
    if(getDatabaseProvider()==='supabase') { const supabase=getSupabase();const {data,error}=await supabase.from('solicitacoes_pessoal').insert({empresa_id:p.empresa_id,colaborador_id:p.colaborador_id,tipo:p.tipo,observacoes:p.observacoes??null,solicitado_por:p.solicitado_por}).select('id').single();if(error)throw new Error(error.message);for(const [ordem,anexo] of (p.anexos??[]).entries()){const caminho=await uploadDocumento(anexo.caminho,`${p.empresa_id}/solicitacoes/${data.id}/${Date.now()}-${basename(anexo.nome).replace(/[^a-zA-Z0-9._-]/g,'_')}`);const {error:anexoError}=await supabase.from('solicitacoes_pessoal_anexos').insert({solicitacao_id:data.id,caminho,nome:anexo.nome,origem:'adm',ordem});if(anexoError)throw new Error(anexoError.message)}return {id:data.id} }
    const criar = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO solicitacoes_pessoal (empresa_id, colaborador_id, tipo, observacoes, solicitado_por)
        VALUES (@empresa_id, @colaborador_id, @tipo, @observacoes, @solicitado_por)
      `).run({
        empresa_id:     p.empresa_id,
        colaborador_id: p.colaborador_id,
        tipo:           p.tipo,
        observacoes:    p.observacoes ?? null,
        solicitado_por: p.solicitado_por,
      })
      const id = result.lastInsertRowid as number

      const inserirAnexo = db.prepare(`
        INSERT INTO solicitacoes_pessoal_anexos (solicitacao_id, caminho, nome, origem, ordem)
        VALUES (?, ?, ?, 'adm', ?)
      `)
      ;(p.anexos ?? []).forEach((a, i) => inserirAnexo.run(id, a.caminho, a.nome, i))

      const colaborador = db.prepare(`SELECT nome FROM colaboradores WHERE id = ?`).get(p.colaborador_id) as { nome: string } | undefined

      criarNotificacaoEvento(db, {
        empresa_id:          p.empresa_id,
        tipo:                'solicitacao_pessoal_nova',
        destinatario_perfil: 'setor_pessoal',
        titulo:              `${TITULO_TIPO[p.tipo] ?? 'Movimentação'} — ${colaborador?.nome ?? 'colaborador'}`,
        mensagem:            p.observacoes || null,
        referencia_id:       id,
      })

      return { id }
    })

    return criar()
  })

  // ── Lista de uma obra (tela do ADM) ──────────────────────
  ipcMain.handle('solicitacoesPessoal:listarPorObra', async (_e, empresa_id: number) => {
    if(getDatabaseProvider()==='supabase') { const supabase=getSupabase();const [{data:solicitacoes,error:solicitacoesError},{data:colaboradores,error:colaboradoresError}]=await Promise.all([supabase.from('solicitacoes_pessoal').select('*').eq('empresa_id',empresa_id).order('solicitado_em',{ascending:false}),supabase.from('colaboradores').select('id,nome').eq('empresa_id',empresa_id)]);if(solicitacoesError)throw new Error(solicitacoesError.message);if(colaboradoresError)throw new Error(colaboradoresError.message);const nomes=new Map((colaboradores??[]).map(c=>[c.id,c.nome]));return (solicitacoes??[]).map(s=>({...s,colaborador_nome:nomes.get(s.colaborador_id)??null})) }
    return db.prepare(`
      SELECT s.*, c.nome AS colaborador_nome
      FROM solicitacoes_pessoal s
      JOIN colaboradores c ON c.id = s.colaborador_id
      WHERE s.empresa_id = ?
      ORDER BY s.solicitado_em DESC
    `).all(empresa_id)
  })

  // ── Lista de todas as obras (painel do Setor Pessoal) ────
  ipcMain.handle('solicitacoesPessoal:listarTodas', async () => {
    if(getDatabaseProvider()==='supabase') { const supabase=getSupabase();const [{data:solicitacoes,error:solicitacoesError},{data:colaboradores,error:colaboradoresError},{data:empresas,error:empresasError}]=await Promise.all([supabase.from('solicitacoes_pessoal').select('*').order('solicitado_em',{ascending:false}),supabase.from('colaboradores').select('id,nome'),supabase.from('empresas').select('id,nome')]);if(solicitacoesError)throw new Error(solicitacoesError.message);if(colaboradoresError)throw new Error(colaboradoresError.message);if(empresasError)throw new Error(empresasError.message);const nomes=new Map((colaboradores??[]).map(c=>[c.id,c.nome]));const obras=new Map((empresas??[]).map(e=>[e.id,e.nome]));return (solicitacoes??[]).map(s=>({...s,colaborador_nome:nomes.get(s.colaborador_id)??null,obra_nome:obras.get(s.empresa_id)??null,obra_id:s.empresa_id})) }
    return db.prepare(`
      SELECT s.*, c.nome AS colaborador_nome, e.nome AS obra_nome, e.id AS obra_id
      FROM solicitacoes_pessoal s
      JOIN colaboradores c ON c.id = s.colaborador_id
      JOIN empresas e      ON e.id = s.empresa_id
      ORDER BY s.solicitado_em DESC
    `).all()
  })

  // ── Detalhe completo (colaborador + anexos dos dois lados) ──
  ipcMain.handle('solicitacoesPessoal:buscarPorId', async (_e, id: number) => {
    if(getDatabaseProvider()==='supabase') { const supabase=getSupabase();const {data:solicitacao,error}=await supabase.from('solicitacoes_pessoal').select('*').eq('id',id).maybeSingle();if(error)throw new Error(error.message);if(!solicitacao)return null;const [{data:empresa,error:empresaError},{data:colaborador,error:colaboradorError},{data:anexos,error:anexosError}]=await Promise.all([supabase.from('empresas').select('nome').eq('id',solicitacao.empresa_id).maybeSingle(),supabase.from('colaboradores').select('*').eq('id',solicitacao.colaborador_id).maybeSingle(),supabase.from('solicitacoes_pessoal_anexos').select('id,caminho,nome,origem,ordem').eq('solicitacao_id',id).order('origem').order('ordem')]);if(empresaError)throw new Error(empresaError.message);if(colaboradorError)throw new Error(colaboradorError.message);if(anexosError)throw new Error(anexosError.message);return {...solicitacao,obra_nome:empresa?.nome??null,colaborador,anexos_adm:(anexos??[]).filter(a=>a.origem==='adm'),anexos_setor_pessoal:(anexos??[]).filter(a=>a.origem==='setor_pessoal')} }
    const solicitacao = db.prepare(`
      SELECT s.*, e.nome AS obra_nome
      FROM solicitacoes_pessoal s
      JOIN empresas e ON e.id = s.empresa_id
      WHERE s.id = ?
    `).get(id) as Record<string, unknown> | undefined
    if (!solicitacao) return null

    const colaborador = db.prepare(`SELECT * FROM colaboradores WHERE id = ?`).get(solicitacao.colaborador_id as number)
    const anexos = db.prepare(`
      SELECT id, caminho, nome, origem, ordem FROM solicitacoes_pessoal_anexos
      WHERE solicitacao_id = ? ORDER BY origem ASC, ordem ASC
    `).all(id) as { origem: string }[]

    return {
      ...solicitacao,
      colaborador,
      anexos_adm:           anexos.filter(a => a.origem === 'adm'),
      anexos_setor_pessoal: anexos.filter(a => a.origem === 'setor_pessoal'),
    }
  })

  // ── Setor Pessoal responde (anexa documentos e devolve) ──
  ipcMain.handle('solicitacoesPessoal:responder', async (_e, p: ResponderPayload) => {
    if(getDatabaseProvider()==='supabase') { const supabase=getSupabase();const {data:solicitacao,error:consultaError}=await supabase.from('solicitacoes_pessoal').select('empresa_id').eq('id',p.id).single();if(consultaError)throw new Error(consultaError.message);const {error}=await supabase.from('solicitacoes_pessoal').update({status:'respondido',respondido_por:p.respondido_por,resposta_observacoes:p.resposta_observacoes??null,respondido_em:new Date().toISOString()}).eq('id',p.id);if(error)throw new Error(error.message);for(const [ordem,anexo] of (p.anexos??[]).entries()){const caminho=await uploadDocumento(anexo.caminho,`${solicitacao.empresa_id}/solicitacoes/${p.id}/${Date.now()}-${basename(anexo.nome).replace(/[^a-zA-Z0-9._-]/g,'_')}`);const {error:anexoError}=await supabase.from('solicitacoes_pessoal_anexos').insert({solicitacao_id:p.id,caminho,nome:anexo.nome,origem:'setor_pessoal',ordem});if(anexoError)throw new Error(anexoError.message)}return {ok:true} }
    const responder = db.transaction(() => {
      db.prepare(`
        UPDATE solicitacoes_pessoal
        SET status = 'respondido', respondido_por = @respondido_por,
            resposta_observacoes = @resposta_observacoes, respondido_em = datetime('now')
        WHERE id = @id
      `).run({
        id:                    p.id,
        respondido_por:        p.respondido_por,
        resposta_observacoes: p.resposta_observacoes ?? null,
      })

      const inserirAnexo = db.prepare(`
        INSERT INTO solicitacoes_pessoal_anexos (solicitacao_id, caminho, nome, origem, ordem)
        VALUES (?, ?, ?, 'setor_pessoal', ?)
      `)
      ;(p.anexos ?? []).forEach((a, i) => inserirAnexo.run(p.id, a.caminho, a.nome, i))

      const solicitacao = db.prepare(`
        SELECT s.empresa_id, s.tipo, c.nome AS colaborador_nome
        FROM solicitacoes_pessoal s JOIN colaboradores c ON c.id = s.colaborador_id
        WHERE s.id = ?
      `).get(p.id) as { empresa_id: number; tipo: string; colaborador_nome: string } | undefined

      if (solicitacao) {
        for (const destinatario of ['admin', 'gestor']) {
          criarNotificacaoEvento(db, {
            empresa_id:          solicitacao.empresa_id,
            tipo:                'solicitacao_pessoal_respondida',
            destinatario_perfil: destinatario,
            titulo:              `Setor Pessoal respondeu — ${solicitacao.colaborador_nome}`,
            mensagem:            `${TITULO_TIPO[solicitacao.tipo] ?? 'Movimentação'} — documentos prontos pra baixar`,
            referencia_id:       p.id,
          })
        }
      }
    })

    responder()
    return { ok: true }
  })

  // ── ADM confirma que já baixou/arquivou (fecha o ciclo) ──
  ipcMain.handle('solicitacoesPessoal:concluir', async (_e, id: number) => {
    if(getDatabaseProvider()==='supabase') { const {error}=await getSupabase().from('solicitacoes_pessoal').update({status:'concluido',concluido_em:new Date().toISOString()}).eq('id',id);if(error)throw new Error(error.message);return {ok:true} }
    db.prepare(`
      UPDATE solicitacoes_pessoal SET status = 'concluido', concluido_em = datetime('now') WHERE id = ?
    `).run(id)
    return { ok: true }
  })

  // ── NOVO: excluir uma solicitação (acesso ADM) — os anexos saem
  // junto, em cascata (ON DELETE CASCADE nas duas bases).
  ipcMain.handle('solicitacoesPessoal:excluir', async (_e, id: number) => {
    if(getDatabaseProvider()==='supabase') { const {error}=await getSupabase().from('solicitacoes_pessoal').delete().eq('id',id);if(error)throw new Error(error.message);return {ok:true} }
    db.prepare(`DELETE FROM solicitacoes_pessoal WHERE id = ?`).run(id)
    return { ok: true }
  })
}
