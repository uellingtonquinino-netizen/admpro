// NOVO: implementação de `window.api` pra versão WEB — mesmo formato
// que o preload do Electron expõe, só que cada função fala direto com
// o Supabase (a mesma lógica que já existia dentro dos handlers do
// processo main, na branch `getDatabaseProvider() === 'supabase'` —
// só "destravada" pra rodar no navegador, que não tem acesso ao
// processo do Electron).
//
// Isso é o que permite as MESMAS páginas de src/renderer/pages (as
// telas ricas que já construímos) funcionarem na web sem precisar
// reescrever a interface — só essa camada de dados muda.
//
// AINDA NÃO IMPLEMENTADO AQUI (fica pra próxima etapa, incremental):
// AP, Notas Fiscais, Lotes, Almoxarifado, Contas a Pagar/Receber,
// Supervisor, Master, Setor Pessoal, Backup, geração de PDF/documentos
// (isso precisa de uma solução própria pra web, já que hoje usa
// Node/arquivo local — não dá só pra "destravar").
import { supabase } from './supabase'
import { calcularResumoFolha, type ItemFolhaCalculo } from '../renderer/utils/folhaPagamentoCalculo'

type Perfil = 'admin' | 'gestor' | 'almoxarife' | 'supervisor' | 'central' | 'master' | 'setor_pessoal'

// ── Usuários / Autenticação ────────────────────────────────
async function getCurrentProfile() {
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) throw new Error('Sessão não encontrada. Faça login novamente.')

  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('id, empresa_id, nome, email, perfil, ativo, carimbo_url')
    .eq('auth_user_id', auth.user.id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!usuario || !usuario.ativo) {
    throw new Error('Sua conta ainda não está vinculada a um usuário ativo do sistema.')
  }

  const [extras, supervisorObras] = await Promise.all([
    supabase.from('usuario_permissoes_extras').select('chave, negada').eq('usuario_id', usuario.id),
    supabase.from('supervisor_obras').select('empresa_id').eq('usuario_id', usuario.id),
  ])
  if (extras.error) throw new Error(extras.error.message)
  if (supervisorObras.error) throw new Error(supervisorObras.error.message)

  return {
    ...usuario,
    perfil: usuario.perfil as Perfil,
    permissoes_extras: (extras.data ?? []).filter(row => !row.negada).map(row => row.chave),
    permissoes_negadas: (extras.data ?? []).filter(row => !!row.negada).map(row => row.chave),
    obras_supervisor: (supervisorObras.data ?? []).map(row => row.empresa_id),
  }
}

