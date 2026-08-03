import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { criarNotificacaoEvento } from './notificacoes.ipc'
import { getDatabaseProvider, getSupabase } from '../supabase/client'

// NOVO: "lote" — pacote de AP's e Notas Fiscais de uma obra, num
// período, que o ADM monta e envia pra aprovação do Supervisor
// ("Programação Financeira <obra> de <início> a <fim>"). Ao aprovar
// um item dentro do lote, o Supervisor usa a MESMA vaga de aprovação
// que a AP/NF já tem (aprovado_por/aprovado_em) — só que quem assina
// é ele, no lugar do Gestor.
// Reaproveitado pela AP e pela Nota Fiscal: depois que o Supervisor
// autoriza um item de um lote, verifica se era o último pendente —
// se sim, avisa o ADM e o Gestor daquela obra que o lote inteiro foi
// concluído.
export function verificarLoteConcluido(db: ReturnType<typeof getDb>, loteId: number | null) {
  if (!loteId) return
  const lote = db.prepare(`SELECT empresa_id, titulo FROM lotes_financeiros WHERE id = ?`)
    .get(loteId) as { empresa_id: number; titulo: string } | undefined
  if (!lote) return

  const pendentesAp = (db.prepare(
    `SELECT COUNT(*) AS n FROM autorizacoes_pagamento WHERE lote_id = ? AND aprovado_supervisor_por IS NULL`
  ).get(loteId) as { n: number }).n
  const pendentesNf = (db.prepare(
    `SELECT COUNT(*) AS n FROM notas_fiscais WHERE lote_id = ? AND aprovado_supervisor_por IS NULL`
  ).get(loteId) as { n: number }).n

  if (pendentesAp === 0 && pendentesNf === 0) {
    for (const destinatario of ['admin', 'gestor', 'central']) {
      criarNotificacaoEvento(db, {
        empresa_id: lote.empresa_id,
        tipo: 'lote_aprovado',
        destinatario_perfil: destinatario,
        titulo: destinatario === 'central' ? 'Lote pronto para aprovação final' : 'Lote totalmente autorizado',
        mensagem: destinatario === 'central'
          ? `O Supervisor concluiu "${lote.titulo}" — pronto para sua aprovação`
          : `O Supervisor concluiu a autorização de todos os itens de "${lote.titulo}"`,
        referencia_id: loteId,
      })
    }
  }
}

