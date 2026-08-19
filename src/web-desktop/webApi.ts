import { supabase } from './supabaseClient'

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

  atualizarCarimbo: async (p: { carimbo_url: string | null }) => {
    const { error } = await supabase.rpc('atualizar_meu_carimbo', { p_carimbo_url: p.carimbo_url })
    if (error) throw new Error(error.message)
    return { ok: true }
  },
}

const empresas = {
  buscarPorId: async (id: number) => {
    const { data, error } = await supabase.from('empresas').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    return data
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
}

// NOVO: usado pela busca global da Navbar — mesma lógica de
// produtos.ipc.ts / fornecedores.ipc.ts (só a listagem por
// enquanto).
const produtosApi = {
  listar: async (p: { empresa_id: number; busca?: string }) => {
    let query = supabase.from('produtos').select('*').eq('empresa_id', p.empresa_id).order('nome')
    if (p.busca) query = query.ilike('nome', `%${p.busca.replace(/[%_]/g, '\\$&')}%`)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return data ?? []
  },
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
}

// NOVO: usado pela Navbar (sino — aviso de experiência vencendo e
// aniversariantes do mês) — módulo relatoriosRH, diferente do que eu
// tinha suposto antes (notificacoes.vencimentoExperiencia, que
// acabou não sendo usado por ninguém — deixei como está, não faz
// mal ficar, só não é chamado).
const relatoriosRHApi = {
  vencimentoExperiencia: async (p: { empresa_id: number; dias: number }) => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const dataLimite = new Date(hoje); dataLimite.setDate(dataLimite.getDate() + p.dias)
    const { data, error } = await supabase.from('colaboradores')
      .select('id,nome,funcao,data_vencimento_experiencia')
      .eq('empresa_id', p.empresa_id)
      .neq('status', 'desligado')
      .not('data_vencimento_experiencia', 'is', null)
      .lte('data_vencimento_experiencia', dataLimite.toISOString().slice(0, 10))
      .order('data_vencimento_experiencia')
    if (error) throw new Error(error.message)
    return (data ?? []).map(c => {
      const vencimento = new Date(`${c.data_vencimento_experiencia}T00:00:00`)
      const dias_restantes = Math.round((vencimento.getTime() - hoje.getTime()) / 86400000)
      return { ...c, dias_restantes }
    })
  },

  aniversariantes: async (p: { empresa_id: number; mes: number }) => {
    const mesBusca = String(p.mes).padStart(2, '0')
    const { data, error } = await supabase.from('colaboradores')
      .select('id,nome,funcao,nascimento').eq('empresa_id', p.empresa_id).neq('status', 'desligado')
    if (error) throw new Error(error.message)
    return (data ?? []).filter(c => c.nascimento?.slice(5, 7) === mesBusca)
      .sort((a, b) => (a.nascimento ?? '').slice(8, 10).localeCompare((b.nascimento ?? '').slice(8, 10)))
  },
}

export const webApi = { usuarios, empresas, auth, app: appApi, supabase: supabaseStatus, faturas: faturasApi, notificacoes: notificacoesApi, folhaPagamento: folhaPagamentoApi, lancamentos: lancamentosApi, colaboradores: colaboradoresApi, importacao: importacaoApi, produtos: produtosApi, fornecedores: fornecedoresApi, relatoriosRH: relatoriosRHApi }