const usuarios = {
  login: async (p: { email: string; senha: string }) => {
    const { error } = await supabase.auth.signInWithPassword({ email: p.email.trim(), password: p.senha })
    if (error) throw new Error('Usuário ou senha inválidos.')
    return getCurrentProfile()
  },

  // NOVO: chamado ao abrir/recarregar a página — o Supabase já guarda
  // a sessão sozinho (localStorage), então se já tiver uma sessão
  // válida, reaproveita ela (mesma lógica de sempre, getCurrentProfile)
  // em vez de pedir e-mail/senha de novo. Devolve null se não tiver
  // sessão nenhuma (ou se der qualquer erro) — nesse caso a tela de
  // login aparece normal.
  // CORRIGIDO: se o token guardado estiver velho/corrompido (ex: de
  // testes anteriores), o Supabase tentava renovar e travava com erro
  // 400, sem nunca desistir — a página ficava carregando pra sempre.
  // Agora, qualquer erro aqui LIMPA a sessão de vez (signOut), em vez
  // de deixar esse token ruim guardado tentando de novo depois.
  sessaoAtual: async () => {
    try {
      const { data: sessao, error } = await supabase.auth.getSession()
      if (error || !sessao.session) {
        await supabase.auth.signOut().catch(() => {})
        return null
      }
      return await getCurrentProfile()
    } catch {
      await supabase.auth.signOut().catch(() => {})
      return null
    }
  },

  minhasObras: async (usuarioId: number) => {
    const perfil = await getCurrentProfile()
    if (perfil.id !== usuarioId) throw new Error('Não é permitido consultar obras de outro usuário.')
    const { data: links, error: linksError } = await supabase
      .from('usuario_obras').select('empresa_id').eq('usuario_id', usuarioId)
    if (linksError) throw new Error(linksError.message)
    const ids = links?.length ? links.map(l => l.empresa_id) : [perfil.empresa_id]
    const { data: obras, error } = await supabase.from('empresas').select('id, nome').in('id', ids).order('nome')
    if (error) throw new Error(error.message)
    return obras ?? []
  },

  buscarPorId: async (id: number) => {
    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('id,empresa_id,nome,email,perfil,ativo,created_at,last_login_at,carimbo_url')
      .eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    if (!usuario) return null
    const [extras, supervisorObras, obrasExtras] = await Promise.all([
      supabase.from('usuario_permissoes_extras').select('chave,negada').eq('usuario_id', id),
      supabase.from('supervisor_obras').select('empresa_id').eq('usuario_id', id),
      supabase.from('usuario_obras').select('empresa_id').eq('usuario_id', id),
    ])
    return {
      ...usuario,
      permissoes_extras: (extras.data ?? []).filter(x => !x.negada).map(x => x.chave),
      permissoes_negadas: (extras.data ?? []).filter(x => !!x.negada).map(x => x.chave),
      obras_supervisor: (supervisorObras.data ?? []).map(x => x.empresa_id),
      obras_extras: (obrasExtras.data ?? []).map(x => x.empresa_id),
    }
  },

  listar: async (empresaId: number) => {
    const { data: lista, error } = await supabase
      .from('usuarios')
      .select('id,empresa_id,nome,email,perfil,ativo,created_at,last_login_at,carimbo_url')
      .eq('empresa_id', empresaId).order('nome')
    if (error) throw new Error(error.message)
    return Promise.all((lista ?? []).map(async u => {
      const [extras, supervisorObras, obrasExtras] = await Promise.all([
        supabase.from('usuario_permissoes_extras').select('chave,negada').eq('usuario_id', u.id),
        supabase.from('supervisor_obras').select('empresa_id').eq('usuario_id', u.id),
        supabase.from('usuario_obras').select('empresa_id').eq('usuario_id', u.id),
      ])
      return {
        ...u,
        permissoes_extras: (extras.data ?? []).filter(x => !x.negada).map(x => x.chave),
        permissoes_negadas: (extras.data ?? []).filter(x => !!x.negada).map(x => x.chave),
        obras_supervisor: (supervisorObras.data ?? []).map(x => x.empresa_id),
        obras_extras: (obrasExtras.data ?? []).map(x => x.empresa_id),
      }
    }))
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

  alterarSenha: async (p: { senha_nova: string }) => {
    if (p.senha_nova.length < 6) throw new Error('A nova senha precisa ter pelo menos 6 caracteres.')
    const { error } = await supabase.auth.updateUser({ password: p.senha_nova })
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  verificarSenha: async (p: { id: number; senha: string }) => {
    const perfil = await getCurrentProfile()
    if (perfil.id !== p.id) return { ok: false }
    const { error } = await supabase.auth.signInWithPassword({ email: perfil.email, password: p.senha })
    return { ok: !error }
  },

  alterarEmail: async (p: { id: number; senha_atual: string; novo_email: string }) => {
    const perfil = await getCurrentProfile()
    if (perfil.id !== p.id) throw new Error('Não é permitido alterar o e-mail de outro usuário.')
    const { error: loginError } = await supabase.auth.signInWithPassword({ email: perfil.email, password: p.senha_atual })
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

  criar: async (p: { empresa_id: number; nome: string; email: string; senha: string; perfil: string }) => {
    const { data: sessao, error: sessaoErro } = await supabase.auth.getSession()
    if (sessaoErro || !sessao.session) throw new Error('Sessão não encontrada. Faça login novamente.')
    const { data, error } = await supabase.functions.invoke('usuarios-admin', {
      body: { acao: 'criar', ...p },
      headers: { Authorization: `Bearer ${sessao.session.access_token}` },
    })
    if (error) throw new Error(error.message)
    if (data?.error) throw new Error(data.error)
    return { id: data.id }
  },

  remover: async (p: { id: number } | number) => {
    const id = typeof p === 'number' ? p : p.id
    const { data: sessao, error: sessaoErro } = await supabase.auth.getSession()
    if (sessaoErro || !sessao.session) throw new Error('Sessão não encontrada. Faça login novamente.')
    const { error } = await supabase.functions.invoke('usuarios-admin', {
      body: { acao: 'remover', id },
      headers: { Authorization: `Bearer ${sessao.session.access_token}` },
    })
    if (error) throw new Error(error.message)
    return { ok: true }
  },
}

const auth = {
  logout: async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw new Error(error.message)
    return { ok: true }
  },
  // NOVO: "esqueci minha senha" — usa o fluxo pronto do Supabase Auth
  // (manda um e-mail com um link; clicar nele volta pro próprio app
  // já autenticado num modo especial de recuperação, que o
  // MobileShell detecta sozinho e mostra a tela de nova senha).
  enviarRecuperacaoSenha: async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    })
    if (error) throw new Error(error.message)
    return { ok: true }
  },
  atualizarSenha: async (novaSenha: string) => {
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    if (error) throw new Error(error.message)
    return { ok: true }
  },
  // NOVO: quando o usuário clica no link do e-mail de recuperação, o
  // Supabase autentica ele sozinho num modo especial e dispara esse
  // evento — é assim que o app sabe a hora de mostrar a tela de nova
  // senha, em vez do login normal. Devolve uma função pra parar de
  // escutar (chamar quando o componente desmontar).
  aoDetectarRecuperacaoSenha: (callback: () => void) => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') callback()
    })
    return () => data.subscription.unsubscribe()
  },
}

