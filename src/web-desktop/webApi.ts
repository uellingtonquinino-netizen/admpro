import { supabase } from './supabaseClient'
import { VERSAO_CONTRATO, preencherContrato } from '../main/ipc/contratoTemplate'

// NOVO: primeira peça do window.api pro build web-desktop — replica,
// falando direto com o Supabase (sem processo do Electron no meio), o
// que os handlers usuarios:login / usuarios:minhasObras /
// empresas:buscarPorId / auth:logout já fazem hoje (ver
// usuarios.supabase.ipc.ts, que serviu de referência exata pra isso).

async function getCurrentProfile() {
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) throw new Error('Sessão do Supabase não encontrada.')

  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('id, empresa_id, nome, email, perfil, ativo, carimbo_url')
    .eq('auth_user_id', auth.user.id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!usuario || !usuario.ativo) {
    throw new Error('Sua conta ainda não está vinculada a um usuário ativo do sistema.')
  }

  const [extras, supervisor] = await Promise.all([
    supabase.from('usuario_permissoes_extras').select('chave, negada').eq('usuario_id', usuario.id),
    supabase.from('supervisor_obras').select('empresa_id').eq('usuario_id', usuario.id),
  ])
  if (extras.error) throw new Error(extras.error.message)
  if (supervisor.error) throw new Error(supervisor.error.message)

  return {
    ...usuario,
    permissoes_extras:  (extras.data ?? []).filter(row => !row.negada).map(row => row.chave),
    permissoes_negadas: (extras.data ?? []).filter(row => row.negada).map(row => row.chave),
    obras_supervisor:   (supervisor.data ?? []).map(row => row.empresa_id),
  }
}