export function registerLotesIpc() {
  const db = getDb()

  // ── Criar lote — título já vem pronto, ADM escolhe os itens ──
  ipcMain.handle('lotes:criar', (_e, p: {
    empresa_id: number; empresa_nome: string; data_inicio: string; data_fim: string
    criado_por?: string | null; ap_ids: number[]; nf_ids: number[]
  }) => {
    if (p.ap_ids.length === 0 && p.nf_ids.length === 0) {
      throw new Error('Selecione ao menos uma AP ou Nota Fiscal.')
    }

    // NOVO: bloqueio de verdade, não só visual — só entra no lote
    // quem já foi autorizado (o botão "Autorizar" é a mesma vaga pro
    // ADM e pro Gestor, tanto faz quem clicou). Só bloqueia o que
    // ainda não tem autorização nenhuma. Mesmo que algo tente pular a
    // validação da tela, aqui é rejeitado.
    if (p.ap_ids.length > 0) {
      const placeholders = p.ap_ids.map(() => '?').join(',')
      const semAprovacao = db.prepare(
        `SELECT COUNT(*) AS n FROM autorizacoes_pagamento WHERE id IN (${placeholders}) AND aprovado_por IS NULL`
      ).get(...p.ap_ids) as { n: number }
      if (semAprovacao.n > 0) {
        throw new Error('Uma ou mais AP\'s selecionadas ainda não foram autorizadas.')
      }
    }
    if (p.nf_ids.length > 0) {
      const placeholders = p.nf_ids.map(() => '?').join(',')
      const semAprovacao = db.prepare(
        `SELECT COUNT(*) AS n FROM notas_fiscais WHERE id IN (${placeholders}) AND aprovado_por IS NULL`
      ).get(...p.nf_ids) as { n: number }
      if (semAprovacao.n > 0) {
        throw new Error('Uma ou mais Notas Fiscais selecionadas ainda não foram autorizadas.')
      }
    }

    const titulo = `Programação Financeira ${p.empresa_nome} de ${p.data_inicio.split('-').reverse().join('/')} a ${p.data_fim.split('-').reverse().join('/')}`

    // ALTERADO: se já existe um lote dessa obra pro MESMO período, os
    // itens novos entram nele — não cria um lote duplicado. O que
    // importa pro lote é o período, não o momento em que cada item
    // foi enviado.
    const criar = db.transaction(() => {
      const existente = db.prepare(`
        SELECT id FROM lotes_financeiros WHERE empresa_id = ? AND data_inicio = ? AND data_fim = ?
      `).get(p.empresa_id, p.data_inicio, p.data_fim) as { id: number } | undefined

      let loteId: number
      const novoLote = !existente

      if (existente) {
        loteId = existente.id
      } else {
        const result = db.prepare(`
          INSERT INTO lotes_financeiros (empresa_id, titulo, data_inicio, data_fim, criado_por)
          VALUES (?, ?, ?, ?, ?)
        `).run(p.empresa_id, titulo, p.data_inicio, p.data_fim, p.criado_por ?? null)
        loteId = result.lastInsertRowid as number
      }

      const marcarAp = db.prepare(`UPDATE autorizacoes_pagamento SET lote_id = ? WHERE id = ?`)
      for (const id of p.ap_ids) marcarAp.run(loteId, id)

      const marcarNf = db.prepare(`UPDATE notas_fiscais SET lote_id = ? WHERE id = ?`)
      for (const id of p.nf_ids) marcarNf.run(loteId, id)

      return { loteId, novoLote }
    })

    const { loteId, novoLote } = criar()

    // Avisa os supervisores da obra — mesmo quando o lote já existia,
    // porque tem item pendente novo esperando aprovação.
    const supervisores = db.prepare(`
      SELECT u.nome FROM supervisor_obras so
      JOIN usuarios u ON u.id = so.usuario_id
      WHERE so.empresa_id = ?
    `).all(p.empresa_id) as { nome: string }[]

    if (supervisores.length > 0) {
      criarNotificacaoEvento(db, {
        empresa_id: p.empresa_id,
        tipo: 'lote_novo',
        destinatario_perfil: 'supervisor',
        titulo: novoLote ? 'Novo lote para autorizar' : 'Novos itens para autorizar no lote',
        mensagem: titulo,
        referencia_id: loteId,
      })
    }

    return { id: loteId, titulo }
  })

  // ── NOVO: "Fechar Lote" — só organiza, não avisa o Supervisor
  // ainda. Sempre usa o lote "aberto" (enviado_em NULL) dessa obra se
  // já existir um — cada obra tem no máximo um por vez, e ele vai
  // crescendo conforme mais itens entram, recalculando o título pela
  // data de emissão de tudo que está dentro (o mais antigo até o
  // mais novo).
  // Confere se os itens selecionados já estão autorizados — a menos
  // que o usuário tenha a permissão extra "Fechar lote com AP/Nota
  // não autorizada" (Acessos Extras). Usada tanto pra criar um lote
  // novo quanto pra adicionar a um que já existe.
  function validarAutorizacao(usuarioId: number | null | undefined, apIds: number[], nfIds: number[]) {
    const podeSemAutorizar = !!usuarioId && !!db.prepare(`
      SELECT 1 FROM usuario_permissoes_extras WHERE usuario_id = ? AND chave = 'fechar-lote-nao-autorizado' AND negada = 0
    `).get(usuarioId)
    if (podeSemAutorizar) return

    if (apIds.length > 0) {
      const placeholders = apIds.map(() => '?').join(',')
      const semAprovacao = db.prepare(
        `SELECT COUNT(*) AS n FROM autorizacoes_pagamento WHERE id IN (${placeholders}) AND aprovado_por IS NULL`
      ).get(...apIds) as { n: number }
      if (semAprovacao.n > 0) throw new Error('Uma ou mais AP\'s selecionadas ainda não foram autorizadas.')
    }
    if (nfIds.length > 0) {
      const placeholders = nfIds.map(() => '?').join(',')
      const semAprovacao = db.prepare(
        `SELECT COUNT(*) AS n FROM notas_fiscais WHERE id IN (${placeholders}) AND aprovado_por IS NULL`
      ).get(...nfIds) as { n: number }
      if (semAprovacao.n > 0) throw new Error('Uma ou mais Notas Fiscais selecionadas ainda não foram autorizadas.')
    }
  }

  // ── "Fechar Lote" — ALTERADO: sempre cria um lote NOVO, numerado
  // em sequência por obra ("Lote 01", "Lote 02"...) em vez de reunir
  // tudo num único lote "aberto" nomeado pela data. Pra juntar com um
  // lote que já existe, é o "Enviar para o Lote" (lotes:adicionarAoLote).
  ipcMain.handle('lotes:fecharLote', (_e, p: {
    empresa_id: number; empresa_nome: string; criado_por?: string | null; usuario_id?: number | null
    ap_ids: number[]; nf_ids: number[]
  }) => {
    if(getDatabaseProvider()==='supabase') return getSupabase().rpc('fechar_lote_financeiro',{p}).then(({data,error})=>{if(error)throw new Error(error.message);return data})
    if (p.ap_ids.length === 0 && p.nf_ids.length === 0) {
      throw new Error('Selecione ao menos uma AP ou Nota Fiscal.')
    }
    validarAutorizacao(p.usuario_id, p.ap_ids, p.nf_ids)

    const fechar = db.transaction(() => {
      const ultimoNumero = (db.prepare(
        `SELECT COALESCE(MAX(numero), 0) AS n FROM lotes_financeiros WHERE empresa_id = ?`
      ).get(p.empresa_id) as { n: number }).n
      const numero = ultimoNumero + 1
      // NOVO: nome do lote já leva a data em que foi criado —
      // "LOTE 01 30/07/2026" — pra ficar claro de quando é sem
      // precisar abrir pra ver.
      const hoje = new Date()
      const dataFormatada = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`
      const titulo = `LOTE ${String(numero).padStart(2, '0')} ${dataFormatada}`

      const result = db.prepare(`
        INSERT INTO lotes_financeiros (empresa_id, numero, titulo, data_inicio, data_fim, criado_por)
        VALUES (?, ?, ?, date('now'), date('now'), ?)
      `).run(p.empresa_id, numero, titulo, p.criado_por ?? null)
      const loteId = result.lastInsertRowid as number

      if (p.ap_ids.length > 0) {
        const marcarAp = db.prepare(`UPDATE autorizacoes_pagamento SET lote_id = ? WHERE id = ?`)
        for (const id of p.ap_ids) marcarAp.run(loteId, id)
      }
      if (p.nf_ids.length > 0) {
        const marcarNf = db.prepare(`UPDATE notas_fiscais SET lote_id = ? WHERE id = ?`)
        for (const id of p.nf_ids) marcarNf.run(loteId, id)
      }

      return { loteId, titulo }
    })

    const { loteId, titulo } = fechar()
    return { id: loteId, titulo }
  })

  // ── NOVO: lista os lotes ainda abertos (não enviados) de uma obra
  // — usado no botão "Enviar para o Lote", pra escolher qual deles
  // recebe os itens selecionados.
  ipcMain.handle('lotes:listarAbertos', async (_e, empresa_id: number) => {
    if(getDatabaseProvider()==='supabase') { const s=getSupabase();const [{data:lotes,error:e1},{data:aps,error:e2},{data:nfs,error:e3}]=await Promise.all([s.from('lotes_financeiros').select('id,numero,titulo').eq('empresa_id',empresa_id).is('enviado_em',null).order('numero',{ascending:false}),s.from('autorizacoes_pagamento').select('lote_id,aprovado_por').eq('empresa_id',empresa_id),s.from('notas_fiscais').select('lote_id,aprovado_por').eq('empresa_id',empresa_id)]);for(const e of [e1,e2,e3])if(e)throw new Error(e.message);return (lotes??[]).map(l=>{const a=(aps??[]).filter(x=>x.lote_id===l.id),n=(nfs??[]).filter(x=>x.lote_id===l.id);return {...l,total_itens:a.length+n.length,nao_aprovados:a.filter(x=>x.aprovado_por===null).length+n.filter(x=>x.aprovado_por===null).length}}) }
    return db.prepare(`
      SELECT l.id, l.numero, l.titulo,
        (SELECT COUNT(*) FROM autorizacoes_pagamento WHERE lote_id = l.id) +
        (SELECT COUNT(*) FROM notas_fiscais WHERE lote_id = l.id) AS total_itens,
        (SELECT COUNT(*) FROM autorizacoes_pagamento WHERE lote_id = l.id AND aprovado_por IS NULL) +
        (SELECT COUNT(*) FROM notas_fiscais WHERE lote_id = l.id AND aprovado_por IS NULL) AS nao_aprovados
      FROM lotes_financeiros l
      WHERE l.empresa_id = ? AND l.enviado_em IS NULL
      ORDER BY l.numero DESC
    `).all(empresa_id)
  })

  // ── NOVO: "Enviar para o Lote" — adiciona os itens selecionados a
  // um lote que já existe (em vez de criar um novo).
  ipcMain.handle('lotes:adicionarAoLote', async (_e, p: {
    lote_id: number; usuario_id?: number | null; ap_ids: number[]; nf_ids: number[]
  }) => {
    if(getDatabaseProvider()==='supabase') { if(!p.ap_ids.length&&!p.nf_ids.length)throw new Error('Selecione ao menos uma AP ou Nota Fiscal.');const {error}=await getSupabase().rpc('adicionar_itens_lote',{p});if(error)throw new Error(error.message);return {ok:true} }
    if (p.ap_ids.length === 0 && p.nf_ids.length === 0) {
      throw new Error('Selecione ao menos uma AP ou Nota Fiscal.')
    }
    const lote = db.prepare(`SELECT enviado_em FROM lotes_financeiros WHERE id = ?`).get(p.lote_id) as { enviado_em: string | null } | undefined
    if (!lote) throw new Error('Lote não encontrado.')
    if (lote.enviado_em) throw new Error('Esse lote já foi enviado ao Supervisor — não dá mais pra adicionar itens nele.')

    validarAutorizacao(p.usuario_id, p.ap_ids, p.nf_ids)

    const adicionar = db.transaction(() => {
      if (p.ap_ids.length > 0) {
        const marcarAp = db.prepare(`UPDATE autorizacoes_pagamento SET lote_id = ? WHERE id = ?`)
        for (const id of p.ap_ids) marcarAp.run(p.lote_id, id)
      }
      if (p.nf_ids.length > 0) {
        const marcarNf = db.prepare(`UPDATE notas_fiscais SET lote_id = ? WHERE id = ?`)
        for (const id of p.nf_ids) marcarNf.run(p.lote_id, id)
      }
    })
    adicionar()
    return { ok: true }
  })

  // ── NOVO: "Tirar do Lote" — remove um item específico do lote em
  // que está. Se aquele era o último item, o lote deixa de existir
  // (um lote só existe com AP/Nota dentro).
  ipcMain.handle('lotes:tirarDoLote', async (_e, p: { item_tipo: 'ap' | 'nf'; item_id: number }) => {
    if(getDatabaseProvider()==='supabase') { const {data,error}=await getSupabase().rpc('tirar_item_lote',{p_tipo:p.item_tipo,p_item_id:p.item_id});if(error)throw new Error(error.message);return {ok:true,loteApagado:data} }
    const tabela = p.item_tipo === 'ap' ? 'autorizacoes_pagamento' : 'notas_fiscais'
    const item = db.prepare(`SELECT lote_id FROM ${tabela} WHERE id = ?`).get(p.item_id) as { lote_id: number | null } | undefined
    if (!item || !item.lote_id) return { ok: true, loteApagado: false }
    const loteId = item.lote_id

    const tirar = db.transaction(() => {
      db.prepare(`UPDATE ${tabela} SET lote_id = NULL WHERE id = ?`).run(p.item_id)

      const restante = (
        (db.prepare(`SELECT COUNT(*) AS n FROM autorizacoes_pagamento WHERE lote_id = ?`).get(loteId) as { n: number }).n +
        (db.prepare(`SELECT COUNT(*) AS n FROM notas_fiscais WHERE lote_id = ?`).get(loteId) as { n: number }).n
      )
      if (restante === 0) {
        db.prepare(`DELETE FROM lotes_financeiros WHERE id = ?`).run(loteId)
        return true
      }
      return false
    })

    const loteApagado = tirar()
    return { ok: true, loteApagado }
  })

  // ── NOVO: manda pro Supervisor um ou mais lotes que já foram
  // fechados — é o que antes acontecia junto com "criar o lote"; a
  // notificação é a mesma de sempre.
  ipcMain.handle('lotes:enviarParaSupervisor', async (_e, p: { lote_ids: number[] }) => {
    if(getDatabaseProvider()==='supabase') { if(!p.lote_ids.length)throw new Error('Selecione ao menos um lote.');const {data,error}=await getSupabase().rpc('enviar_lotes_supervisor',{p_lote_ids:p.lote_ids});if(error)throw new Error(error.message);return {lotes:data??[]} }
    if (p.lote_ids.length === 0) throw new Error('Selecione ao menos um lote.')

    const resultados: { id: number; titulo: string }[] = []

    const enviar = db.transaction(() => {
      for (const loteId of p.lote_ids) {
        const lote = db.prepare(`SELECT empresa_id, titulo, enviado_em FROM lotes_financeiros WHERE id = ?`)
          .get(loteId) as { empresa_id: number; titulo: string; enviado_em: string | null } | undefined
        if (!lote) continue
        if (lote.enviado_em) { resultados.push({ id: loteId, titulo: lote.titulo }); continue }  // já tinha sido enviado, ignora

        db.prepare(`UPDATE lotes_financeiros SET enviado_em = datetime('now') WHERE id = ?`).run(loteId)

        const supervisores = db.prepare(`
          SELECT u.nome FROM supervisor_obras so JOIN usuarios u ON u.id = so.usuario_id WHERE so.empresa_id = ?
        `).all(lote.empresa_id) as { nome: string }[]

        if (supervisores.length > 0) {
          criarNotificacaoEvento(db, {
            empresa_id: lote.empresa_id,
            tipo: 'lote_novo',
            destinatario_perfil: 'supervisor',
            titulo: 'Novo lote para autorizar',
            mensagem: lote.titulo,
            referencia_id: loteId,
          })
        }

        resultados.push({ id: loteId, titulo: lote.titulo })
      }
    })

    enviar()
    return { lotes: resultados }
  })

  // ── Listar lotes de uma obra ──────────────────────────────
  // ── NOVO: "Apagar Lote" — some com o lote, mas NUNCA com as AP's/
  // Notas que estavam dentro dele; elas voltam a ficar soltas (sem
  // lote), com o status de aprovação de cada uma preservado.
  ipcMain.handle('lotes:excluir', async (_e, id: number) => {
    if(getDatabaseProvider()==='supabase') { const {error}=await getSupabase().rpc('excluir_lote_financeiro',{p_lote_id:id});if(error)throw new Error(error.message);return {ok:true} }
    const apagar = db.transaction(() => {
      db.prepare(`UPDATE autorizacoes_pagamento SET lote_id = NULL WHERE lote_id = ?`).run(id)
      db.prepare(`UPDATE notas_fiscais SET lote_id = NULL WHERE lote_id = ?`).run(id)
      db.prepare(`DELETE FROM lotes_financeiros WHERE id = ?`).run(id)
    })
    apagar()
    return { ok: true }
  })

  ipcMain.handle('lotes:listarPorObra', async (_e, empresa_id: number) => {
    if(getDatabaseProvider()==='supabase') { const s=getSupabase();const [{data:lotes,error:e1},{data:aps,error:e2},{data:nfs,error:e3}]=await Promise.all([s.from('lotes_financeiros').select('*').eq('empresa_id',empresa_id).order('data_inicio',{ascending:false}).order('id',{ascending:false}),s.from('autorizacoes_pagamento').select('lote_id,aprovado_supervisor_por').eq('empresa_id',empresa_id),s.from('notas_fiscais').select('lote_id,aprovado_supervisor_por').eq('empresa_id',empresa_id)]);for(const e of [e1,e2,e3])if(e)throw new Error(e.message);return (lotes??[]).map(l=>{const a=(aps??[]).filter(x=>x.lote_id===l.id),n=(nfs??[]).filter(x=>x.lote_id===l.id);const total=a.length+n.length,aprovados=a.filter(x=>x.aprovado_supervisor_por!==null).length+n.filter(x=>x.aprovado_supervisor_por!==null).length;return {...l,total_itens:total,itens_aprovados:aprovados,pendente:aprovados<total}}) }
    const lotes = db.prepare(`
      SELECT * FROM lotes_financeiros WHERE empresa_id = ? ORDER BY data_inicio DESC, id DESC
    `).all(empresa_id) as { id: number }[]

    const contarAp = db.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN aprovado_supervisor_por IS NOT NULL THEN 1 ELSE 0 END) AS aprovadas FROM autorizacoes_pagamento WHERE lote_id = ?`)
    const contarNf = db.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN aprovado_supervisor_por IS NOT NULL THEN 1 ELSE 0 END) AS aprovadas FROM notas_fiscais WHERE lote_id = ?`)

    return lotes.map(l => {
      const ap = contarAp.get(l.id) as { n: number; aprovadas: number }
      const nf = contarNf.get(l.id) as { n: number; aprovadas: number }
      const total = ap.n + nf.n
      const aprovados = (ap.aprovadas ?? 0) + (nf.aprovadas ?? 0)
      return { ...l, total_itens: total, itens_aprovados: aprovados, pendente: aprovados < total }
    })
  })

  // ── Detalhe de um lote — as AP's e NF's dentro dele ──────
  ipcMain.handle('lotes:buscarPorId', async (_e, id: number) => {
    if(getDatabaseProvider()==='supabase') { const s=getSupabase();const {data:lote,error}=await s.from('lotes_financeiros').select('*').eq('id',id).maybeSingle();if(error)throw new Error(error.message);if(!lote)return null;const [{data:aps,error:e1},{data:nfs,error:e2}]=await Promise.all([s.from('autorizacoes_pagamento').select('*').eq('lote_id',id).order('id',{ascending:false}),s.from('notas_fiscais').select('*').eq('lote_id',id).order('id',{ascending:false})]);if(e1)throw new Error(e1.message);if(e2)throw new Error(e2.message);const apIds=(aps??[]).map(a=>a.id),nfIds=(nfs??[]).map(n=>n.id);const [{data:ab,error:e3},{data:nb,error:e4}]=await Promise.all([apIds.length?s.from('autorizacoes_pagamento_boletos').select('ap_id,id,valor').in('ap_id',apIds):Promise.resolve({data:[],error:null}),nfIds.length?s.from('notas_fiscais_boletos').select('nota_id,id,valor').in('nota_id',nfIds):Promise.resolve({data:[],error:null})]);if(e3)throw new Error(e3.message);if(e4)throw new Error(e4.message);const autorizacoes=(aps??[]).map(a=>{const b=(ab??[]).filter(x=>x.ap_id===a.id);return {...a,valor_total:b.length?b.reduce((x,y)=>x+Number(y.valor),0):Number(a.valor),qtd_boletos:b.length}});const notas_fiscais=(nfs??[]).map(n=>{const b=(nb??[]).filter(x=>x.nota_id===n.id);return {...n,valor_total:b.reduce((x,y)=>x+Number(y.valor),0),qtd_boletos:b.length}});return {...lote,autorizacoes,notas_fiscais} }
    const lote = db.prepare(`SELECT * FROM lotes_financeiros WHERE id = ?`).get(id)
    if (!lote) return null

    const aps = db.prepare(`
      SELECT a.*, COALESCE(SUM(b.valor), a.valor) AS valor_total, COUNT(b.id) AS qtd_boletos
      FROM autorizacoes_pagamento a
      LEFT JOIN autorizacoes_pagamento_boletos b ON b.ap_id = a.id
      WHERE a.lote_id = ?
      GROUP BY a.id
      ORDER BY a.id DESC
    `).all(id)

    const nfs = db.prepare(`
      SELECT n.*, COALESCE(SUM(b.valor), 0) AS valor_total, COUNT(b.id) AS qtd_boletos
      FROM notas_fiscais n
      LEFT JOIN notas_fiscais_boletos b ON b.nota_id = n.id
      WHERE n.lote_id = ?
      GROUP BY n.id
      ORDER BY n.id DESC
    `).all(id)

    return { ...lote, autorizacoes: aps, notas_fiscais: nfs }
  })

  // ── Escritório Central: lista todos os Supervisores ──────
  // NOVO: o Escritório Central não acompanha obra nem supervisor
  // específico — vê todos. Primeira tela dele é essa lista.
  ipcMain.handle('lotes:listarSupervisores', async () => {
    if(getDatabaseProvider()==='supabase') { const s=getSupabase();const [{data:usuarios,error:e1},{data:links,error:e2},{data:lotes,error:e3},{data:aps,error:e4},{data:nfs,error:e5}]=await Promise.all([s.from('usuarios').select('id,nome').eq('perfil','supervisor').eq('ativo',1).order('nome'),s.from('supervisor_obras').select('usuario_id,empresa_id'),s.from('lotes_financeiros').select('id,empresa_id'),s.from('autorizacoes_pagamento').select('lote_id,aprovado_supervisor_por,aprovado_central_por'),s.from('notas_fiscais').select('lote_id,aprovado_supervisor_por,aprovado_central_por')]);for(const e of [e1,e2,e3,e4,e5])if(e)throw new Error(e.message);return (usuarios??[]).map(u=>{const obras=(links??[]).filter(l=>l.usuario_id===u.id).map(l=>l.empresa_id);const loteIds=new Set((lotes??[]).filter(l=>obras.includes(l.empresa_id)).map(l=>l.id));const pendentes=new Set([...(aps??[]).filter(a=>loteIds.has(a.lote_id)&&a.aprovado_supervisor_por!==null&&a.aprovado_central_por===null).map(a=>a.lote_id),...(nfs??[]).filter(n=>loteIds.has(n.lote_id)&&n.aprovado_supervisor_por!==null&&n.aprovado_central_por===null).map(n=>n.lote_id)]);return {usuario_id:u.id,nome:u.nome,total_obras:obras.length,lotes_pendentes:pendentes.size}}) }
    const supervisores = db.prepare(`
      SELECT id, nome FROM usuarios WHERE perfil = 'supervisor' AND ativo = 1 ORDER BY nome ASC
    `).all() as { id: number; nome: string }[]

    return supervisores.map(s => {
      const obras = (db.prepare(
        `SELECT COUNT(*) AS n FROM supervisor_obras WHERE usuario_id = ?`
      ).get(s.id) as { n: number }).n

      // Pendente pro Central = já passou pelo Supervisor, mas o
      // Central ainda não assinou.
      const lotesPendentes = (db.prepare(`
        SELECT COUNT(DISTINCT l.id) AS n
        FROM lotes_financeiros l
        JOIN supervisor_obras so ON so.empresa_id = l.empresa_id AND so.usuario_id = ?
        WHERE
          EXISTS (SELECT 1 FROM autorizacoes_pagamento WHERE lote_id = l.id AND aprovado_supervisor_por IS NOT NULL AND aprovado_central_por IS NULL)
          OR EXISTS (SELECT 1 FROM notas_fiscais WHERE lote_id = l.id AND aprovado_supervisor_por IS NOT NULL AND aprovado_central_por IS NULL)
      `).get(s.id) as { n: number }).n

      return { usuario_id: s.id, nome: s.nome, total_obras: obras, lotes_pendentes: lotesPendentes }
    })
  })

  // ── Escritório Central: obras de um Supervisor específico ──
  ipcMain.handle('lotes:obrasDoSupervisor', async (_e, usuario_id: number) => {
    if(getDatabaseProvider()==='supabase') { const s=getSupabase();const {data:links,error}=await s.from('supervisor_obras').select('empresa_id').eq('usuario_id',usuario_id);if(error)throw new Error(error.message);const ids=(links??[]).map(x=>x.empresa_id);if(!ids.length)return [];const [{data:empresas,error:e1},{data:colaboradores,error:e2},{data:lancamentos,error:e3},{data:lotes,error:e4},{data:aps,error:e5},{data:nfs,error:e6}]=await Promise.all([s.from('empresas').select('id,nome,logo_url').in('id',ids),s.from('colaboradores').select('empresa_id,status').in('empresa_id',ids),s.from('lancamentos').select('empresa_id,tipo,status,valor,data').in('empresa_id',ids),s.from('lotes_financeiros').select('id,empresa_id').in('empresa_id',ids),s.from('autorizacoes_pagamento').select('lote_id,aprovado_supervisor_por').in('empresa_id',ids),s.from('notas_fiscais').select('lote_id,aprovado_supervisor_por').in('empresa_id',ids)]);for(const e of [e1,e2,e3,e4,e5,e6])if(e)throw new Error(e.message);const inicio=new Date();inicio.setDate(1);const mes=inicio.toISOString().slice(0,10);return (empresas??[]).map(e=>{const loteIds=new Set((lotes??[]).filter(l=>l.empresa_id===e.id).map(l=>l.id));return {empresa_id:e.id,empresa_nome:e.nome,logo_url:e.logo_url,colaboradores:(colaboradores??[]).filter(c=>c.empresa_id===e.id&&c.status==='ativo').length,gastos_mes:(lancamentos??[]).filter(l=>l.empresa_id===e.id&&l.tipo==='despesa'&&l.status!=='cancelado'&&l.data>=mes).reduce((x,l)=>x+Number(l.valor),0),lotes_pendentes:(aps??[]).filter(a=>loteIds.has(a.lote_id)&&a.aprovado_supervisor_por!==null).length+(nfs??[]).filter(n=>loteIds.has(n.lote_id)&&n.aprovado_supervisor_por!==null).length}}) }
    const empresaIds = (db.prepare(
      `SELECT empresa_id FROM supervisor_obras WHERE usuario_id = ?`
    ).all(usuario_id) as { empresa_id: number }[]).map(r => r.empresa_id)

    if (empresaIds.length === 0) return []

    return empresaIds.map(empresaId => {
      const empresa = db.prepare(`SELECT id, nome, logo_url FROM empresas WHERE id = ?`).get(empresaId) as
        { id: number; nome: string; logo_url: string | null } | undefined
      if (!empresa) return null

      const colaboradores = (db.prepare(
        `SELECT COUNT(*) AS n FROM colaboradores WHERE empresa_id = ? AND status = 'ativo'`
      ).get(empresaId) as { n: number }).n

      const inicioMes = new Date()
      inicioMes.setDate(1)
      const gastos = (db.prepare(`
        SELECT COALESCE(SUM(valor), 0) AS total FROM lancamentos
        WHERE empresa_id = ? AND tipo = 'despesa' AND status != 'cancelado'
          AND date(data) >= date(?)
      `).get(empresaId, inicioMes.toISOString().slice(0, 10)) as { total: number }).total

      // Pendente pro Central = já passou pelo Supervisor.
      const lotesPendentes = (db.prepare(`
        SELECT COUNT(*) AS n FROM lotes_financeiros l
        WHERE l.empresa_id = ?
          AND (
            EXISTS (SELECT 1 FROM autorizacoes_pagamento WHERE lote_id = l.id AND aprovado_supervisor_por IS NOT NULL AND aprovado_central_por IS NULL)
            OR EXISTS (SELECT 1 FROM notas_fiscais WHERE lote_id = l.id AND aprovado_supervisor_por IS NOT NULL AND aprovado_central_por IS NULL)
          )
      `).get(empresaId) as { n: number }).n

      return {
        empresa_id: empresa.id, empresa_nome: empresa.nome, logo_url: empresa.logo_url,
        colaboradores, gastos_mes: gastos, lotes_pendentes: lotesPendentes,
      }
    }).filter(Boolean)
  })

  // ── Dados completos das AP's de um lote, prontos pra "capa" ──
  // NOVO: junta CNPJ/CPF e dados bancários (do fornecedor ou do
  // colaborador, dependendo de quem é o beneficiário) e o primeiro
  // vencimento de cada AP — tudo que o relatório em forma de planilha
  // precisa, sem o front ter que buscar fornecedor/colaborador um a um.
  ipcMain.handle('lotes:apsParaCapa', async (_e, lote_id: number) => {
    if(getDatabaseProvider()==='supabase') { const s=getSupabase();const {data:aps,error}=await s.from('autorizacoes_pagamento').select('*').eq('lote_id',lote_id).order('id');if(error)throw new Error(error.message);const ids=(aps??[]).map(a=>a.id);const [{data:boletos,error:e1},{data:fornecedores,error:e2},{data:colaboradores,error:e3}]=await Promise.all([ids.length?s.from('autorizacoes_pagamento_boletos').select('ap_id,valor,vencimento').in('ap_id',ids):Promise.resolve({data:[],error:null}),s.from('fornecedores').select('id,cnpj,cpf,forma_pagamento,banco,agencia,operacao,conta,conta_digito'),s.from('colaboradores').select('id,cpf,banco,agencia,operacao,conta,conta_digito')]);for(const e of [e1,e2,e3])if(e)throw new Error(e.message);const fs=new Map((fornecedores??[]).map(f=>[f.id,f])),cs=new Map((colaboradores??[]).map(c=>[c.id,c]));return (aps??[]).map(a=>{const b=(boletos??[]).filter(x=>x.ap_id===a.id);const r:any=a.beneficiario_tipo==='fornecedor'?fs.get(a.beneficiario_id):cs.get(a.beneficiario_id);return {id:a.id,created_at:a.created_at,beneficiario_nome:a.beneficiario_nome,descricao:a.descricao,cnpj:a.beneficiario_tipo==='fornecedor'?r?.cnpj??null:null,cpf:r?.cpf??null,forma_pagamento:a.beneficiario_tipo==='fornecedor'?r?.forma_pagamento??null:null,banco:r?.banco??null,agencia:r?.agencia??null,operacao:r?.operacao??null,conta:r?.conta??null,conta_digito:r?.conta_digito??null,primeiro_vencimento:b[0]?.vencimento??null,valor_total:b.length?b.reduce((x,y)=>x+Number(y.valor),0):Number(a.valor)}}) }
    return db.prepare(`
      SELECT
        a.id, a.created_at, a.beneficiario_nome, a.descricao,
        CASE WHEN a.beneficiario_tipo = 'fornecedor' THEN f.cnpj ELSE NULL END AS cnpj,
        CASE WHEN a.beneficiario_tipo = 'fornecedor' THEN f.cpf ELSE c.cpf END AS cpf,
        CASE WHEN a.beneficiario_tipo = 'fornecedor' THEN f.forma_pagamento ELSE NULL END AS forma_pagamento,
        CASE WHEN a.beneficiario_tipo = 'fornecedor' THEN f.banco ELSE c.banco END AS banco,
        CASE WHEN a.beneficiario_tipo = 'fornecedor' THEN f.agencia ELSE c.agencia END AS agencia,
        CASE WHEN a.beneficiario_tipo = 'fornecedor' THEN f.operacao ELSE c.operacao END AS operacao,
        CASE WHEN a.beneficiario_tipo = 'fornecedor' THEN f.conta ELSE c.conta END AS conta,
        CASE WHEN a.beneficiario_tipo = 'fornecedor' THEN f.conta_digito ELSE c.conta_digito END AS conta_digito,
        (SELECT vencimento FROM autorizacoes_pagamento_boletos WHERE ap_id = a.id ORDER BY vencimento ASC LIMIT 1) AS primeiro_vencimento,
        COALESCE((SELECT SUM(valor) FROM autorizacoes_pagamento_boletos WHERE ap_id = a.id), a.valor) AS valor_total
      FROM autorizacoes_pagamento a
      LEFT JOIN fornecedores f ON f.id = a.beneficiario_id AND a.beneficiario_tipo = 'fornecedor'
      LEFT JOIN colaboradores c ON c.id = a.beneficiario_id AND a.beneficiario_tipo = 'colaborador'
      WHERE a.lote_id = ?
      ORDER BY a.id ASC
    `).all(lote_id)
  })

  // ── Resumo por obra, pro painel inicial do Supervisor ────
  ipcMain.handle('lotes:resumoObras', async (_e, empresa_ids: number[]) => {
    if (empresa_ids.length === 0) return []
    if(getDatabaseProvider()==='supabase') { const s=getSupabase();const [{data:empresas,error:e1},{data:colaboradores,error:e2},{data:lancamentos,error:e3},{data:lotes,error:e4},{data:aps,error:e5},{data:nfs,error:e6}]=await Promise.all([s.from('empresas').select('id,nome,logo_url').in('id',empresa_ids),s.from('colaboradores').select('empresa_id,status').in('empresa_id',empresa_ids),s.from('lancamentos').select('empresa_id,tipo,status,valor,data').in('empresa_id',empresa_ids),s.from('lotes_financeiros').select('id,empresa_id').in('empresa_id',empresa_ids),s.from('autorizacoes_pagamento').select('lote_id,aprovado_supervisor_por').in('empresa_id',empresa_ids),s.from('notas_fiscais').select('lote_id,aprovado_supervisor_por').in('empresa_id',empresa_ids)]);for(const e of [e1,e2,e3,e4,e5,e6])if(e)throw new Error(e.message);const inicio=new Date();inicio.setDate(1);const mes=inicio.toISOString().slice(0,10);return (empresas??[]).map(e=>{const lotesDaObra=new Set((lotes??[]).filter(l=>l.empresa_id===e.id).map(l=>l.id));const pendentes=(aps??[]).filter(a=>lotesDaObra.has(a.lote_id)&&a.aprovado_supervisor_por===null).length+(nfs??[]).filter(n=>lotesDaObra.has(n.lote_id)&&n.aprovado_supervisor_por===null).length;return {empresa_id:e.id,empresa_nome:e.nome,logo_url:e.logo_url,colaboradores:(colaboradores??[]).filter(c=>c.empresa_id===e.id&&c.status==='ativo').length,gastos_mes:(lancamentos??[]).filter(l=>l.empresa_id===e.id&&l.tipo==='despesa'&&l.status!=='cancelado'&&l.data>=mes).reduce((x,l)=>x+Number(l.valor),0),lotes_pendentes:pendentes}}) }

    return empresa_ids.map(empresaId => {
      const empresa = db.prepare(`SELECT id, nome, logo_url FROM empresas WHERE id = ?`).get(empresaId) as
        { id: number; nome: string; logo_url: string | null } | undefined
      if (!empresa) return null

      const colaboradores = (db.prepare(
        `SELECT COUNT(*) AS n FROM colaboradores WHERE empresa_id = ? AND status = 'ativo'`
      ).get(empresaId) as { n: number }).n

      const inicioMes = new Date()
      inicioMes.setDate(1)
      const gastos = (db.prepare(`
        SELECT COALESCE(SUM(valor), 0) AS total FROM lancamentos
        WHERE empresa_id = ? AND tipo = 'despesa' AND status != 'cancelado'
          AND date(data) >= date(?)
      `).get(empresaId, inicioMes.toISOString().slice(0, 10)) as { total: number }).total

      const lotesPendentes = (db.prepare(`
        SELECT COUNT(*) AS n FROM lotes_financeiros l
        WHERE l.empresa_id = ?
          AND (
            EXISTS (SELECT 1 FROM autorizacoes_pagamento WHERE lote_id = l.id AND aprovado_supervisor_por IS NULL)
            OR EXISTS (SELECT 1 FROM notas_fiscais WHERE lote_id = l.id AND aprovado_supervisor_por IS NULL)
          )
      `).get(empresaId) as { n: number }).n

      return {
        empresa_id:      empresa.id,
        empresa_nome:    empresa.nome,
        logo_url:        empresa.logo_url,
        colaboradores,
        gastos_mes:      gastos,
        lotes_pendentes: lotesPendentes,
      }
    }).filter(Boolean)
  })
}