// ── Empresas ────────────────────────────────────────────────
const empresas = {
  listar: async () => {
    const { data, error } = await supabase.from('empresas').select('*').eq('ativo', 1).order('nome')
    if (error) throw new Error(error.message)
    return data ?? []
  },
  buscarPorId: async (id: number) => {
    const { data, error } = await supabase.from('empresas').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    return data ?? null
  },
  criar: async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.from('empresas').insert({ ...payload, ativo: 1 }).select('id').single()
    if (error) throw new Error(error.message)
    return { id: data.id }
  },
  atualizar: async (payload: { id: number } & Record<string, unknown>) => {
    const { id, ...dados } = payload
    const { error } = await supabase.from('empresas').update(dados).eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },
  excluir: async (id: number) => {
    const { error } = await supabase.from('empresas').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },
}

// ── Dashboard (Início) ───────────────────────────────────────
const dashboard = {
  resumo: async (p: { empresa_id: number; mes?: number; ano?: number }) => {
    const { data, error } = await supabase.from('lancamentos').select('tipo,status,valor,data,data_venc').eq('empresa_id', p.empresa_id)
    if (error) throw new Error(error.message)
    const noPeriodo = (valor: string | null) => (!p.mes && !p.ano) || (!!valor && (!p.mes || Number(valor.slice(5, 7)) === p.mes) && (!p.ano || Number(valor.slice(0, 4)) === p.ano))
    let receitas = 0, despesas = 0, pendentes = 0
    for (const l of data ?? []) {
      const valor = Number(l.valor)
      if (l.tipo === 'receita' && l.status === 'pago' && noPeriodo(l.data_venc)) receitas += valor
      if (l.tipo === 'despesa' && l.status !== 'cancelado' && noPeriodo(l.data)) despesas += valor
      if (l.status === 'pendente' && noPeriodo(l.data_venc)) pendentes += valor
    }
    return { receitas, despesas, pendentes, saldo: receitas - despesas }
  },

  graficomensal: async (p: { empresa_id: number }) => {
    const { data, error } = await supabase.from('lancamentos').select('tipo,status,valor,data,data_venc').eq('empresa_id', p.empresa_id)
    if (error) throw new Error(error.message)
    const inicio = new Date(); inicio.setMonth(inicio.getMonth() - 6)
    const limite = inicio.toISOString().slice(0, 10)
    const grupos = new Map<string, { receitas: number; despesas: number }>()
    for (const l of data ?? []) {
      const dataRef = l.tipo === 'receita' ? l.data_venc : l.data
      if (!dataRef || dataRef < limite) continue
      if (l.tipo === 'receita' && l.status !== 'pago') continue
      if (l.tipo === 'despesa' && l.status === 'cancelado') continue
      const mes = dataRef.slice(0, 7)
      const g = grupos.get(mes) ?? { receitas: 0, despesas: 0 }
      if (l.tipo === 'receita') g.receitas += Number(l.valor); else g.despesas += Number(l.valor)
      grupos.set(mes, g)
    }
    return [...grupos].sort(([a], [b]) => a.localeCompare(b)).map(([mes, g]) => ({ mes, ...g }))
  },

  ultimoslanc: async (p: { empresa_id: number; limite?: number }) => {
    const [{ data: lancamentos, error: lancamentosError }, { data: categorias, error: categoriasError }, { data: contas, error: contasError }] = await Promise.all([
      supabase.from('lancamentos').select('*').eq('empresa_id', p.empresa_id).order('created_at', { ascending: false }).limit(p.limite ?? 5),
      supabase.from('categorias').select('id,nome').eq('empresa_id', p.empresa_id),
      supabase.from('contas').select('id,nome').eq('empresa_id', p.empresa_id),
    ])
    if (lancamentosError) throw new Error(lancamentosError.message)
    if (categoriasError) throw new Error(categoriasError.message)
    if (contasError) throw new Error(contasError.message)
    const categoriasPorId = new Map((categorias ?? []).map(c => [c.id, c.nome]))
    const contasPorId = new Map((contas ?? []).map(c => [c.id, c.nome]))
    const hoje = new Date().toISOString().slice(0, 10)
    return (lancamentos ?? []).map(l => ({
      ...l, categoria: categoriasPorId.get(l.categoria_id) ?? null, conta: contasPorId.get(l.conta_id) ?? null,
      situacao: l.status === 'pago' ? 'pago' : l.status === 'cancelado' ? 'cancelado' : (l.status === 'pendente' && l.data_venc < hoje) ? 'vencido' : 'a_vencer',
    }))
  },

  topCategorias: async (p: { empresa_id: number }) => {
    const [{ data: lancamentos, error: lancamentosError }, { data: categorias, error: categoriasError }] = await Promise.all([
      supabase.from('lancamentos').select('categoria_id,valor').eq('empresa_id', p.empresa_id).eq('tipo', 'despesa').eq('status', 'pago'),
      supabase.from('categorias').select('id,nome,cor').eq('empresa_id', p.empresa_id),
    ])
    if (lancamentosError) throw new Error(lancamentosError.message)
    if (categoriasError) throw new Error(categoriasError.message)
    const porId = new Map((categorias ?? []).map(c => [c.id, c]))
    const grupos = new Map<number, { nome: string; cor: string; total: number }>()
    for (const l of lancamentos ?? []) {
      if (l.categoria_id === null) continue
      const c = porId.get(l.categoria_id)
      if (!c) continue
      const g = grupos.get(l.categoria_id) ?? { nome: c.nome, cor: c.cor, total: 0 }
      g.total += Number(l.valor)
      grupos.set(l.categoria_id, g)
    }
    return [...grupos.values()].sort((a, b) => b.total - a.total).slice(0, 5)
  },
}

