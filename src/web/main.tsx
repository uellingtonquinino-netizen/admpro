import { FormEvent, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Session } from '@supabase/supabase-js'
import { ArrowLeftRight, Boxes, Building2, LayoutDashboard, LogOut, MapPin, Menu, UsersRound, Wallet, X } from 'lucide-react'
import { supabase } from './supabase'
import '../renderer/index.css'

type Perfil = {
  id: number
  empresa_id: number
  nome: string
  email: string
  perfil: string
  ativo: boolean | number
}

type ResumoObra = {
  ativos: number
  custoFolha: number
  lancamentos: { id: number; descricao: string; valor: number; tipo: string; data: string; status: string }[]
  mediaIdade: number | null
  aniversariantes: { nome: string; funcao: string | null; nascimento: string }[]
  porFuncao: { funcao: string; quantidade: number; custo: number }[]
}

type Lancamento = { id: number; descricao: string; valor: number; tipo: string; data: string; data_venc: string | null; status: string }
type Colaborador = { id: number; nome: string; funcao: string | null; setor: string | null; status: string; salario_base: number }
type Produto = { id: number; codigo: string; nome: string; unidade: string | null; estoque_atual: number; estoque_minimo: number; valor_unitario: number }
type ResumoMaster = { obras: number; usuarios: number; supervisores: number; administradores: number }
type UsuarioMaster = { id: number; nome: string; email: string; perfil: string; ativo: boolean | number }
type ObraMaster = { id: number; nome: string; titulo_obra: string | null; estado: string | null }
type ResumoSupervisor = {
  obras: { id: number; nome: string; titulo_obra: string | null; estado: string | null }[]
  colaboradores: number
  idadeMedia: number | null
  admissoes: number
  desligamentos: number
  despesas: number
  pendencias: number
}
type SolicitacaoPessoal = {
  id: number
  empresa_id: number
  colaborador_id: number
  tipo: string
  status: string
  solicitado_por: string
  solicitado_em: string
  respondido_por: string | null
  colaborador_nome: string
  obra_nome: string
}
type ResumoCentral = {
  id: number
  nome: string
  email: string
  obras: { id: number; nome: string }[]
  pendencias: number
}
type OpcaoFinanceira = { id: number; nome: string }

const nomesPerfil: Record<string, string> = {
  admin: 'Administrador', gestor: 'Gestor', almoxarife: 'Almoxarife',
  supervisor: 'Supervisor', central: 'Escritório Central', master: 'Administrador Master',
  setor_pessoal: 'Setor Pessoal',
}

const tiposSolicitacao: Record<string, string> = {
  admissao: 'Admissão', desligamento: 'Desligamento', alteracao_salarial: 'Alteração salarial', outro: 'Movimentação',
}

