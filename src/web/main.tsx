import { FormEvent, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Session } from '@supabase/supabase-js'
import { Building2, LayoutDashboard, LogOut, Menu, UsersRound, Wallet, X } from 'lucide-react'
import { supabase } from './supabase'
import '../renderer/index.css'

type Perfil = {
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
}

type Lancamento = { id: number; descricao: string; valor: number; tipo: string; data: string; data_venc: string | null; status: string }
type Colaborador = { id: number; nome: string; funcao: string | null; setor: string | null; status: string; salario_base: number }
type OpcaoFinanceira = { id: number; nome: string }

const nomesPerfil: Record<string, string> = {
  admin: 'Administrador', gestor: 'Gestor', almoxarife: 'Almoxarife',
  supervisor: 'Supervisor', central: 'Escritório Central', master: 'Administrador Master',
  setor_pessoal: 'Setor Pessoal',
}

function PortalWeb() {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [resumo, setResumo] = useState<ResumoObra | null>(null)
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [colaboradoresWeb, setColaboradoresWeb] = useState<Colaborador[]>([])
  const [categoriasWeb, setCategoriasWeb] = useState<OpcaoFinanceira[]>([])
  const [contasWeb, setContasWeb] = useState<OpcaoFinanceira[]>([])
  const [pagina, setPagina] = useState<'inicio' | 'financeiro' | 'rh'>('inicio')
  const [menuAberto, setMenuAberto] = useState(false)
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
      .select('empresa_id,nome,email,perfil,ativo')
      .eq('auth_user_id', sessao.user.id)
      .maybeSingle()
    if (error) setErro(`Não foi possível carregar seu perfil: ${error.message}`)
    else if (!data || !data.ativo) setErro('Sua conta não está vinculada a um usuário ativo do sistema.')
    else {
      setPerfil(data)
      const [colaboradores, lancamentos] = await Promise.all([
        supabase.from('colaboradores').select('salario_base').eq('empresa_id', data.empresa_id).eq('status', 'ativo'),
        supabase.from('lancamentos').select('id,descricao,valor,tipo,data,status').eq('empresa_id', data.empresa_id).order('created_at', { ascending: false }).limit(5),
      ])
      if (colaboradores.error || lancamentos.error) {
        setErro('Não foi possível carregar o resumo da obra.')
      } else {
        setResumo({
          ativos: colaboradores.data?.length ?? 0,
          custoFolha: (colaboradores.data ?? []).reduce((total, item) => total + Number(item.salario_base), 0),
          lancamentos: lancamentos.data ?? [],
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

  const navegar = (destino: 'inicio' | 'financeiro' | 'rh') => { setPagina(destino); setMenuAberto(false) }

  return <div className="flex h-screen overflow-hidden bg-background text-white">
    {menuAberto && <button aria-label="Fechar menu" className="fixed inset-0 z-20 bg-black/60 md:hidden" onClick={() => setMenuAberto(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-30 flex w-60 shrink-0 flex-col border-r border-surface-border bg-surface px-3 py-4 transition-transform md:static md:translate-x-0 ${menuAberto ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-8 flex items-center gap-2.5 px-2"><div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500"><Building2 size={16} /></div><div className="min-w-0"><p className="text-xs font-bold">ADM PRO</p><p className="truncate text-[11px] text-gray-500">Versão web</p></div></div>
      <nav className="flex-1 space-y-1">
        <button className={pagina === 'inicio' ? 'flex w-full items-center gap-3 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-semibold shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('inicio')}><LayoutDashboard size={16} />Início</button>
        <div className="my-3 border-t border-surface-border" />
        <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Recursos Humanos</p>
        <button className={pagina === 'rh' ? 'flex w-full items-center gap-3 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('rh')}><UsersRound size={15} />Colaboradores</button>
        <div className="my-3 border-t border-surface-border" />
        <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Financeiro</p>
        <button className={pagina === 'financeiro' ? 'flex w-full items-center gap-3 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('financeiro')}><Wallet size={15} />Lançamentos</button>
      </nav>
      <div className="border-t border-surface-border pt-4"><div className="flex items-center gap-2.5 px-2"><div className="grid h-7 w-7 place-items-center rounded-full bg-brand-500/10 text-xs font-bold text-brand-400">{perfil.nome.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-gray-200">{perfil.nome}</p><p className="truncate text-[11px] text-gray-500">{nomesPerfil[perfil.perfil] ?? perfil.perfil}</p></div><button title="Sair" className="rounded-lg p-1.5 text-gray-500 hover:bg-red-500/10 hover:text-red-400" onClick={() => void supabase.auth.signOut()}><LogOut size={14} /></button></div></div>
    </aside>
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden"><header className="flex h-[64px] shrink-0 items-center justify-between border-b border-surface-border bg-surface px-4 md:h-[73px] md:px-6"><div className="flex items-center gap-3"><button className="rounded-lg p-2 text-gray-300 hover:bg-surface-hover md:hidden" aria-label="Abrir menu" onClick={() => setMenuAberto(aberto => !aberto)}>{menuAberto ? <X size={20} /> : <Menu size={20} />}</button><div><p className="text-xs text-gray-500">ADM PRO WEB</p><h1 className="text-lg font-semibold">{pagina === 'inicio' ? 'Painel Inicial' : pagina === 'rh' ? 'Colaboradores' : 'Lançamentos'}</h1></div></div><p className="hidden text-sm text-gray-400 sm:block">{perfil.email}</p></header><main className="flex-1 overflow-y-auto p-4 md:p-6">
      {erro && <p className="mt-6 rounded-md bg-red-950/50 p-3 text-sm text-red-300">{erro}</p>}
      {resumo && pagina === 'inicio' && <section className="mt-8">
        <h2 className="mb-4 text-lg font-semibold">Painel inicial</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-surface-border bg-surface p-5"><p className="text-sm text-gray-400">Colaboradores ativos</p><p className="mt-2 text-3xl font-bold">{resumo.ativos}</p></div>
          <div className="rounded-lg border border-surface-border bg-surface p-5"><p className="text-sm text-gray-400">Custo de folha</p><p className="mt-2 text-3xl font-bold">{resumo.custoFolha.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div>
        </div>
        <div className="mt-5 rounded-lg border border-surface-border bg-surface p-5">
          <h3 className="font-medium">Últimos lançamentos</h3>
          <div className="mt-3 divide-y divide-surface-border">
            {resumo.lancamentos.length === 0 && <p className="py-3 text-sm text-gray-400">Nenhum lançamento encontrado.</p>}
            {resumo.lancamentos.map(item => <div key={item.id} className="flex items-center justify-between gap-4 py-3 text-sm"><div><p>{item.descricao}</p><p className="text-xs text-gray-400">{item.data} · {item.status}</p></div><strong className={item.tipo === 'receita' ? 'text-emerald-400' : 'text-red-300'}>{item.tipo === 'receita' ? '+' : '-'} {Number(item.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>)}
          </div>
        </div>
      </section>}
      {pagina === 'financeiro' && <section className="mt-7">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Lançamentos</h2>{perfil.perfil === 'admin' && <button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium hover:bg-brand-500" onClick={() => setNovoLancamento(aberto => !aberto)}>{novoLancamento ? 'Cancelar' : '+ Novo lançamento'}</button>}</div>
        {novoLancamento && <form onSubmit={salvarLancamento} className="mb-5 grid gap-3 rounded-lg border border-surface-border bg-surface p-4 md:grid-cols-2"><label className="text-sm text-gray-300 md:col-span-2">Descrição<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" value={formLancamento.descricao} onChange={e => setFormLancamento({ ...formLancamento, descricao: e.target.value })} required /></label><label className="text-sm text-gray-300">Tipo<select className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" value={formLancamento.tipo} onChange={e => setFormLancamento({ ...formLancamento, tipo: e.target.value })}><option value="despesa">Despesa</option><option value="receita">Receita</option></select></label><label className="text-sm text-gray-300">Valor<input min="0.01" step="0.01" className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" type="number" value={formLancamento.valor} onChange={e => setFormLancamento({ ...formLancamento, valor: e.target.value })} required /></label><label className="text-sm text-gray-300">Data<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" type="date" value={formLancamento.data} onChange={e => setFormLancamento({ ...formLancamento, data: e.target.value })} required /></label><label className="text-sm text-gray-300">Vencimento<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" type="date" value={formLancamento.data_venc} onChange={e => setFormLancamento({ ...formLancamento, data_venc: e.target.value })} /></label><label className="text-sm text-gray-300">Categoria<select className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" value={formLancamento.categoria_id} onChange={e => setFormLancamento({ ...formLancamento, categoria_id: e.target.value })} required><option value="">Selecione</option>{categoriasWeb.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><label className="text-sm text-gray-300">Conta<select className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" value={formLancamento.conta_id} onChange={e => setFormLancamento({ ...formLancamento, conta_id: e.target.value })} required><option value="">Selecione</option>{contasWeb.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><div className="md:col-span-2"><button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium disabled:opacity-60" disabled={salvandoLancamento}>{salvandoLancamento ? 'Salvando…' : 'Salvar lançamento'}</button></div></form>}
        <div className="overflow-x-auto rounded-lg border border-surface-border">
          <table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-surface text-gray-400"><tr><th className="p-3">Data</th><th className="p-3">Descrição</th><th className="p-3">Situação</th><th className="p-3 text-right">Valor</th></tr></thead>
            <tbody>{lancamentos.length === 0 ? <tr><td className="p-4 text-gray-400" colSpan={4}>Nenhum lançamento encontrado.</td></tr> : lancamentos.map(item => <tr key={item.id} className="border-t border-surface-border"><td className="p-3 text-gray-400">{item.data}</td><td className="p-3">{item.descricao}</td><td className="p-3"><span className="rounded bg-surface px-2 py-1 text-xs">{item.status}</span></td><td className={item.tipo === 'receita' ? 'p-3 text-right font-medium text-emerald-400' : 'p-3 text-right font-medium text-red-300'}>{item.tipo === 'receita' ? '+' : '-'} {Number(item.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td></tr>)}</tbody>
          </table>
        </div>
      </section>}
      {pagina === 'rh' && <section className="mt-7">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Colaboradores</h2><div className="flex items-center gap-3"><span className="rounded-full bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-300">{colaboradoresWeb.length} cadastrados</span>{perfil.perfil === 'admin' && <button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium hover:bg-brand-500" onClick={() => setNovoColaborador(aberto => !aberto)}>{novoColaborador ? 'Cancelar' : '+ Novo colaborador'}</button>}</div></div>
        {novoColaborador && <form onSubmit={salvarColaborador} className="mb-5 grid gap-3 rounded-lg border border-surface-border bg-surface p-4 md:grid-cols-2"><label className="text-sm text-gray-300 md:col-span-2">Nome completo<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" value={formColaborador.nome} onChange={e => setFormColaborador({ ...formColaborador, nome: e.target.value })} required /></label><label className="text-sm text-gray-300">Função<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" value={formColaborador.funcao} onChange={e => setFormColaborador({ ...formColaborador, funcao: e.target.value })} /></label><label className="text-sm text-gray-300">Setor<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" value={formColaborador.setor} onChange={e => setFormColaborador({ ...formColaborador, setor: e.target.value })} /></label><label className="text-sm text-gray-300">Data de admissão<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" type="date" value={formColaborador.data_admissao} onChange={e => setFormColaborador({ ...formColaborador, data_admissao: e.target.value })} /></label><label className="text-sm text-gray-300">Salário base<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" min="0" step="0.01" type="number" value={formColaborador.salario_base} onChange={e => setFormColaborador({ ...formColaborador, salario_base: e.target.value })} /></label><div className="md:col-span-2"><button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium disabled:opacity-60" disabled={salvandoColaborador}>{salvandoColaborador ? 'Salvando…' : 'Cadastrar colaborador'}</button></div></form>}
        <div className="overflow-x-auto rounded-lg border border-surface-border"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-surface text-gray-400"><tr><th className="p-3">Nome</th><th className="p-3">Função</th><th className="p-3">Setor</th><th className="p-3">Status</th><th className="p-3 text-right">Salário base</th></tr></thead><tbody>{colaboradoresWeb.length === 0 ? <tr><td className="p-4 text-gray-400" colSpan={5}>Nenhum colaborador encontrado.</td></tr> : colaboradoresWeb.map(item => <tr key={item.id} className="border-t border-surface-border"><td className="p-3 font-medium">{item.nome}</td><td className="p-3 text-gray-300">{item.funcao ?? '—'}</td><td className="p-3 text-gray-300">{item.setor ?? '—'}</td><td className="p-3"><span className={item.status === 'ativo' ? 'rounded bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300' : 'rounded bg-gray-500/10 px-2 py-1 text-xs text-gray-400'}>{item.status}</span></td><td className="p-3 text-right">{Number(item.salario_base).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td></tr>)}</tbody></table></div>
      </section>}
      <div className="mt-6 rounded-lg border border-blue-500/30 bg-blue-500/10 p-5 text-sm text-blue-100">Seu acesso web está autenticado pelo Supabase. Outros módulos serão disponibilizados gradualmente, mantendo as mesmas permissões do aplicativo desktop.</div>
    </main></div>
  </div>
}

ReactDOM.createRoot(document.getElementById('root')!).render(<PortalWeb />)