// ── Colaboradores (RH) ───────────────────────────────────────
function normalizarColaborador(p: Record<string, unknown>) {
  return { ...p, pcd: p.pcd ? 1 : 0, alojado: p.alojado ? 1 : 0, tem_baixada: p.tem_baixada ? 1 : 0 }
}

const colaboradores = {
  listar: async (p: { empresa_id: number; busca?: string; funcao?: string; setor?: string; equipe?: string; status?: string; page?: number; perPage?: number }) => {
    const page = p.page ?? 1, perPage = p.perPage ?? 50
    let query = supabase.from('colaboradores').select('*', { count: 'exact' }).eq('empresa_id', p.empresa_id).order('nome').range((page - 1) * perPage, page * perPage - 1)
    if (p.funcao) query = query.eq('funcao', p.funcao)
    if (p.setor) query = query.eq('setor', p.setor)
    if (p.equipe) query = query.eq('equipe', p.equipe)
    if (p.status) query = query.eq('status', p.status)
    if (p.busca) query = query.ilike('nome', `%${p.busca.replace(/[%_]/g, '\\$&')}%`)
    const { data, error, count } = await query
    if (error) throw new Error(error.message)
    return { items: data ?? [], total: count ?? 0 }
  },

  listarResumo: async (empresa_id: number) => {
    const { data, error } = await supabase.from('colaboradores').select('id,nome,cpf,funcao').eq('empresa_id', empresa_id).neq('status', 'desligado').order('nome')
    if (error) throw new Error(error.message)
    return data ?? []
  },

  buscarPorId: async (id: number) => {
    const { data, error } = await supabase.from('colaboradores').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    return data ?? null
  },

  criar: async (p: Record<string, unknown>) => {
    const { data, error } = await supabase.from('colaboradores').insert(normalizarColaborador(p)).select('id').single()
    if (error) throw new Error(error.message)
    return { id: data.id }
  },

  atualizar: async (p: { id: number } & Record<string, unknown>) => {
    const { id, ...dados } = p
    const { error } = await supabase.from('colaboradores').update(normalizarColaborador(dados)).eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  excluir: async (id: number) => {
    const { error } = await supabase.from('colaboradores').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  // NOVO: implementado de verdade (era um stub vazio) — mesma lógica
  // da branch Supabase de colaboradores:opcoesFiltro no desktop.
  opcoesFiltro: async (empresa_id: number) => {
    const distintos = async (campo: 'funcao' | 'setor' | 'equipe') => {
      const { data, error } = await supabase.from('colaboradores').select(campo).eq('empresa_id', empresa_id).not(campo, 'is', null)
      if (error) throw new Error(error.message)
      const linhas = (data ?? []) as unknown as Record<string, string>[]
      const valores = new Set(linhas.map(r => r[campo]).filter(v => v && v !== ''))
      return [...valores].sort()
    }
    const [funcoes, setores, equipes] = await Promise.all([distintos('funcao'), distintos('setor'), distintos('equipe')])
    return { funcoes, setores, equipes }
  },

  // ALTERADO: aceita um período opcional (dataInicio/dataFim) — os
  // aniversariantes agora são de acordo com os meses que esse
  // período cobre, não mais sempre o mês REAL de hoje (que ignorava
  // qualquer filtro escolhido na tela).
  resumoRH: async (p: number | { empresa_id: number; dataInicio?: string; dataFim?: string }) => {
    const empresa_id = typeof p === 'number' ? p : p.empresa_id
    const dataInicio  = typeof p === 'number' ? undefined : p.dataInicio
    const dataFim     = typeof p === 'number' ? undefined : p.dataFim

    const { data, error } = await supabase.from('colaboradores').select('nome, funcao, nascimento, salario_base, status').eq('empresa_id', empresa_id)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    const ativos = rows.filter(row => row.status === 'ativo')
    const porFuncao = new Map<string, { quantidade: number; custo_salarial: number }>()
    const porStatus = new Map<string, number>()
    for (const row of rows) {
      porStatus.set(row.status ?? 'sem_status', (porStatus.get(row.status ?? 'sem_status') ?? 0) + 1)
      if (row.status === 'ativo' && row.funcao) {
        const atual = porFuncao.get(row.funcao) ?? { quantidade: 0, custo_salarial: 0 }
        atual.quantidade += 1; atual.custo_salarial += Number(row.salario_base ?? 0)
        porFuncao.set(row.funcao, atual)
      }
    }
    const hoje = new Date()
    const idades = ativos.filter(row => row.nascimento).map(row => (hoje.getTime() - new Date(`${row.nascimento}T00:00:00`).getTime()) / 31557600000)

    // Meses (MM) cobertos pelo período — sem período informado, cai
    // no mês real de hoje (comportamento de antes, ainda vale pra
    // quem chamar essa função sem passar dataInicio/dataFim).
    const mesesDoPeriodo = new Set<string>()
    if (dataInicio && dataFim) {
      const cursor = new Date(`${dataInicio}T00:00:00`)
      const fim = new Date(`${dataFim}T00:00:00`)
      let seguranca = 0
      while (cursor <= fim && seguranca < 24) {
        mesesDoPeriodo.add(String(cursor.getMonth() + 1).padStart(2, '0'))
        cursor.setMonth(cursor.getMonth() + 1)
        seguranca++
      }
    } else {
      mesesDoPeriodo.add(String(hoje.getMonth() + 1).padStart(2, '0'))
    }

    return {
      totalAtivos: ativos.length,
      custoFolha: ativos.reduce((total, row) => total + Number(row.salario_base ?? 0), 0),
      mediaIdade: idades.length ? Math.round(idades.reduce((a, b) => a + b, 0) / idades.length) : null,
      porFuncao: [...porFuncao].map(([funcao, dados]) => ({ funcao, ...dados })).sort((a, b) => b.quantidade - a.quantidade),
      porStatus: [...porStatus].map(([status, quantidade]) => ({ status, quantidade })),
      aniversariantes: ativos
        .filter(row => row.nascimento && mesesDoPeriodo.has(row.nascimento.slice(5, 7)))
        .sort((a, b) => (a.nascimento ?? '').slice(5, 10).localeCompare((b.nascimento ?? '').slice(5, 10)))
        .map(row => ({ nome: row.nome, funcao: row.funcao, nascimento: row.nascimento })),
    }
  },
}

// ── Contas e Categorias (usadas por vários módulos) ───────────
const contas = {
  listar: async (p: { empresa_id: number }) => {
    const { data, error } = await supabase.from('contas').select('*').eq('empresa_id', p.empresa_id).eq('ativo', 1).order('nome')
    if (error) throw new Error(error.message)
    return data ?? []
  },
  buscarPorId: async (id: number) => {
    const { data, error } = await supabase.from('contas').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    return data ?? null
  },
  criar: async (p: Record<string, unknown>) => {
    const { data, error } = await supabase.from('contas').insert({ ...p, ativo: 1 }).select('id').single()
    if (error) throw new Error(error.message)
    return { id: data.id }
  },
  atualizar: async (p: { id: number } & Record<string, unknown>) => {
    const { id, ...dados } = p
    const { error } = await supabase.from('contas').update(dados).eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },
  excluir: async (id: number) => {
    const { error } = await supabase.from('contas').update({ ativo: 0 }).eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },
  saldoTotal: async (id: number) => {
    const { data, error } = await supabase.from('contas').select('saldo').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    return data?.saldo ?? 0
  },
}

const categorias = {
  listar: async (p: { empresa_id: number }) => {
    const { data, error } = await supabase.from('categorias').select('*').eq('empresa_id', p.empresa_id).eq('ativo', 1).order('nome')
    if (error) throw new Error(error.message)
    return data ?? []
  },
  criar: async (p: Record<string, unknown>) => {
    const { data, error } = await supabase.from('categorias').insert({ ...p, ativo: 1 }).select('id').single()
    if (error) throw new Error(error.message)
    return { id: data.id }
  },
  atualizar: async (p: { id: number } & Record<string, unknown>) => {
    const { id, ...dados } = p
    const { error } = await supabase.from('categorias').update(dados).eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },
  excluir: async (id: number) => {
    const { error } = await supabase.from('categorias').update({ ativo: 0 }).eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },
  sugestoes: async () => [],
}

// ── Lançamentos ───────────────────────────────────────────────
const lancamentos = {
  listar: async (p: { empresa_id: number; busca?: string; tipo?: string; status?: string; page?: number; perPage?: number }) => {
    const page = p.page ?? 1, perPage = p.perPage ?? 50
    let query = supabase.from('lancamentos').select('*', { count: 'exact' }).eq('empresa_id', p.empresa_id).order('data_venc', { ascending: false }).range((page - 1) * perPage, page * perPage - 1)
    if (p.tipo) query = query.eq('tipo', p.tipo)
    if (p.status) query = query.eq('status', p.status)
    if (p.busca) query = query.ilike('descricao', `%${p.busca.replace(/[%_]/g, '\\$&')}%`)
    const { data, error, count } = await query
    if (error) throw new Error(error.message)
    return { items: data ?? [], total: count ?? 0 }
  },
  buscarPorId: async (id: number) => {
    const { data, error } = await supabase.from('lancamentos').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    return data ?? null
  },
  criar: async (p: Record<string, unknown>) => {
    const { data, error } = await supabase.from('lancamentos').insert(p).select('id').single()
    if (error) throw new Error(error.message)
    return { id: data.id }
  },
  atualizar: async (p: { id: number } & Record<string, unknown>) => {
    const { id, ...dados } = p
    const { error } = await supabase.from('lancamentos').update(dados).eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },
  excluir: async (id: number) => {
    const { error } = await supabase.from('lancamentos').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  },
}

// ── Supervisor: painel de resumo (versão mobile) ────────────
// NOVO: mesma lógica exata da branch Supabase de supervisor:painelInicio
// e supervisor:graficosObras (src/main/ipc/supervisorPainel.ipc.ts) —
// só "destravada" pra rodar direto no navegador, sem passar pelo
// processo do Electron. Usada pelo Painel mobile (Gestor/Supervisor).
const supervisor = {
  painelInicio: async (p: { empresa_ids: number[]; dataInicio: string; dataFim: string }) => {
    if (p.empresa_ids.length === 0) {
      return { obras: [], totalColaboradores: 0, idadeMedia: null, admissoes: 0, desligamentos: 0, totalAutorizacoes: 0, totalNotasFiscais: 0 }
    }
    const [{ data: obras, error: e1 }, { data: colaboradores, error: e2 }, { data: aps, error: e3 }, { data: nfs, error: e4 }, { data: boletos, error: e5 }] = await Promise.all([
      supabase.from('empresas').select('id,nome,titulo_obra,estado').in('id', p.empresa_ids).order('nome'),
      supabase.from('colaboradores').select('status,nascimento,data_admissao,data_demissao').in('empresa_id', p.empresa_ids),
      supabase.from('autorizacoes_pagamento').select('id,valor,created_at').in('empresa_id', p.empresa_ids),
      supabase.from('notas_fiscais').select('id,data').in('empresa_id', p.empresa_ids),
      supabase.from('notas_fiscais_boletos').select('nota_id,valor'),
    ])
    for (const e of [e1, e2, e3, e4, e5]) if (e) throw new Error(e.message)
    const periodo = (d: string | null) => !!d && d.slice(0, 10) >= p.dataInicio && d.slice(0, 10) <= p.dataFim
    const ativos = (colaboradores ?? []).filter(c => c.status === 'ativo')
    const idades = ativos.filter(c => c.nascimento).map(c => (Date.now() - new Date(`${c.nascimento}T00:00:00`).getTime()) / 31557600000)
    const nfIds = new Set((nfs ?? []).filter(n => periodo(n.data)).map(n => n.id))
    return {
      obras: obras ?? [],
      totalColaboradores: ativos.length,
      idadeMedia: idades.length ? Math.round(idades.reduce((a, b) => a + b, 0) / idades.length) : null,
      admissoes: (colaboradores ?? []).filter(c => periodo(c.data_admissao)).length,
      desligamentos: (colaboradores ?? []).filter(c => periodo(c.data_demissao)).length,
      totalAutorizacoes: (aps ?? []).filter(a => periodo(a.created_at)).reduce((x, a) => x + Number(a.valor), 0),
      totalNotasFiscais: (boletos ?? []).filter(b => nfIds.has(b.nota_id)).reduce((x, b) => x + Number(b.valor), 0),
    }
  },

  graficosObras: async (p: { empresa_ids: number[]; meses: number }) => {
    if (p.empresa_ids.length === 0) return { admissoesDesligamentos: [], despesasMensais: [] }
    const [{ data: colaboradores, error: e1 }, { data: aps, error: e2 }, { data: nfs, error: e3 }, { data: boletos, error: e4 }] = await Promise.all([
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
    const add = (map: Map<string, number>, d: string | null, v = 1) => {
      if (d && mesesLista.includes(d.slice(0, 7))) map.set(d.slice(0, 7), (map.get(d.slice(0, 7)) ?? 0) + v)
    }
    const adm = new Map<string, number>(), desl = new Map<string, number>(), gastos = new Map<string, number>()
    for (const c of colaboradores ?? []) { add(adm, c.data_admissao); add(desl, c.data_demissao) }
    for (const a of aps ?? []) add(gastos, a.created_at, Number(a.valor))
    const nfPorId = new Map((nfs ?? []).map(n => [n.id, n.data]))
    for (const b of boletos ?? []) add(gastos, nfPorId.get(b.nota_id) ?? null, Number(b.valor))
    return {
      admissoesDesligamentos: mesesLista.map(m => ({ mes: m, admissoes: adm.get(m) ?? 0, desligamentos: desl.get(m) ?? 0 })),
      despesasMensais: mesesLista.map(m => ({ mes: m, total: gastos.get(m) ?? 0 })),
    }
  },
}

// ── Produtos (Almoxarifado) ─────────────────────────────────
// NOVO: mesma lógica exata da branch Supabase de produtos:listar e
// produtos:resumo no desktop.
const produtos = {
  listar: async (p: { empresa_id: number; busca?: string }) => {
    let query = supabase.from('produtos').select('*').eq('empresa_id', p.empresa_id).order('nome')
    if (p.busca) query = query.ilike('nome', `%${p.busca.replace(/[%_]/g, '\\$&')}%`)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return data ?? []
  },

  resumo: async (empresa_id: number) => {
    const { data, error } = await supabase.from('produtos').select('id,codigo,nome,estoque_atual,estoque_minimo,unidade,valor_unitario').eq('empresa_id', empresa_id)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    return {
      zerados: rows.filter(x => Number(x.estoque_atual) <= 0).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      acabando: rows.filter(x => Number(x.estoque_atual) > 0 && Number(x.estoque_atual) <= Number(x.estoque_minimo)).sort((a, b) => Number(a.estoque_atual) - Number(b.estoque_atual)),
      valorTotal: rows.reduce((s, x) => s + Number(x.estoque_atual) * Number(x.valor_unitario), 0),
    }
  },
}

// ── Aprovações (AP / Nota Fiscal) ───────────────────────────
// NOVO: mesmas duas funções (aprovar_ap/aprovar_nota_fiscal) já
// usadas no desktop — elas mesmas detectam se quem está aprovando é
// Gestor/ADM ou Supervisor (pelo perfil logado), então o front só
// precisa chamar com o id, sem se preocupar com qual "nível" é.
async function urlAssinada(caminhoSupabase: string): Promise<string> {
  const semPrefixo = caminhoSupabase.replace('supabase://', '')
  const [bucket, ...resto] = semPrefixo.split('/')
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(resto.join('/'), 3600)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

const aprovacoes = {
  pendentes: async (p: { empresa_ids: number[]; ehSupervisor: boolean }) => {
    if (p.empresa_ids.length === 0) return { aps: [], notas: [], lotes: [] }
    let apsQuery = supabase.from('autorizacoes_pagamento')
      .select('id,beneficiario_nome,descricao,valor,created_at,data_emissao,pdf_path,empresa_id,lote_id')
      .in('empresa_id', p.empresa_ids)
    apsQuery = p.ehSupervisor
      ? apsQuery.not('lote_id', 'is', null).is('aprovado_supervisor_por', null)
      : apsQuery.is('aprovado_por', null)

    let notasQuery = supabase.from('notas_fiscais')
      .select('id,fornecedor_nome,numero_nf,nota_pdf_path,boletos_pdf_path,data,empresa_id,lote_id')
      .in('empresa_id', p.empresa_ids)
    notasQuery = p.ehSupervisor
      ? notasQuery.not('lote_id', 'is', null).is('aprovado_supervisor_por', null)
      : notasQuery.is('aprovado_por', null)

    const [{ data: aps, error: e1 }, { data: notas, error: e2 }] = await Promise.all([
      apsQuery.order('created_at', { ascending: false }),
      notasQuery.order('data', { ascending: false }),
    ])
    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)

    // NOVO: pro Supervisor, busca também o título de cada lote
    // envolvido — sem isso a tela mostrava tudo solto, sem
    // agrupar, diferente do programa (que sempre organiza por lote).
    let lotes: { id: number; titulo: string }[] = []
    if (p.ehSupervisor) {
      const loteIds = Array.from(new Set([
        ...(aps ?? []).map(a => a.lote_id),
        ...(notas ?? []).map(n => n.lote_id),
      ].filter((id): id is number => id !== null)))
      if (loteIds.length) {
        const { data, error } = await supabase.from('lotes_financeiros').select('id,titulo').in('id', loteIds)
        if (error) throw new Error(error.message)
        lotes = data ?? []
      }
    }

    return { aps: aps ?? [], notas: notas ?? [], lotes }
  },

  aprovarAp: async (id: number) => {
    const { error } = await supabase.rpc('aprovar_ap', { p_id: id })
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  aprovarNota: async (id: number) => {
    const { error } = await supabase.rpc('aprovar_nota_fiscal', { p_id: id })
    if (error) throw new Error(error.message)
    return { ok: true }
  },

  urlDocumento: urlAssinada,
}

// ── Folha de Pagamento (resumo pro mobile) ──────────────────
// NOVO: soma o valor de TODAS as folhas salvas (uma por mês) que
// caem dentro do período escolhido, pra entrar na "Despesa Compras
// Acumulada" do Painel — mesma conta usada no editor de Folha do
// programa (calcularResumoFolha), reaproveitada aqui igual.
const folhaPagamento = {
  totalPorPeriodo: async (p: { empresa_ids: number[]; dataInicio: string; dataFim: string }) => {
    if (p.empresa_ids.length === 0) return 0

    const { data: folhas, error } = await supabase
      .from('folhas_pagamento')
      .select('id, mes_competencia')
      .in('empresa_id', p.empresa_ids)
      .gte('mes_competencia', `${p.dataInicio.slice(0, 7)}-01`)
      .lte('mes_competencia', `${p.dataFim.slice(0, 7)}-01`)
    if (error) throw new Error(error.message)
    if (!folhas || folhas.length === 0) return 0

    let total = 0
    for (const folha of folhas) {
      const { data: itens, error: e2 } = await supabase
        .from('folhas_pagamento_itens').select('*').eq('folha_id', folha.id)
      if (e2) throw new Error(e2.message)

      const ids = (itens ?? []).map(i => i.colaborador_id).filter((id): id is number => id !== null)
      let salarioPorId = new Map<number, number>()
      if (ids.length) {
        const { data: colaboradoresDaFolha, error: e3 } = await supabase
          .from('colaboradores').select('id,salario_base').in('id', ids)
        if (e3) throw new Error(e3.message)
        salarioPorId = new Map((colaboradoresDaFolha ?? []).map(c => [c.id, c.salario_base]))
      }

      const itensComSalario: ItemFolhaCalculo[] = (itens ?? []).map(i => ({
        ...i,
        salario_base: i.colaborador_id ? salarioPorId.get(i.colaborador_id) ?? null : null,
      }))
      total += calcularResumoFolha(itensComSalario, folha.mes_competencia.slice(0, 7)).totalGeral
    }
    return total
  },
}

// ── Obra — Estrutura Analítica (EAP), só leitura no mobile ──
// (quem cadastra/edita é o Gestor no programa do computador — aqui
// só precisa listar, pra escolher o item na hora de lançar o Diário).
const obraEap = {
  listar: async (empresa_id: number) => {
    const { data, error } = await supabase.from('obra_eap_itens').select('*').eq('empresa_id', empresa_id).order('ordem').order('id')
    if (error) throw new Error(error.message)
    return data ?? []
  },
}

// ── Obra — Diário de Obra (RDO), pelo celular ────────────────
// NOVO: mesma coisa que o Gestor já faz no programa, agora também
// pelo celular — direto em campo. A diferença técnica principal é a
// foto: aqui vem de um arquivo do NAVEGADOR (input type="file", com
// ou sem o atributo "capture" pra abrir a câmera direto), não de um
// caminho local do disco como no Electron — então o upload é
// diferente (sobe o arquivo em si, não lê de um caminho).
async function uploadFotoDiario(empresaId: number, diarioId: number, atividadeIndex: number, arquivo: File): Promise<string> {
  const nomeLimpo = arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const remoto = `${empresaId}/diario-obra/${diarioId}/${atividadeIndex}/${Date.now()}-${nomeLimpo}`
  const { error } = await supabase.storage.from('documentos-rh').upload(remoto, arquivo)
  if (error) throw new Error(error.message)
  return `supabase://${remoto}`
}

const obraDiario = {
  listar: async (empresa_id: number) => {
    const { data: diarios, error } = await supabase.from('obra_diarios').select('*').eq('empresa_id', empresa_id).order('data', { ascending: false })
    if (error) throw new Error(error.message)
    const resultado = []
    for (const d of diarios ?? []) {
      const { count } = await supabase.from('obra_diario_atividades').select('id', { count: 'exact', head: true }).eq('diario_id', d.id)
      resultado.push({ ...d, quantidade_atividades: count ?? 0 })
    }
    return resultado
  },

  buscarPorId: async (id: number) => {
    const { data: diario, error } = await supabase.from('obra_diarios').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    if (!diario) return null
    const { data: atividades, error: e2 } = await supabase.from('obra_diario_atividades').select('*').eq('diario_id', id)
    if (e2) throw new Error(e2.message)
    const comFotos = []
    for (const a of atividades ?? []) {
      const { data: fotos, error: e3 } = await supabase.from('obra_diario_fotos').select('*').eq('atividade_id', a.id)
      if (e3) throw new Error(e3.message)
      comFotos.push({ ...a, fotos: fotos ?? [] })
    }
    return { ...diario, atividades: comFotos }
  },

  percentuaisAcumulados: async (empresa_id: number) => {
    const { data: diarios, error } = await supabase.from('obra_diarios').select('id').eq('empresa_id', empresa_id)
    if (error) throw new Error(error.message)
    const diarioIds = (diarios ?? []).map(d => d.id)
    if (diarioIds.length === 0) return {}
    const { data: atividades, error: e2 } = await supabase.from('obra_diario_atividades').select('eap_item_id,percentual_incremento').in('diario_id', diarioIds)
    if (e2) throw new Error(e2.message)
    const totais: Record<number, number> = {}
    for (const a of atividades ?? []) totais[a.eap_item_id] = (totais[a.eap_item_id] ?? 0) + Number(a.percentual_incremento)
    return totais
  },

  // p.atividades[i].fotos = mistura de fotos JÁ enviadas (objeto
  // {caminho, legenda}, quando editando um diário existente) com
  // fotos NOVAS (objeto {arquivo: File, legenda} — ainda no
  // navegador, precisa subir agora).
  salvar: async (p: {
    id?: number; empresa_id: number; data: string; clima: string | null; condicao_trabalho: string | null
    mao_de_obra_presente: string | null; ocorrencias: string | null; criado_por: string | null; criado_por_usuario_id: number | null
    atividades: { eap_item_id: number; percentual_incremento: number; observacao: string | null; fotos: ({ caminho: string; legenda: string | null } | { arquivo: File; legenda: string | null })[] }[]
  }) => {
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

      const fotosProntas: { caminho: string; legenda: string | null }[] = []
      for (const foto of ativ.fotos) {
        if ('arquivo' in foto) {
          const caminho = await uploadFotoDiario(p.empresa_id, diarioId, i, foto.arquivo)
          fotosProntas.push({ caminho, legenda: foto.legenda })
        } else {
          fotosProntas.push(foto)
        }
      }
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

  urlFoto: async (caminho: string) => {
    if (!caminho.startsWith('supabase://')) return caminho
    const semPrefixo = caminho.replace(/^supabase:\/\//, '')
    const { data, error } = await supabase.storage.from('documentos-rh').createSignedUrl(semPrefixo, 3600)
    if (error) throw new Error(error.message)
    return data.signedUrl
  },
}

export const apiWeb = {
  usuarios, auth, empresas, dashboard, colaboradores, contas, categorias, lancamentos, supervisor, produtos, aprovacoes, folhaPagamento, obraEap, obraDiario,
  // NOVO: módulos que ainda faltam — ver anotação no topo do arquivo.
}