function PortalWeb() {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [resumo, setResumo] = useState<ResumoObra | null>(null)
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [colaboradoresWeb, setColaboradoresWeb] = useState<Colaborador[]>([])
  const [produtosWeb, setProdutosWeb] = useState<Produto[]>([])
  const [resumoMaster, setResumoMaster] = useState<ResumoMaster | null>(null)
  const [usuariosMaster, setUsuariosMaster] = useState<UsuarioMaster[]>([])
  const [obrasMaster, setObrasMaster] = useState<ObraMaster[]>([])
  const [resumoSupervisor, setResumoSupervisor] = useState<ResumoSupervisor | null>(null)
  const [solicitacoesPessoal, setSolicitacoesPessoal] = useState<SolicitacaoPessoal[]>([])
  const [resumoCentral, setResumoCentral] = useState<ResumoCentral[]>([])
  const [categoriasWeb, setCategoriasWeb] = useState<OpcaoFinanceira[]>([])
  const [contasWeb, setContasWeb] = useState<OpcaoFinanceira[]>([])
  const [pagina, setPagina] = useState<'inicio' | 'financeiro' | 'rh' | 'estoque' | 'supervisor' | 'pessoal' | 'central'>('inicio')
  const [menuAberto, setMenuAberto] = useState(false)
  const [buscaColaborador, setBuscaColaborador] = useState('')
  const [filtroStatusRh, setFiltroStatusRh] = useState('todos')
  const [buscaLancamento, setBuscaLancamento] = useState('')
  const [filtroTipoFinanceiro, setFiltroTipoFinanceiro] = useState('todos')
  const [buscaProduto, setBuscaProduto] = useState('')
  const [novoLancamento, setNovoLancamento] = useState(false)
  const [salvandoLancamento, setSalvandoLancamento] = useState(false)
  const [formLancamento, setFormLancamento] = useState({ descricao: '', valor: '', tipo: 'despesa', data: new Date().toISOString().slice(0, 10), data_venc: '', categoria_id: '', conta_id: '' })
  const [novoColaborador, setNovoColaborador] = useState(false)
  const [salvandoColaborador, setSalvandoColaborador] = useState(false)
  const [formColaborador, setFormColaborador] = useState({ nome: '', funcao: '', setor: '', data_admissao: new Date().toISOString().slice(0, 10), salario_base: '' })
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)

  async function carregarPerfil(sessao: Session | null) {
    setSession(sessao)
    setPerfil(null)
    if (!sessao) { setCarregando(false); return }

    const { data, error } = await supabase
      .from('usuarios')
      .select('id,empresa_id,nome,email,perfil,ativo')
      .eq('auth_user_id', sessao.user.id)
      .maybeSingle()
    if (error) setErro(`Não foi possível carregar seu perfil: ${error.message}`)
    else if (!data || !data.ativo) setErro('Sua conta não está vinculada a um usuário ativo do sistema.')
    else {
      setPerfil(data)
      setPagina(data.perfil === 'almoxarife' ? 'estoque' : data.perfil === 'supervisor' ? 'supervisor' : data.perfil === 'setor_pessoal' ? 'pessoal' : data.perfil === 'central' ? 'central' : 'inicio')
      if (data.perfil === 'master') {
        const [obras, usuarios] = await Promise.all([
          supabase.from('empresas').select('id,nome,titulo_obra,estado').order('nome'),
          supabase.from('usuarios').select('id,nome,email,perfil,ativo').order('nome'),
        ])
        if (!obras.error && !usuarios.error) {
          const ativos = (usuarios.data ?? []).filter(item => !!item.ativo)
          setResumoMaster({ obras: obras.data?.length ?? 0, usuarios: ativos.length, supervisores: ativos.filter(item => item.perfil === 'supervisor').length, administradores: ativos.filter(item => item.perfil === 'admin').length })
          setObrasMaster(obras.data ?? [])
          setUsuariosMaster(usuarios.data ?? [])
        }
        setCarregando(false)
        return
      }
      if (data.perfil === 'supervisor') {
        const { data: vinculos, error: erroVinculos } = await supabase
          .from('supervisor_obras')
          .select('empresa_id')
          .eq('usuario_id', data.id)
        if (erroVinculos) {
          setErro('Não foi possível carregar as obras sob sua supervisão.')
          setCarregando(false)
          return
        }
        const empresaIds = (vinculos ?? []).map(item => item.empresa_id)
        if (empresaIds.length === 0) {
          setResumoSupervisor({ obras: [], colaboradores: 0, idadeMedia: null, admissoes: 0, desligamentos: 0, despesas: 0, pendencias: 0 })
          setCarregando(false)
          return
        }
        const inicioMes = new Date(); inicioMes.setDate(1)
        const inicioMesTexto = inicioMes.toISOString().slice(0, 10)
        const [{ data: obras, error: erroObras }, { data: colaboradores, error: erroColaboradores }, { data: lancamentos, error: erroLancamentos }, { data: autorizacoes, error: erroAutorizacoes }, { data: notas, error: erroNotas }] = await Promise.all([
          supabase.from('empresas').select('id,nome,titulo_obra,estado').in('id', empresaIds).order('nome'),
          supabase.from('colaboradores').select('status,nascimento,data_admissao,data_demissao').in('empresa_id', empresaIds),
          supabase.from('lancamentos').select('valor,tipo,status,data').in('empresa_id', empresaIds),
          supabase.from('autorizacoes_pagamento').select('lote_id,aprovado_supervisor_por').in('empresa_id', empresaIds),
          supabase.from('notas_fiscais').select('lote_id,aprovado_supervisor_por').in('empresa_id', empresaIds),
        ])
        if (erroObras || erroColaboradores || erroLancamentos || erroAutorizacoes || erroNotas) {
          setErro('Não foi possível carregar o painel de supervisão.')
        } else {
          const ativos = (colaboradores ?? []).filter(item => item.status === 'ativo')
          const idades = ativos.filter(item => item.nascimento).map(item => (Date.now() - new Date(`${item.nascimento}T00:00:00`).getTime()) / 31557600000)
          setResumoSupervisor({
            obras: obras ?? [],
            colaboradores: ativos.length,
            idadeMedia: idades.length ? Math.round(idades.reduce((total, idade) => total + idade, 0) / idades.length) : null,
            admissoes: (colaboradores ?? []).filter(item => item.data_admissao?.slice(0, 7) === inicioMesTexto.slice(0, 7)).length,
            desligamentos: (colaboradores ?? []).filter(item => item.data_demissao?.slice(0, 7) === inicioMesTexto.slice(0, 7)).length,
            despesas: (lancamentos ?? []).filter(item => item.tipo === 'despesa' && item.status !== 'cancelado' && item.data >= inicioMesTexto).reduce((total, item) => total + Number(item.valor), 0),
            pendencias: (autorizacoes ?? []).filter(item => item.lote_id !== null && item.aprovado_supervisor_por === null).length + (notas ?? []).filter(item => item.lote_id !== null && item.aprovado_supervisor_por === null).length,
          })
        }
        setCarregando(false)
        return
      }
      if (data.perfil === 'setor_pessoal') {
        const [{ data: solicitacoes, error: erroSolicitacoes }, { data: colaboradores, error: erroColaboradores }, { data: empresas, error: erroEmpresas }] = await Promise.all([
          supabase.from('solicitacoes_pessoal').select('id,empresa_id,colaborador_id,tipo,status,solicitado_por,solicitado_em,respondido_por').order('solicitado_em', { ascending: false }).limit(150),
          supabase.from('colaboradores').select('id,nome'),
          supabase.from('empresas').select('id,nome'),
        ])
        if (erroSolicitacoes || erroColaboradores || erroEmpresas) {
          setErro('Não foi possível carregar as solicitações do Setor Pessoal.')
        } else {
          const colaboradorPorId = new Map((colaboradores ?? []).map(item => [item.id, item.nome]))
          const obraPorId = new Map((empresas ?? []).map(item => [item.id, item.nome]))
          setSolicitacoesPessoal((solicitacoes ?? []).map(item => ({
            ...item,
            colaborador_nome: colaboradorPorId.get(item.colaborador_id) ?? 'Colaborador não encontrado',
            obra_nome: obraPorId.get(item.empresa_id) ?? 'Obra não encontrada',
          })))
        }
        setCarregando(false)
        return
      }
      if (data.perfil === 'central') {
        const [{ data: supervisores, error: erroSupervisores }, { data: vinculos, error: erroVinculos }, { data: empresas, error: erroEmpresas }, { data: lotes, error: erroLotes }, { data: autorizacoes, error: erroAutorizacoes }, { data: notas, error: erroNotas }] = await Promise.all([
          supabase.from('usuarios').select('id,nome,email').eq('perfil', 'supervisor').eq('ativo', 1).order('nome'),
          supabase.from('supervisor_obras').select('usuario_id,empresa_id'),
          supabase.from('empresas').select('id,nome'),
          supabase.from('lotes_financeiros').select('id,empresa_id'),
          supabase.from('autorizacoes_pagamento').select('lote_id,aprovado_central_por'),
          supabase.from('notas_fiscais').select('lote_id,aprovado_central_por'),
        ])
        if (erroSupervisores || erroVinculos || erroEmpresas || erroLotes || erroAutorizacoes || erroNotas) {
          setErro('Não foi possível carregar o painel do Escritório Central.')
        } else {
          const obraPorId = new Map((empresas ?? []).map(item => [item.id, item]))
          const obrasPorSupervisor = new Map<number, number[]>()
          for (const vinculo of vinculos ?? []) obrasPorSupervisor.set(vinculo.usuario_id, [...(obrasPorSupervisor.get(vinculo.usuario_id) ?? []), vinculo.empresa_id])
          const empresaPorLote = new Map((lotes ?? []).map(item => [item.id, item.empresa_id]))
          const pendenciasPorObra = new Map<number, number>()
          for (const item of [...(autorizacoes ?? []), ...(notas ?? [])]) {
            if (item.lote_id === null || item.aprovado_central_por !== null) continue
            const empresaId = empresaPorLote.get(item.lote_id)
            if (empresaId) pendenciasPorObra.set(empresaId, (pendenciasPorObra.get(empresaId) ?? 0) + 1)
          }
          setResumoCentral((supervisores ?? []).map(supervisor => {
            const obras = (obrasPorSupervisor.get(supervisor.id) ?? []).map(id => obraPorId.get(id)).filter((obra): obra is { id: number; nome: string } => !!obra)
            return { id: supervisor.id, nome: supervisor.nome, email: supervisor.email, obras, pendencias: obras.reduce((total, obra) => total + (pendenciasPorObra.get(obra.id) ?? 0), 0) }
          }))
        }
        setCarregando(false)
        return
      }
      const [colaboradores, lancamentos] = await Promise.all([
        supabase.from('colaboradores').select('nome,funcao,nascimento,salario_base').eq('empresa_id', data.empresa_id).eq('status', 'ativo'),
        supabase.from('lancamentos').select('id,descricao,valor,tipo,data,status').eq('empresa_id', data.empresa_id).order('created_at', { ascending: false }).limit(5),
      ])
      if (colaboradores.error || lancamentos.error) {
        setErro('Não foi possível carregar o resumo da obra.')
      } else {
        const hoje = new Date()
        const idades = (colaboradores.data ?? []).filter(item => item.nascimento).map(item => (hoje.getTime() - new Date(`${item.nascimento}T00:00:00`).getTime()) / 31557600000)
        const porFuncao = new Map<string, { quantidade: number; custo: number }>()
        for (const item of colaboradores.data ?? []) {
          if (!item.funcao) continue
          const atual = porFuncao.get(item.funcao) ?? { quantidade: 0, custo: 0 }
          atual.quantidade += 1; atual.custo += Number(item.salario_base); porFuncao.set(item.funcao, atual)
        }
        setResumo({
          ativos: colaboradores.data?.length ?? 0,
          custoFolha: (colaboradores.data ?? []).reduce((total, item) => total + Number(item.salario_base), 0),
          lancamentos: lancamentos.data ?? [],
          mediaIdade: idades.length ? Math.round(idades.reduce((total, idade) => total + idade, 0) / idades.length) : null,
          aniversariantes: (colaboradores.data ?? []).filter(item => item.nascimento?.slice(5, 7) === String(hoje.getMonth() + 1).padStart(2, '0')).map(item => ({ nome: item.nome, funcao: item.funcao, nascimento: item.nascimento! })).sort((a, b) => a.nascimento.localeCompare(b.nascimento)),
          porFuncao: [...porFuncao].map(([funcao, dados]) => ({ funcao, ...dados })).sort((a, b) => b.quantidade - a.quantidade),
        })
        const { data: listaFinanceira, error: erroFinanceiro } = await supabase
          .from('lancamentos')
          .select('id,descricao,valor,tipo,data,data_venc,status')
          .eq('empresa_id', data.empresa_id)
          .order('data', { ascending: false })
          .order('id', { ascending: false })
          .limit(100)
        if (erroFinanceiro) setErro('Não foi possível carregar os lançamentos financeiros.')
        else setLancamentos(listaFinanceira ?? [])
        const { data: listaColaboradores, error: erroColaboradores } = await supabase
          .from('colaboradores')
          .select('id,nome,funcao,setor,status,salario_base')
          .eq('empresa_id', data.empresa_id)
          .order('nome')
          .limit(200)
        if (erroColaboradores) setErro('Não foi possível carregar os colaboradores.')
        else setColaboradoresWeb(listaColaboradores ?? [])
        const { data: produtos, error: erroProdutos } = await supabase.from('produtos').select('id,codigo,nome,unidade,estoque_atual,estoque_minimo,valor_unitario').eq('empresa_id', data.empresa_id).order('nome')
        if (erroProdutos) setErro('Não foi possível carregar o estoque.')
        else setProdutosWeb(produtos ?? [])
        const [categorias, contas] = await Promise.all([
          supabase.from('categorias').select('id,nome').eq('empresa_id', data.empresa_id).order('nome'),
          supabase.from('contas').select('id,nome').eq('empresa_id', data.empresa_id).order('nome'),
        ])
        if (categorias.error || contas.error) setErro('Não foi possível carregar categorias e contas financeiras.')
        else { setCategoriasWeb(categorias.data ?? []); setContasWeb(contas.data ?? []) }
      }
    }
    setCarregando(false)
  }

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => carregarPerfil(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      void carregarPerfil(novaSessao)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function entrar(evento: FormEvent) {
    evento.preventDefault()
    setErro(''); setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    if (error) setErro('E-mail ou senha inválidos.')
    setEnviando(false)
  }

  async function salvarLancamento(evento: FormEvent) {
    evento.preventDefault()
    if (!perfil || !formLancamento.categoria_id || !formLancamento.conta_id) {
      setErro('Selecione uma categoria e uma conta.')
      return
    }
    setErro(''); setSalvandoLancamento(true)
    const { error } = await supabase.rpc('criar_lancamento', {
      p: {
        empresa_id: perfil.empresa_id,
        descricao: formLancamento.descricao.trim(),
        valor: Number(formLancamento.valor),
        tipo: formLancamento.tipo,
        status: 'pendente',
        data: formLancamento.data,
        data_venc: formLancamento.data_venc || null,
        categoria_id: Number(formLancamento.categoria_id),
        conta_id: Number(formLancamento.conta_id),
        observacao: null,
      },
    })
    setSalvandoLancamento(false)
    if (error) { setErro(`Não foi possível salvar o lançamento: ${error.message}`); return }
    setNovoLancamento(false)
    setFormLancamento({ descricao: '', valor: '', tipo: 'despesa', data: new Date().toISOString().slice(0, 10), data_venc: '', categoria_id: '', conta_id: '' })
    await carregarPerfil(session)
  }

  async function salvarColaborador(evento: FormEvent) {
    evento.preventDefault()
    if (!perfil) return
    setErro(''); setSalvandoColaborador(true)
    const { error } = await supabase.from('colaboradores').insert({
      empresa_id: perfil.empresa_id,
      nome: formColaborador.nome.trim(),
      funcao: formColaborador.funcao.trim() || null,
      setor: formColaborador.setor.trim() || null,
      data_admissao: formColaborador.data_admissao || null,
      salario_base: formColaborador.salario_base ? Number(formColaborador.salario_base) : null,
      status: 'ativo',
      pcd: 0, alojado: 0, tem_baixada: 0,
    })
    setSalvandoColaborador(false)
    if (error) { setErro(`Não foi possível cadastrar o colaborador: ${error.message}`); return }
    setNovoColaborador(false)
    setFormColaborador({ nome: '', funcao: '', setor: '', data_admissao: new Date().toISOString().slice(0, 10), salario_base: '' })
    await carregarPerfil(session)
  }

  if (carregando) return <main className="min-h-screen grid place-items-center bg-surface text-white">Carregando…</main>

  if (!session || !perfil) {
    return <main className="min-h-screen grid place-items-center bg-surface px-4">
      <form onSubmit={entrar} className="w-full max-w-sm rounded-xl border border-surface-border bg-surface-card p-8 space-y-4">
        <h1 className="text-center text-xl font-bold text-white">ADM PRO</h1>
        <p className="text-center text-sm text-gray-400">Acesso web seguro</p>
        <label className="block text-sm text-gray-200">E-mail<input className="mt-1 w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-white" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label className="block text-sm text-gray-200">Senha<input className="mt-1 w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-white" type="password" value={senha} onChange={e => setSenha(e.target.value)} required /></label>
        {erro && <p className="rounded-md bg-red-950/50 p-3 text-sm text-red-300">{erro}</p>}
        <button className="w-full rounded-md bg-blue-600 py-2 font-medium text-white disabled:opacity-60" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </main>
  }

  const navegar = (destino: 'inicio' | 'financeiro' | 'rh' | 'estoque' | 'supervisor' | 'pessoal' | 'central') => { setPagina(destino); setMenuAberto(false) }
  const colaboradoresFiltrados = colaboradoresWeb.filter(item => {
    const correspondeBusca = `${item.nome} ${item.funcao ?? ''} ${item.setor ?? ''}`.toLowerCase().includes(buscaColaborador.toLowerCase())
    return correspondeBusca && (filtroStatusRh === 'todos' || item.status === filtroStatusRh)
  })
  const resumoStatusRh = {
    ativos: colaboradoresWeb.filter(item => item.status === 'ativo').length,
    ferias: colaboradoresWeb.filter(item => item.status === 'ferias').length,
    afastados: colaboradoresWeb.filter(item => item.status === 'afastado').length,
  }
  const lancamentosFiltrados = lancamentos.filter(item => {
    const correspondeBusca = `${item.descricao} ${item.status} ${item.data}`.toLowerCase().includes(buscaLancamento.toLowerCase())
    return correspondeBusca && (filtroTipoFinanceiro === 'todos' || item.tipo === filtroTipoFinanceiro)
  })
  const resumoFinanceiro = {
    receitas: lancamentos.filter(item => item.tipo === 'receita' && item.status !== 'cancelado').reduce((total, item) => total + Number(item.valor), 0),
    despesas: lancamentos.filter(item => item.tipo === 'despesa' && item.status !== 'cancelado').reduce((total, item) => total + Number(item.valor), 0),
    pendentes: lancamentos.filter(item => item.status === 'pendente').length,
  }
  const produtosFiltrados = produtosWeb.filter(item => `${item.codigo} ${item.nome} ${item.unidade ?? ''}`.toLowerCase().includes(buscaProduto.toLowerCase()))
  const produtosAbaixoMinimo = produtosWeb.filter(item => Number(item.estoque_atual) <= Number(item.estoque_minimo)).length

  return <div className="flex h-screen overflow-hidden bg-background text-white">
    {menuAberto && <button aria-label="Fechar menu" className="fixed inset-0 z-20 bg-black/60 md:hidden" onClick={() => setMenuAberto(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-30 flex w-60 shrink-0 flex-col border-r border-surface-border bg-surface px-3 py-4 transition-transform md:relative md:translate-x-0 ${menuAberto ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-8 flex items-center gap-2.5 px-2"><div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500"><Building2 size={16} /></div><div className="min-w-0"><p className="text-xs font-bold">ADM PRO</p><p className="truncate text-[11px] text-gray-500">Versão web</p></div></div>
      <nav className="flex-1 space-y-1">
        {perfil.perfil === 'master' && <button className="flex w-full items-center gap-3 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-semibold shadow-glow-sm"><Building2 size={16} />Painel Administrador</button>}
        {perfil.perfil === 'supervisor' && <button className={pagina === 'supervisor' ? 'flex w-full items-center gap-3 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-semibold shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('supervisor')}><LayoutDashboard size={16} />Visão geral</button>}
        {perfil.perfil === 'setor_pessoal' && <button className={pagina === 'pessoal' ? 'flex w-full items-center gap-3 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-semibold shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('pessoal')}><UsersRound size={16} />Solicitações</button>}
        {perfil.perfil === 'central' && <button className={pagina === 'central' ? 'flex w-full items-center gap-3 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-semibold shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('central')}><Building2 size={16} />Painel Central</button>}
        {['admin', 'gestor'].includes(perfil.perfil) && <button className={pagina === 'inicio' ? 'flex w-full items-center gap-3 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-semibold shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('inicio')}><LayoutDashboard size={16} />Início</button>}
        <div className="my-3 border-t border-surface-border" />
        {perfil.perfil === 'admin' && <><p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Recursos Humanos</p><button className={pagina === 'rh' ? 'flex w-full items-center gap-3 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('rh')}><UsersRound size={15} />Colaboradores</button></>}
        {['admin', 'gestor', 'almoxarife'].includes(perfil.perfil) && <><div className="my-3 border-t border-surface-border" /><p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Almoxarifado</p><button className={pagina === 'estoque' ? 'flex w-full items-center gap-3 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('estoque')}><Boxes size={15} />Estoque</button></>}
        <div className="my-3 border-t border-surface-border" />
        <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Financeiro</p>
        {perfil.perfil === 'admin' && <button className={pagina === 'financeiro' ? 'flex w-full items-center gap-3 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('financeiro')}><Wallet size={15} />Lançamentos</button>}
      </nav>
      <div className="border-t border-surface-border pt-4"><div className="flex items-center gap-2.5 px-2"><div className="grid h-7 w-7 place-items-center rounded-full bg-brand-500/10 text-xs font-bold text-brand-400">{perfil.nome.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-gray-200">{perfil.nome}</p><p className="truncate text-[11px] text-gray-500">{nomesPerfil[perfil.perfil] ?? perfil.perfil}</p></div><button title="Sair" className="rounded-lg p-1.5 text-gray-500 hover:bg-red-500/10 hover:text-red-400" onClick={() => void supabase.auth.signOut()}><LogOut size={14} /></button></div></div>
    </aside>
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden"><header className="flex h-[64px] shrink-0 items-center justify-between border-b border-surface-border bg-surface px-4 md:h-[73px] md:px-6"><div className="flex items-center gap-3"><button className="rounded-lg p-2 text-gray-300 hover:bg-surface-hover md:hidden" aria-label="Abrir menu" onClick={() => setMenuAberto(aberto => !aberto)}>{menuAberto ? <X size={20} /> : <Menu size={20} />}</button><div><p className="text-xs text-gray-500">ADM PRO WEB</p><h1 className="text-lg font-semibold">{pagina === 'supervisor' ? 'Painel do Supervisor' : pagina === 'pessoal' ? 'Setor Pessoal' : pagina === 'central' ? 'Escritório Central' : pagina === 'inicio' ? 'Painel Inicial' : pagina === 'rh' ? 'Colaboradores' : pagina === 'estoque' ? 'Estoque' : 'Lançamentos'}</h1></div></div><p className="hidden text-sm text-gray-400 sm:block">{perfil.email}</p></header><main className="flex-1 overflow-y-auto p-4 md:p-6">
      {erro && <p className="mt-6 rounded-md bg-red-950/50 p-3 text-sm text-red-300">{erro}</p>}
      {perfil.perfil === 'master' && resumoMaster && <section className="mx-auto max-w-7xl py-2 md:py-4"><div className="mb-6"><p className="text-sm font-semibold text-brand-400">ADMINISTRAÇÃO GERAL</p><h2 className="mt-1 text-2xl font-bold">Painel Administrador</h2><p className="mt-1 text-sm text-gray-400">Visão consolidada da estrutura da empresa e dos acessos do sistema.</p></div><div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4"><div className="rounded-2xl border border-brand-500/35 bg-surface p-5"><div className="flex items-center gap-2 text-brand-300"><Building2 size={16} /><p className="text-xs font-bold uppercase tracking-wide">Obras</p></div><p className="mt-5 text-4xl font-bold">{resumoMaster.obras}</p><p className="mt-1 text-sm text-gray-400">empreendimentos cadastrados</p></div><div className="rounded-2xl border border-emerald-500/35 bg-surface p-5"><div className="flex items-center gap-2 text-emerald-300"><UsersRound size={16} /><p className="text-xs font-bold uppercase tracking-wide">Usuários ativos</p></div><p className="mt-5 text-4xl font-bold text-emerald-300">{resumoMaster.usuarios}</p><p className="mt-1 text-sm text-gray-400">com acesso ao sistema</p></div><div className="rounded-2xl border border-purple-500/35 bg-surface p-5"><div className="flex items-center gap-2 text-purple-300"><LayoutDashboard size={16} /><p className="text-xs font-bold uppercase tracking-wide">Supervisores</p></div><p className="mt-5 text-4xl font-bold text-purple-300">{resumoMaster.supervisores}</p><p className="mt-1 text-sm text-gray-400">responsáveis por obras</p></div><div className="rounded-2xl border border-amber-500/35 bg-surface p-5"><div className="flex items-center gap-2 text-amber-300"><UsersRound size={16} /><p className="text-xs font-bold uppercase tracking-wide">Administradores</p></div><p className="mt-5 text-4xl font-bold text-amber-300">{resumoMaster.administradores}</p><p className="mt-1 text-sm text-gray-400">gestão operacional</p></div></div><div className="mt-6 grid gap-5 lg:grid-cols-3"><section className="rounded-2xl border border-surface-border bg-surface p-5 lg:col-span-2"><h3 className="font-semibold">Estrutura operacional</h3><p className="mt-1 text-sm text-gray-400">Acesso organizado pelos mesmos núcleos do aplicativo desktop.</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-surface-hover p-4"><p className="font-medium">Escritório Central</p><p className="mt-1 text-sm text-gray-400">Aprovação e acompanhamento de lotes.</p></div><div className="rounded-xl bg-surface-hover p-4"><p className="font-medium">Setor Pessoal</p><p className="mt-1 text-sm text-gray-400">Fila de solicitações trabalhistas.</p></div><div className="rounded-xl bg-surface-hover p-4"><p className="font-medium">Supervisores</p><p className="mt-1 text-sm text-gray-400">Gestão agrupada por obras vinculadas.</p></div><div className="rounded-xl bg-surface-hover p-4"><p className="font-medium">Administração da obra</p><p className="mt-1 text-sm text-gray-400">RH, financeiro e almoxarifado.</p></div></div></section><section className="rounded-2xl border border-surface-border bg-surface p-5"><h3 className="font-semibold">Próxima conferência</h3><p className="mt-3 text-sm leading-6 text-gray-400">Revise os acessos ativos e os vínculos de supervisores às obras antes de liberar novos usuários.</p><div className="mt-6 rounded-xl border border-brand-500/25 bg-brand-500/10 p-3 text-sm text-brand-200">A gestão completa de usuários e obras continua sendo migrada para as telas web.</div></section></div></section>}
      {perfil.perfil === 'master' && resumoMaster && <section className="mx-auto -mt-5 max-w-7xl pb-6"><div className="grid gap-5 lg:grid-cols-2"><section className="overflow-hidden rounded-2xl border border-surface-border bg-surface"><div className="flex items-center justify-between border-b border-surface-border p-5"><div><h3 className="font-semibold">Obras cadastradas</h3><p className="mt-1 text-sm text-gray-400">Visão rápida dos empreendimentos.</p></div><span className="text-sm text-gray-400">{obrasMaster.length} total</span></div><div className="divide-y divide-surface-border">{obrasMaster.slice(0, 6).map(obra => <div key={obra.id} className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate font-medium">{obra.titulo_obra || obra.nome}</p><p className="mt-1 truncate text-xs text-gray-400">{obra.nome}</p></div><span className="rounded-full bg-surface-hover px-2.5 py-1 text-xs text-gray-300">{obra.estado || 'Sem UF'}</span></div>)}{obrasMaster.length === 0 && <p className="p-5 text-sm text-gray-400">Nenhuma obra cadastrada.</p>}</div></section><section className="overflow-hidden rounded-2xl border border-surface-border bg-surface"><div className="flex items-center justify-between border-b border-surface-border p-5"><div><h3 className="font-semibold">Usuários do sistema</h3><p className="mt-1 text-sm text-gray-400">Contas e perfis cadastrados.</p></div><span className="text-sm text-gray-400">{usuariosMaster.length} total</span></div><div className="divide-y divide-surface-border">{usuariosMaster.slice(0, 6).map(usuario => <div key={usuario.id} className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate font-medium">{usuario.nome}</p><p className="mt-1 truncate text-xs text-gray-400">{usuario.email} · {nomesPerfil[usuario.perfil] ?? usuario.perfil}</p></div><span className={usuario.ativo ? 'rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-300' : 'rounded-full bg-gray-500/15 px-2.5 py-1 text-xs text-gray-400'}>{usuario.ativo ? 'Ativo' : 'Inativo'}</span></div>)}{usuariosMaster.length === 0 && <p className="p-5 text-sm text-gray-400">Nenhum usuário cadastrado.</p>}</div></section></div></section>}
      {perfil.perfil === 'supervisor' && pagina === 'supervisor' && resumoSupervisor && <section className="mx-auto max-w-7xl py-2 md:py-4"><div className="mb-6"><p className="text-sm font-semibold text-brand-400">VISÃO GERAL</p><h2 className="mt-1 text-2xl font-bold">Suas obras</h2><p className="mt-1 text-sm text-gray-400">Acompanhamento consolidado das obras sob sua gestão.</p></div><div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4"><div className="rounded-2xl border border-emerald-500/35 bg-surface p-5"><div className="flex items-center gap-2 text-emerald-300"><Building2 size={16} /><p className="text-xs font-bold uppercase tracking-wide">Sua gestão</p></div><p className="mt-5 text-3xl font-bold">{resumoSupervisor.obras.length}</p><p className="mt-1 text-sm text-gray-400">obras · {resumoSupervisor.colaboradores} colaboradores</p></div><div className="rounded-2xl border border-brand-500/35 bg-surface p-5"><div className="flex items-center gap-2 text-brand-300"><ArrowLeftRight size={16} /><p className="text-xs font-bold uppercase tracking-wide">Movimentação do mês</p></div><p className="mt-5 text-2xl font-bold text-brand-300">{resumoSupervisor.admissoes} / {resumoSupervisor.desligamentos}</p><p className="mt-1 text-sm text-gray-400">admissões / desligamentos</p></div><div className="rounded-2xl border border-amber-500/35 bg-surface p-5"><div className="flex items-center gap-2 text-amber-300"><Wallet size={16} /><p className="text-xs font-bold uppercase tracking-wide">Despesas no mês</p></div><p className="mt-5 text-2xl font-bold text-amber-300">{resumoSupervisor.despesas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p><p className="mt-1 text-sm text-gray-400">lançamentos não cancelados</p></div><div className="rounded-2xl border border-purple-500/35 bg-surface p-5"><div className="flex items-center gap-2 text-purple-300"><UsersRound size={16} /><p className="text-xs font-bold uppercase tracking-wide">Equipe ativa</p></div><p className="mt-5 text-3xl font-bold text-purple-300">{resumoSupervisor.colaboradores}</p><p className="mt-1 text-sm text-gray-400">idade média: {resumoSupervisor.idadeMedia ? `${resumoSupervisor.idadeMedia} anos` : '—'}</p></div></div><div className="mt-6 grid gap-5 2xl:grid-cols-3"><section className="rounded-2xl border border-surface-border bg-surface p-5 2xl:col-span-2"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Obras acompanhadas</h3><p className="mt-1 text-sm text-gray-400">Organizadas por estado, como no painel desktop.</p></div><span className="rounded-lg bg-surface-hover px-3 py-1.5 text-sm text-gray-300">{resumoSupervisor.obras.length} obra(s)</span></div><div className="mt-4 divide-y divide-surface-border">{resumoSupervisor.obras.length === 0 ? <p className="py-6 text-sm text-gray-400">Nenhuma obra vinculada a este supervisor.</p> : resumoSupervisor.obras.map(obra => <div key={obra.id} className="flex items-center justify-between gap-4 py-4"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-300"><MapPin size={16} /></span><div className="min-w-0"><p className="truncate font-medium">{obra.titulo_obra || obra.nome}</p><p className="truncate text-xs text-gray-400">{obra.nome}{obra.estado ? ` · ${obra.estado}` : ''}</p></div></div><span className="shrink-0 rounded-full bg-surface-hover px-2.5 py-1 text-xs text-gray-300">{obra.estado || 'Sem estado'}</span></div>)}</div></section><section className="rounded-2xl border border-surface-border bg-surface p-5"><h3 className="font-semibold">Pendências para aprovação</h3><p className="mt-2 text-sm text-gray-400">Itens de lote aguardando decisão do supervisor.</p><p className="mt-7 text-5xl font-bold text-amber-300">{resumoSupervisor.pendencias}</p><p className="mt-2 text-sm text-gray-400">autorizações e notas fiscais</p></section></div></section>}
      {perfil.perfil === 'setor_pessoal' && pagina === 'pessoal' && <section className="mx-auto max-w-7xl py-2 md:py-4"><div className="mb-6"><p className="text-sm font-semibold text-brand-400">DEPARTAMENTO PESSOAL</p><h2 className="mt-1 text-2xl font-bold">Solicitações das obras</h2><p className="mt-1 text-sm text-gray-400">Admissões, desligamentos e movimentações recebidas de todas as obras.</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-2xl border border-amber-500/35 bg-surface p-5"><p className="text-xs font-bold uppercase tracking-wide text-amber-300">Aguardando resposta</p><p className="mt-4 text-3xl font-bold text-amber-300">{solicitacoesPessoal.filter(item => item.status === 'pendente').length}</p></div><div className="rounded-2xl border border-brand-500/35 bg-surface p-5"><p className="text-xs font-bold uppercase tracking-wide text-brand-300">Respondidas</p><p className="mt-4 text-3xl font-bold text-brand-300">{solicitacoesPessoal.filter(item => item.status === 'respondido').length}</p></div><div className="rounded-2xl border border-emerald-500/35 bg-surface p-5"><p className="text-xs font-bold uppercase tracking-wide text-emerald-300">Concluídas</p><p className="mt-4 text-3xl font-bold text-emerald-300">{solicitacoesPessoal.filter(item => item.status === 'concluido').length}</p></div><div className="rounded-2xl border border-purple-500/35 bg-surface p-5"><p className="text-xs font-bold uppercase tracking-wide text-purple-300">Obras envolvidas</p><p className="mt-4 text-3xl font-bold text-purple-300">{new Set(solicitacoesPessoal.map(item => item.empresa_id)).size}</p></div></div><section className="mt-6 overflow-hidden rounded-2xl border border-surface-border bg-surface"><div className="flex flex-col gap-2 border-b border-surface-border p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">Fila de trabalho</h3><p className="mt-1 text-sm text-gray-400">Solicitações recentes, com prioridade para as pendentes.</p></div><span className="text-sm text-gray-400">{solicitacoesPessoal.length} registro(s)</span></div><div className="divide-y divide-surface-border">{solicitacoesPessoal.length === 0 ? <p className="p-6 text-sm text-gray-400">Nenhuma solicitação recebida até o momento.</p> : solicitacoesPessoal.slice().sort((a, b) => (a.status === 'pendente' ? -1 : 1) - (b.status === 'pendente' ? -1 : 1) || b.solicitado_em.localeCompare(a.solicitado_em)).map(item => <article key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-medium">{item.colaborador_nome}</p><p className="mt-1 truncate text-sm text-gray-400">{tiposSolicitacao[item.tipo] ?? item.tipo} · {item.obra_nome} · enviado por {item.solicitado_por}</p></div><div className="flex shrink-0 items-center gap-3"><span className={item.status === 'pendente' ? 'rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300' : item.status === 'respondido' ? 'rounded-full bg-brand-500/15 px-3 py-1 text-xs font-medium text-brand-300' : 'rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300'}>{item.status === 'pendente' ? 'Pendente' : item.status === 'respondido' ? 'Respondido' : 'Concluído'}</span><span className="text-xs text-gray-500">{new Date(item.solicitado_em).toLocaleDateString('pt-BR')}</span></div></article>)}</div></section></section>}
      {perfil.perfil === 'central' && pagina === 'central' && <section className="mx-auto max-w-7xl py-2 md:py-4"><div className="mb-6"><p className="text-sm font-semibold text-brand-400">ESCRITÓRIO CENTRAL</p><h2 className="mt-1 text-2xl font-bold">Supervisores e obras</h2><p className="mt-1 text-sm text-gray-400">Acompanhe a fila de aprovação por responsável, mantendo a hierarquia do painel desktop.</p></div><div className="grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-brand-500/35 bg-surface p-5"><p className="text-xs font-bold uppercase tracking-wide text-brand-300">Supervisores ativos</p><p className="mt-4 text-3xl font-bold text-brand-300">{resumoCentral.length}</p></div><div className="rounded-2xl border border-emerald-500/35 bg-surface p-5"><p className="text-xs font-bold uppercase tracking-wide text-emerald-300">Obras acompanhadas</p><p className="mt-4 text-3xl font-bold text-emerald-300">{resumoCentral.reduce((total, item) => total + item.obras.length, 0)}</p></div><div className="rounded-2xl border border-amber-500/35 bg-surface p-5"><p className="text-xs font-bold uppercase tracking-wide text-amber-300">Pendências centrais</p><p className="mt-4 text-3xl font-bold text-amber-300">{resumoCentral.reduce((total, item) => total + item.pendencias, 0)}</p></div></div><section className="mt-6 overflow-hidden rounded-2xl border border-surface-border bg-surface"><div className="border-b border-surface-border p-5"><h3 className="font-semibold">Fluxo por supervisor</h3><p className="mt-1 text-sm text-gray-400">Seleção de obras e itens aguardando aprovação do Escritório.</p></div><div className="divide-y divide-surface-border">{resumoCentral.length === 0 ? <p className="p-6 text-sm text-gray-400">Nenhum supervisor ativo cadastrado.</p> : resumoCentral.map(supervisor => <article key={supervisor.id} className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{supervisor.nome}</p><p className="mt-1 text-sm text-gray-400">{supervisor.email}</p></div><span className={supervisor.pendencias ? 'w-fit rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300' : 'w-fit rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300'}>{supervisor.pendencias ? `${supervisor.pendencias} pendência(s)` : 'Sem pendências'}</span></div><div className="mt-4 flex flex-wrap gap-2">{supervisor.obras.length === 0 ? <span className="text-sm text-gray-500">Nenhuma obra vinculada.</span> : supervisor.obras.map(obra => <span key={obra.id} className="rounded-lg bg-surface-hover px-3 py-1.5 text-sm text-gray-300">{obra.nome}</span>)}</div></article>)}</div></section></section>}
      {resumo && pagina === 'inicio' && <section className="mt-8">
        <h2 className="mb-4 text-lg font-semibold">Painel inicial</h2>
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          <div className="rounded-lg border border-surface-border bg-surface p-5"><p className="text-sm text-gray-400">Colaboradores ativos</p><p className="mt-2 text-3xl font-bold">{resumo.ativos}</p></div>
          <div className="rounded-lg border border-surface-border bg-surface p-5"><p className="text-sm text-gray-400">Custo de folha</p><p className="mt-2 text-3xl font-bold">{resumo.custoFolha.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-5"><p className="text-sm text-amber-100">Média de idade</p><p className="mt-2 text-3xl font-bold text-amber-300">{resumo.mediaIdade ? `${resumo.mediaIdade} anos` : '—'}</p></div>
          <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-5"><p className="text-sm text-purple-100">Aniversariantes do mês</p><p className="mt-2 text-3xl font-bold text-purple-300">{resumo.aniversariantes.length}</p></div>
        </div>
        <div className="mt-5 grid gap-5 2xl:grid-cols-3"><div className="rounded-lg border border-surface-border bg-surface p-5 2xl:col-span-2"><h3 className="font-medium">Colaboradores por função</h3><div className="mt-4 space-y-4">{resumo.porFuncao.length === 0 ? <p className="text-sm text-gray-400">Sem funções cadastradas.</p> : resumo.porFuncao.map(item => <div key={item.funcao}><div className="flex justify-between gap-4 text-sm"><strong>{item.funcao}</strong><span className="text-gray-400">{item.quantidade} · {item.custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-hover"><div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(6, (item.quantidade / resumo.ativos) * 100)}%` }} /></div></div>)}</div></div><div className="rounded-lg border border-surface-border bg-surface p-5"><h3 className="font-medium">Aniversariantes do mês</h3><div className="mt-3 space-y-3">{resumo.aniversariantes.length === 0 ? <p className="text-sm text-gray-400">Nenhum aniversariante neste mês.</p> : resumo.aniversariantes.map(item => <div key={`${item.nome}-${item.nascimento}`} className="flex gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-purple-500/15 text-xs text-purple-300">{item.nascimento.slice(8, 10)}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{item.nome}</p><p className="truncate text-xs text-gray-400">{item.funcao ?? '—'}</p></div></div>)}</div></div></div>
        <div className="mt-5 rounded-lg border border-surface-border bg-surface p-5">
          <h3 className="font-medium">Últimos lançamentos</h3>
          <div className="mt-3 divide-y divide-surface-border">
            {resumo.lancamentos.length === 0 && <p className="py-3 text-sm text-gray-400">Nenhum lançamento encontrado.</p>}
            {resumo.lancamentos.map(item => <div key={item.id} className="flex items-center justify-between gap-4 py-3 text-sm"><div><p>{item.descricao}</p><p className="text-xs text-gray-400">{item.data} · {item.status}</p></div><strong className={item.tipo === 'receita' ? 'text-emerald-400' : 'text-red-300'}>{item.tipo === 'receita' ? '+' : '-'} {Number(item.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>)}
          </div>
        </div>
      </section>}
      {pagina === 'financeiro' && <section className="mt-7">
        <div className="mx-auto max-w-7xl"><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-brand-400">FINANCEIRO</p><h2 className="mt-1 text-2xl font-bold">Lançamentos</h2><p className="mt-1 text-sm text-gray-400">Controle de receitas, despesas e compromissos da obra.</p></div>{perfil.perfil === 'admin' && <button className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium hover:bg-brand-500" onClick={() => setNovoLancamento(aberto => !aberto)}>{novoLancamento ? 'Cancelar' : '+ Novo lançamento'}</button>}</div><div className="mb-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-emerald-500/30 bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Receitas</p><p className="mt-2 text-xl font-bold text-emerald-300">{resumoFinanceiro.receitas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div><div className="rounded-xl border border-red-500/30 bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-red-300">Despesas</p><p className="mt-2 text-xl font-bold text-red-300">{resumoFinanceiro.despesas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div><div className="rounded-xl border border-amber-500/30 bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Pendentes</p><p className="mt-2 text-2xl font-bold text-amber-300">{resumoFinanceiro.pendentes}</p></div></div>
        {novoLancamento && <form onSubmit={salvarLancamento} className="mb-5 grid gap-3 rounded-lg border border-surface-border bg-surface p-4 md:grid-cols-2"><label className="text-sm text-gray-300 md:col-span-2">Descrição<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" value={formLancamento.descricao} onChange={e => setFormLancamento({ ...formLancamento, descricao: e.target.value })} required /></label><label className="text-sm text-gray-300">Tipo<select className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" value={formLancamento.tipo} onChange={e => setFormLancamento({ ...formLancamento, tipo: e.target.value })}><option value="despesa">Despesa</option><option value="receita">Receita</option></select></label><label className="text-sm text-gray-300">Valor<input min="0.01" step="0.01" className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" type="number" value={formLancamento.valor} onChange={e => setFormLancamento({ ...formLancamento, valor: e.target.value })} required /></label><label className="text-sm text-gray-300">Data<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" type="date" value={formLancamento.data} onChange={e => setFormLancamento({ ...formLancamento, data: e.target.value })} required /></label><label className="text-sm text-gray-300">Vencimento<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" type="date" value={formLancamento.data_venc} onChange={e => setFormLancamento({ ...formLancamento, data_venc: e.target.value })} /></label><label className="text-sm text-gray-300">Categoria<select className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" value={formLancamento.categoria_id} onChange={e => setFormLancamento({ ...formLancamento, categoria_id: e.target.value })} required><option value="">Selecione</option>{categoriasWeb.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><label className="text-sm text-gray-300">Conta<select className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" value={formLancamento.conta_id} onChange={e => setFormLancamento({ ...formLancamento, conta_id: e.target.value })} required><option value="">Selecione</option>{contasWeb.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><div className="md:col-span-2"><button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium disabled:opacity-60" disabled={salvandoLancamento}>{salvandoLancamento ? 'Salvando…' : 'Salvar lançamento'}</button></div></form>}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row"><input className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2.5 text-sm text-white sm:max-w-md" placeholder="Buscar lançamento…" value={buscaLancamento} onChange={e => setBuscaLancamento(e.target.value)} /><select aria-label="Filtrar tipo de lançamento" className="rounded-lg border border-surface-border bg-surface px-3 py-2.5 text-sm text-gray-200" value={filtroTipoFinanceiro} onChange={e => setFiltroTipoFinanceiro(e.target.value)}><option value="todos">Receitas e despesas</option><option value="receita">Receitas</option><option value="despesa">Despesas</option></select></div><div className="space-y-3 md:hidden">{lancamentosFiltrados.length === 0 ? <p className="rounded-xl border border-surface-border bg-surface p-5 text-sm text-gray-400">Nenhum lançamento encontrado.</p> : lancamentosFiltrados.map(item => <article key={item.id} className="rounded-xl border border-surface-border bg-surface p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{item.descricao}</p><p className="mt-1 text-sm text-gray-400">{item.data} · {item.status}</p></div><strong className={item.tipo === 'receita' ? 'shrink-0 text-emerald-400' : 'shrink-0 text-red-300'}>{item.tipo === 'receita' ? '+' : '-'} {Number(item.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div></article>)}</div><div className="hidden overflow-x-auto rounded-xl border border-surface-border md:block"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-surface text-gray-400"><tr><th className="p-3">Data</th><th className="p-3">Descrição</th><th className="p-3">Situação</th><th className="p-3 text-right">Valor</th></tr></thead><tbody>{lancamentosFiltrados.length === 0 ? <tr><td className="p-5 text-gray-400" colSpan={4}>Nenhum lançamento encontrado.</td></tr> : lancamentosFiltrados.map(item => <tr key={item.id} className="border-t border-surface-border"><td className="p-3 text-gray-400">{item.data}</td><td className="p-3">{item.descricao}</td><td className="p-3"><span className="rounded bg-surface px-2 py-1 text-xs">{item.status}</span></td><td className={item.tipo === 'receita' ? 'p-3 text-right font-medium text-emerald-400' : 'p-3 text-right font-medium text-red-300'}>{item.tipo === 'receita' ? '+' : '-'} {Number(item.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td></tr>)}</tbody></table></div></div>
      </section>}
      {pagina === 'rh' && <section className="mt-7">
        <div className="mx-auto max-w-7xl"><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-brand-400">RECURSOS HUMANOS</p><h2 className="mt-1 text-2xl font-bold">Colaboradores</h2><p className="mt-1 text-sm text-gray-400">Cadastro, situação e custo da equipe da obra.</p></div><div className="flex items-center gap-3"><span className="rounded-full bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-300">{colaboradoresWeb.length} cadastrados</span>{perfil.perfil === 'admin' && <button className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium hover:bg-brand-500" onClick={() => setNovoColaborador(aberto => !aberto)}>{novoColaborador ? 'Cancelar' : '+ Novo colaborador'}</button>}</div></div><div className="mb-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-emerald-500/30 bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Ativos</p><p className="mt-2 text-2xl font-bold text-emerald-300">{resumoStatusRh.ativos}</p></div><div className="rounded-xl border border-brand-500/30 bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-brand-300">Em férias</p><p className="mt-2 text-2xl font-bold text-brand-300">{resumoStatusRh.ferias}</p></div><div className="rounded-xl border border-amber-500/30 bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Afastados</p><p className="mt-2 text-2xl font-bold text-amber-300">{resumoStatusRh.afastados}</p></div></div><div className="mb-4 flex flex-col gap-3 sm:flex-row"><input className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2.5 text-sm text-white sm:max-w-md" placeholder="Buscar por nome, função ou setor…" value={buscaColaborador} onChange={e => setBuscaColaborador(e.target.value)} /><select aria-label="Filtrar situação" className="rounded-lg border border-surface-border bg-surface px-3 py-2.5 text-sm text-gray-200" value={filtroStatusRh} onChange={e => setFiltroStatusRh(e.target.value)}><option value="todos">Todas as situações</option><option value="ativo">Ativos</option><option value="ferias">Férias</option><option value="afastado">Afastados</option><option value="desligado">Desligados</option></select></div>
        {novoColaborador && <form onSubmit={salvarColaborador} className="mb-5 grid gap-3 rounded-lg border border-surface-border bg-surface p-4 md:grid-cols-2"><label className="text-sm text-gray-300 md:col-span-2">Nome completo<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" value={formColaborador.nome} onChange={e => setFormColaborador({ ...formColaborador, nome: e.target.value })} required /></label><label className="text-sm text-gray-300">Função<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" value={formColaborador.funcao} onChange={e => setFormColaborador({ ...formColaborador, funcao: e.target.value })} /></label><label className="text-sm text-gray-300">Setor<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" value={formColaborador.setor} onChange={e => setFormColaborador({ ...formColaborador, setor: e.target.value })} /></label><label className="text-sm text-gray-300">Data de admissão<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" type="date" value={formColaborador.data_admissao} onChange={e => setFormColaborador({ ...formColaborador, data_admissao: e.target.value })} /></label><label className="text-sm text-gray-300">Salário base<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" min="0" step="0.01" type="number" value={formColaborador.salario_base} onChange={e => setFormColaborador({ ...formColaborador, salario_base: e.target.value })} /></label><div className="md:col-span-2"><button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium disabled:opacity-60" disabled={salvandoColaborador}>{salvandoColaborador ? 'Salvando…' : 'Cadastrar colaborador'}</button></div></form>}
        <div className="space-y-3 md:hidden">{colaboradoresFiltrados.length === 0 ? <p className="rounded-xl border border-surface-border bg-surface p-5 text-sm text-gray-400">Nenhum colaborador encontrado.</p> : colaboradoresFiltrados.map(item => <article key={item.id} className="rounded-xl border border-surface-border bg-surface p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{item.nome}</p><p className="mt-1 text-sm text-gray-400">{item.funcao ?? 'Função não informada'}</p></div><span className={item.status === 'ativo' ? 'rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300' : 'rounded-full bg-gray-500/10 px-2.5 py-1 text-xs text-gray-300'}>{item.status}</span></div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-surface-border pt-3 text-sm"><div><p className="text-xs text-gray-500">Setor</p><p className="mt-1 text-gray-200">{item.setor ?? '—'}</p></div><div><p className="text-xs text-gray-500">Salário base</p><p className="mt-1 font-medium text-gray-200">{Number(item.salario_base).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div></div></article>)}</div><div className="hidden overflow-x-auto rounded-xl border border-surface-border md:block"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-surface text-gray-400"><tr><th className="p-3">Nome</th><th className="p-3">Função</th><th className="p-3">Setor</th><th className="p-3">Status</th><th className="p-3 text-right">Salário base</th></tr></thead><tbody>{colaboradoresFiltrados.length === 0 ? <tr><td className="p-5 text-gray-400" colSpan={5}>Nenhum colaborador encontrado.</td></tr> : colaboradoresFiltrados.map(item => <tr key={item.id} className="border-t border-surface-border"><td className="p-3 font-medium">{item.nome}</td><td className="p-3 text-gray-300">{item.funcao ?? '—'}</td><td className="p-3 text-gray-300">{item.setor ?? '—'}</td><td className="p-3"><span className={item.status === 'ativo' ? 'rounded bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300' : 'rounded bg-gray-500/10 px-2 py-1 text-xs text-gray-400'}>{item.status}</span></td><td className="p-3 text-right">{Number(item.salario_base).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td></tr>)}</tbody></table></div></div>
      </section>}
      {pagina === 'estoque' && <section className="mx-auto mt-7 max-w-7xl"><div className="mb-6"><p className="text-sm font-semibold text-brand-400">ALMOXARIFADO</p><h2 className="mt-1 text-2xl font-bold">Estoque</h2><p className="mt-1 text-sm text-gray-400">Consulta rápida de produtos e alertas de reposição.</p></div><div className="mb-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-brand-500/30 bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-brand-300">Itens cadastrados</p><p className="mt-2 text-2xl font-bold text-brand-300">{produtosWeb.length}</p></div><div className="rounded-xl border border-amber-500/30 bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Abaixo do mínimo</p><p className="mt-2 text-2xl font-bold text-amber-300">{produtosAbaixoMinimo}</p></div><div className="rounded-xl border border-emerald-500/30 bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Em nível regular</p><p className="mt-2 text-2xl font-bold text-emerald-300">{produtosWeb.length - produtosAbaixoMinimo}</p></div></div><input className="mb-4 w-full rounded-lg border border-surface-border bg-surface px-3 py-2.5 text-sm text-white sm:max-w-md" placeholder="Buscar código ou produto…" value={buscaProduto} onChange={e => setBuscaProduto(e.target.value)} /><div className="space-y-3 md:hidden">{produtosFiltrados.length === 0 ? <p className="rounded-xl border border-surface-border bg-surface p-5 text-sm text-gray-400">Nenhum produto encontrado.</p> : produtosFiltrados.map(item => <article key={item.id} className="rounded-xl border border-surface-border bg-surface p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{item.nome}</p><p className="mt-1 text-xs text-gray-500">Código: {item.codigo}</p></div><span className={Number(item.estoque_atual) <= Number(item.estoque_minimo) ? 'rounded-full bg-amber-500/15 px-2.5 py-1 text-xs text-amber-300' : 'rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-300'}>{item.estoque_atual} {item.unidade ?? ''}</span></div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-surface-border pt-3 text-sm"><div><p className="text-xs text-gray-500">Estoque mínimo</p><p className="mt-1 text-gray-200">{item.estoque_minimo} {item.unidade ?? ''}</p></div><div><p className="text-xs text-gray-500">Valor unitário</p><p className="mt-1 font-medium text-gray-200">{Number(item.valor_unitario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div></div></article>)}</div><div className="hidden overflow-x-auto rounded-xl border border-surface-border md:block"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-surface text-gray-400"><tr><th className="p-3">Código</th><th className="p-3">Produto</th><th className="p-3">Estoque</th><th className="p-3 text-right">Valor unitário</th></tr></thead><tbody>{produtosFiltrados.length === 0 ? <tr><td className="p-5 text-gray-400" colSpan={4}>Nenhum produto encontrado.</td></tr> : produtosFiltrados.map(item => <tr key={item.id} className="border-t border-surface-border"><td className="p-3 text-gray-400">{item.codigo}</td><td className="p-3 font-medium">{item.nome}</td><td className={Number(item.estoque_atual) <= Number(item.estoque_minimo) ? 'p-3 text-amber-300' : 'p-3'}>{item.estoque_atual} {item.unidade ?? ''}</td><td className="p-3 text-right">{Number(item.valor_unitario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td></tr>)}</tbody></table></div></section>}
    </main></div>
  </div>
}

ReactDOM.createRoot(document.getElementById('root')!).render(<PortalWeb />)