// Fala com a Edge Function "usuarios-admin" (criar/remover usuário
// exige privilégio elevado, não dá pra fazer isso com a chave
// pública direto na tabela) — mesma lógica de usuarios.supabase.ipc.ts.
async function chamarAdminUsuarios(body: Record<string, unknown>) {
  const { data: sessao, error: sessaoErro } = await supabase.auth.getSession()
  if (sessaoErro || !sessao.session) throw new Error('Sessão do Supabase não encontrada. Faça login novamente.')
  const { data, error } = await supabase.functions.invoke('usuarios-admin', {
    body, headers: { Authorization: `Bearer ${sessao.session.access_token}` },
  })
  if (error) {
    const response = (error as { context?: Response }).context
    if (response) {
      const detalhe = await response.clone().json().catch(() => null) as { error?: string } | null
      if (detalhe?.error) throw new Error(detalhe.error)
    }
    throw new Error(error.message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

// NOVO: usada em qualquer lugar que recebe anexos vindos de
// EmitirAPModal.tsx (ou telas parecidas) — cada anexo chega como
// {caminho, vaiAssinatura, arquivo?}. No desktop, `caminho` já é um
// caminho de arquivo local de verdade; na web, `.path` não existe
// (bloqueado por segurança do navegador), então o componente manda o
// próprio arquivo (File) em `arquivo` — essa função garante que todo
// anexo vire um endereço válido do Storage antes de seguir, subindo
// o que precisar subir.
async function garantirAnexosCaminhoStorage(
  empresaId: number, pastaId: string,
  anexos: { caminho: string; vaiAssinatura?: boolean; arquivo?: File }[]
): Promise<{ caminho: string; vaiAssinatura?: boolean }[]> {
  const resultado: { caminho: string; vaiAssinatura?: boolean }[] = []
  for (const a of anexos) {
    if (a.arquivo) {
      const remoto = `${empresaId}/${pastaId}/${Date.now()}-${a.arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error } = await supabase.storage.from('documentos-rh').upload(remoto, a.arquivo)
      if (error) throw new Error(error.message)
      resultado.push({ caminho: `supabase://documentos-rh/${remoto}`, vaiAssinatura: a.vaiAssinatura })
    } else {
      resultado.push({ caminho: a.caminho, vaiAssinatura: a.vaiAssinatura })
    }
  }
  return resultado
}

const usuarios = {
  login: async (p: { email: string; senha: string }) => {
    const { error } = await supabase.auth.signInWithPassword({ email: p.email.trim(), password: p.senha })
    if (error) throw new Error('Usuário ou senha inválidos.')
    await supabase.rpc('registrar_login')
    return getCurrentProfile()
  },

  minhasObras: async (usuarioId: number) => {
    const profile = await getCurrentProfile()
    if (profile.id !== usuarioId) throw new Error('Não é permitido consultar obras de outro usuário.')
    const { data: links, error: linksError } = await supabase
      .from('usuario_obras').select('empresa_id').eq('usuario_id', usuarioId)
    if (linksError) throw new Error(linksError.message)
    const ids = links?.length ? links.map(l => l.empresa_id) : [profile.empresa_id]
    const { data: obras, error } = await supabase.from('empresas').select('id, nome').in('id', ids).order('nome')
    if (error) throw new Error(error.message)
    return obras ?? []
  },

  alterarSenha: async (p: { senha_nova: string }) => {
    if (p.senha_nova.length < 6) throw new Error('A nova senha precisa ter pelo menos 6 caracteres.')
    const { error } = await supabase.auth.updateUser({ password: p.senha_nova })
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  verificarSenha: async (p: { id: number; senha: string }) => {
    const profile = await getCurrentProfile()
    if (profile.id !== p.id) return { ok: false }
    const { error } = await supabase.auth.signInWithPassword({ email: profile.email, password: p.senha })
    return { ok: !error }
  },

  alterarEmail: async (p: { id: number; senha_atual: string; novo_email: string }) => {
    const profile = await getCurrentProfile()
    if (profile.id !== p.id) throw new Error('Não é permitido alterar o e-mail de outro usuário.')
    const { error: loginError } = await supabase.auth.signInWithPassword({ email: profile.email, password: p.senha_atual })
    if (loginError) throw new Error('Senha atual incorreta.')
    const { error } = await supabase.auth.updateUser({ email: p.novo_email.trim() })
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  atualizarCarimbo: async (p: { carimbo_url: string | null }) => {
    const { error } = await supabase.rpc('atualizar_meu_carimbo', { p_carimbo_url: p.carimbo_url })
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  // NOVO: os que faltavam pra fechar o CRUD completo (tela de
  // Usuários, gestão de permissões e obras vinculadas).
  listar: async (empresaId: number) => {
    const [{ data: usuariosCasa, error: erroCasa }, { data: vinculosExtras, error: erroVinculos }] = await Promise.all([
      supabase.from('usuarios').select('id,empresa_id,nome,email,perfil,ativo,created_at,last_login_at,carimbo_url').eq('empresa_id', empresaId),
      supabase.from('usuario_obras').select('usuario_id').eq('empresa_id', empresaId),
    ])
    if (erroCasa) throw new Error(erroCasa.message)
    if (erroVinculos) throw new Error(erroVinculos.message)
    const idsExtras = (vinculosExtras ?? []).map(v => v.usuario_id).filter(id => !(usuariosCasa ?? []).some(u => u.id === id))
    let usuariosExtras: typeof usuariosCasa = []
    if (idsExtras.length > 0) {
      const { data, error } = await supabase.from('usuarios').select('id,empresa_id,nome,email,perfil,ativo,created_at,last_login_at,carimbo_url').in('id', idsExtras)
      if (error) throw new Error(error.message)
      usuariosExtras = data
    }
    const listaCompleta = [...(usuariosCasa ?? []), ...usuariosExtras].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    return Promise.all(listaCompleta.map(async usuario => {
      const [extras, supervisor, obras] = await Promise.all([
        supabase.from('usuario_permissoes_extras').select('chave,negada').eq('usuario_id', usuario.id),
        supabase.from('supervisor_obras').select('empresa_id').eq('usuario_id', usuario.id),
        supabase.from('usuario_obras').select('empresa_id').eq('usuario_id', usuario.id),
      ])
      for (const r of [extras, supervisor, obras]) if (r.error) throw new Error(r.error.message)
      return {
        ...usuario,
        permissoes_extras: (extras.data ?? []).filter(x => !x.negada).map(x => x.chave),
        permissoes_negadas: (extras.data ?? []).filter(x => !!x.negada).map(x => x.chave),
        obras_supervisor: (supervisor.data ?? []).map(x => x.empresa_id),
        obras_extras: (obras.data ?? []).map(x => x.empresa_id),
      }
    }))
  },

  buscarPorId: async (id: number) => {
    const { data: usuario, error } = await supabase.from('usuarios').select('id,empresa_id,nome,email,perfil,ativo,created_at,last_login_at,carimbo_url').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    if (!usuario) return null
    const [extras, supervisor, obras] = await Promise.all([
      supabase.from('usuario_permissoes_extras').select('chave,negada').eq('usuario_id', id),
      supabase.from('supervisor_obras').select('empresa_id').eq('usuario_id', id),
      supabase.from('usuario_obras').select('empresa_id').eq('usuario_id', id),
    ])
    if (extras.error) throw new Error(extras.error.message)
    if (supervisor.error) throw new Error(supervisor.error.message)
    if (obras.error) throw new Error(obras.error.message)
    return {
      ...usuario,
      permissoes_extras: (extras.data ?? []).filter(x => !x.negada).map(x => x.chave),
      permissoes_negadas: (extras.data ?? []).filter(x => !!x.negada).map(x => x.chave),
      obras_supervisor: (supervisor.data ?? []).map(x => x.empresa_id),
      obras_extras: (obras.data ?? []).map(x => x.empresa_id),
    }
  },

  atualizar: async (p: { id: number; nome: string; perfil: string; ativo: boolean }) => {
    const { error } = await supabase.from('usuarios').update({ nome: p.nome, perfil: p.perfil, ativo: p.ativo ? 1 : 0 }).eq('id', p.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  definirPermissoesExtras: async (p: { usuario_id: number; extras: string[]; negadas: string[] }) => {
    const { error: apagarErro } = await supabase.from('usuario_permissoes_extras').delete().eq('usuario_id', p.usuario_id)
    if (apagarErro) throw new Error(apagarErro.message)
    const linhas = [...p.extras.map(chave => ({ usuario_id: p.usuario_id, chave, negada: 0 })), ...p.negadas.map(chave => ({ usuario_id: p.usuario_id, chave, negada: 1 }))]
    if (linhas.length) {
      const { error } = await supabase.from('usuario_permissoes_extras').insert(linhas)
      if (error) throw new Error(error.message)
    }
    return { ok: true }
  },

  definirObras: async (p: { usuario_id: number; empresa_ids: number[] }) => {
    const { error: apagarErro } = await supabase.from('usuario_obras').delete().eq('usuario_id', p.usuario_id)
    if (apagarErro) throw new Error(apagarErro.message)
    if (p.empresa_ids.length) {
      const { error } = await supabase.from('usuario_obras').insert(p.empresa_ids.map(empresa_id => ({ usuario_id: p.usuario_id, empresa_id })))
      if (error) throw new Error(error.message)
    }
    return { ok: true }
  },

  definirObrasSupervisor: async (p: { usuario_id: number; empresa_ids: number[] }) => {
    const { error: apagarErro } = await supabase.from('supervisor_obras').delete().eq('usuario_id', p.usuario_id)
    if (apagarErro) throw new Error(apagarErro.message)
    if (p.empresa_ids.length) {
      const { error } = await supabase.from('supervisor_obras').insert(p.empresa_ids.map(empresa_id => ({ usuario_id: p.usuario_id, empresa_id })))
      if (error) throw new Error(error.message)
    }
    return { ok: true }
  },

  remover: async (p: { id: number } | number) => {
    const id = typeof p === 'number' ? p : p.id
    const { data: usuario } = await supabase.from('usuarios').select('nome,email,empresa_id').eq('id', id).single()
    if (usuario) {
      await supabase.rpc('registrar_exclusao', {
        p_tabela: 'usuarios', p_registro_id: id,
        p_descricao: `Usuário - ${usuario.nome} (${usuario.email})`, p_empresa_id: usuario.empresa_id,
      })
    }
    return chamarAdminUsuarios({ acao: 'remover', id })
  },

  criar: async (p: { empresa_id: number; nome: string; email: string; senha: string; perfil: string }) => {
    const data = await chamarAdminUsuarios({ acao: 'criar', ...p })
    return { id: data.id }
  },

  // NOVO: usado pelo Master (lista de todos os usuários, de todas as
  // obras) — mesma lógica de usuarios.supabase.ipc.ts.
  listarTodos: async () => {
    const { data: usuariosRows, error } = await supabase
      .from('usuarios').select('id,empresa_id,nome,email,perfil,ativo,created_at,last_login_at,carimbo_url,empresas(nome)').order('nome')
    if (error) throw new Error(error.message)
    return Promise.all((usuariosRows ?? []).map(async (usuario: any) => {
      const [extras, supervisor, obras] = await Promise.all([
        supabase.from('usuario_permissoes_extras').select('chave,negada').eq('usuario_id', usuario.id),
        supabase.from('supervisor_obras').select('empresa_id').eq('usuario_id', usuario.id),
        supabase.from('usuario_obras').select('empresa_id').eq('usuario_id', usuario.id),
      ])
      for (const r of [extras, supervisor, obras]) if (r.error) throw new Error(r.error.message)
      const { empresas, ...resto } = usuario
      return {
        ...resto, empresa_nome: empresas?.nome ?? '—',
        permissoes_extras: (extras.data ?? []).filter((x: any) => !x.negada).map((x: any) => x.chave),
        permissoes_negadas: (extras.data ?? []).filter((x: any) => !!x.negada).map((x: any) => x.chave),
        obras_supervisor: (supervisor.data ?? []).map((x: any) => x.empresa_id),
        obras_extras: (obras.data ?? []).map((x: any) => x.empresa_id),
      }
    }))
  },
}

interface EmpresaCriarPayload {
  nome: string; titulo_obra?: string | null; razao_social?: string | null; cnpj: string | null
  email: string | null; telefone: string | null; endereco: string | null; cidade?: string | null
  estado?: string | null; logo_url?: string | null; solicitante_padrao?: string | null
  autorizado_por_padrao?: string | null; codigo_empresa?: string | null
}
function normalizarEmpresa(payload: EmpresaCriarPayload) {
  return {
    ...payload,
    titulo_obra: payload.titulo_obra ?? null, razao_social: payload.razao_social ?? null,
    cidade: payload.cidade ?? null, estado: payload.estado ?? null, logo_url: payload.logo_url ?? null,
    solicitante_padrao: payload.solicitante_padrao ?? null, autorizado_por_padrao: payload.autorizado_por_padrao ?? null,
    codigo_empresa: payload.codigo_empresa ?? null,
  }
}
// NOVO: usado em várias telas (Master, Configurações) — mesma lógica
// de empresas.supabase.ipc.ts.
const empresas = {
  listar: async () => {
    const { data, error } = await supabase.from('empresas').select('*').eq('ativo', 1).order('nome')
    if (error) throw new Error(error.message)
    return data ?? []
  },
  buscarPorId: async (id: number) => {
    const { data, error } = await supabase.from('empresas').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    return data
  },
  criar: async (payload: EmpresaCriarPayload) => {
    const { data, error } = await supabase.from('empresas').insert({ ...normalizarEmpresa(payload), ativo: 1 }).select('id').single()
    if (error) throw new Error(error.message)
    return { id: data.id }
  },
  atualizar: async (payload: EmpresaCriarPayload & { id: number }) => {
    const { id, ...dados } = payload
    const { error } = await supabase.from('empresas').update(normalizarEmpresa(dados)).eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },
  excluir: async (id: number) => {
    const { error } = await supabase.from('empresas').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },
}

// NOVO: a recuperação de senha na web usa o mecanismo NATIVO do
// Supabase Auth (link por e-mail), não o código de 6 dígitos do
// desktop (que só existe pro SQLite — ver aviso dado ao usuário).
// `solicitarRecuperacaoSenha` manda o link; a troca de senha de
// verdade acontece depois, quando a pessoa clica nele e cai numa
// tela própria (ver RecuperarSenhaWeb.tsx).
const auth = {
  logout: async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  solicitarRecuperacaoSenha: async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}${window.location.pathname}#/nova-senha`,
    })
    if (error) return { ok: false, erro: error.message }
    return { ok: true }
  },
}

// NOVO: versão web do app:*.ts — a maior parte não faz sentido num
// navegador (minimizar/maximizar janela, é o próprio SO que cuida
// disso numa aba) — funções que ficam sem efeito nenhum (no-op) só
// pra evitar erro caso alguma tela ainda chame elas sem checar antes.
const appApi = {
  getVersion: async () => 'web',
  getDatabaseProvider: async () => 'supabase',
  openExternal: async (url: string) => { window.open(url, '_blank') },
  minimize: async () => {},
  maximize: async () => {},
  close: async () => {},
  relaunch: async () => { window.location.reload() },
}

// NOVO: window.api.supabase.status() — o PrivateRoute usa isso pra
// saber se a sessão ainda está válida antes de liberar qualquer tela
// protegida. No desktop, isso pergunta pro processo principal (que
// pode estar em modo SQLite ou Supabase); na web é sempre Supabase,
// então só confere se existe uma sessão de autenticação ativa
// agora mesmo (não confia só no que está salvo no Zustand — o token
// pode ter expirado sem a pessoa ter feito nada).
const supabaseStatus = {
  status: async () => {
    const { data } = await supabase.auth.getSession()
    return { provider: 'supabase' as const, authenticated: !!data.session }
  },
}

// NOVO: usado pela Sidebar (selo de notificação de fatura vencendo)
// — mesma lógica de faturas.ipc.ts.
const faturasApi = {
  listar: async (empresaId: number) => {
    const { data, error } = await supabase.from('faturas').select('*').eq('empresa_id', empresaId).order('mes_competencia', { ascending: false })
    if (error) throw new Error(error.message)
    return data ?? []
  },
  statusAssinatura: async (empresaId: number) => {
    const { data, error } = await supabase.from('empresas').select('asaas_subscription_id').eq('id', empresaId).single()
    if (error) throw new Error(error.message)
    return { ativa: !!data.asaas_subscription_id }
  },
  ativarAssinatura: async (empresaId: number) => {
    const { data, error } = await supabase.functions.invoke('criar-assinatura-fatura', { body: { empresa_id: empresaId } })
    if (error) {
      const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null) as { error?: string } | null
      throw new Error(corpo?.error ?? error.message)
    }
    if (data?.error) throw new Error(data.error)
    return data
  },
}

// NOVO: usado pela Navbar (sino de notificações) — mesma lógica de
// notificacoes.ipc.ts (só a parte Supabase).
const notificacoesApi = {
  eventos: async (p: { empresa_id?: number; empresa_ids?: number[]; perfil: string }) => {
    let q = supabase.from('notificacoes_eventos').select('id,tipo,titulo,mensagem,referencia_id,created_at')
      .eq('destinatario_perfil', p.perfil).eq('lida', 0).order('created_at', { ascending: false })
    if (p.perfil !== 'setor_pessoal') {
      const ids = p.empresa_ids?.length ? p.empresa_ids : p.empresa_id ? [p.empresa_id] : []
      if (!ids.length) return []
      q = q.in('empresa_id', ids)
    }
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return data ?? []
  },
  marcarEventosComoLidos: async (p: { empresa_id?: number; empresa_ids?: number[]; perfil: string }) => {
    let q = supabase.from('notificacoes_eventos').update({ lida: 1 }).eq('destinatario_perfil', p.perfil).eq('lida', 0)
    if (p.perfil !== 'setor_pessoal') {
      const ids = p.empresa_ids?.length ? p.empresa_ids : p.empresa_id ? [p.empresa_id] : []
      if (!ids.length) return { ok: true }
      q = q.in('empresa_id', ids)
    }
    const { error } = await q
    if (error) throw new Error(error.message)
    return { ok: true }
  },
  estoqueMinimo: async (empresaId: number) => {
    const { data, error } = await supabase.from('produtos').select('id,codigo,nome,estoque_atual,unidade,estoque_minimo').eq('empresa_id', empresaId).gt('estoque_atual', 0).order('estoque_atual')
    if (error) throw new Error(error.message)
    return (data ?? []).filter(p => Number(p.estoque_atual) <= Number(p.estoque_minimo)).map(({ estoque_minimo, ...p }) => p)
  },
  estoqueZerado: async (empresaId: number) => {
    const { data, error } = await supabase.from('produtos').select('id,codigo,nome,estoque_atual,unidade').eq('empresa_id', empresaId).lte('estoque_atual', 0).order('nome')
    if (error) throw new Error(error.message)
    return data ?? []
  },
  faturas: async (empresaId: number) => {
    const hoje = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabase.from('faturas').select('id,mes_competencia,vencimento,valor').eq('empresa_id', empresaId).eq('status', 'aberta').order('vencimento')
    if (error) throw new Error(error.message)
    const todas = data ?? []
    return { vencidas: todas.filter(f => f.vencimento < hoje), venceHoje: todas.filter(f => f.vencimento === hoje) }
  },
  // NOVO: colaboradores com experiência vencendo nos próximos 5 dias
  // (ou vencendo hoje) — mesmo princípio de estoque mínimo/zerado,
  // calculado na hora, sem guardar nada.
  vencimentoExperiencia: async (empresaId: number) => {
    const hoje = new Date()
    const dataLimite = new Date(hoje); dataLimite.setDate(dataLimite.getDate() + 5)
    const hojeISO = hoje.toISOString().slice(0, 10)
    const limiteISO = dataLimite.toISOString().slice(0, 10)
    const { data, error } = await supabase.from('colaboradores')
      .select('id,nome,data_vencimento_experiencia')
      .eq('empresa_id', empresaId)
      .neq('status', 'desligado')
      .not('data_vencimento_experiencia', 'is', null)
      .gte('data_vencimento_experiencia', hojeISO)
      .lte('data_vencimento_experiencia', limiteISO)
      .order('data_vencimento_experiencia')
    if (error) throw new Error(error.message)
    return data ?? []
  },
}

// NOVO: usado pelo Dashboard (card de Custo de Salários) — mesma
// lógica de folhaPagamento.ipc.ts (só o pedaço necessário aqui, o
// resto do módulo vem depois, quando migrar a tela de Folha em si).
const CAMPOS_ITEM_FOLHA = ['h_premio', 'producao', 'vale_transporte', 'insalubridade', 'periculosidade', 'adc_noturno', 'he_50', 'he_80', 'he_100', 'he_110', 'atrasos', 'faltas', 'outros_eventos'] as const
function normalizarItemFolha(item: Record<string, unknown>): Record<string, unknown> {
  const norm = { ...item }
  for (const campo of CAMPOS_ITEM_FOLHA) {
    const v = norm[campo]
    norm[campo] = v === null || v === undefined || v === '' ? null : Number(v)
  }
  return norm
}

const folhaPagamentoApi = {
  buscarPorCompetencia: async (p: { empresa_id: number; mes_competencia: string }) => {
    const { data: folha, error: e1 } = await supabase.from('folhas_pagamento')
      .select('*').eq('empresa_id', p.empresa_id).eq('mes_competencia', p.mes_competencia).maybeSingle()
    if (e1) throw new Error(e1.message)
    if (!folha) return null

    const { data: itens, error: e2 } = await supabase.from('folhas_pagamento_itens')
      .select('*').eq('folha_id', folha.id).order('ordem')
    if (e2) throw new Error(e2.message)

    const ids = (itens ?? []).map(i => i.colaborador_id).filter((id): id is number => id !== null)
    let salarioPorId = new Map<number, number>()
    if (ids.length) {
      const { data: colaboradores, error: e3 } = await supabase.from('colaboradores').select('id,salario_base').in('id', ids)
      if (e3) throw new Error(e3.message)
      salarioPorId = new Map((colaboradores ?? []).map(c => [c.id, c.salario_base]))
    }

    return {
      ...folha,
      itens: (itens ?? []).map(i => ({ ...i, salario_base: i.colaborador_id ? salarioPorId.get(i.colaborador_id) ?? null : null })),
    }
  },

  // NOVO: completa o resto da tela de Folha de Pagamento — mesma
  // lógica de folhaPagamento.ipc.ts (só a parte Supabase).
  colaboradoresAtivos: async (empresaId: number) => {
    const { data, error } = await supabase.from('colaboradores').select('id,nome,matricula_esocial,cpf,salario_base').eq('empresa_id', empresaId).eq('status', 'ativo').order('nome')
    if (error) throw new Error(error.message)
    return data ?? []
  },

  listar: async (empresaId: number) => {
    const { data, error } = await supabase.from('folhas_pagamento').select('id,mes_competencia,criado_por,created_at').eq('empresa_id', empresaId).order('mes_competencia', { ascending: false })
    if (error) throw new Error(error.message)
    return data ?? []
  },

  buscarPorId: async (id: number) => {
    const [{ data: folha, error: e1 }, { data: itens, error: e2 }] = await Promise.all([
      supabase.from('folhas_pagamento').select('*').eq('id', id).maybeSingle(),
      supabase.from('folhas_pagamento_itens').select('*').eq('folha_id', id).order('ordem'),
    ])
    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)
    if (!folha) return null
    return { ...folha, itens: itens ?? [] }
  },

  criar: async (p: { empresa_id: number; mes_competencia: string; criado_por?: string | null; itens: Record<string, unknown>[] }) => {
    const { data: folha, error: e1 } = await supabase.from('folhas_pagamento')
      .insert({ empresa_id: p.empresa_id, mes_competencia: p.mes_competencia, criado_por: p.criado_por }).select('id').single()
    if (e1) throw new Error(e1.message)
    if (p.itens.length) {
      const linhas = p.itens.map((item, ordem) => ({ folha_id: folha.id, ordem, ...normalizarItemFolha(item) }))
      const { error: e2 } = await supabase.from('folhas_pagamento_itens').insert(linhas)
      if (e2) throw new Error(e2.message)
    }
    return { id: folha.id }
  },

  atualizar: async (p: { id: number; mes_competencia: string; itens: Record<string, unknown>[] }) => {
    const { error: e1 } = await supabase.from('folhas_pagamento').update({ mes_competencia: p.mes_competencia, updated_at: new Date().toISOString() }).eq('id', p.id)
    if (e1) throw new Error(e1.message)
    const { error: e2 } = await supabase.from('folhas_pagamento_itens').delete().eq('folha_id', p.id)
    if (e2) throw new Error(e2.message)
    if (p.itens.length) {
      const linhas = p.itens.map((item, ordem) => ({ folha_id: p.id, ordem, ...normalizarItemFolha(item) }))
      const { error: e3 } = await supabase.from('folhas_pagamento_itens').insert(linhas)
      if (e3) throw new Error(e3.message)
    }
    return { ok: true }
  },

  excluir: async (id: number) => {
    const { error } = await supabase.from('folhas_pagamento').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  // PENDENTE: exportarExcel (abre um modelo .xlsx específico
  // empacotado com o programa) e importarEspelhosPonto (extração de
  // PDF por posição, feita em Node) ainda não foram portados pra
  // web — precisam de mais trabalho (o modelo precisa virar um
  // arquivo público servido pelo site; a extração de PDF precisa
  // trocar pra versão de navegador do pdfjs). Avisar o usuário
  // quando ele testar essa tela.
}

// NOVO: usado pelo Dashboard (Últimos Lançamentos) — mesma lógica de
// lancamentos.ipc.ts (só o pedaço da listagem por enquanto).
const lancamentosApi = {
  listar: async (params: {
    empresa_id: number; mes?: number; ano?: number; dataInicio?: string; dataFim?: string
    tipo?: 'receita' | 'despesa'; status?: string; busca?: string; page?: number; perPage?: number
  }) => {
    const page = params.page ?? 1, perPage = params.perPage ?? 15
    let query = supabase.from('lancamentos')
      .select('id, descricao, valor, tipo, status, data, data_venc, observacao, categoria_id, conta_id', { count: 'exact' })
      .eq('empresa_id', params.empresa_id)
    if (params.dataInicio && params.dataFim) {
      query = query.gte('data', params.dataInicio).lte('data', params.dataFim)
    } else if (params.mes && params.ano) {
      const start = `${params.ano}-${String(params.mes).padStart(2, '0')}-01`
      const next = new Date(params.ano, params.mes, 1).toISOString().slice(0, 10)
      query = query.gte('data', start).lt('data', next)
    }
    if (params.tipo) query = query.eq('tipo', params.tipo)
    if (params.status === 'vencido') query = query.eq('status', 'pendente').lt('data_venc', new Date().toISOString().slice(0, 10))
    else if (params.status === 'a_vencer') query = query.eq('status', 'pendente').gte('data_venc', new Date().toISOString().slice(0, 10))
    else if (params.status) query = query.eq('status', params.status)
    if (params.busca) query = query.ilike('descricao', `%${params.busca.replace(/[%_]/g, '\\$&')}%`)

    const { data, error, count } = await query
      .order('data', { ascending: false }).order('id', { ascending: false })
      .range((page - 1) * perPage, page * perPage - 1)
    if (error) throw new Error(error.message)

    const categoryIds = [...new Set((data ?? []).map(row => row.categoria_id).filter(Boolean))]
    const accountIds = [...new Set((data ?? []).map(row => row.conta_id).filter(Boolean))]
    const [categories, accounts] = await Promise.all([
      categoryIds.length ? supabase.from('categorias').select('id,nome').in('id', categoryIds) : Promise.resolve({ data: [] as any[], error: null }),
      accountIds.length ? supabase.from('contas').select('id,nome').in('id', accountIds) : Promise.resolve({ data: [] as any[], error: null }),
    ])
    if (categories.error || accounts.error) throw new Error(categories.error?.message ?? accounts.error?.message)
    const cats = new Map(categories.data.map(row => [row.id, row.nome]))
    const contas = new Map(accounts.data.map(row => [row.id, row.nome]))
    const hojeISO = new Date().toISOString().slice(0, 10)
    return {
      total: count ?? 0,
      items: (data ?? []).map(row => ({
        ...row,
        categoria: cats.get(row.categoria_id) ?? null,
        conta: contas.get(row.conta_id) ?? null,
        situacao: row.status === 'pago' || row.status === 'cancelado' ? row.status : (row.data_venc && row.data_venc < hojeISO ? 'vencido' : 'a_vencer'),
      })),
    }
  },

  criar: async (p: {
    empresa_id: number; descricao: string; valor: number; tipo: 'receita' | 'despesa'; status: string
    data: string; data_venc: string | null; categoria_id: number; conta_id: number; observacao: string | null
  }) => {
    const { data, error } = await supabase.rpc('criar_lancamento', { p })
    if (error) throw new Error(error.message)
    return { id: data }
  },

  atualizar: async (p: {
    id: number; descricao: string; valor: number; tipo: 'receita' | 'despesa'; status: string
    data: string; data_venc: string | null; categoria_id: number; conta_id: number; observacao: string | null
  }) => {
    const { error } = await supabase.rpc('atualizar_lancamento', { p })
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  excluir: async (id: number) => {
    const { error } = await supabase.rpc('excluir_lancamento', { p_id: id })
    if (error) throw new Error(error.message)
    return { ok: true }
  },
}

// NOVO: usado pelo Dashboard/ResumoRHObra — mesma lógica de
// colaboradores.ipc.ts (só os dois pedaços necessários por enquanto;
// o resto do módulo — criar, editar, gerar documento — vem depois,
// quando migrar a tela de Colaboradores em si).
const colaboradoresApi = {
  listar: async (p: {
    empresa_id: number; funcao?: string; setor?: string; equipe?: string; status?: string
    busca?: string; page?: number; perPage?: number
  }) => {
    const page = p.page ?? 1, perPage = p.perPage ?? 50
    let query = supabase.from('colaboradores').select('*', { count: 'exact' })
      .eq('empresa_id', p.empresa_id).order('nome').range((page - 1) * perPage, page * perPage - 1)
    if (p.funcao) query = query.eq('funcao', p.funcao)
    if (p.setor)  query = query.eq('setor', p.setor)
    if (p.equipe) query = query.eq('equipe', p.equipe)
    if (p.status) query = query.eq('status', p.status)
    if (p.busca)  query = query.ilike('nome', `%${p.busca.replace(/[%_]/g, '\\$&')}%`)
    const { data, error, count } = await query
    if (error) throw new Error(error.message)
    return { items: data ?? [], total: count ?? 0 }
  },

  resumoRH: async (p: number | { empresa_id: number; mes?: number }) => {
    const empresaId = typeof p === 'number' ? p : p.empresa_id
    const mesFiltro  = typeof p === 'number' ? undefined : p.mes

    const { data, error } = await supabase.from('colaboradores')
      .select('nome, funcao, nascimento, salario_base, status').eq('empresa_id', empresaId)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    const ativos = rows.filter(row => row.status === 'ativo')
    const porFuncao = new Map<string, { quantidade: number; custo_salarial: number }>()
    const porStatus = new Map<string, number>()
    for (const row of rows) {
      porStatus.set(row.status ?? 'sem_status', (porStatus.get(row.status ?? 'sem_status') ?? 0) + 1)
      if (row.status === 'ativo' && row.funcao) {
        const atual = porFuncao.get(row.funcao) ?? { quantidade: 0, custo_salarial: 0 }
        atual.quantidade += 1; atual.custo_salarial += Number(row.salario_base ?? 0); porFuncao.set(row.funcao, atual)
      }
    }
    const hoje = new Date()
    const idades = ativos.filter(row => row.nascimento).map(row => (hoje.getTime() - new Date(`${row.nascimento}T00:00:00`).getTime()) / 31557600000)
    const mesBusca = String(mesFiltro ?? hoje.getMonth() + 1).padStart(2, '0')
    return {
      totalAtivos: ativos.length,
      custoFolha: ativos.reduce((total, row) => total + Number(row.salario_base ?? 0), 0),
      mediaIdade: idades.length ? Math.round(idades.reduce((a, b) => a + b, 0) / idades.length) : null,
      porFuncao: [...porFuncao].map(([funcao, dados]) => ({ funcao, ...dados })).sort((a, b) => b.quantidade - a.quantidade),
      porStatus: [...porStatus].map(([status, quantidade]) => ({ status, quantidade })),
      aniversariantes: ativos.filter(row => row.nascimento?.slice(5, 7) === mesBusca)
        .sort((a, b) => (a.nascimento ?? '').slice(8, 10).localeCompare((b.nascimento ?? '').slice(8, 10)))
        .map(row => ({ nome: row.nome, funcao: row.funcao, nascimento: row.nascimento })),
    }
  },

  buscarPorId: async (id: number) => {
    const { data, error } = await supabase.from('colaboradores').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    return data ?? null
  },

  excluir: async (id: number) => {
    const { data: colaborador } = await supabase.from('colaboradores').select('nome,cpf,empresa_id').eq('id', id).single()
    if (colaborador) {
      await supabase.rpc('registrar_exclusao', {
        p_tabela: 'colaboradores', p_registro_id: id,
        p_descricao: `Colaborador - ${colaborador.nome}${colaborador.cpf ? ` (CPF ${colaborador.cpf})` : ''}`,
        p_empresa_id: colaborador.empresa_id,
      })
    }
    const { error } = await supabase.from('colaboradores').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  opcoesFiltro: async (empresaId: number) => {
    const distintos = async (campo: 'funcao' | 'setor' | 'equipe') => {
      const { data, error } = await supabase.from('colaboradores').select(campo).eq('empresa_id', empresaId).not(campo, 'is', null)
      if (error) throw new Error(error.message)
      const linhas = (data ?? []) as unknown as Record<string, string>[]
      const valores = new Set(linhas.map(r => r[campo]).filter(v => v && v !== ''))
      return [...valores].sort()
    }
    const [funcoes, setores, equipes] = await Promise.all([distintos('funcao'), distintos('setor'), distintos('equipe')])
    return { funcoes, setores, equipes }
  },

  // NOVO: usado em modais que só precisam de nome/CPF/função pra um
  // seletor (ex: Acordo de Compensação) — mesma lógica de
  // colaboradores.ipc.ts.
  listarResumo: async (empresaId: number) => {
    const { data, error } = await supabase.from('colaboradores').select('id,nome,cpf,funcao').eq('empresa_id', empresaId).neq('status', 'desligado').order('nome')
    if (error) throw new Error(error.message)
    return data ?? []
  },

  // NOVO: usado pelo ColaboradorModal (aba de anexos) — mesma lógica
  // de colaboradores.ipc.ts. Só a listagem por enquanto — anexar/
  // excluir arquivo precisa do mesmo tratamento de seletor de
  // arquivo do navegador que já fiz na importação por planilha,
  // ainda não fiz pra esse caso específico.
  listarAnexos: async (colaboradorId: number) => {
    const { data, error } = await supabase.from('colaboradores_anexos').select('*').eq('colaborador_id', colaboradorId).order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data ?? []
  },

  // NOVO: completa o CRUD (antes só tinha listar/buscarPorId/excluir).
  criar: async (p: Record<string, unknown> & { empresa_id: number; nome: string }) => {
    const dados = { ...p, pcd: p.pcd ? 1 : 0, alojado: p.alojado ? 1 : 0, tem_baixada: p.tem_baixada ? 1 : 0 }
    const { data, error } = await supabase.from('colaboradores').insert(dados).select('id').single()
    if (error) throw new Error(error.message)
    return { id: data.id }
  },

  atualizar: async (p: Record<string, unknown> & { id: number }) => {
    const { id, ...resto } = p
    const dados = { ...resto, pcd: resto.pcd ? 1 : 0, alojado: resto.alojado ? 1 : 0, tem_baixada: resto.tem_baixada ? 1 : 0 }
    const { error } = await supabase.from('colaboradores').update(dados).eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  historicoDocumentos: async (colaboradorId: number) => {
    const { data, error } = await supabase.from('colaborador_documentos').select('id,tipo,created_at').eq('colaborador_id', colaboradorId).order('created_at', { ascending: false }).limit(20)
    if (error) throw new Error(error.message)
    return data ?? []
  },

  registrarDocumento: async (p: { colaborador_id: number; empresa_id: number; tipo: string; dados_json: string }) => {
    const { error } = await supabase.from('colaborador_documentos').insert(p)
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  // NOVO: aceita File (arquivo do navegador) em vez de caminho local.
  adicionarAnexo: async (p: { colaborador_id: number; arquivo: File; descricao?: string | null }) => {
    const { data: c, error: ce } = await supabase.from('colaboradores').select('empresa_id').eq('id', p.colaborador_id).single()
    if (ce) throw new Error(ce.message)
    const remoto = `${c.empresa_id}/${p.colaborador_id}/${Date.now()}-${p.arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error: e1 } = await supabase.storage.from('documentos-rh').upload(remoto, p.arquivo)
    if (e1) throw new Error(e1.message)
    const { data, error } = await supabase.from('colaboradores_anexos').insert({ colaborador_id: p.colaborador_id, caminho: `supabase://${remoto}`, nome: p.arquivo.name, descricao: p.descricao ?? null }).select('id').single()
    if (error) throw new Error(error.message)
    return { id: data.id }
  },

  removerAnexo: async (id: number) => {
    const { data, error } = await supabase.from('colaboradores_anexos').select('caminho').eq('id', id).single()
    if (error) throw new Error(error.message)
    if (data.caminho.startsWith('supabase://')) {
      await supabase.storage.from('documentos-rh').remove([data.caminho.replace('supabase://', '')])
    }
    const r = await supabase.from('colaboradores_anexos').delete().eq('id', id)
    if (r.error) throw new Error(r.error.message)
    return { ok: true }
  },
}

// NOVO: usado pelo ColaboradorModal (dropdowns de Função/Setor/
// Equipe) — SUPOSIÇÃO, não tenho o opcoes.ipc.ts original ainda.
// Assumi uma tabela "opcoes" com empresa_id/tipo/valor — se algo não
// bater, é só colar o handler real (mesmo formato que você já colou
// pro colaboradores.listarAnexos) que eu ajusto.
// CORRIGIDO: minha suposição anterior estava errada (tabela "opcoes"
// com coluna "valor") — a tabela real é opcoes_colaborador, com
// coluna "nome" e soft-delete via "ativo". Corrigido pra bater com
// opcoes.ipc.ts de verdade, e completado o CRUD (antes só tinha
// listar).
const opcoesApi = {
  listar: async (p: { empresa_id: number; tipo: 'funcao' | 'setor' | 'equipe' }) => {
    const { data, error } = await supabase.from('opcoes_colaborador').select('*').eq('empresa_id', p.empresa_id).eq('tipo', p.tipo).eq('ativo', 1).order('nome')
    if (error) throw new Error(error.message)
    return data ?? []
  },
  criar: async (p: { empresa_id: number; tipo: 'funcao' | 'setor' | 'equipe'; nome: string }) => {
    const nome = p.nome.trim()
    const { data: existente, error: e1 } = await supabase.from('opcoes_colaborador').select('id').eq('empresa_id', p.empresa_id).eq('tipo', p.tipo).eq('nome', nome).maybeSingle()
    if (e1) throw new Error(e1.message)
    if (existente) throw new Error('Já existe um item com esse nome.')
    const { data, error } = await supabase.from('opcoes_colaborador').insert({ ...p, nome }).select('id').single()
    if (error) throw new Error(error.message)
    return { id: data.id, nome }
  },
  atualizar: async (p: { id: number; nome: string }) => {
    const { error } = await supabase.from('opcoes_colaborador').update({ nome: p.nome.trim() }).eq('id', p.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },
  excluir: async (id: number) => {
    const { error } = await supabase.from('opcoes_colaborador').update({ ativo: 0 }).eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },
}

// ── Importação de Colaboradores por planilha ─────────────────
// NOVO: mesma lógica de importacao.ipc.ts (campos, conversão de
// linha, cálculo de vencimento de experiência, casamento por CPF),
// só trocando a ENTRADA/SAÍDA de arquivo: o desktop usa diálogo
// nativo do Windows pra escolher/salvar arquivo — no navegador isso
// vira um seletor de arquivo (<input type="file">, disparado
// escondido) e um download comum, mas o resto (o que acontece com os
// dados) é idêntico.

const CAMPOS_IMPORTACAO: { rotulo: string; campo: string; tipo?: 'data' | 'numero' | 'booleano' | 'cpf' }[] = [
  { rotulo: 'Nome completo',                    campo: 'nome' },
  { rotulo: 'Código (matrícula e-Social)',      campo: 'matricula_esocial' },
  { rotulo: 'CPF',                              campo: 'cpf', tipo: 'cpf' },
  { rotulo: 'RG',                               campo: 'rg' },
  { rotulo: 'RG - Órgão emissor',               campo: 'rg_orgao_emissor' },
  { rotulo: 'Data de nascimento (AAAA-MM-DD)',  campo: 'nascimento', tipo: 'data' },
  { rotulo: 'Estado civil',                     campo: 'estado_civil' },
  { rotulo: 'Nacionalidade',                    campo: 'nacionalidade' },
  { rotulo: 'Nome da mãe',                      campo: 'nome_mae' },
  { rotulo: 'Nome do pai',                      campo: 'nome_pai' },
  { rotulo: 'Escolaridade',                     campo: 'escolaridade' },
  { rotulo: 'PCD (Sim/Não)',                    campo: 'pcd', tipo: 'booleano' },
  { rotulo: 'Cor/Raça',                         campo: 'cor_raca' },
  { rotulo: 'Função',                           campo: 'funcao' },
  { rotulo: 'Setor',                            campo: 'setor' },
  { rotulo: 'Equipe',                           campo: 'equipe' },
  { rotulo: 'Tipo de contrato',                 campo: 'tipo_contrato' },
  { rotulo: 'Data de admissão (AAAA-MM-DD)',    campo: 'data_admissao', tipo: 'data' },
  { rotulo: 'Dias de experiência',              campo: 'dias_experiencia', tipo: 'numero' },
  { rotulo: 'Data de demissão (AAAA-MM-DD)',    campo: 'data_demissao', tipo: 'data' },
  { rotulo: 'Tipo de demissão',                 campo: 'tipo_demissao' },
  { rotulo: 'Salário base',                     campo: 'salario_base', tipo: 'numero' },
  { rotulo: 'Status (ativo/afastado/ferias/desligado)', campo: 'status' },
  { rotulo: 'CTPS',                             campo: 'ctps' },
  { rotulo: 'CTPS - Série',                     campo: 'ctps_serie' },
  { rotulo: 'PIS',                              campo: 'pis' },
  { rotulo: 'Telefone',                         campo: 'telefone' },
  { rotulo: 'E-mail',                           campo: 'email' },
  { rotulo: 'Contato de emergência - Nome',     campo: 'contato_emergencia_nome' },
  { rotulo: 'Contato de emergência - Telefone', campo: 'contato_emergencia_telefone' },
  { rotulo: 'Endereço',                         campo: 'endereco' },
  { rotulo: 'Número',                           campo: 'numero' },
  { rotulo: 'Bairro',                           campo: 'bairro' },
  { rotulo: 'Cidade',                           campo: 'cidade' },
  { rotulo: 'UF',                               campo: 'estado' },
  { rotulo: 'CEP',                              campo: 'cep' },
  { rotulo: 'Banco',                            campo: 'banco' },
  { rotulo: 'Agência',                          campo: 'agencia' },
  { rotulo: 'Operação',                         campo: 'operacao' },
  { rotulo: 'Conta',                            campo: 'conta' },
  { rotulo: 'Dígito',                           campo: 'conta_digito' },
  { rotulo: 'Tipo de conta (corrente/poupanca)',campo: 'tipo_conta' },
  { rotulo: 'Passagem (Sim/Não)',                campo: 'passagem' },
  { rotulo: 'Valor ida e volta',                campo: 'valor_ida_volta', tipo: 'numero' },
  { rotulo: 'Alimentação',                      campo: 'alimentacao', tipo: 'numero' },
  { rotulo: 'Tamanho da camisa',                campo: 'tamanho_camisa' },
  { rotulo: 'Tamanho da calça',                 campo: 'tamanho_calca' },
  { rotulo: 'Número do calçado',                campo: 'numero_calcado' },
  { rotulo: 'Título de eleitor - Número',       campo: 'titulo_numero' },
  { rotulo: 'Título de eleitor - Zona',         campo: 'titulo_zona' },
  { rotulo: 'Título de eleitor - Seção',        campo: 'titulo_secao' },
  { rotulo: 'Reservista',                       campo: 'reservista' },
  { rotulo: 'CNH - Número',                     campo: 'cnh_numero' },
  { rotulo: 'CNH - Categoria',                  campo: 'cnh_categoria' },
  { rotulo: 'CNH - Vencimento (AAAA-MM-DD)',    campo: 'cnh_vencimento', tipo: 'data' },
  { rotulo: 'Alojado (Sim/Não)',                campo: 'alojado', tipo: 'booleano' },
  { rotulo: 'Tem baixada (Sim/Não)',            campo: 'tem_baixada', tipo: 'booleano' },
  { rotulo: 'Observações',                      campo: 'observacoes' },
]

function formatarCpf(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length !== 11) return valor.trim()
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

function calcularVencimentoExperiencia(dataAdmissao: string, diasExperiencia: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(dataAdmissao)) return null
  const d = new Date(`${dataAdmissao}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + diasExperiencia - 1)
  return d.toISOString().slice(0, 10)
}

function converterLinhaColaborador(linha: Record<string, unknown>): Record<string, unknown> {
  const dados: Record<string, unknown> = {}
  for (const { rotulo, campo, tipo } of CAMPOS_IMPORTACAO) {
    const bruto = linha[rotulo]
    if (bruto === undefined || bruto === null || String(bruto).trim() === '') continue

    if (tipo === 'booleano') {
      const v = String(bruto).trim().toLowerCase()
      dados[campo] = v === 'sim' || v === '1' || v === 'true' ? 1 : 0
    } else if (tipo === 'cpf') {
      dados[campo] = formatarCpf(String(bruto))
    } else if (tipo === 'numero') {
      const n = Number(String(bruto).replace(',', '.'))
      if (!Number.isNaN(n)) dados[campo] = n
    } else if (tipo === 'data') {
      if (bruto instanceof Date) {
        dados[campo] = bruto.toISOString().slice(0, 10)
      } else if (typeof bruto === 'number') {
        const data = new Date(Math.round((bruto - 25569) * 86400 * 1000))
        dados[campo] = Number.isNaN(data.getTime()) ? '' : data.toISOString().slice(0, 10)
      } else {
        const texto = String(bruto).trim()
        const br = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(texto)
        if (br) {
          const [, dia, mes, ano] = br
          dados[campo] = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
        } else {
          dados[campo] = texto
        }
      }
    } else {
      dados[campo] = String(bruto).trim()
    }
  }
  return dados
}

// Abre o seletor de arquivo do navegador (equivalente ao
// dialog.showOpenDialog do Electron) — resolve com o arquivo
// escolhido, ou null se a pessoa cancelar sem escolher nada.
function selecionarArquivoNoNavegador(aceita: string): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = aceita
    input.style.display = 'none'
    input.onchange = () => { resolve(input.files?.[0] ?? null); input.remove() }
    document.body.appendChild(input)
    input.click()
  })
}

const importacaoApi = {
  gerarModeloColaboradores: async () => {
    const XLSX = await import('xlsx')
    const cabecalho = CAMPOS_IMPORTACAO.map(c => c.rotulo)
    const linhaExemplo = CAMPOS_IMPORTACAO.map(c => {
      if (c.campo === 'nome') return 'JOÃO DA SILVA (exemplo — apague esta linha)'
      if (c.campo === 'cpf') return '000.000.000-00'
      return ''
    })
    const ws = XLSX.utils.aoa_to_sheet([cabecalho, linhaExemplo])
    ws['!cols'] = cabecalho.map(h => ({ wch: Math.max(18, h.length) }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Colaboradores')
    const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer

    const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'Modelo_Importacao_Colaboradores.xlsx'
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
    return { ok: true }
  },

  importarColaboradores: async (p: { empresa_id: number }) => {
    const arquivo = await selecionarArquivoNoNavegador('.xlsx,.xls')
    if (!arquivo) return { ok: false, canceled: true }

    const XLSX = await import('xlsx')
    const buffer = await arquivo.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

    let criados = 0, atualizados = 0, ignorados = 0

    const { data: existentesRows, error } = await supabase.from('colaboradores')
      .select('id,cpf,data_admissao').eq('empresa_id', p.empresa_id)
    if (error) throw new Error(error.message)
    const porCpf = new Map((existentesRows ?? []).filter(r => r.cpf).map(r => [r.cpf as string, r]))

    for (const linha of linhas) {
      const dados = converterLinhaColaborador(linha)
      if (!dados.nome) { ignorados++; continue }

      const existente = typeof dados.cpf === 'string' ? porCpf.get(dados.cpf) : undefined

      if (dados.dias_experiencia !== undefined) {
        const admissaoParaCalculo = typeof dados.data_admissao === 'string'
          ? dados.data_admissao : existente?.data_admissao ?? undefined
        if (admissaoParaCalculo) {
          const vencimento = calcularVencimentoExperiencia(admissaoParaCalculo, Number(dados.dias_experiencia))
          if (vencimento) dados.data_vencimento_experiencia = vencimento
        }
      }

      if (existente) {
        const { error: e2 } = await supabase.from('colaboradores').update(dados).eq('id', existente.id)
        if (e2) throw new Error(e2.message)
        atualizados++
      } else {
        const { error: e2 } = await supabase.from('colaboradores').insert({ ...dados, empresa_id: p.empresa_id })
        if (e2) throw new Error(e2.message)
        criados++
      }
    }

    return { ok: true, criados, atualizados, ignorados, total: linhas.length }
  },

  // NOVO: importação de Produtos/Materiais do Almoxarifado — mesmo
  // padrão da de colaboradores (seletor de arquivo e download do
  // navegador, em vez de diálogo nativo). Mesma lógica de
  // importacao.ipc.ts.
  gerarModeloProdutos: async () => {
    const XLSX = await import('xlsx')
    const campos: { rotulo: string; campo: string }[] = [
      { rotulo: 'Nome', campo: 'nome' }, { rotulo: 'Descrição', campo: 'descricao' },
      { rotulo: 'Unidade', campo: 'unidade' }, { rotulo: 'Estoque atual', campo: 'estoque_atual' },
      { rotulo: 'Estoque mínimo', campo: 'estoque_minimo' }, { rotulo: 'Valor unitário', campo: 'valor_unitario' },
      { rotulo: 'Fornecedor (nome já cadastrado)', campo: 'fornecedor_nome' },
      { rotulo: 'Alugado (Sim/Não)', campo: 'alugado' }, { rotulo: 'Valor do aluguel', campo: 'valor_aluguel' },
      { rotulo: 'Período do aluguel', campo: 'aluguel_periodo' }, { rotulo: 'Vencimento do aluguel (AAAA-MM-DD)', campo: 'aluguel_vencimento' },
    ]
    const cabecalho = campos.map(c => c.rotulo)
    const linhaExemplo = campos.map(c => {
      if (c.campo === 'nome') return 'CAPACETE DE SEGURANÇA (exemplo — apague esta linha)'
      if (c.campo === 'unidade') return 'UN'
      if (c.campo === 'alugado') return 'Não'
      return ''
    })
    const ws = XLSX.utils.aoa_to_sheet([cabecalho, linhaExemplo])
    ws['!cols'] = cabecalho.map(h => ({ wch: Math.max(18, h.length) }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos')
    const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'Modelo_Importacao_Produtos.xlsx'
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
    return { ok: true }
  },

  importarProdutos: async (p: { empresa_id: number }) => {
    const arquivo = await selecionarArquivoNoNavegador('.xlsx,.xls')
    if (!arquivo) return { ok: false, canceled: true }

    const XLSX = await import('xlsx')
    const buffer = await arquivo.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

    const campos: { rotulo: string; campo: string; tipo?: 'numero' | 'booleano' | 'data' }[] = [
      { rotulo: 'Nome', campo: 'nome' }, { rotulo: 'Descrição', campo: 'descricao' },
      { rotulo: 'Unidade', campo: 'unidade' }, { rotulo: 'Estoque atual', campo: 'estoque_atual', tipo: 'numero' },
      { rotulo: 'Estoque mínimo', campo: 'estoque_minimo', tipo: 'numero' }, { rotulo: 'Valor unitário', campo: 'valor_unitario', tipo: 'numero' },
      { rotulo: 'Fornecedor (nome já cadastrado)', campo: 'fornecedor_nome' },
      { rotulo: 'Alugado (Sim/Não)', campo: 'alugado', tipo: 'booleano' }, { rotulo: 'Valor do aluguel', campo: 'valor_aluguel', tipo: 'numero' },
      { rotulo: 'Período do aluguel', campo: 'aluguel_periodo' }, { rotulo: 'Vencimento do aluguel (AAAA-MM-DD)', campo: 'aluguel_vencimento', tipo: 'data' },
    ]
    function converterLinha(linha: Record<string, unknown>): Record<string, unknown> {
      const dados: Record<string, unknown> = {}
      for (const { rotulo, campo, tipo } of campos) {
        const bruto = linha[rotulo]
        if (bruto === undefined || bruto === null || String(bruto).trim() === '') continue
        if (tipo === 'booleano') {
          const v = String(bruto).trim().toLowerCase()
          dados[campo] = v === 'sim' || v === '1' || v === 'true' ? 1 : 0
        } else if (tipo === 'numero') {
          const n = Number(String(bruto).replace(',', '.'))
          if (!Number.isNaN(n)) dados[campo] = n
        } else if (tipo === 'data') {
          if (bruto instanceof Date) dados[campo] = bruto.toISOString().slice(0, 10)
          else {
            const texto = String(bruto).trim()
            const br = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(texto)
            dados[campo] = br ? `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}` : texto
          }
        } else {
          dados[campo] = String(bruto).trim()
        }
      }
      return dados
    }

    let criados = 0, atualizados = 0, ignorados = 0
    const [{ data: existentesRows, error: e1 }, { data: fornecedoresRows, error: e2 }, { data: produtosAtuais, error: e3 }] = await Promise.all([
      supabase.from('produtos').select('id,nome').eq('empresa_id', p.empresa_id),
      supabase.from('fornecedores').select('id,nome').eq('empresa_id', p.empresa_id),
      supabase.from('produtos').select('codigo').eq('empresa_id', p.empresa_id),
    ])
    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)
    if (e3) throw new Error(e3.message)

    const porNome = new Map((existentesRows ?? []).map(r => [r.nome.toUpperCase(), r.id]))
    const fornecedorPorNome = new Map((fornecedoresRows ?? []).map(f => [f.nome.toUpperCase(), f.id]))
    let proximoCodigo = Math.max(0, ...(produtosAtuais ?? []).map(pr => Number(pr.codigo.replace(/\D/g, '')) || 0)) + 1

    for (const linha of linhas) {
      const dados = converterLinha(linha)
      if (!dados.nome) { ignorados++; continue }

      if (dados.fornecedor_nome) {
        const idFornecedor = fornecedorPorNome.get(String(dados.fornecedor_nome).toUpperCase())
        dados.fornecedor_id = idFornecedor ?? null
      }
      delete dados.fornecedor_nome

      const existenteId = porNome.get(String(dados.nome).toUpperCase())
      if (existenteId) {
        const { error } = await supabase.from('produtos').update(dados).eq('id', existenteId)
        if (error) throw new Error(error.message)
        atualizados++
      } else {
        const codigo = String(proximoCodigo++).padStart(3, '0')
        const { error } = await supabase.from('produtos').insert({ ...dados, empresa_id: p.empresa_id, codigo })
        if (error) throw new Error(error.message)
        criados++
      }
    }

    return { ok: true, criados, atualizados, ignorados, total: linhas.length }
  },
}

// NOVO: usado pela busca global da Navbar — mesma lógica de
// produtos.ipc.ts / fornecedores.ipc.ts (só a listagem por
// enquanto).
// NOVO: usado no módulo de Almoxarifado (Estoque, cadastro de
// material/ferramenta, relatórios) — mesma lógica de produtos.ipc.ts.
interface ProdutoPayload {
  empresa_id: number; codigo: string; nome: string; descricao?: string | null; unidade?: string | null
  categoria?: string | null; estoque_atual?: number; estoque_minimo?: number; valor_unitario?: number
  fornecedor_id?: number | null; alugado?: boolean; valor_aluguel?: number | null
  aluguel_periodo?: string | null; aluguel_vencimento?: string | null
}
function normalizarProduto(p: ProdutoPayload) {
  return {
    ...p, descricao: p.descricao ?? null, unidade: p.unidade ?? null, categoria: p.categoria ?? null,
    estoque_atual: p.estoque_atual ?? 0, estoque_minimo: p.estoque_minimo ?? 0, valor_unitario: p.valor_unitario ?? 0,
    fornecedor_id: p.fornecedor_id ?? null, alugado: p.alugado ? 1 : 0,
    valor_aluguel: p.alugado ? p.valor_aluguel ?? null : null,
    aluguel_periodo: p.alugado ? p.aluguel_periodo ?? null : null,
    aluguel_vencimento: p.alugado ? p.aluguel_vencimento ?? null : null,
  }
}
const produtosApi = {
  listar: async (p: { empresa_id: number; busca?: string; categoria?: string }) => {
    let query = supabase.from('produtos').select('*').eq('empresa_id', p.empresa_id).order('nome')
    if (p.busca) query = query.ilike('nome', `%${p.busca.replace(/[%_]/g, '\\$&')}%`)
    if (p.categoria) query = query.eq('categoria', p.categoria)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return data ?? []
  },

  categorias: async (empresaId: number) => {
    const { data, error } = await supabase.from('produtos').select('categoria').eq('empresa_id', empresaId).not('categoria', 'is', null)
    if (error) throw new Error(error.message)
    return [...new Set((data ?? []).map(r => r.categoria).filter((v): v is string => !!v && v !== ''))].sort()
  },

  buscarPorCodigo: async (p: { empresa_id: number; codigo: string }) => {
    const { data, error } = await supabase.from('produtos').select('*').eq('empresa_id', p.empresa_id).eq('codigo', p.codigo).maybeSingle()
    if (error) throw new Error(error.message)
    return data ?? null
  },

  buscarPorId: async (id: number) => {
    const { data, error } = await supabase.from('produtos').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    return data ?? null
  },

  resumo: async (empresaId: number) => {
    const { data, error } = await supabase.from('produtos').select('id,codigo,nome,estoque_atual,estoque_minimo,unidade,valor_unitario').eq('empresa_id', empresaId)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    return {
      zerados: rows.filter(x => Number(x.estoque_atual) <= 0).sort((a, b) => a.nome.localeCompare(b.nome)),
      acabando: rows.filter(x => Number(x.estoque_atual) > 0 && Number(x.estoque_atual) <= Number(x.estoque_minimo)).sort((a, b) => Number(a.estoque_atual) - Number(b.estoque_atual)),
      valorTotal: rows.reduce((s, x) => s + Number(x.estoque_atual) * Number(x.valor_unitario), 0),
    }
  },

  listarComMovimentacao: async (p: { empresa_id: number; dataInicio?: string; dataFim?: string }) => {
    const [{ data: produtos, error: e1 }, { data: itens, error: e2 }, { data: itensSaida, error: e3 }] = await Promise.all([
      supabase.from('produtos').select('id,codigo,nome,descricao,unidade,estoque_atual').eq('empresa_id', p.empresa_id).order('nome'),
      supabase.from('almoxarifado_entradas_itens').select('produto_id,almoxarifado_entradas(data)').eq('almoxarifado_entradas.empresa_id', p.empresa_id),
      supabase.from('almoxarifado_saidas_itens').select('produto_id,almoxarifado_saidas(data,empresa_id)'),
    ])
    for (const e of [e1, e2, e3]) if (e) throw new Error(e.message)
    const dentro = (d: string) => !p.dataInicio || !p.dataFim || (d >= p.dataInicio && d <= p.dataFim)
    const saidasDaObra = (itensSaida ?? []).filter((x: any) => x.almoxarifado_saidas?.empresa_id === p.empresa_id)
    return (produtos ?? []).map(pr => ({
      ...pr,
      ultima_entrada: (itens ?? []).filter((i: any) => i.produto_id === pr.id && i.almoxarifado_entradas?.data && dentro(i.almoxarifado_entradas.data)).map((i: any) => i.almoxarifado_entradas.data).sort().at(-1) ?? null,
      ultima_saida: saidasDaObra.filter((x: any) => x.produto_id === pr.id && x.almoxarifado_saidas?.data && dentro(x.almoxarifado_saidas.data)).map((x: any) => x.almoxarifado_saidas.data).sort().at(-1) ?? null,
    }))
  },

  movimentacao: async (p: { produto_id: number; dataInicio?: string; dataFim?: string }) => {
    const [{ data: itens, error: e1 }, { data: itensSaida, error: e2 }] = await Promise.all([
      supabase.from('almoxarifado_entradas_itens').select('quantidade,entrada_id,almoxarifado_entradas(data,fornecedor_nome,numero_nota)').eq('produto_id', p.produto_id),
      supabase.from('almoxarifado_saidas_itens').select('quantidade,saida_id,almoxarifado_saidas(data,retirado_por_nome,setor)').eq('produto_id', p.produto_id),
    ])
    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)
    const dentro = (d: string) => !p.dataInicio || !p.dataFim || (d >= p.dataInicio! && d <= p.dataFim!)
    return [
      ...(itens ?? []).map((i: any) => ({ tipo: 'entrada', data: i.almoxarifado_entradas?.data, quantidade: i.quantidade, pessoa: i.almoxarifado_entradas?.fornecedor_nome, referencia: i.almoxarifado_entradas?.numero_nota })),
      ...(itensSaida ?? []).map((x: any) => ({ tipo: 'saida', data: x.almoxarifado_saidas?.data, quantidade: x.quantidade, pessoa: x.almoxarifado_saidas?.retirado_por_nome, referencia: x.almoxarifado_saidas?.setor })),
    ].filter(x => x.data && dentro(x.data)).sort((a, b) => b.data.localeCompare(a.data))
  },

  porFaixaEstoque: async (p: { empresa_id: number; min: number; max: number }) => {
    const { data, error } = await supabase.from('produtos').select('codigo,nome,unidade,estoque_atual,valor_unitario').eq('empresa_id', p.empresa_id).gte('estoque_atual', p.min).lte('estoque_atual', p.max).order('estoque_atual')
    if (error) throw new Error(error.message)
    return data ?? []
  },

  proximoCodigo: async (empresaId: number) => {
    const { data, error } = await supabase.from('produtos').select('codigo').eq('empresa_id', empresaId)
    if (error) throw new Error(error.message)
    const maior = Math.max(0, ...(data ?? []).map(p => Number(p.codigo.replace(/\D/g, '')) || 0))
    return { codigo: String(maior + 1).padStart(3, '0') }
  },

  criar: async (p: ProdutoPayload) => {
    const { data, error } = await supabase.from('produtos').insert(normalizarProduto(p)).select('id').single()
    if (error) throw new Error(error.message)
    return { id: data.id }
  },

  atualizar: async (p: ProdutoPayload & { id: number }) => {
    const { id, ...dados } = p
    const { error } = await supabase.from('produtos').update(normalizarProduto(dados as ProdutoPayload)).eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  alugados: async (p: { empresa_id: number; vencimentoInicio?: string; vencimentoFim?: string }) => {
    let q = supabase.from('produtos').select('codigo,nome,unidade,valor_aluguel,aluguel_periodo,aluguel_vencimento,fornecedor_id').eq('empresa_id', p.empresa_id).eq('alugado', 1).order('aluguel_vencimento')
    if (p.vencimentoInicio && p.vencimentoFim) q = q.gte('aluguel_vencimento', p.vencimentoInicio).lte('aluguel_vencimento', p.vencimentoFim)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    const ids = [...(data ?? []).map(x => x.fornecedor_id).filter((x): x is number => x !== null)]
    let fornecedoresRows: any[] = []
    if (ids.length) {
      const r = await supabase.from('fornecedores').select('id,nome').in('id', ids)
      if (r.error) throw new Error(r.error.message)
      fornecedoresRows = r.data ?? []
    }
    const nomes = new Map(fornecedoresRows.map(f => [f.id, f.nome]))
    return (data ?? []).map(x => ({ ...x, fornecedor_nome: nomes.get(x.fornecedor_id) ?? null }))
  },

  excluir: async (id: number) => {
    const { data: produto } = await supabase.from('produtos').select('nome,codigo,empresa_id').eq('id', id).single()
    if (produto) {
      await supabase.rpc('registrar_exclusao', { p_tabela: 'produtos', p_registro_id: id, p_descricao: `Material/Ferramenta - ${produto.nome} (código ${produto.codigo})`, p_empresa_id: produto.empresa_id })
    }
    const { error } = await supabase.from('produtos').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },
}

interface FornecedorPayload {
  nome: string; tipo_pessoa: 'pj' | 'pf'; cnpj?: string | null; cpf?: string | null
  email?: string | null; telefone?: string | null; endereco?: string | null; categoria?: string | null
  forma_pagamento: 'boleto' | 'conta'; banco?: string | null; agencia?: string | null; operacao?: string | null
  conta?: string | null; conta_digito?: string | null; tipo_conta?: string | null; chave_pix?: string | null
  ativo?: boolean
}
const fornecedoresApi = {
  listar: async (p: { empresa_id: number; busca?: string; ativo?: boolean }) => {
    let query = supabase.from('fornecedores').select('*').eq('empresa_id', p.empresa_id).order('nome')
    if (p.ativo !== undefined) query = query.eq('ativo', p.ativo ? 1 : 0)
    if (p.busca) query = query.ilike('nome', `%${p.busca.replace(/[%_]/g, '\\$&')}%`)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return data ?? []
  },
  listarResumo: async (empresaId: number) => {
    const { data, error } = await supabase.from('fornecedores').select('id,nome,cnpj,cpf,tipo_pessoa').eq('empresa_id', empresaId).eq('ativo', 1).order('nome')
    if (error) throw new Error(error.message)
    return data ?? []
  },
  buscarPorId: async (id: number) => {
    const { data, error } = await supabase.from('fornecedores').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    return data ?? null
  },
  criar: async (p: FornecedorPayload & { empresa_id: number }) => {
    const { data, error } = await supabase.from('fornecedores').insert({ ...p, ativo: p.ativo === false ? 0 : 1 }).select('id').single()
    if (error) throw new Error(error.message)
    return { id: data.id }
  },
  atualizar: async (p: FornecedorPayload & { id: number }) => {
    const { id, ...dados } = p
    const { error } = await supabase.from('fornecedores').update({ ...dados, ativo: p.ativo === false ? 0 : 1 }).eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },
  excluir: async (id: number) => {
    const { data: fornecedor } = await supabase.from('fornecedores').select('nome,cnpj,cpf,empresa_id').eq('id', id).single()
    if (fornecedor) {
      await supabase.rpc('registrar_exclusao', { p_tabela: 'fornecedores', p_registro_id: id, p_descricao: `Fornecedor - ${fornecedor.nome}`, p_empresa_id: fornecedor.empresa_id })
    }
    const { error } = await supabase.from('fornecedores').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },
}

// NOVO: usado pela Navbar (sino — aviso de experiência vencendo e
// aniversariantes do mês) — módulo relatoriosRH, diferente do que eu
// tinha suposto antes (notificacoes.vencimentoExperiencia, que
// acabou não sendo usado por ninguém — deixei como está, não faz
// mal ficar, só não é chamado).
// CORRIGIDO: minha versão anterior de vencimentoExperiencia (feita
// sem o arquivo original na mão, só pro sino de notificações) estava
// incompleta — faltava o modo por período (inicio/fim), que a tela de
// Relatórios de RH usa; o modo por "dias" (usado só pelo sino)
// continua existindo. Substituída pela lógica real de
// relatoriosRH.ipc.ts, e completado o resto do módulo.
const relatoriosRHApi = {
  colaboradoresAtivos: async (p: { empresa_id: number; funcao?: string; setor?: string; equipe?: string }) => {
    let q = supabase.from('colaboradores').select('nome,matricula_esocial,funcao,setor,equipe,data_admissao,salario_base,telefone,cidade,estado').eq('empresa_id', p.empresa_id).eq('status', 'ativo').order('nome')
    if (p.funcao) q = q.eq('funcao', p.funcao)
    if (p.setor) q = q.eq('setor', p.setor)
    if (p.equipe) q = q.eq('equipe', p.equipe)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return data
  },

  porAdmissao: async (p: { empresa_id: number; dataInicio: string; dataFim: string }) => {
    const { data, error } = await supabase.from('colaboradores').select('nome,matricula_esocial,funcao,setor,equipe,data_admissao,status')
      .eq('empresa_id', p.empresa_id).not('data_admissao', 'is', null).gte('data_admissao', p.dataInicio).lte('data_admissao', p.dataFim).order('data_admissao')
    if (error) throw new Error(error.message)
    return data
  },

  vencimentoExperiencia: async (p: { empresa_id: number; dias?: number; inicio?: string; fim?: string }) => {
    let q = supabase.from('colaboradores').select('id,nome,funcao,setor,data_admissao,dias_experiencia,data_vencimento_experiencia')
      .eq('empresa_id', p.empresa_id).eq('status', 'ativo').not('data_vencimento_experiencia', 'is', null)
    if (p.inicio && p.fim) {
      q = q.gte('data_vencimento_experiencia', p.inicio).lte('data_vencimento_experiencia', p.fim)
    } else {
      const limite = new Date(); limite.setDate(limite.getDate() + (p.dias ?? 30))
      q = q.lte('data_vencimento_experiencia', limite.toISOString().slice(0, 10))
    }
    const { data, error } = await q.order('data_vencimento_experiencia')
    if (error) throw new Error(error.message)
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    return (data ?? []).map(c => ({ ...c, dias_restantes: Math.floor((new Date(`${c.data_vencimento_experiencia}T00:00:00`).getTime() - hoje.getTime()) / 86400000) }))
  },

  alojados: async (empresaId: number) => {
    const { data, error } = await supabase.from('colaboradores').select('nome,funcao,setor,equipe,cidade,estado,telefone').eq('empresa_id', empresaId).eq('status', 'ativo').eq('alojado', 1).order('nome')
    if (error) throw new Error(error.message)
    return data
  },

  afastados: async (empresaId: number) => {
    const { data, error } = await supabase.from('colaboradores').select('nome,funcao,setor,equipe,data_admissao').eq('empresa_id', empresaId).eq('status', 'afastado').order('nome')
    if (error) throw new Error(error.message)
    return data
  },

  inativos: async (empresaId: number) => {
    const { data, error } = await supabase.from('colaboradores').select('nome,funcao,setor,data_admissao,data_demissao,tipo_demissao').eq('empresa_id', empresaId).eq('status', 'desligado').order('data_demissao', { ascending: false })
    if (error) throw new Error(error.message)
    return data
  },

  aniversariantes: async (p: { empresa_id: number; mes?: number }) => {
    const mes = p.mes ?? (new Date().getMonth() + 1)
    const mesStr = String(mes).padStart(2, '0')
    const { data, error } = await supabase.from('colaboradores').select('id,nome,funcao,setor,nascimento').eq('empresa_id', p.empresa_id).eq('status', 'ativo').not('nascimento', 'is', null)
    if (error) throw new Error(error.message)
    return (data ?? []).filter(c => c.nascimento.slice(5, 7) === mesStr).map(c => ({ ...c, dia: Number(c.nascimento.slice(8, 10)) })).sort((a, b) => a.dia - b.dia)
  },

  movimentacaoPeriodo: async (p: { empresa_id: number; inicio: string; fim: string }) => {
    const [{ data: admissoes, error: e1 }, { data: demissoes, error: e2 }] = await Promise.all([
      supabase.from('colaboradores').select('nome,funcao,setor,data:data_admissao').eq('empresa_id', p.empresa_id).gte('data_admissao', p.inicio).lte('data_admissao', p.fim).order('data_admissao'),
      supabase.from('colaboradores').select('nome,funcao,setor,data:data_demissao,tipo_demissao').eq('empresa_id', p.empresa_id).not('data_demissao', 'is', null).gte('data_demissao', p.inicio).lte('data_demissao', p.fim).order('data_demissao'),
    ])
    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)
    return { admissoes, demissoes }
  },

  porSetor: async (p: { empresa_id: number; setor?: string }) => {
    let q = supabase.from('colaboradores').select('nome,funcao,setor').eq('empresa_id', p.empresa_id).eq('status', 'ativo').order('setor').order('nome')
    if (p.setor) q = q.eq('setor', p.setor)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return data
  },

  contasBancarias: async (p: { empresa_id: number; inicio?: string; fim?: string } | number) => {
    const params = typeof p === 'number' ? { empresa_id: p } : p
    let q = supabase.from('colaboradores').select('nome,cpf,banco,agencia,conta,conta_digito,tipo_conta').eq('empresa_id', params.empresa_id).eq('status', 'ativo').order('nome')
    if (params.inicio && params.fim) q = q.gte('data_admissao', params.inicio).lte('data_admissao', params.fim)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return data
  },
}

// NOVO: usado na tela de Relatórios (financeiro) — mesma lógica de
// relatorios.ipc.ts.
const relatoriosApi = {
  evolucaoMensal: async (p: { empresa_id: number; meses?: number }) => {
    const meses = p.meses ?? 6
    const { data, error } = await supabase.from('lancamentos').select('tipo,valor,status,data').eq('empresa_id', p.empresa_id).neq('status', 'cancelado')
    if (error) throw new Error(error.message)
    const hoje = new Date(); hoje.setDate(1)
    const lista: string[] = []
    for (let i = meses - 1; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      lista.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return lista.map(mes => {
      const doMes = (data ?? []).filter(l => l.data.slice(0, 7) === mes)
      return {
        mes,
        receitas: doMes.filter(l => l.tipo === 'receita').reduce((s, l) => s + Number(l.valor), 0),
        despesas: doMes.filter(l => l.tipo === 'despesa').reduce((s, l) => s + Number(l.valor), 0),
      }
    })
  },

  topCategorias: async (p: { empresa_id: number; tipo: 'receita' | 'despesa'; dataInicio?: string; dataFim?: string; limite?: number }) => {
    let q = supabase.from('lancamentos').select('valor,categoria_id').eq('empresa_id', p.empresa_id).eq('tipo', p.tipo).neq('status', 'cancelado')
    if (p.dataInicio && p.dataFim) q = q.gte('data', p.dataInicio).lte('data', p.dataFim)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    const categoriaIds = [...new Set((data ?? []).map(l => l.categoria_id).filter(Boolean))]
    let categoriasRows: any[] = []
    if (categoriaIds.length) {
      const r = await supabase.from('categorias').select('id,nome,cor').in('id', categoriaIds)
      if (r.error) throw new Error(r.error.message)
      categoriasRows = r.data ?? []
    }
    const nomes = new Map(categoriasRows.map(c => [c.id, c.nome]))
    const cores = new Map(categoriasRows.map(c => [c.id, c.cor]))
    const grupos = new Map<string, number>()
    for (const l of data ?? []) {
      const nome = nomes.get(l.categoria_id) ?? 'Sem categoria'
      grupos.set(nome, (grupos.get(nome) ?? 0) + Number(l.valor))
    }
    return [...grupos].map(([categoria, total]) => ({ categoria, total, cor: cores.get(categoria) ?? null }))
      .sort((a, b) => b.total - a.total).slice(0, p.limite ?? 10)
  },
}

// NOVO: usado pela tela de Autorização de Pagamento — mesma lógica
// de ap.ipc.ts (só a parte Supabase, que já usa RPCs prontas no
// banco pra a maioria das operações — muito mais simples de replicar
// aqui do que a versão SQLite). `registrar`/`atualizar` aceitam
// anexos como File[] (arquivo do navegador), fazendo o upload direto
// pro Storage antes de chamar a RPC — diferente do desktop, que
// recebe caminho de arquivo local.
const apApi = {
  buscarUltima: async (p: { beneficiario_tipo: string; beneficiario_id: number }) => {
    const { data: ap, error } = await supabase.from('autorizacoes_pagamento').select('*')
      .eq('beneficiario_tipo', p.beneficiario_tipo).eq('beneficiario_id', p.beneficiario_id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw new Error(error.message)
    if (!ap) return undefined
    const { data: boletos, error: e2 } = await supabase.from('autorizacoes_pagamento_boletos').select('valor,vencimento').eq('ap_id', ap.id).order('vencimento')
    if (e2) throw new Error(e2.message)
    return { ...ap, boletos: boletos ?? [] }
  },

  registrar: async (p: {
    empresa_id: number; beneficiario_tipo: 'fornecedor' | 'colaborador'; beneficiario_id: number
    beneficiario_nome: string; descricao?: string | null; boletos: { valor: number; vencimento: string }[]
    observacoes?: string | null; solicitante?: string | null; autorizado_por?: string | null
    anexos?: { caminho: string; vaiAssinatura?: boolean; arquivo?: File }[]
  }) => {
    const { data: apId, error } = await supabase.rpc('criar_ap', { p: { ...p, anexos: undefined } })
    if (error) throw new Error(error.message)
    if (p.anexos?.length) {
      const prontos = await garantirAnexosCaminhoStorage(p.empresa_id, `autorizacoes-pagamento/${apId}`, p.anexos)
      const linhas = prontos.map((a, ordem) => ({ ap_id: apId, caminho: a.caminho, ordem, vai_assinatura: a.vaiAssinatura ? 1 : 0 }))
      const { error: e2 } = await supabase.from('autorizacoes_pagamento_anexos').insert(linhas)
      if (e2) throw new Error(e2.message)
    }
    return { id: apId }
  },

  atualizar: async (p: {
    id: number; beneficiario_nome: string; descricao?: string | null
    boletos: { valor: number; vencimento: string }[]
    observacoes?: string | null; solicitante?: string | null; autorizado_por?: string | null
  }) => {
    const { error } = await supabase.rpc('atualizar_ap', { p })
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  capaPorIds: async (apIds: number[]) => {
    if (apIds.length === 0) return []
    const { data: aps, error } = await supabase.from('autorizacoes_pagamento').select('*').in('id', apIds).order('id')
    if (error) throw new Error(error.message)
    const { data: boletos, error: e2 } = await supabase.from('autorizacoes_pagamento_boletos').select('ap_id,valor,vencimento').in('ap_id', apIds)
    if (e2) throw new Error(e2.message)
    const idsBeneficiarios = { fornecedor: [] as number[], colaborador: [] as number[] }
    for (const a of aps ?? []) idsBeneficiarios[a.beneficiario_tipo as 'fornecedor' | 'colaborador'].push(a.beneficiario_id)
    const [fornecedores, colaboradores] = await Promise.all([
      idsBeneficiarios.fornecedor.length ? supabase.from('fornecedores').select('id,cnpj,cpf,forma_pagamento,banco,agencia,operacao,conta,conta_digito').in('id', idsBeneficiarios.fornecedor) : Promise.resolve({ data: [] as any[], error: null }),
      idsBeneficiarios.colaborador.length ? supabase.from('colaboradores').select('id,cpf,banco,agencia,operacao,conta,conta_digito').in('id', idsBeneficiarios.colaborador) : Promise.resolve({ data: [] as any[], error: null }),
    ])
    if (fornecedores.error || colaboradores.error) throw new Error(fornecedores.error?.message ?? colaboradores.error?.message)
    const forn = new Map(fornecedores.data.map(f => [f.id, f]))
    const colab = new Map(colaboradores.data.map(c => [c.id, c]))
    return (aps ?? []).map(a => {
      const bs = (boletos ?? []).filter(b => b.ap_id === a.id).sort((x, y) => x.vencimento.localeCompare(y.vencimento))
      const dadosBancarios = a.beneficiario_tipo === 'fornecedor' ? forn.get(a.beneficiario_id) : colab.get(a.beneficiario_id)
      return {
        id: a.id, created_at: a.created_at, beneficiario_nome: a.beneficiario_nome, descricao: a.descricao,
        cnpj: a.beneficiario_tipo === 'fornecedor' ? dadosBancarios?.cnpj ?? null : null,
        cpf: dadosBancarios?.cpf ?? null,
        forma_pagamento: a.beneficiario_tipo === 'fornecedor' ? (dadosBancarios as any)?.forma_pagamento ?? null : null,
        banco: dadosBancarios?.banco ?? null, agencia: dadosBancarios?.agencia ?? null, operacao: dadosBancarios?.operacao ?? null,
        conta: dadosBancarios?.conta ?? null, conta_digito: dadosBancarios?.conta_digito ?? null,
        primeiro_vencimento: bs[0]?.vencimento ?? null,
        valor_total: bs.length ? bs.reduce((s, b) => s + Number(b.valor), 0) : Number(a.valor),
      }
    })
  },

  resumo: async (p: number | { empresa_id: number; dataInicio?: string; dataFim?: string }) => {
    const empresa_id = typeof p === 'number' ? p : p.empresa_id
    const dataInicio = typeof p === 'number' ? undefined : p.dataInicio
    const dataFim = typeof p === 'number' ? undefined : p.dataFim
    let q = supabase.from('autorizacoes_pagamento').select('beneficiario_nome,valor,created_at').eq('empresa_id', empresa_id)
    if (dataInicio && dataFim) q = q.gte('created_at', dataInicio).lte('created_at', `${dataFim}T23:59:59.999Z`)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    const grupos = new Map<string, number>()
    for (const a of data ?? []) grupos.set(a.beneficiario_nome, (grupos.get(a.beneficiario_nome) ?? 0) + Number(a.valor))
    return {
      total: (data ?? []).length,
      valorTotal: (data ?? []).reduce((x, a) => x + Number(a.valor), 0),
      porFornecedor: [...grupos].sort(([a], [b]) => a.localeCompare(b)).map(([nome, total]) => ({ nome, total })),
    }
  },

  listar: async (p: { empresa_id: number; page?: number; perPage?: number; busca?: string; dataInicio?: string; dataFim?: string }) => {
    const perPage = p.perPage ?? 20
    const offset = ((p.page ?? 1) - 1) * perPage
    let q = supabase.from('autorizacoes_pagamento').select('*').eq('empresa_id', p.empresa_id).order('created_at', { ascending: false })
    if (p.dataInicio && p.dataFim) q = q.gte('created_at', p.dataInicio).lte('created_at', `${p.dataFim}T23:59:59.999Z`)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    let filtradas = data ?? []
    if (p.busca) {
      const b = p.busca.toLowerCase()
      filtradas = filtradas.filter(a => a.beneficiario_nome.toLowerCase().includes(b) || (a.descricao ?? '').toLowerCase().includes(b) || String(a.valor).includes(b))
    }
    const ids = filtradas.map(a => a.id)
    let boletos: any[] = []
    if (ids.length) {
      const r = await supabase.from('autorizacoes_pagamento_boletos').select('id,ap_id,valor').in('ap_id', ids)
      if (r.error) throw new Error(r.error.message)
      boletos = r.data ?? []
    }
    const items = filtradas.slice(offset, offset + perPage).map(a => {
      const bs = boletos.filter(b => b.ap_id === a.id)
      return { ...a, valor_total: bs.length ? bs.reduce((x, b) => x + Number(b.valor), 0) : Number(a.valor), qtd_boletos: bs.length }
    })
    return { items, total: filtradas.length }
  },

  buscarPorId: async (id: number) => {
    const [{ data: ap, error: e1 }, { data: boletos, error: e2 }, { data: anexosRows, error: e3 }] = await Promise.all([
      supabase.from('autorizacoes_pagamento').select('*').eq('id', id).maybeSingle(),
      supabase.from('autorizacoes_pagamento_boletos').select('*').eq('ap_id', id).order('vencimento'),
      supabase.from('autorizacoes_pagamento_anexos').select('caminho,vai_assinatura').eq('ap_id', id).order('ordem'),
    ])
    for (const e of [e1, e2, e3]) if (e) throw new Error(e.message)
    if (!ap) return null
    const ids = [ap.aprovado_por_usuario_id, ap.aprovado_supervisor_por_usuario_id].filter((x): x is number => x !== null)
    let usuarios: any[] = []
    if (ids.length) {
      // CORRIGIDO: ler direto de "usuarios" aqui é bloqueado pela
      // política de segurança (só permite ver o PRÓPRIO perfil, ou
      // ser Master) — sempre que quem está olhando a AP é diferente
      // de quem aprovou, essa consulta voltava vazia sem erro
      // nenhum, e o carimbo sumia. A função carimbos_usuarios() no
      // banco (mesma usada no desktop) contorna essa trava só pra
      // esse uso legítimo.
      const r = await supabase.rpc('carimbos_usuarios', { p_ids: ids })
      if (r.error) throw new Error(r.error.message)
      usuarios = r.data ?? []
    }
    const carimbos = new Map(usuarios.map(u => [u.id, u.carimbo_url]))
    return {
      ...ap,
      aprovado_por_carimbo_url: carimbos.get(ap.aprovado_por_usuario_id) ?? null,
      aprovado_supervisor_carimbo_url: carimbos.get(ap.aprovado_supervisor_por_usuario_id) ?? null,
      boletos: boletos ?? [],
      // CORRIGIDO: precisa ser {caminho, vaiAssinatura}[], não uma
      // lista simples de string — era por isso que o "Vai Assinatura"
      // se perdia (e o serviço de PDF recebia `caminho: undefined`
      // em cada anexo, causando o erro "reading 'startsWith'" ao
      // tentar decidir se era um endereço do Storage).
      anexos: (anexosRows ?? []).map(a => ({ caminho: a.caminho, vaiAssinatura: !!a.vai_assinatura })),
    }
  },

  salvarCaminhoPdf: async (p: { id: number; pdf_path: string }) => {
    const { error } = await supabase.from('autorizacoes_pagamento').update({ pdf_path: p.pdf_path }).eq('id', p.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  aprovar: async (p: { id: number; aprovado_por: string; aprovado_perfil?: string; usuario_id?: number | null }) => {
    const { data, error } = await supabase.rpc('aprovar_ap', { p_id: p.id })
    if (error) throw new Error(error.message)
    return { ok: true, aprovado_em: data }
  },

  excluir: async (id: number) => {
    const { error } = await supabase.rpc('excluir_ap', { p_id: id })
    if (error) throw new Error(error.message)
    return { ok: true }
  },
}

// NOVO: usado pela tela de Autorização de Pagamento (lotes) — mesma
// lógica de lotes.ipc.ts (só a parte Supabase, via RPCs).
const lotesApi = {
  listarAbertos: async (empresaId: number) => {
    const [{ data: lotes, error: e1 }, { data: aps, error: e2 }, { data: nfs, error: e3 }] = await Promise.all([
      supabase.from('lotes_financeiros').select('id,numero,titulo').eq('empresa_id', empresaId).is('enviado_em', null).order('numero', { ascending: false }),
      supabase.from('autorizacoes_pagamento').select('lote_id,aprovado_por').eq('empresa_id', empresaId),
      supabase.from('notas_fiscais').select('lote_id,aprovado_por').eq('empresa_id', empresaId),
    ])
    for (const e of [e1, e2, e3]) if (e) throw new Error(e.message)
    return (lotes ?? []).map(l => {
      const a = (aps ?? []).filter(x => x.lote_id === l.id), n = (nfs ?? []).filter(x => x.lote_id === l.id)
      return { ...l, total_itens: a.length + n.length, nao_aprovados: a.filter(x => x.aprovado_por === null).length + n.filter(x => x.aprovado_por === null).length }
    })
  },

  adicionarAoLote: async (p: { lote_id: number; usuario_id?: number | null; ap_ids: number[]; nf_ids: number[] }) => {
    if (!p.ap_ids.length && !p.nf_ids.length) throw new Error('Selecione ao menos uma AP ou Nota Fiscal.')
    const { error } = await supabase.rpc('adicionar_itens_lote', { p })
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  tirarDoLote: async (p: { item_tipo: 'ap' | 'nf'; item_id: number }) => {
    const { data, error } = await supabase.rpc('tirar_item_lote', { p_tipo: p.item_tipo, p_item_id: p.item_id })
    if (error) throw new Error(error.message)
    return { ok: true, loteApagado: data }
  },

  enviarParaSupervisor: async (p: { lote_ids: number[] }) => {
    if (!p.lote_ids.length) throw new Error('Selecione ao menos um lote.')
    const { data, error } = await supabase.rpc('enviar_lotes_supervisor', { p_lote_ids: p.lote_ids })
    if (error) throw new Error(error.message)
    return { lotes: data ?? [] }
  },

  // NOVO: completa o módulo (antes só tinha as 4 funções mais usadas
  // na tela de AP — essas aqui são de MeusLotes, PainelSupervisor e
  // do Escritório Central).
  criar: async (p: { empresa_id: number; empresa_nome: string; data_inicio: string; data_fim: string; criado_por?: string | null; ap_ids: number[]; nf_ids: number[] }) => {
    const { data, error } = await supabase.rpc('criar_lote_financeiro', { p })
    if (error) throw new Error(error.message)
    return data
  },

  fecharLote: async (p: { empresa_id: number; empresa_nome: string; criado_por?: string | null; usuario_id?: number | null; ap_ids: number[]; nf_ids: number[] }) => {
    const { data, error } = await supabase.rpc('fechar_lote_financeiro', { p })
    if (error) throw new Error(error.message)
    return data
  },

  excluir: async (id: number) => {
    const { error } = await supabase.rpc('excluir_lote_financeiro', { p_lote_id: id })
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  listarPorObra: async (empresaId: number) => {
    const [{ data: lotes, error: e1 }, { data: aps, error: e2 }, { data: nfs, error: e3 }] = await Promise.all([
      supabase.from('lotes_financeiros').select('*').eq('empresa_id', empresaId).order('data_inicio', { ascending: false }).order('id', { ascending: false }),
      supabase.from('autorizacoes_pagamento').select('lote_id,aprovado_supervisor_por').eq('empresa_id', empresaId),
      supabase.from('notas_fiscais').select('lote_id,aprovado_supervisor_por').eq('empresa_id', empresaId),
    ])
    for (const e of [e1, e2, e3]) if (e) throw new Error(e.message)
    return (lotes ?? []).map(l => {
      const a = (aps ?? []).filter(x => x.lote_id === l.id), n = (nfs ?? []).filter(x => x.lote_id === l.id)
      const total = a.length + n.length
      const aprovados = a.filter(x => x.aprovado_supervisor_por !== null).length + n.filter(x => x.aprovado_supervisor_por !== null).length
      return { ...l, total_itens: total, itens_aprovados: aprovados, pendente: aprovados < total }
    })
  },

  buscarPorId: async (id: number) => {
    const { data: lote, error } = await supabase.from('lotes_financeiros').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    if (!lote) return null
    const [{ data: aps, error: e1 }, { data: nfs, error: e2 }] = await Promise.all([
      supabase.from('autorizacoes_pagamento').select('*').eq('lote_id', id).order('id', { ascending: false }),
      supabase.from('notas_fiscais').select('*').eq('lote_id', id).order('id', { ascending: false }),
    ])
    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)
    const apIds = (aps ?? []).map(a => a.id), nfIds = (nfs ?? []).map(n => n.id)
    const [{ data: ab, error: e3 }, { data: nb, error: e4 }] = await Promise.all([
      apIds.length ? supabase.from('autorizacoes_pagamento_boletos').select('ap_id,id,valor').in('ap_id', apIds) : Promise.resolve({ data: [] as any[], error: null }),
      nfIds.length ? supabase.from('notas_fiscais_boletos').select('nota_id,id,valor').in('nota_id', nfIds) : Promise.resolve({ data: [] as any[], error: null }),
    ])
    if (e3) throw new Error(e3.message)
    if (e4) throw new Error(e4.message)
    const autorizacoes = (aps ?? []).map(a => {
      const b = (ab ?? []).filter(x => x.ap_id === a.id)
      return { ...a, valor_total: b.length ? b.reduce((x, y) => x + Number(y.valor), 0) : Number(a.valor), qtd_boletos: b.length }
    })
    const notas_fiscais = (nfs ?? []).map(n => {
      const b = (nb ?? []).filter(x => x.nota_id === n.id)
      return { ...n, valor_total: b.reduce((x, y) => x + Number(y.valor), 0), qtd_boletos: b.length }
    })
    return { ...lote, autorizacoes, notas_fiscais }
  },

  listarSupervisores: async () => {
    const [{ data: usuariosRows, error: e1 }, { data: links, error: e2 }, { data: lotesRows, error: e3 }, { data: aps, error: e4 }, { data: nfs, error: e5 }] = await Promise.all([
      supabase.from('usuarios').select('id,nome').eq('perfil', 'supervisor').eq('ativo', 1).order('nome'),
      supabase.from('supervisor_obras').select('usuario_id,empresa_id'),
      supabase.from('lotes_financeiros').select('id,empresa_id'),
      supabase.from('autorizacoes_pagamento').select('lote_id,aprovado_supervisor_por,aprovado_central_por'),
      supabase.from('notas_fiscais').select('lote_id,aprovado_supervisor_por,aprovado_central_por'),
    ])
    for (const e of [e1, e2, e3, e4, e5]) if (e) throw new Error(e.message)
    return (usuariosRows ?? []).map(u => {
      const obras = (links ?? []).filter(l => l.usuario_id === u.id).map(l => l.empresa_id)
      const loteIds = new Set((lotesRows ?? []).filter(l => obras.includes(l.empresa_id)).map(l => l.id))
      const pendentes = new Set([
        ...(aps ?? []).filter(a => loteIds.has(a.lote_id) && a.aprovado_supervisor_por !== null && a.aprovado_central_por === null).map(a => a.lote_id),
        ...(nfs ?? []).filter(n => loteIds.has(n.lote_id) && n.aprovado_supervisor_por !== null && n.aprovado_central_por === null).map(n => n.lote_id),
      ])
      return { usuario_id: u.id, nome: u.nome, total_obras: obras.length, lotes_pendentes: pendentes.size }
    })
  },

  obrasDoSupervisor: async (usuarioId: number) => {
    const { data: links, error } = await supabase.from('supervisor_obras').select('empresa_id').eq('usuario_id', usuarioId)
    if (error) throw new Error(error.message)
    const ids = (links ?? []).map(x => x.empresa_id)
    if (!ids.length) return []
    const [{ data: empresasRows, error: e1 }, { data: colaboradoresRows, error: e2 }, { data: lancamentosRows, error: e3 }, { data: lotesRows, error: e4 }, { data: aps, error: e5 }, { data: nfs, error: e6 }] = await Promise.all([
      supabase.from('empresas').select('id,nome,logo_url').in('id', ids),
      supabase.from('colaboradores').select('empresa_id,status').in('empresa_id', ids),
      supabase.from('lancamentos').select('empresa_id,tipo,status,valor,data').in('empresa_id', ids),
      supabase.from('lotes_financeiros').select('id,empresa_id').in('empresa_id', ids),
      supabase.from('autorizacoes_pagamento').select('lote_id,aprovado_supervisor_por').in('empresa_id', ids),
      supabase.from('notas_fiscais').select('lote_id,aprovado_supervisor_por').in('empresa_id', ids),
    ])
    for (const e of [e1, e2, e3, e4, e5, e6]) if (e) throw new Error(e.message)
    const inicio = new Date(); inicio.setDate(1)
    const mes = inicio.toISOString().slice(0, 10)
    return (empresasRows ?? []).map(e => {
      const loteIds = new Set((lotesRows ?? []).filter(l => l.empresa_id === e.id).map(l => l.id))
      return {
        empresa_id: e.id, empresa_nome: e.nome, logo_url: e.logo_url,
        colaboradores: (colaboradoresRows ?? []).filter(c => c.empresa_id === e.id && c.status === 'ativo').length,
        gastos_mes: (lancamentosRows ?? []).filter(l => l.empresa_id === e.id && l.tipo === 'despesa' && l.status !== 'cancelado' && l.data >= mes).reduce((x, l) => x + Number(l.valor), 0),
        lotes_pendentes: (aps ?? []).filter(a => loteIds.has(a.lote_id) && a.aprovado_supervisor_por !== null).length + (nfs ?? []).filter(n => loteIds.has(n.lote_id) && n.aprovado_supervisor_por !== null).length,
      }
    })
  },

  apsParaCapa: async (loteId: number) => {
    const { data: aps, error } = await supabase.from('autorizacoes_pagamento').select('*').eq('lote_id', loteId).order('id')
    if (error) throw new Error(error.message)
    const ids = (aps ?? []).map(a => a.id)
    const [{ data: boletos, error: e1 }, { data: fornecedoresRows, error: e2 }, { data: colaboradoresRows, error: e3 }] = await Promise.all([
      ids.length ? supabase.from('autorizacoes_pagamento_boletos').select('ap_id,valor,vencimento').in('ap_id', ids) : Promise.resolve({ data: [] as any[], error: null }),
      supabase.from('fornecedores').select('id,cnpj,cpf,forma_pagamento,banco,agencia,operacao,conta,conta_digito'),
      supabase.from('colaboradores').select('id,cpf,banco,agencia,operacao,conta,conta_digito'),
    ])
    for (const e of [e1, e2, e3]) if (e) throw new Error(e.message)
    const fs = new Map((fornecedoresRows ?? []).map(f => [f.id, f])), cs = new Map((colaboradoresRows ?? []).map(c => [c.id, c]))
    return (aps ?? []).map(a => {
      const b = (boletos ?? []).filter(x => x.ap_id === a.id)
      const r: any = a.beneficiario_tipo === 'fornecedor' ? fs.get(a.beneficiario_id) : cs.get(a.beneficiario_id)
      return {
        id: a.id, created_at: a.created_at, beneficiario_nome: a.beneficiario_nome, descricao: a.descricao,
        cnpj: a.beneficiario_tipo === 'fornecedor' ? r?.cnpj ?? null : null, cpf: r?.cpf ?? null,
        forma_pagamento: a.beneficiario_tipo === 'fornecedor' ? r?.forma_pagamento ?? null : null,
        banco: r?.banco ?? null, agencia: r?.agencia ?? null, operacao: r?.operacao ?? null,
        conta: r?.conta ?? null, conta_digito: r?.conta_digito ?? null,
        primeiro_vencimento: b[0]?.vencimento ?? null, valor_total: b.length ? b.reduce((x, y) => x + Number(y.valor), 0) : Number(a.valor),
      }
    })
  },

  resumoObras: async (empresaIds: number[]) => {
    if (empresaIds.length === 0) return []
    const [{ data: empresasRows, error: e1 }, { data: colaboradoresRows, error: e2 }, { data: lancamentosRows, error: e3 }, { data: lotesRows, error: e4 }, { data: aps, error: e5 }, { data: nfs, error: e6 }] = await Promise.all([
      supabase.from('empresas').select('id,nome,logo_url').in('id', empresaIds),
      supabase.from('colaboradores').select('empresa_id,status').in('empresa_id', empresaIds),
      supabase.from('lancamentos').select('empresa_id,tipo,status,valor,data').in('empresa_id', empresaIds),
      supabase.from('lotes_financeiros').select('id,empresa_id').in('empresa_id', empresaIds),
      supabase.from('autorizacoes_pagamento').select('lote_id,aprovado_supervisor_por').in('empresa_id', empresaIds),
      supabase.from('notas_fiscais').select('lote_id,aprovado_supervisor_por').in('empresa_id', empresaIds),
    ])
    for (const e of [e1, e2, e3, e4, e5, e6]) if (e) throw new Error(e.message)
    const inicio = new Date(); inicio.setDate(1)
    const mes = inicio.toISOString().slice(0, 10)
    return (empresasRows ?? []).map(e => {
      const loteIds = new Set((lotesRows ?? []).filter(l => l.empresa_id === e.id).map(l => l.id))
      const pendentes = (aps ?? []).filter(a => loteIds.has(a.lote_id) && a.aprovado_supervisor_por === null).length + (nfs ?? []).filter(n => loteIds.has(n.lote_id) && n.aprovado_supervisor_por === null).length
      return {
        empresa_id: e.id, empresa_nome: e.nome, logo_url: e.logo_url,
        colaboradores: (colaboradoresRows ?? []).filter(c => c.empresa_id === e.id && c.status === 'ativo').length,
        gastos_mes: (lancamentosRows ?? []).filter(l => l.empresa_id === e.id && l.tipo === 'despesa' && l.status !== 'cancelado' && l.data >= mes).reduce((x, l) => x + Number(l.valor), 0),
        lotes_pendentes: pendentes,
      }
    })
  },
}

// NOVO: usado nas telas de Categorias e Lançamentos — mesma lógica
// de categorias.ipc.ts (RPCs).
const categoriasApi = {
  listar: async (params: { empresa_id: number; tipo?: string }) => {
    let query = supabase.from('categorias').select('*').eq('empresa_id', params.empresa_id).order('nome')
    if (params.tipo) query = query.in('tipo', [params.tipo, 'ambos'])
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return data ?? []
  },
  criar: async (p: { empresa_id: number; nome: string; tipo: string; cor: string }) => {
    const { data, error } = await supabase.rpc('criar_categoria', { p })
    if (error) throw new Error(error.message)
    return { id: data }
  },
  atualizar: async (p: { id: number; empresa_id: number; nome: string; tipo: string; cor: string }) => {
    const { error } = await supabase.rpc('atualizar_categoria', { p })
    if (error) throw new Error(error.message)
    return { ok: true }
  },
  excluir: async (id: number) => {
    const { error } = await supabase.rpc('excluir_categoria', { p_id: id })
    if (error) throw new Error(error.message)
    return { ok: true }
  },
  sugestoes: async (params: { empresa_id: number; busca: string; tipo?: string }) => {
    let query = supabase.from('categorias').select('id,nome,tipo,cor').eq('empresa_id', params.empresa_id)
      .ilike('nome', `%${params.busca.replace(/[%_]/g, '\\$&')}%`).order('nome').limit(10)
    if (params.tipo) query = query.in('tipo', [params.tipo, 'ambos'])
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return data ?? []
  },
}

// NOVO: usado nas telas de Contas e Lançamentos — mesma lógica de
// contas.ipc.ts (RPCs).
const contasApi = {
  listar: async (params: { empresa_id: number; ativo?: number }) => {
    let query = supabase.from('contas').select('*').eq('empresa_id', params.empresa_id).order('nome')
    if (params.ativo !== undefined) query = query.eq('ativo', params.ativo)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return data ?? []
  },
  buscarPorId: async (id: number) => {
    const { data, error } = await supabase.from('contas').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    return data ?? null
  },
  criar: async (p: { empresa_id: number; nome: string; tipo: string; saldo: number; banco: string | null; agencia: string | null; numero: string | null; ativo: number }) => {
    const { data, error } = await supabase.rpc('criar_conta', { p })
    if (error) throw new Error(error.message)
    return { id: data }
  },
  atualizar: async (p: { id: number; empresa_id: number; nome: string; tipo: string; saldo: number; banco: string | null; agencia: string | null; numero: string | null; ativo: number }) => {
    const { error } = await supabase.rpc('atualizar_conta', { p })
    if (error) throw new Error(error.message)
    return { ok: true }
  },
  excluir: async (id: number) => {
    const { error } = await supabase.rpc('excluir_conta', { p_id: id })
    if (error) throw new Error(error.message)
    return { ok: true }
  },
  saldoTotal: async (empresaId: number) => {
    const { data, error } = await supabase.from('contas').select('saldo').eq('empresa_id', empresaId).eq('ativo', 1)
    if (error) throw new Error(error.message)
    return (data ?? []).reduce((r, c) => {
      const saldo = Number(c.saldo); r.total += saldo
      saldo >= 0 ? r.positivo += saldo : r.negativo += saldo
      return r
    }, { positivo: 0, negativo: 0, total: 0 })
  },
}

// NOVO: usado em Contas a Pagar e Contas a Receber — mesma lógica de
// contasAPagar.ipc.ts / contasAReceber.ipc.ts (RPCs).
function criarApiContasPagarReceber(tipo: 'despesa' | 'receita') {
  return {
    listar: async (p: { empresa_id: number; situacao?: 'a_vencer' | 'vencido' | 'pago'; busca?: string }) => {
      let q = supabase.from('lancamentos').select('id,descricao,valor,data,data_venc,status,data_pgto,fornecedor_id')
        .eq('empresa_id', p.empresa_id).eq('tipo', tipo).neq('status', 'cancelado').order('data_venc')
      const hoje = new Date().toISOString().slice(0, 10)
      if (p.situacao === 'pago') q = q.eq('status', 'pago')
      else if (p.situacao === 'vencido') q = q.eq('status', 'pendente').lt('data_venc', hoje)
      else if (p.situacao === 'a_vencer') q = q.eq('status', 'pendente').gte('data_venc', hoje)
      if (p.busca) q = q.ilike('descricao', `%${p.busca.replace(/[%_]/g, '\\$&')}%`)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return (data ?? []).map(x => ({ ...x, situacao: x.status === 'pago' ? 'pago' : x.data_venc < hoje ? 'vencido' : 'a_vencer', origem: 'outro' }))
    },
    darBaixa: async (p: { id: number; data_pgto?: string }) => {
      const { error } = await supabase.rpc('atualizar_baixa_lancamento', { p_id: p.id, p_status: 'pago', p_data: p.data_pgto ?? null })
      if (error) throw new Error(error.message)
      return { ok: true }
    },
    reabrir: async (id: number) => {
      const { error } = await supabase.rpc('atualizar_baixa_lancamento', { p_id: id, p_status: 'pendente', p_data: null })
      if (error) throw new Error(error.message)
      return { ok: true }
    },
    pagarParcial: async (p: { id: number; valor_pago: number; novo_vencimento: string; data_pgto?: string }) => {
      const { data, error } = await supabase.rpc('pagamento_parcial', { p })
      if (error) throw new Error(error.message)
      return { ok: true, novoId: data }
    },
  }
}
const contasAPagarApi = criarApiContasPagarReceber('despesa')
const contasAReceberApi = criarApiContasPagarReceber('receita')

// NOVO: usado em telas que emitem Recibo avulso — o recibos.ipc.ts
// original não tem parte Supabase nenhuma (só SQLite), então essa é
// uma implementação equivalente, não uma cópia.
const recibosApi = {
  emitir: async (p: { empresa_id: number; beneficiario_nome: string; valor: number; referente?: string | null }) => {
    const { data, error } = await supabase.from('recibos').insert({
      empresa_id: p.empresa_id, beneficiario_nome: p.beneficiario_nome, valor: p.valor, referente: p.referente ?? null,
    }).select('id').single()
    if (error) throw new Error(error.message)
    return { numero: data.id }
  },
}

// NOVO: usado em modais que cadastram gente sem vínculo formal
// (diarista, etc.) — mesma lógica de pessoasAvulsas.ipc.ts.
const pessoasAvulsasApi = {
  listar: async (p: { empresa_id: number; busca?: string }) => {
    let q = supabase.from('pessoas_avulsas').select('*').eq('empresa_id', p.empresa_id).order('nome')
    if (p.busca) q = q.ilike('nome', `%${p.busca.replace(/[%_]/g, '\\$&')}%`)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return data ?? []
  },
  criar: async (p: { empresa_id: number; nome: string; cpf?: string | null }) => {
    const { data, error } = await supabase.from('pessoas_avulsas').insert({ empresa_id: p.empresa_id, nome: p.nome, cpf: p.cpf ?? null }).select('id').single()
    if (error) throw new Error(error.message)
    return { id: data.id }
  },
}

// NOVO: usado pelo painel do Administrador Master (Escritório
// Central, Setor Pessoal, Supervisores, gestão de obras) — mesma
// lógica de master.ipc.ts.
const masterApi = {
  escritorio: async () => {
    const [{ data: centrais, error: e1 }, { data: aps, error: e2 }, { data: nfs, error: e3 }] = await Promise.all([
      supabase.from('usuarios').select('id,nome,email,ativo,last_login_at').eq('perfil', 'central').order('nome'),
      supabase.from('autorizacoes_pagamento').select('aprovado_central_por'),
      supabase.from('notas_fiscais').select('aprovado_central_por'),
    ])
    for (const e of [e1, e2, e3]) if (e) throw new Error(e.message)
    return (centrais ?? []).map(c => ({
      ...c, ativo: !!c.ativo,
      itens_aprovados: (aps ?? []).filter(a => a.aprovado_central_por === c.nome).length + (nfs ?? []).filter(n => n.aprovado_central_por === c.nome).length,
    }))
  },

  setorPessoal: async () => {
    const [{ data: usuariosRows, error: e1 }, { data: solicitacoes, error: e2 }] = await Promise.all([
      supabase.from('usuarios').select('id,nome,email,ativo,last_login_at').eq('perfil', 'setor_pessoal').order('nome'),
      supabase.from('solicitacoes_pessoal').select('respondido_por'),
    ])
    for (const e of [e1, e2]) if (e) throw new Error(e.message)
    return (usuariosRows ?? []).map(u => ({ ...u, ativo: !!u.ativo, solicitacoes_respondidas: (solicitacoes ?? []).filter(x => x.respondido_por === u.nome).length }))
  },

  supervisores: async () => {
    const [{ data: supervisoresRows, error: e1 }, { data: links, error: e2 }, { data: obras, error: e3 }, { data: aps, error: e4 }, { data: nfs, error: e5 }] = await Promise.all([
      supabase.from('usuarios').select('id,nome,email,ativo,last_login_at').eq('perfil', 'supervisor').order('nome'),
      supabase.from('supervisor_obras').select('usuario_id,empresa_id'),
      supabase.from('empresas').select('id,nome'),
      supabase.from('autorizacoes_pagamento').select('aprovado_supervisor_por'),
      supabase.from('notas_fiscais').select('aprovado_supervisor_por'),
    ])
    for (const e of [e1, e2, e3, e4, e5]) if (e) throw new Error(e.message)
    const obraPorId = new Map((obras ?? []).map(o => [o.id, o]))
    return (supervisoresRows ?? []).map(u => ({
      ...u, ativo: !!u.ativo,
      obras: (links ?? []).filter(l => l.usuario_id === u.id).map(l => obraPorId.get(l.empresa_id)).filter(Boolean),
      itens_aprovados: (aps ?? []).filter(a => a.aprovado_supervisor_por === u.nome).length + (nfs ?? []).filter(n => n.aprovado_supervisor_por === u.nome).length,
    }))
  },

  definirObrasSupervisor: async (p: { usuario_id: number; empresa_ids: number[] }) => {
    const { error: apagarErro } = await supabase.from('supervisor_obras').delete().eq('usuario_id', p.usuario_id)
    if (apagarErro) throw new Error(apagarErro.message)
    if (p.empresa_ids.length) {
      const { error } = await supabase.from('supervisor_obras').insert(p.empresa_ids.map(empresa_id => ({ usuario_id: p.usuario_id, empresa_id })))
      if (error) throw new Error(error.message)
    }
    return { ok: true }
  },

  obras: async () => {
    const { data, error } = await supabase.from('empresas').select('id,nome,cnpj,cidade,estado,logo_url').order('nome')
    if (error) throw new Error(error.message)
    return data ?? []
  },

  obraDetalhe: async (empresaId: number) => {
    const [{ data: empresa, error: e1 }, { data: colaboradoresRows, error: e2 }, { data: lancamentosRows, error: e3 }, { data: usuariosRows, error: e4 }, { data: links, error: e5 }] = await Promise.all([
      supabase.from('empresas').select('*').eq('id', empresaId).maybeSingle(),
      supabase.from('colaboradores').select('status,salario_base').eq('empresa_id', empresaId),
      supabase.from('lancamentos').select('valor,data,status,tipo').eq('empresa_id', empresaId),
      supabase.from('usuarios').select('id,nome,email,perfil,ativo,last_login_at').eq('empresa_id', empresaId).in('perfil', ['admin', 'gestor', 'almoxarife']).order('perfil').order('nome'),
      supabase.from('supervisor_obras').select('usuario_id').eq('empresa_id', empresaId),
    ])
    for (const e of [e1, e2, e3, e4, e5]) if (e) throw new Error(e.message)
    if (!empresa) return null
    const ativos = (colaboradoresRows ?? []).filter(c => c.status === 'ativo')
    const inicio = new Date(); inicio.setDate(1)
    const inicioMes = inicio.toISOString().slice(0, 10)
    const gastos_mes = (lancamentosRows ?? []).filter(l => l.tipo === 'despesa' && l.status !== 'cancelado' && l.data >= inicioMes).reduce((x, l) => x + Number(l.valor), 0)
    const ids = (links ?? []).map(l => l.usuario_id)
    let supervisoresLista: unknown[] = []
    if (ids.length) {
      const { data, error } = await supabase.from('usuarios').select('id,nome').in('id', ids)
      if (error) throw new Error(error.message)
      supervisoresLista = data ?? []
    }
    return {
      empresa, colaboradores: ativos.length, custo_folha: ativos.reduce((x, c) => x + Number(c.salario_base), 0),
      gastos_mes, usuarios: (usuariosRows ?? []).map(u => ({ ...u, ativo: !!u.ativo })), supervisores: supervisoresLista,
    }
  },

  // NOVO: usado pela tela de Log de Exclusões (Master) — mesma
  // lógica de master.ipc.ts.
  listarExclusoes: async () => {
    const { data, error } = await supabase.from('auditoria')
      .select('id,tabela,descricao,usuario_nome,empresa_id,created_at,empresas(nome)')
      .eq('acao', 'delete').order('created_at', { ascending: false }).limit(500)
    if (error) throw new Error(error.message)
    return (data ?? []).map((row: any) => {
      const { empresas, ...resto } = row
      return { ...resto, empresa_nome: empresas?.nome ?? '—' }
    })
  },
}

// NOVO: usado pela tela de Notas Fiscais — mesma lógica de
// notasFiscais.ipc.ts (RPCs, e o mesmo padrão de anexos File[] que
// já usei em ap.registrar).
const notasFiscaisApi = {
  listar: async (p: { empresa_id: number; busca?: string; dataInicio?: string; dataFim?: string }) => {
    let query = supabase.from('notas_fiscais').select('*,notas_fiscais_boletos(valor)').eq('empresa_id', p.empresa_id).order('data', { ascending: false })
    if (p.dataInicio && p.dataFim) query = query.gte('data', p.dataInicio).lte('data', p.dataFim)
    if (p.busca) query = query.ilike('fornecedor_nome', `%${p.busca.replace(/[%_]/g, '\\$&')}%`)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data ?? []).map((n: any) => ({ ...n, valor_total: (n.notas_fiscais_boletos ?? []).reduce((s: number, b: any) => s + Number(b.valor), 0), qtd_boletos: n.notas_fiscais_boletos?.length ?? 0 }))
  },

  capaPorIds: async (notaIds: number[]) => {
    if (notaIds.length === 0) return []
    const [{ data: notas, error: e1 }, { data: boletos, error: e2 }] = await Promise.all([
      supabase.from('notas_fiscais').select('id,numero_pedido,numero_nf,data_emissao_nf,fornecedor_nome').in('id', notaIds).order('id'),
      supabase.from('notas_fiscais_boletos').select('nota_id,valor,vencimento').in('nota_id', notaIds).order('vencimento'),
    ])
    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)
    return (notas ?? []).map(n => {
      const itens = (boletos ?? []).filter(b => b.nota_id === n.id)
      return { ...n, boletos: itens, valor_total: itens.reduce((x, b) => x + Number(b.valor), 0) }
    })
  },

  buscarPorId: async (id: number) => {
    const [{ data: nota, error: e1 }, { data: boletos, error: e2 }, { data: anexos, error: e3 }] = await Promise.all([
      supabase.from('notas_fiscais').select('*').eq('id', id).maybeSingle(),
      supabase.from('notas_fiscais_boletos').select('*').eq('nota_id', id).order('vencimento'),
      supabase.from('notas_fiscais_anexos').select('*').eq('nota_id', id).order('categoria').order('ordem'),
    ])
    for (const e of [e1, e2, e3]) if (e) throw new Error(e.message)
    if (!nota) return null
    const ids = [nota.aprovado_por_usuario_id, nota.aprovado_supervisor_por_usuario_id].filter((x): x is number => x !== null)
    let usuarios: any[] = []
    if (ids.length) {
      // CORRIGIDO: mesmo problema do ap.buscarPorId (ver comentário
      // lá) — consulta direta em "usuarios" é bloqueada por RLS
      // quando quem olha é diferente de quem aprovou.
      const r = await supabase.rpc('carimbos_usuarios', { p_ids: ids })
      if (r.error) throw new Error(r.error.message)
      usuarios = r.data ?? []
    }
    const carimbos = new Map(usuarios.map(u => [u.id, u.carimbo_url]))
    return {
      ...nota,
      aprovado_por_carimbo_url: carimbos.get(nota.aprovado_por_usuario_id) ?? null,
      aprovado_supervisor_carimbo_url: carimbos.get(nota.aprovado_supervisor_por_usuario_id) ?? null,
      boletos: boletos ?? [],
      anexos_nota: (anexos ?? []).filter(a => a.categoria === 'nota').map(a => a.caminho),
      anexos_boletos: (anexos ?? []).filter(a => a.categoria === 'boleto').map(a => a.caminho),
    }
  },

  criar: async (p: {
    empresa_id: number; numero_pedido?: string | null; data: string; numero_nf?: string | null
    data_emissao_nf?: string | null; fornecedor_id?: number | null; fornecedor_nome: string
    boletos: { valor: number; vencimento: string }[]
    anexos_nota?: string[]; anexos_boletos?: string[]
  }) => {
    const { data: notaId, error } = await supabase.rpc('criar_nota_fiscal', { p: { ...p, anexos_nota: undefined, anexos_boletos: undefined } })
    if (error) throw new Error(error.message)
    // CORRIGIDO: os caminhos já chegam PRONTOS aqui (subidos antes
    // pela tela, via prepararAnexoWeb — ver NotaFiscalModal.tsx) —
    // só precisa vincular, sem subir de novo. Antes esperava File[]
    // por engano, causando "Cannot read properties of undefined
    // (reading 'replace')" porque cada elemento chegava como string,
    // sem propriedade .name nenhuma.
    const enviar = async (caminhos: string[], categoria: 'nota' | 'boleto') => {
      for (let ordem = 0; ordem < caminhos.length; ordem++) {
        const { error: e2 } = await supabase.from('notas_fiscais_anexos').insert({ nota_id: notaId, caminho: caminhos[ordem], categoria, ordem })
        if (e2) throw new Error(e2.message)
      }
    }
    await enviar(p.anexos_nota ?? [], 'nota')
    await enviar(p.anexos_boletos ?? [], 'boleto')
    return { id: notaId }
  },

  atualizar: async (p: {
    id: number; numero_pedido?: string | null; data: string; numero_nf?: string | null
    data_emissao_nf?: string | null; fornecedor_id?: number | null; fornecedor_nome: string
    boletos: { valor: number; vencimento: string }[]
  }) => {
    const { error } = await supabase.rpc('atualizar_nota_fiscal', { p })
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  // NOVO: sem parte Supabase no original (só SQLite) — implementação
  // equivalente.
  salvarCaminhosPdf: async (p: { id: number; nota_pdf_path?: string | null; boletos_pdf_path?: string | null }) => {
    const patch: Record<string, string> = {}
    if (p.nota_pdf_path) patch.nota_pdf_path = p.nota_pdf_path
    if (p.boletos_pdf_path) patch.boletos_pdf_path = p.boletos_pdf_path
    const { error } = await supabase.from('notas_fiscais').update(patch).eq('id', p.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  aprovar: async (p: { id: number; aprovado_por: string; aprovado_perfil?: string; usuario_id?: number | null }) => {
    const { data, error } = await supabase.rpc('aprovar_nota_fiscal', { p_id: p.id })
    if (error) throw new Error(error.message)
    return { ok: true, aprovado_em: data }
  },

  resumo: async (p: number | { empresa_id: number; dataInicio?: string; dataFim?: string }) => {
    const empresa_id = typeof p === 'number' ? p : p.empresa_id
    const dataInicio = typeof p === 'number' ? undefined : p.dataInicio
    const dataFim = typeof p === 'number' ? undefined : p.dataFim
    let q = supabase.from('notas_fiscais').select('id,fornecedor_nome,data').eq('empresa_id', empresa_id)
    if (dataInicio && dataFim) q = q.gte('data', dataInicio).lte('data', dataFim)
    const { data: notas, error } = await q
    if (error) throw new Error(error.message)
    const ids = (notas ?? []).map(n => n.id)
    let boletos: any[] = []
    if (ids.length) {
      const r = await supabase.from('notas_fiscais_boletos').select('nota_id,valor').in('nota_id', ids)
      if (r.error) throw new Error(r.error.message)
      boletos = r.data ?? []
    }
    const nomes = new Map((notas ?? []).map(n => [n.id, n.fornecedor_nome]))
    const grupos = new Map<string, number>()
    for (const b of boletos) {
      const nome = nomes.get(b.nota_id) ?? 'Sem fornecedor'
      grupos.set(nome, (grupos.get(nome) ?? 0) + Number(b.valor))
    }
    return {
      total: (notas ?? []).length, valorTotal: boletos.reduce((x, b) => x + Number(b.valor), 0),
      porFornecedor: [...grupos].sort(([a], [b]) => a.localeCompare(b)).map(([nome, total]) => ({ nome, total })),
    }
  },

  excluir: async (id: number) => {
    const { error } = await supabase.rpc('excluir_nota_fiscal', { p_id: id })
    if (error) throw new Error(error.message)
    return { ok: true }
  },
}

// NOVO: usado na tela de Almoxarifado (Entradas) — mesma lógica de
// almoxarifadoEntradas.ipc.ts (RPCs).
const almoxarifadoEntradasApi = {
  listar: async (p: { empresa_id: number; busca?: string }) => {
    let q = supabase.from('almoxarifado_entradas').select('*').eq('empresa_id', p.empresa_id).order('data', { ascending: false }).order('id', { ascending: false })
    if (p.busca) {
      const termo = p.busca.replace(/[(),.]/g, ' ')
      q = q.or(`numero_nota.ilike.%${termo}%,numero_pedido.ilike.%${termo}%,fornecedor_nome.ilike.%${termo}%`)
    }
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return data ?? []
  },
  buscarPorId: async (id: number) => {
    const [{ data: entrada, error: e1 }, { data: itens, error: e2 }] = await Promise.all([
      supabase.from('almoxarifado_entradas').select('*').eq('id', id).maybeSingle(),
      supabase.from('almoxarifado_entradas_itens').select('*').eq('entrada_id', id),
    ])
    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)
    return entrada ? { ...entrada, itens: itens ?? [] } : null
  },
  criar: async (p: {
    empresa_id: number; numero_nota?: string | null; numero_pedido?: string | null; data: string
    fornecedor_id?: number | null; fornecedor_nome: string; valor_desconto?: number
    itens: { produto_id: number; produto_codigo: string; produto_nome: string; quantidade: number; valor_unitario: number }[]
  }) => {
    const { data, error } = await supabase.rpc('criar_entrada_almoxarifado', { p })
    if (error) throw new Error(error.message)
    return { id: data }
  },
  excluir: async (id: number) => {
    const { error } = await supabase.rpc('excluir_entrada_almoxarifado', { p_entrada_id: id })
    if (error) throw new Error(error.message)
    return { ok: true }
  },
}

// NOVO: usado na tela de Almoxarifado (Saídas) — mesma lógica de
// almoxarifadoSaidas.ipc.ts (RPCs).
const almoxarifadoSaidasApi = {
  listar: async (p: { empresa_id: number; busca?: string; dataInicio?: string; dataFim?: string }) => {
    let q = supabase.from('almoxarifado_saidas').select('*').eq('empresa_id', p.empresa_id).order('data', { ascending: false }).order('id', { ascending: false })
    if (p.busca) {
      const termo = p.busca.replace(/[(),.]/g, ' ')
      q = q.or(`produto_nome.ilike.%${termo}%,produto_codigo.ilike.%${termo}%,retirado_por_nome.ilike.%${termo}%`)
    }
    if (p.dataInicio && p.dataFim) q = q.gte('data', p.dataInicio).lte('data', p.dataFim)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return data ?? []
  },
  buscarPorId: async (id: number) => {
    const { data, error } = await supabase.from('almoxarifado_saidas').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    return data ?? null
  },
  criar: async (p: {
    empresa_id: number; data: string; produto_id: number; produto_codigo: string; produto_nome: string; quantidade: number
    retirado_por_tipo: 'colaborador' | 'avulso'; retirado_por_id?: number | null; retirado_por_nome: string
    setor?: string | null; solicitado_por_id?: number | null; solicitado_por_nome?: string | null; liberado_por?: string | null
  }) => {
    const { data, error } = await supabase.rpc('criar_saida_almoxarifado', { p })
    if (error) throw new Error(error.message)
    return { id: data }
  },
  // NOVO: sem parte Supabase no original (só SQLite) — implementação equivalente.
  salvarCaminhoPdf: async (p: { id: number; pdf_path: string }) => {
    const { error } = await supabase.from('almoxarifado_saidas').update({ pdf_path: p.pdf_path }).eq('id', p.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },
  excluir: async (id: number) => {
    const { error } = await supabase.rpc('excluir_saida_almoxarifado', { p_saida_id: id })
    if (error) throw new Error(error.message)
    return { ok: true }
  },
}

// NOVO: usado nas telas de Solicitações ao Setor Pessoal (ADM e
// Setor Pessoal) — mesma lógica de solicitacoesPessoal.ipc.ts, com
// anexos como File[] (upload direto pro Storage), incluindo as
// notificações (mesma tabela notificacoes_eventos já usada em outros
// módulos).
const TITULO_TIPO_SOLICITACAO: Record<string, string> = {
  admissao: 'Admissão', desligamento: 'Desligamento', alteracao_salarial: 'Alteração salarial', outro: 'Movimentação',
}
async function enviarAnexosSolicitacao(empresaId: number, solicitacaoId: number, arquivos: { arquivo: File }[], origem: 'adm' | 'setor_pessoal') {
  for (let ordem = 0; ordem < arquivos.length; ordem++) {
    const { arquivo } = arquivos[ordem]
    const remoto = `${empresaId}/solicitacoes/${solicitacaoId}/${Date.now()}-${arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error: e1 } = await supabase.storage.from('documentos-rh').upload(remoto, arquivo)
    if (e1) throw new Error(e1.message)
    const { error: e2 } = await supabase.from('solicitacoes_pessoal_anexos').insert({ solicitacao_id: solicitacaoId, caminho: `supabase://${remoto}`, nome: arquivo.name, origem, ordem })
    if (e2) throw new Error(e2.message)
  }
}
const solicitacoesPessoalApi = {
  criar: async (p: {
    empresa_id: number; colaborador_id: number; tipo: 'admissao' | 'desligamento' | 'alteracao_salarial' | 'outro'
    observacoes?: string | null; solicitado_por: string; anexos?: { arquivo: File }[]
  }) => {
    const { data, error } = await supabase.from('solicitacoes_pessoal').insert({
      empresa_id: p.empresa_id, colaborador_id: p.colaborador_id, tipo: p.tipo,
      observacoes: p.observacoes ?? null, solicitado_por: p.solicitado_por,
    }).select('id').single()
    if (error) throw new Error(error.message)
    await enviarAnexosSolicitacao(p.empresa_id, data.id, p.anexos ?? [], 'adm')

    const { data: colaborador } = await supabase.from('colaboradores').select('nome').eq('id', p.colaborador_id).maybeSingle()
    await supabase.from('notificacoes_eventos').insert({
      empresa_id: p.empresa_id, tipo: 'solicitacao_pessoal_nova', destinatario_perfil: 'setor_pessoal',
      titulo: `${TITULO_TIPO_SOLICITACAO[p.tipo] ?? 'Movimentação'} — ${colaborador?.nome ?? 'colaborador'}`,
      mensagem: p.observacoes || null, referencia_id: data.id,
    })

    return { id: data.id }
  },

  listarPorObra: async (empresaId: number) => {
    const [{ data: solicitacoes, error: e1 }, { data: colaboradoresRows, error: e2 }] = await Promise.all([
      supabase.from('solicitacoes_pessoal').select('*').eq('empresa_id', empresaId).order('solicitado_em', { ascending: false }),
      supabase.from('colaboradores').select('id,nome').eq('empresa_id', empresaId),
    ])
    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)
    const nomes = new Map((colaboradoresRows ?? []).map(c => [c.id, c.nome]))
    return (solicitacoes ?? []).map(s => ({ ...s, colaborador_nome: nomes.get(s.colaborador_id) ?? null }))
  },

  listarTodas: async () => {
    const [{ data: solicitacoes, error: e1 }, { data: colaboradoresRows, error: e2 }, { data: empresasRows, error: e3 }] = await Promise.all([
      supabase.from('solicitacoes_pessoal').select('*').order('solicitado_em', { ascending: false }),
      supabase.from('colaboradores').select('id,nome'),
      supabase.from('empresas').select('id,nome'),
    ])
    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)
    if (e3) throw new Error(e3.message)
    const nomes = new Map((colaboradoresRows ?? []).map(c => [c.id, c.nome]))
    const obras = new Map((empresasRows ?? []).map(e => [e.id, e.nome]))
    return (solicitacoes ?? []).map(s => ({ ...s, colaborador_nome: nomes.get(s.colaborador_id) ?? null, obra_nome: obras.get(s.empresa_id) ?? null, obra_id: s.empresa_id }))
  },

  buscarPorId: async (id: number) => {
    const { data: solicitacao, error } = await supabase.from('solicitacoes_pessoal').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    if (!solicitacao) return null
    const [{ data: empresa, error: e1 }, { data: colaborador, error: e2 }, { data: anexos, error: e3 }] = await Promise.all([
      supabase.from('empresas').select('nome').eq('id', solicitacao.empresa_id).maybeSingle(),
      supabase.from('colaboradores').select('*').eq('id', solicitacao.colaborador_id).maybeSingle(),
      supabase.from('solicitacoes_pessoal_anexos').select('id,caminho,nome,origem,ordem').eq('solicitacao_id', id).order('origem').order('ordem'),
    ])
    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)
    if (e3) throw new Error(e3.message)
    return {
      ...solicitacao, obra_nome: empresa?.nome ?? null, colaborador,
      anexos_adm: (anexos ?? []).filter(a => a.origem === 'adm'),
      anexos_setor_pessoal: (anexos ?? []).filter(a => a.origem === 'setor_pessoal'),
    }
  },

  responder: async (p: { id: number; respondido_por: string; resposta_observacoes?: string | null; anexos?: { arquivo: File }[] }) => {
    const { data: solicitacao, error: e0 } = await supabase.from('solicitacoes_pessoal').select('empresa_id').eq('id', p.id).single()
    if (e0) throw new Error(e0.message)
    const { error } = await supabase.from('solicitacoes_pessoal').update({
      status: 'respondido', respondido_por: p.respondido_por, resposta_observacoes: p.resposta_observacoes ?? null, respondido_em: new Date().toISOString(),
    }).eq('id', p.id)
    if (error) throw new Error(error.message)
    await enviarAnexosSolicitacao(solicitacao.empresa_id, p.id, p.anexos ?? [], 'setor_pessoal')

    const { data: detalhe } = await supabase.from('solicitacoes_pessoal').select('tipo, colaboradores(nome)').eq('id', p.id).maybeSingle()
    const colaboradorNome = (detalhe as any)?.colaboradores?.nome ?? 'colaborador'
    for (const destinatario of ['admin', 'gestor']) {
      await supabase.from('notificacoes_eventos').insert({
        empresa_id: solicitacao.empresa_id, tipo: 'solicitacao_pessoal_respondida', destinatario_perfil: destinatario,
        titulo: `Setor Pessoal respondeu — ${colaboradorNome}`,
        mensagem: `${TITULO_TIPO_SOLICITACAO[detalhe?.tipo ?? 'outro'] ?? 'Movimentação'} — documentos prontos pra baixar`,
        referencia_id: p.id,
      })
    }

    return { ok: true }
  },

  concluir: async (id: number) => {
    const { error } = await supabase.from('solicitacoes_pessoal').update({ status: 'concluido', concluido_em: new Date().toISOString() }).eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  excluir: async (id: number) => {
    const { error } = await supabase.from('solicitacoes_pessoal').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },
}

// NOVO: usado na tela de Exportação de Lançamentos — o
// exportacao.ipc.ts original não tem parte Supabase (só SQLite), e
// usa diálogo nativo do Windows pra salvar — aqui vira download
// direto do navegador.
const exportacaoApi = {
  exportar: async (p: { empresa_id: number; formato: 'csv' | 'pdf' | 'json' }) => {
    const { data, error } = await supabase.from('lancamentos')
      .select('id,data,descricao,valor,tipo,status,categoria_id,conta_id')
      .eq('empresa_id', p.empresa_id).order('data', { ascending: false })
    if (error) throw new Error(error.message)
    const categoriaIds = [...new Set((data ?? []).map(l => l.categoria_id).filter(Boolean))]
    const contaIds = [...new Set((data ?? []).map(l => l.conta_id).filter(Boolean))]
    const [categorias, contas] = await Promise.all([
      categoriaIds.length ? supabase.from('categorias').select('id,nome').in('id', categoriaIds) : Promise.resolve({ data: [] as any[], error: null }),
      contaIds.length ? supabase.from('contas').select('id,nome').in('id', contaIds) : Promise.resolve({ data: [] as any[], error: null }),
    ])
    const cats = new Map((categorias.data ?? []).map(c => [c.id, c.nome]))
    const contasMap = new Map((contas.data ?? []).map(c => [c.id, c.nome]))
    const lancamentos = (data ?? []).map(l => ({ ...l, categoria: cats.get(l.categoria_id) ?? null, conta: contasMap.get(l.conta_id) ?? null }))

    if (p.formato === 'json') return JSON.stringify({ lancamentos }, null, 2)

    if (p.formato === 'csv') {
      const cabecalho = ['ID', 'Data', 'Descrição', 'Valor', 'Tipo', 'Status', 'Categoria', 'Conta'].join(';')
      const linhas = lancamentos.map(l => [
        l.id, l.data, `"${String(l.descricao).replace(/"/g, '""')}"`, String(l.valor).replace('.', ','),
        l.tipo, l.status, l.categoria ?? '', l.conta ?? '',
      ].join(';'))
      return [cabecalho, ...linhas].join('\n')
    }

    const rows = lancamentos.map(l => `
      <tr>
        <td>${l.data}</td><td>${l.descricao}</td>
        <td>${l.tipo === 'receita' ? '+' : '-'} R$ ${Number(l.valor).toFixed(2)}</td>
        <td>${l.tipo}</td><td>${l.status}</td><td>${l.categoria ?? '-'}</td><td>${l.conta ?? '-'}</td>
      </tr>`).join('')
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8" /><style>
        body { font-family: sans-serif; font-size: 11px; margin: 24px; }
        h1 { font-size: 16px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 6px 8px; border: 1px solid #ddd; text-align: left; }
        th { background: #f3f4f6; } tr:nth-child(even) { background: #f9fafb; }
      </style></head><body><h1>Relatório de Lançamentos</h1><table><thead><tr>
        <th>Data</th><th>Descrição</th><th>Valor</th><th>Tipo</th><th>Status</th><th>Categoria</th><th>Conta</th>
      </tr></thead><tbody>${rows}</tbody></table></body></html>`
  },

  salvarArquivo: async (p: { nome: string; conteudo: string; formato: 'csv' | 'pdf' | 'json' }) => {
    const tipoMime = p.formato === 'csv' ? 'text/csv' : p.formato === 'json' ? 'application/json' : 'text/html'
    const blob = new Blob([p.conteudo], { type: tipoMime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = p.nome
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
    return { ok: true, filePath: p.nome }
  },
}

// NOVO: usado no Painel do Supervisor — mesma lógica de
// supervisorPainel.ipc.ts (registrado como window.api.supervisor).
const supervisorApi = {
  painelInicio: async (p: { empresa_ids: number[]; dataInicio: string; dataFim: string }) => {
    if (p.empresa_ids.length === 0) {
      return { obras: [], totalColaboradores: 0, idadeMedia: null, admissoes: 0, desligamentos: 0, totalAutorizacoes: 0, totalNotasFiscais: 0 }
    }
    const [{ data: obras, error: e1 }, { data: colaboradoresRows, error: e2 }, { data: aps, error: e3 }, { data: nfs, error: e4 }, { data: boletos, error: e5 }] = await Promise.all([
      supabase.from('empresas').select('id,nome,titulo_obra,estado').in('id', p.empresa_ids).order('nome'),
      supabase.from('colaboradores').select('status,nascimento,data_admissao,data_demissao').in('empresa_id', p.empresa_ids),
      supabase.from('autorizacoes_pagamento').select('id,valor,created_at').in('empresa_id', p.empresa_ids),
      supabase.from('notas_fiscais').select('id,data').in('empresa_id', p.empresa_ids),
      supabase.from('notas_fiscais_boletos').select('nota_id,valor'),
    ])
    for (const e of [e1, e2, e3, e4, e5]) if (e) throw new Error(e.message)
    const periodo = (d: string | null) => !!d && d.slice(0, 10) >= p.dataInicio && d.slice(0, 10) <= p.dataFim
    const ativos = (colaboradoresRows ?? []).filter(c => c.status === 'ativo')
    const idades = ativos.filter(c => c.nascimento).map(c => (Date.now() - new Date(`${c.nascimento}T00:00:00`).getTime()) / 31557600000)
    const nfIds = new Set((nfs ?? []).filter(n => periodo(n.data)).map(n => n.id))
    return {
      obras: obras ?? [], totalColaboradores: ativos.length,
      idadeMedia: idades.length ? Math.round(idades.reduce((a, b) => a + b, 0) / idades.length) : null,
      admissoes: (colaboradoresRows ?? []).filter(c => periodo(c.data_admissao)).length,
      desligamentos: (colaboradoresRows ?? []).filter(c => periodo(c.data_demissao)).length,
      totalAutorizacoes: (aps ?? []).filter(a => periodo(a.created_at)).reduce((x, a) => x + Number(a.valor), 0),
      totalNotasFiscais: (boletos ?? []).filter(b => nfIds.has(b.nota_id)).reduce((x, b) => x + Number(b.valor), 0),
    }
  },

  graficosObras: async (p: { empresa_ids: number[]; meses: number }) => {
    if (p.empresa_ids.length === 0) return { admissoesDesligamentos: [], despesasMensais: [], colaboradores: { ativos: 0, ferias: 0, afastados: 0, desligados: 0, total: 0 } }
    const [{ data: colaboradoresRows, error: e1 }, { data: aps, error: e2 }, { data: nfs, error: e3 }, { data: boletos, error: e4 }] = await Promise.all([
      supabase.from('colaboradores').select('status,data_admissao,data_demissao').in('empresa_id', p.empresa_ids),
      supabase.from('autorizacoes_pagamento').select('id,valor,created_at').in('empresa_id', p.empresa_ids),
      supabase.from('notas_fiscais').select('id,data').in('empresa_id', p.empresa_ids),
      supabase.from('notas_fiscais_boletos').select('nota_id,valor'),
    ])
    for (const e of [e1, e2, e3, e4]) if (e) throw new Error(e.message)
    const mesesLista: string[] = []
    const hoje = new Date(); hoje.setDate(1)
    for (let i = p.meses - 1; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      mesesLista.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    const add = (mapa: Map<string, number>, d: string | null, v = 1) => { if (d && mesesLista.includes(d.slice(0, 7))) mapa.set(d.slice(0, 7), (mapa.get(d.slice(0, 7)) ?? 0) + v) }
    const adm = new Map<string, number>(), desl = new Map<string, number>(), gastos = new Map<string, number>()
    for (const c of colaboradoresRows ?? []) { add(adm, c.data_admissao); add(desl, c.data_demissao) }
    for (const a of aps ?? []) add(gastos, a.created_at, Number(a.valor))
    const nfPorId = new Map((nfs ?? []).map(n => [n.id, n.data]))
    for (const b of boletos ?? []) add(gastos, nfPorId.get(b.nota_id) ?? null, Number(b.valor))
    const status = new Map<string, number>()
    for (const c of colaboradoresRows ?? []) status.set(c.status, (status.get(c.status) ?? 0) + 1)
    const ativos = status.get('ativo') ?? 0, ferias = status.get('ferias') ?? 0, afastados = status.get('afastado') ?? 0, desligados = status.get('desligado') ?? 0
    return {
      admissoesDesligamentos: mesesLista.map(m => ({ mes: m, admissoes: adm.get(m) ?? 0, desligamentos: desl.get(m) ?? 0 })),
      despesasMensais: mesesLista.map(m => ({ mes: m, total: gastos.get(m) ?? 0 })),
      colaboradores: { ativos, ferias, afastados, desligados, total: ativos + ferias + afastados + desligados },
    }
  },

  colaboradoresPorDimensao: async (p: { empresa_ids: number[]; dimensao: 'status' | 'setor' | 'funcao' }) => {
    if (p.empresa_ids.length === 0) return { itens: [], total: 0 }
    const { data, error } = await supabase.from('colaboradores').select(p.dimensao).in('empresa_id', p.empresa_ids)
    if (error) throw new Error(error.message)
    const grupos = new Map<string, number>()
    for (const c of data ?? []) {
      const chave = String((c as Record<string, unknown>)[p.dimensao] ?? '').trim() || 'Não informado'
      grupos.set(chave, (grupos.get(chave) ?? 0) + 1)
    }
    const itens = [...grupos].map(([chave, total]) => ({ chave, total })).sort((a, b) => b.total - a.total)
    return { itens, total: itens.reduce((x, i) => x + i.total, 0) }
  },

  notificacoesObras: async (empresaIds: number[]) => {
    if (empresaIds.length === 0) return []
    const [{ data: aps, error: e1 }, { data: nfs, error: e2 }, { data: colaboradoresRows, error: e3 }] = await Promise.all([
      supabase.from('autorizacoes_pagamento').select('empresa_id,lote_id,aprovado_supervisor_por').in('empresa_id', empresaIds),
      supabase.from('notas_fiscais').select('empresa_id,lote_id,aprovado_supervisor_por').in('empresa_id', empresaIds),
      supabase.from('colaboradores').select('empresa_id,data_admissao,data_demissao').in('empresa_id', empresaIds),
    ])
    for (const e of [e1, e2, e3]) if (e) throw new Error(e.message)
    const limite = new Date(); limite.setDate(limite.getDate() - 7)
    const dataLimite = limite.toISOString().slice(0, 10)
    return empresaIds.map(empresaId => {
      const aps_pendentes = (aps ?? []).filter(a => a.empresa_id === empresaId && a.lote_id !== null && a.aprovado_supervisor_por === null).length
      const nfs_pendentes = (nfs ?? []).filter(n => n.empresa_id === empresaId && n.lote_id !== null && n.aprovado_supervisor_por === null).length
      const admissoes_recentes = (colaboradoresRows ?? []).filter(c => c.empresa_id === empresaId && !!c.data_admissao && c.data_admissao >= dataLimite).length
      const desligamentos_recentes = (colaboradoresRows ?? []).filter(c => c.empresa_id === empresaId && !!c.data_demissao && c.data_demissao >= dataLimite).length
      return { empresa_id: empresaId, aps_pendentes, nfs_pendentes, admissoes_recentes, desligamentos_recentes, total: aps_pendentes + nfs_pendentes + admissoes_recentes + desligamentos_recentes }
    })
  },
}

// NOVO: usado por qualquer tela que gera/imprime documento (AP, Nota
// Fiscal, etc) — fala com o serviço de PDF isolado na Vercel
// (Puppeteer + Chrome de verdade), em vez do Electron gerando local.
// Documentado no repositório em pdf-service/.
const PDF_SERVICE_URL = import.meta.env.VITE_PDF_SERVICE_URL as string ?? 'https://admpro-pdf-service.vercel.app'

async function chamarServicoPdf(caminho: string, corpo: Record<string, unknown>) {
  const { data: sessao, error } = await supabase.auth.getSession()
  if (error || !sessao.session) throw new Error('Sessão do Supabase não encontrada. Faça login novamente.')
  const resposta = await fetch(`${PDF_SERVICE_URL}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.session.access_token}` },
    body: JSON.stringify(corpo),
  })
  const json = await resposta.json()
  if (!resposta.ok) throw new Error(json.error ?? json.erro ?? `Erro ao gerar o documento (status ${resposta.status}).`)
  return json
}

// Baixa um arquivo do Storage e devolve como Blob — usado tanto pra
// abrir numa aba nova quanto pra baixar de verdade.
// CORRIGIDO: o Supabase Storage às vezes devolve o Blob sem o tipo
// MIME certo (ou genérico demais) — sem isso, o navegador não sabe
// que é um PDF e mostra o conteúdo bruto (binário) como se fosse
// texto, em vez de abrir o visualizador de PDF embutido dele.
async function baixarComoBlob(caminhoStorage: string): Promise<Blob> {
  const semPrefixo = caminhoStorage.replace('supabase://documentos-rh/', '')
  const { data, error } = await supabase.storage.from('documentos-rh').download(semPrefixo)
  if (error || !data) throw new Error(error?.message ?? 'Arquivo não encontrado.')
  if (data.type === 'application/pdf') return data
  return new Blob([data], { type: 'application/pdf' })
}

const documentosApi = {
  // ALTERADO: no desktop, abre o diálogo de impressão nativo. Na web,
  // não existe — abre o HTML numa aba nova e chama o print() do
  // próprio navegador (que também deixa "Salvar como PDF"), sem
  // precisar do serviço de PDF pra esse caso simples (sem anexo).
  // CORRIGIDO: `document.write` numa aba em branco não estava sendo
  // interpretado como HTML de verdade em alguns navegadores (mostrava
  // o código fonte cru, com as tags visíveis, em vez de desenhar a
  // página) — trocado por um Blob com tipo MIME explícito
  // (text/html), que garante que o navegador sabe o que está abrindo.
  imprimir: async (p: { html: string; landscape?: boolean; nomeArquivo?: string }) => {
    const blob = new Blob([p.html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const janela = window.open(url, '_blank')
    if (!janela) { URL.revokeObjectURL(url); return { ok: false } }
    janela.addEventListener('load', () => {
      janela.focus()
      janela.print()
      // Espera um pouco antes de liberar a memória do Blob, pra dar
      // tempo do diálogo de impressão terminar de ler o conteúdo.
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    })
    return { ok: true }
  },

  // NOVO: salva automaticamente (mesmo fluxo do desktop, chamado
  // depois de registrar/aprovar uma AP ou Nota Fiscal) — fala com o
  // serviço de PDF, que já sobe pro Storage sozinho.
  salvarPdfInterno: async (p: {
    html: string; landscape?: boolean; nomeArquivo: string; pastaId: string; empresa_id?: number
    anexos?: { caminho: string; vaiAssinatura?: boolean; arquivo?: File }[]
    carimbos?: { aprovadoPor: string; aprovadoEm: string; carimboBase64?: string | null; posicao: 'inferior-esquerdo' | 'inferior-direito' }[]
  }) => {
    if (!p.empresa_id) throw new Error('empresa_id é obrigatório pra salvar o documento.')
    // CORRIGIDO: anexos vindos do formulário podem trazer o arquivo
    // de verdade (File, rodando na web) em vez de um caminho pronto
    // — precisa subir ANTES de mandar pro serviço de PDF (que só
    // sabe lidar com endereço do Storage, não recebe arquivo bruto
    // numa requisição JSON).
    const anexosProntos = p.anexos?.length ? await garantirAnexosCaminhoStorage(p.empresa_id, p.pastaId, p.anexos) : undefined
    const resultado = await chamarServicoPdf('/api/gerar-pdf', { ...p, anexos: anexosProntos })
    return { ok: true, filePath: resultado.path }
  },

  // NOVO: usado pelo Painel do Supervisor (aprovação) — gera o
  // documento com anexos e já baixa pro computador da pessoa (o
  // desktop mostra um diálogo de "Salvar como", aqui vira download
  // direto). O resultado (caminho no Storage) é usado em seguida por
  // aplicarCarimbosAP/carimbarPrimeiraPagina (já funciona) — essa
  // função só cuida de gerar e salvar, não carimba nada sozinha
  // (evita carimbar duas vezes).
  gerarPdfComAnexos: async (p: {
    html: string; landscape?: boolean; nomeArquivo: string
    anexos?: { caminho: string; vaiAssinatura?: boolean; arquivo?: File }[]
    empresa_id?: number
  }) => {
    if (!p.empresa_id) throw new Error('empresa_id é obrigatório pra gerar o documento.')
    const pastaId = `DOC_${Date.now()}`
    const anexosProntos = p.anexos?.length ? await garantirAnexosCaminhoStorage(p.empresa_id, pastaId, p.anexos) : undefined
    const resultado = await chamarServicoPdf('/api/gerar-pdf', { ...p, anexos: anexosProntos, pastaId })
    try {
      const blob = await baixarComoBlob(resultado.path)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${p.nomeArquivo}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch { /* o download é só uma cortesia — se falhar, o arquivo já está salvo no Storage mesmo assim */ }
    return { ok: true, filePath: resultado.path }
  },

  // NOVO: no desktop, sobe um arquivo LOCAL pro Storage (depois de
  // carimbar por cima com pdf-lib, que só sabe mexer em arquivo em
  // disco). Na web não existe "arquivo local" nesse ponto do fluxo —
  // o gerarPdfComAnexos acima já devolve direto o caminho no Storage
  // (supabase://...), então aqui não tem nada pra fazer além de
  // confirmar o mesmo caminho de volta.
  subirPdfStorage: async (p: { caminhoLocal: string; empresaId: number; pastaId: string }) => {
    return { ok: true, caminho: p.caminhoLocal }
  },

  // NOVO: usado pela Nota Fiscal — só junta os anexos (nota e
  // boletos) em dois PDFs separados, sem gerar nenhum documento base
  // (por isso não manda "html").
  gerarPdfsSeparados: async (p: {
    notaArquivos: string[]; boletoArquivos: string[]; pastaId: string; empresa_id?: number
  }) => {
    if (!p.empresa_id) throw new Error('empresa_id é obrigatório pra salvar o documento.')
    let notaPdfPath: string | null = null
    let boletosPdfPath: string | null = null
    if (p.notaArquivos.length > 0) {
      const r = await chamarServicoPdf('/api/gerar-pdf', {
        nomeArquivo: `${p.pastaId}_nota`, pastaId: p.pastaId, empresa_id: p.empresa_id,
        anexos: p.notaArquivos.map(caminho => ({ caminho })),
      })
      notaPdfPath = r.path
    }
    if (p.boletoArquivos.length > 0) {
      const r = await chamarServicoPdf('/api/gerar-pdf', {
        nomeArquivo: `${p.pastaId}_boletos`, pastaId: p.pastaId, empresa_id: p.empresa_id,
        anexos: p.boletoArquivos.map(caminho => ({ caminho })),
      })
      boletosPdfPath = r.path
    }
    return { ok: true, notaPdfPath, boletosPdfPath }
  },

  // NOVO: carimba a primeira página de um PDF já salvo — usa o
  // endpoint leve (sem Chrome), bem mais rápido.
  carimbarPrimeiraPagina: async (p: {
    caminhoPdf: string; aprovadoPor: string; aprovadoEm: string; carimboBase64?: string | null
    posicao?: 'inferior-esquerdo' | 'inferior-direito'; tamanho?: 'normal' | 'pequeno'
  }) => {
    try {
      await chamarServicoPdf('/api/carimbar-pdf', { caminhoPdf: p.caminhoPdf, carimbo: p })
      return { ok: true }
    } catch (erro) {
      console.error('Erro ao carimbar PDF:', p.caminhoPdf, erro)
      return { ok: false, erro: erro instanceof Error ? erro.message : String(erro) }
    }
  },

  // ALTERADO: no desktop abre no leitor padrão do Windows. Na web,
  // abre numa aba nova do navegador (que já sabe visualizar PDF
  // sozinho).
  abrirArquivo: async (caminho: string) => {
    try {
      const blob = await baixarComoBlob(caminho)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      return { ok: true, erro: null }
    } catch (erro) {
      return { ok: false, erro: erro instanceof Error ? erro.message : 'Erro ao abrir o arquivo.' }
    }
  },

  // NOVO: exclusivo da web — sobe um único arquivo avulso pro
  // Storage e devolve o endereço (supabase://...). Usado por telas
  // (como NotaFiscalModal.tsx) que ainda mandam os anexos como lista
  // de STRING simples pro resto do fluxo (formato que precisa
  // continuar igual no desktop) — a tela resolve cada File pra um
  // caminho de verdade ANTES de montar o payload, chamando essa
  // função só quando ela existir (no desktop, essa função nem
  // existe, e a tela usa o .path do jeito de sempre).
  prepararAnexoWeb: async (p: { empresa_id: number; pasta_id: string; arquivo: File }) => {
    const remoto = `${p.empresa_id}/${p.pasta_id}/${Date.now()}-${p.arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error } = await supabase.storage.from('documentos-rh').upload(remoto, p.arquivo)
    if (error) throw new Error(error.message)
    return `supabase://documentos-rh/${remoto}`
  },

  // ALTERADO: no desktop copia os PDFs pra uma pasta escolhida pelo
  // usuário — não existe "pasta local" na web. Em vez disso, baixa
  // tudo junto num único arquivo .zip.
  gerarLote: async (arquivos: { origem: string; nomeArquivo: string }[]) => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    let copiados = 0
    const falhas: string[] = []
    for (const arq of arquivos) {
      try {
        const blob = await baixarComoBlob(arq.origem)
        zip.file(`${arq.nomeArquivo}.pdf`, blob)
        copiados++
      } catch {
        falhas.push(arq.nomeArquivo)
      }
    }
    if (copiados === 0) return { ok: false, canceled: false }
    const conteudoZip = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(conteudoZip)
    const a = document.createElement('a')
    a.href = url; a.download = `lote-aps-${Date.now()}.zip`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
    return { ok: true, copiados, falhas }
  },
}

// NOVO: Contrato de Prestação de Serviços — mesma lógica de
// contratos.ipc.ts, reaproveitando o texto de contratoTemplate.ts
// direto (sem duplicar).
const contratosApi = {
  buscarOuCriar: async (empresaId: number) => {
    const { data: existente, error: erroBusca } = await supabase
      .from('contratos').select('*').eq('empresa_id', empresaId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (erroBusca) throw new Error(erroBusca.message)
    if (existente && existente.versao === VERSAO_CONTRATO) return existente

    const { data: empresa, error: erroEmpresa } = await supabase
      .from('empresas').select('razao_social, nome, cnpj, valor_mensalidade').eq('id', empresaId).single()
    if (erroEmpresa) throw new Error(erroEmpresa.message)

    const texto = preencherContrato({
      nome_empresa: empresa.razao_social || empresa.nome,
      cnpj_empresa: empresa.cnpj, valor_mensalidade: Number(empresa.valor_mensalidade ?? 0),
    })

    const { data: novo, error: erroInsert } = await supabase.from('contratos').insert({
      empresa_id: empresaId, versao: VERSAO_CONTRATO, texto_completo: texto, status: 'pendente',
    }).select('*').single()
    if (erroInsert) throw new Error(erroInsert.message)
    return novo
  },

  assinar: async (p: { contrato_id: number; nome_completo: string; usuario_id: number }) => {
    const { error } = await supabase.from('contratos').update({
      status: 'assinado', assinado_por_nome: p.nome_completo,
      assinado_por_usuario_id: p.usuario_id, data_assinatura: new Date().toISOString(),
    }).eq('id', p.contrato_id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },
}

// NOVO: módulo Obra — Estrutura Analítica (EAP) — mesma lógica de
// obraEap.ipc.ts. O peso (%) de cada item é sempre calculado na
// tela a partir do valor orçado, nunca gravado aqui.
interface ItemEapPayload {
  id?: number; empresa_id: number | null; parent_id: number | null; nome: string
  valor_orcado: number; unidade_medida: string | null; ordem: number
  data_inicio_prevista?: string | null; data_fim_prevista?: string | null
}
const obraEapApi = {
  listar: async (empresaId: number) => {
    const { data, error } = await supabase.from('obra_eap_itens').select('*').eq('empresa_id', empresaId).order('ordem').order('id')
    if (error) throw new Error(error.message)
    return data ?? []
  },
  listarModelo: async () => {
    const { data, error } = await supabase.from('obra_eap_itens').select('*').is('empresa_id', null).order('ordem').order('id')
    if (error) throw new Error(error.message)
    return data ?? []
  },
  criar: async (p: ItemEapPayload) => {
    const { data, error } = await supabase.from('obra_eap_itens').insert({
      empresa_id: p.empresa_id, parent_id: p.parent_id, nome: p.nome,
      valor_orcado: p.valor_orcado, unidade_medida: p.unidade_medida, ordem: p.ordem,
      data_inicio_prevista: p.data_inicio_prevista ?? null, data_fim_prevista: p.data_fim_prevista ?? null,
    }).select('id').single()
    if (error) throw new Error(error.message)
    return { id: data.id }
  },
  atualizar: async (p: ItemEapPayload) => {
    const { error } = await supabase.from('obra_eap_itens').update({
      nome: p.nome, valor_orcado: p.valor_orcado, unidade_medida: p.unidade_medida, ordem: p.ordem,
      data_inicio_prevista: p.data_inicio_prevista ?? null, data_fim_prevista: p.data_fim_prevista ?? null,
    }).eq('id', p.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },
  excluir: async (id: number) => {
    // FK no banco já é ON DELETE CASCADE — apaga a árvore inteira embaixo sozinho
    const { error } = await supabase.from('obra_eap_itens').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },
  clonarModelo: async (empresaId: number) => {
    const { data: modelo, error } = await supabase.from('obra_eap_itens').select('*').is('empresa_id', null).order('ordem').order('id')
    if (error) throw new Error(error.message)
    const mapaIds = new Map<number, number>()
    for (const item of modelo ?? []) {
      const novoParentId = item.parent_id ? mapaIds.get(item.parent_id) ?? null : null
      const { data: novo, error: e2 } = await supabase.from('obra_eap_itens').insert({
        empresa_id: empresaId, parent_id: novoParentId, nome: item.nome,
        valor_orcado: item.valor_orcado, unidade_medida: item.unidade_medida, ordem: item.ordem,
        data_inicio_prevista: item.data_inicio_prevista, data_fim_prevista: item.data_fim_prevista,
      }).select('id').single()
      if (e2) throw new Error(e2.message)
      mapaIds.set(item.id, novo.id)
    }
    return { ok: true, quantidade: (modelo ?? []).length }
  },
}

// NOVO: módulo Obra — Diário de Obra (RDO) — mesma lógica de
// obraDiario.ipc.ts. Fotos: no desktop, "fotos" vem como lista de
// caminhos locais (do diálogo nativo) ou já supabase:// (existente).
// Na web não existe "caminho local" — o formulário passa File[]
// direto (do seletor de arquivo do navegador) pras fotos NOVAS, e
// string supabase:// pras já existentes.
interface FotoPayloadWeb {
  caminho: string | File  // File = nova (precisa subir); string = já existe (supabase://)
  legenda: string | null
}
interface AtividadePayloadWeb {
  eap_item_id: number; percentual_incremento: number; observacao: string | null; fotos: FotoPayloadWeb[]
}
interface DiarioPayloadWeb {
  id?: number; empresa_id: number; data: string; clima: string | null; condicao_trabalho: string | null
  mao_de_obra_presente: string | null; ocorrencias: string | null
  criado_por: string | null; criado_por_usuario_id: number | null
  atividades: AtividadePayloadWeb[]
}

async function subirFotosNovasWeb(empresaId: number, diarioId: number, atividadeIndex: number, fotos: FotoPayloadWeb[]) {
  const resultado: { caminho: string; legenda: string | null }[] = []
  for (const foto of fotos) {
    if (typeof foto.caminho === 'string') { resultado.push({ caminho: foto.caminho, legenda: foto.legenda }); continue }
    const arquivo = foto.caminho
    const remoto = `${empresaId}/diario-obra/${diarioId}/${atividadeIndex}/${Date.now()}-${arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error } = await supabase.storage.from('documentos-rh').upload(remoto, arquivo)
    if (error) throw new Error(error.message)
    resultado.push({ caminho: `supabase://documentos-rh/${remoto}`, legenda: foto.legenda })
  }
  return resultado
}

async function buscarDiarioCompleto(diario: any) {
  if (!diario) return null
  const { data: atividades, error } = await supabase.from('obra_diario_atividades').select('*').eq('diario_id', diario.id)
  if (error) throw new Error(error.message)
  const comFotos = []
  for (const a of atividades ?? []) {
    const { data: fotos, error: e2 } = await supabase.from('obra_diario_fotos').select('*').eq('atividade_id', a.id)
    if (e2) throw new Error(e2.message)
    comFotos.push({ ...a, fotos: fotos ?? [] })
  }
  return { ...diario, atividades: comFotos }
}

const obraDiarioApi = {
  // NOVO: no desktop abre o diálogo nativo. Na web, abre o seletor
  // de arquivo do navegador (múltiplas imagens) e devolve os File
  // escolhidos — o salvar() abaixo é quem sabe subir cada um.
  selecionarFotos: async (): Promise<File[]> => {
    return new Promise(resolve => {
      const input = document.createElement('input')
      input.type = 'file'; input.accept = 'image/*'; input.multiple = true; input.style.display = 'none'
      input.onchange = () => { resolve(Array.from(input.files ?? [])); input.remove() }
      document.body.appendChild(input); input.click()
    })
  },

  urlFoto: async (caminho: string) => {
    if (!caminho.startsWith('supabase://')) return caminho
    const semPrefixo = caminho.replace(/^supabase:\/\//, '')
    const { data, error } = await supabase.storage.from('documentos-rh').createSignedUrl(semPrefixo, 3600)
    if (error) throw new Error(error.message)
    return data.signedUrl
  },

  listar: async (empresaId: number) => {
    const { data: diarios, error } = await supabase.from('obra_diarios').select('*').eq('empresa_id', empresaId).order('data', { ascending: false })
    if (error) throw new Error(error.message)
    const resultado = []
    for (const d of diarios ?? []) {
      const { count } = await supabase.from('obra_diario_atividades').select('id', { count: 'exact', head: true }).eq('diario_id', d.id)
      resultado.push({ ...d, quantidade_atividades: count ?? 0 })
    }
    return resultado
  },

  buscarPorData: async (p: { empresa_id: number; data: string }) => {
    const { data: diario, error } = await supabase.from('obra_diarios').select('*').eq('empresa_id', p.empresa_id).eq('data', p.data).maybeSingle()
    if (error) throw new Error(error.message)
    return buscarDiarioCompleto(diario)
  },

  buscarPorId: async (id: number) => {
    const { data: diario, error } = await supabase.from('obra_diarios').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    return buscarDiarioCompleto(diario)
  },

  percentuaisAcumulados: async (empresaId: number) => {
    const { data: diarios, error } = await supabase.from('obra_diarios').select('id').eq('empresa_id', empresaId)
    if (error) throw new Error(error.message)
    const diarioIds = (diarios ?? []).map(d => d.id)
    if (diarioIds.length === 0) return {}
    const { data: atividades, error: e2 } = await supabase.from('obra_diario_atividades').select('eap_item_id,percentual_incremento').in('diario_id', diarioIds)
    if (e2) throw new Error(e2.message)
    const totais: Record<number, number> = {}
    for (const a of atividades ?? []) totais[a.eap_item_id] = (totais[a.eap_item_id] ?? 0) + Number(a.percentual_incremento)
    return totais
  },

  todasAtividades: async (empresaId: number) => {
    const { data: diarios, error } = await supabase.from('obra_diarios').select('id,data').eq('empresa_id', empresaId).order('data')
    if (error) throw new Error(error.message)
    const dataPorDiarioId = new Map((diarios ?? []).map(d => [d.id, d.data]))
    const diarioIds = [...dataPorDiarioId.keys()]
    if (diarioIds.length === 0) return []
    const { data: atividades, error: e2 } = await supabase.from('obra_diario_atividades').select('diario_id,eap_item_id,percentual_incremento').in('diario_id', diarioIds)
    if (e2) throw new Error(e2.message)
    return (atividades ?? []).map(a => ({ data: dataPorDiarioId.get(a.diario_id), eap_item_id: a.eap_item_id, percentual_incremento: a.percentual_incremento }))
  },

  salvar: async (p: DiarioPayloadWeb) => {
    let diarioId = p.id
    if (diarioId) {
      const { error } = await supabase.from('obra_diarios').update({
        clima: p.clima, condicao_trabalho: p.condicao_trabalho,
        mao_de_obra_presente: p.mao_de_obra_presente, ocorrencias: p.ocorrencias,
        updated_at: new Date().toISOString(),
      }).eq('id', diarioId)
      if (error) throw new Error(error.message)
      const { error: e2 } = await supabase.from('obra_diario_atividades').delete().eq('diario_id', diarioId)
      if (e2) throw new Error(e2.message)
    } else {
      const { data: novo, error } = await supabase.from('obra_diarios').insert({
        empresa_id: p.empresa_id, data: p.data, clima: p.clima, condicao_trabalho: p.condicao_trabalho,
        mao_de_obra_presente: p.mao_de_obra_presente, ocorrencias: p.ocorrencias,
        criado_por: p.criado_por, criado_por_usuario_id: p.criado_por_usuario_id,
      }).select('id').single()
      if (error) throw new Error(error.message)
      diarioId = novo.id
    }
    if (diarioId === undefined) throw new Error('Erro interno: diário sem id definido.')

    for (let i = 0; i < p.atividades.length; i++) {
      const ativ = p.atividades[i]
      const { data: novaAtividade, error } = await supabase.from('obra_diario_atividades').insert({
        diario_id: diarioId, eap_item_id: ativ.eap_item_id,
        percentual_incremento: ativ.percentual_incremento, observacao: ativ.observacao,
      }).select('id').single()
      if (error) throw new Error(error.message)

      const fotosProntas = await subirFotosNovasWeb(p.empresa_id, diarioId, i, ativ.fotos)
      if (fotosProntas.length) {
        const { error: e2 } = await supabase.from('obra_diario_fotos').insert(
          fotosProntas.map(f => ({ atividade_id: novaAtividade.id, caminho: f.caminho, legenda: f.legenda }))
        )
        if (e2) throw new Error(e2.message)
      }
    }
    return { id: diarioId }
  },

  excluir: async (id: number) => {
    const { error } = await supabase.from('obra_diarios').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },
}

export const webApi = { usuarios, empresas, auth, app: appApi, supabase: supabaseStatus, faturas: faturasApi, notificacoes: notificacoesApi, folhaPagamento: folhaPagamentoApi, lancamentos: lancamentosApi, colaboradores: colaboradoresApi, importacao: importacaoApi, produtos: produtosApi, fornecedores: fornecedoresApi, relatoriosRH: relatoriosRHApi, relatorios: relatoriosApi, opcoes: opcoesApi, ap: apApi, lotes: lotesApi, categorias: categoriasApi, contas: contasApi, contasAPagar: contasAPagarApi, contasAReceber: contasAReceberApi, recibos: recibosApi, pessoasAvulsas: pessoasAvulsasApi, master: masterApi, notasFiscais: notasFiscaisApi, almoxarifadoEntradas: almoxarifadoEntradasApi, almoxarifadoSaidas: almoxarifadoSaidasApi, solicitacoesPessoal: solicitacoesPessoalApi, exportacao: exportacaoApi, supervisor: supervisorApi, documentos: documentosApi, contratos: contratosApi, obraEap: obraEapApi, obraDiario: obraDiarioApi }
