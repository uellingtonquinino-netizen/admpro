import { useState, useEffect } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore }    from '@store/auth.store'
import { useEmpresaStore } from '@store/empresa.store'
import { useUIStore }      from '@store/ui.store'
import { useConfirm }      from '@hooks/useConfirm'
import ConfirmDialog       from '@components/ui/ConfirmDialog'
import { clsx }            from 'clsx'
import {
  LayoutDashboard,
  HardHat,
  Truck,
  ArrowLeftRight,
  Wallet,
  BarChart2,
  ClipboardList,
  Receipt,
  CircleDollarSign,
  HandCoins,
  FileSignature,
  Settings,
  Users,
  LogOut,
  RefreshCw,
  Building2,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  UsersRound,
  Landmark,
  HelpCircle,
  PackageSearch,
  PackagePlus,
  PackageMinus,
  Boxes,
  Building,
  FolderTree,
  TrendingUp,
  CreditCard,
  NotebookPen,
  Calculator,
  FileSpreadsheet,
} from 'lucide-react'

type Perfil = 'admin' | 'gestor' | 'almoxarife' | 'supervisor' | 'central' | 'master' | 'setor_pessoal'

const PERFIL_LABEL: Record<Perfil, string> = {
  admin:      'ADM',
  gestor:     'GESTOR',
  almoxarife: 'ALMOXARIFADO',
  supervisor: 'SUPERVISOR',
  central:    'ESCRITÓRIO CENTRAL',
  master:     'ADMINISTRADOR MASTER',
  setor_pessoal: 'SETOR PESSOAL',
}

interface MenuItem {
  to:      string
  icon:    React.ElementType
  label:   string
  perfis?: Perfil[]  // quais perfis veem este item — se vazio, todos veem
  chave?:  string    // chave de permissão extra que também libera o item
  emBreve?: boolean
}

interface MenuGroup {
  id:    string
  label: string
  icon:  React.ElementType
  itens: MenuItem[]
}

// ALTERADO: cada item agora declara quais perfis podem vê-lo — ADM
// enxerga tudo; GESTOR só Início + Autorização de Pagamento + Notas
// Fiscais (leitura/impressão, controlado dentro da própria página);
// ALMOXARIFADO só o grupo Almoxarifado (nem Início).
const ITEM_INICIO: MenuItem = { to: '/inicio', icon: LayoutDashboard, label: 'Início', perfis: ['admin', 'gestor'], chave: 'inicio' }
// NOVO: Faturas virou item independente (não fica dentro de nenhum
// grupo que precisa expandir) — fica ancorado perto do rodapé, junto
// do nome do usuário, sempre visível, porque tem notificação de
// vencimento nele (precisa aparecer sem precisar clicar em nada).
const ITEM_FATURAS: MenuItem = { to: '/faturas', icon: CreditCard, label: 'Faturas', perfis: ['admin'], chave: 'faturas' }
const ITEM_SUPERVISOR_INICIO: MenuItem = { to: '/supervisor', icon: Building2, label: 'Painel Supervisor', perfis: ['supervisor'] }
const ITEM_SUPERVISOR_RELATORIOS: MenuItem = { to: '/supervisor/relatorios', icon: ClipboardList, label: 'Relatórios', perfis: ['supervisor'] }
const ITEM_SUPERVISOR_CONFIG: MenuItem = { to: '/supervisor/configuracoes', icon: Settings, label: 'Configurações', perfis: ['supervisor'] }
const ITEM_CENTRAL: MenuItem = { to: '/central', icon: Building2, label: 'Escritório Central', perfis: ['central'] }
const ITEM_MASTER: MenuItem = { to: '/master', icon: Building2, label: 'Painel Administrador', perfis: ['master'] }
const ITEM_SETOR_PESSOAL: MenuItem = { to: '/setor-pessoal', icon: FileSignature, label: 'Setor Pessoal', perfis: ['setor_pessoal'] }

const GRUPOS: MenuGroup[] = [
  {
    id:    'rh',
    label: 'Recursos Humanos',
    icon:  UsersRound,
    itens: [
      { to: '/colaboradores', icon: HardHat,       label: 'Colaboradores', perfis: ['admin'], chave: 'colaboradores' },
      { to: '/relatorios-rh', icon: ClipboardList, label: 'Relatórios RH', perfis: ['admin'], chave: 'relatorios-rh' },
      { to: '/solicitacoes-pessoal', icon: FileSignature, label: 'Solicitações ao Setor Pessoal', perfis: ['admin'], chave: 'solicitacoes-pessoal' },
      // NOVO: painel parecido com a planilha Excel já usada hoje pra
      // preencher a folha de pagamento, com exportação no formato que
      // o programa de folha da empresa já sabe importar.
      { to: '/folha-pagamento', icon: FileSpreadsheet, label: 'Folha de Pagamento', perfis: ['admin'], chave: 'folha-pagamento' },
    ],
  },
  {
    id:    'financeiro',
    label: 'Financeiro',
    icon:  Landmark,
    itens: [
      { to: '/autorizacao-pagamento', icon: FileSignature, label: 'Autorização de Pagamento', perfis: ['admin', 'gestor'], chave: 'autorizacao-pagamento' },
      { to: '/notas-fiscais',    icon: Receipt,          label: 'Notas Fiscais', perfis: ['admin', 'gestor'], chave: 'notas-fiscais' },
      { to: '/lotes-enviados',   icon: FileSignature,    label: 'Lotes Enviados', perfis: ['admin'], chave: 'lotes-enviados' },
      { to: '/fornecedores',     icon: Truck,            label: 'Fornecedores', perfis: ['admin'], chave: 'fornecedores' },
      { to: '/contas-a-pagar',   icon: CircleDollarSign, label: 'Contas a Pagar', perfis: ['admin'], chave: 'contas-a-pagar' },
      { to: '/contas-a-receber', icon: HandCoins,        label: 'Contas a Receber', perfis: ['admin'], chave: 'contas-a-receber' },
      { to: '/lancamentos',      icon: ArrowLeftRight,   label: 'Lançamentos', perfis: ['admin'], chave: 'lancamentos' },
      { to: '/contas',           icon: Wallet,           label: 'Contas', perfis: ['admin'], chave: 'contas' },
      { to: '/relatorios',       icon: BarChart2,        label: 'Relatórios Financeiros', perfis: ['admin'], chave: 'relatorios-financeiros' },
    ],
  },
  {
    id:    'almoxarifado',
    label: 'Almoxarifado',
    icon:  Boxes,
    itens: [
      { to: '/almoxarifado/painel-inicial', icon: LayoutDashboard, label: 'Painel Inicial', perfis: ['admin', 'almoxarife', 'gestor'], chave: 'almoxarifado-painel' },
      { to: '/almoxarifado/entradas', icon: PackagePlus,  label: 'Entradas', perfis: ['admin', 'almoxarife'], chave: 'almoxarifado-entradas' },
      { to: '/almoxarifado/saidas',   icon: PackageMinus, label: 'Saídas', perfis: ['admin', 'almoxarife'], chave: 'almoxarifado-saidas' },
      { to: '/almoxarifado/estoque',  icon: PackageSearch, label: 'Estoque', perfis: ['admin', 'almoxarife', 'gestor'], chave: 'almoxarifado-estoque' },
      // NOVO: ainda não existem — ficam visíveis, mas desabilitadas,
      // até serem construídas de verdade. Perfis por enquanto iguais
      // ao resto do Almoxarifado — ajustar quando ganharem função.
      { to: '/almoxarifado/pedidos',    icon: ClipboardList, label: 'Pedidos',    perfis: ['admin', 'almoxarife'], emBreve: true },
      { to: '/almoxarifado/orcamentos', icon: Calculator,    label: 'Orçamentos', perfis: ['admin', 'almoxarife'], emBreve: true },
    ],
  },
  // NOVO: grupo novo, logo abaixo de Almoxarifado — por enquanto só
  // tem o Diário de Obra, ainda por construir.
  // ALTERADO: grupo "Obra" ganhou o primeiro item de verdade —
  // Estrutura da Obra (EAP), onde o ADM monta as Fases/Itens/
  // Sub-itens do processo construtivo. Diário de Obra continua "em
  // breve" (é o próximo passo, depende da EAP já existir).
  {
    id:    'obra',
    label: 'Obra',
    icon:  Building,
    itens: [
      { to: '/obra/estrutura', icon: FolderTree, label: 'Estrutura da Obra (EAP)', perfis: ['gestor'], chave: 'obra-estrutura' },
      { to: '/obra/diario', icon: NotebookPen, label: 'Diário de Obra', perfis: ['gestor'], chave: 'obra-diario' },
      { to: '/obra/painel', icon: TrendingUp, label: 'Painel de Acompanhamento', perfis: ['admin', 'gestor'], chave: 'obra-painel' },
    ],
  },
]

// ALTERADO: "Configurações" saiu daqui e foi pro menu do usuário
// (clicar no nome/avatar no rodapé), junto de Suporte/Trocar de
// obra/Sair — como o menu do usuário no Claude.ai, por exemplo.
// "Backup" saiu de vez daqui também — agora vive dentro da própria
// tela de Configurações, como mais uma categoria.

export default function Sidebar() {
  const usuario  = useAuthStore(s => s.usuario)
  const logout   = useAuthStore(s => s.logout)
  const navigate = useNavigate()
  // NOVO: menu suspenso do usuário — abre pra cima (o gatilho fica no
  // rodapé), agrupando Configurações/Suporte/Trocar de obra/Sair, que
  // antes ficavam espalhados soltos na barra.
  const [menuUsuarioAberto, setMenuUsuarioAberto] = useState(false)
  const obrasDisponiveis = useAuthStore(s => s.obrasDisponiveis)
  const trocarObra = useAuthStore(s => s.trocarObra)
  const empresa  = useEmpresaStore(s => s.empresa)
  const { pathname } = useLocation()
  const { confirm, dialogProps } = useConfirm()

  // NOVO: barra lateral recolhível — fica só com os ícones, liberando
  // espaço horizontal pras telas com tabela larga (ex: Autorização de
  // Pagamento). Lembra a preferência entre sessões.
  const sidebarOpen   = useUIStore(s => s.sidebarOpen)
  const toggleSidebar = useUIStore(s => s.toggleSidebar)
  const setSidebar     = useUIStore(s => s.setSidebar)
  // NOVO: quando a barra está recolhida (preferência salva), passar o
  // mouse por cima expande ela temporariamente — tirar o mouse recolhe
  // de novo. Não mexe na preferência salva (sidebarOpen continua
  // recolhida) — é só uma expansão visual passageira. Se a preferência
  // já é "aberta", isso não faz nada (já está expandida mesmo).
  const [expandidaPorHover, setExpandidaPorHover] = useState(false)
  const colapsada = !sidebarOpen && !expandidaPorHover

  useEffect(() => {
    const salvo = localStorage.getItem('sidebar-aberta')
    if (salvo !== null) setSidebar(salvo === 'true')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function alternarSidebar() {
    toggleSidebar()
    localStorage.setItem('sidebar-aberta', String(!sidebarOpen))
  }

  // NOVO: antes saía direto ao clicar — agora pede confirmação, pra
  // não sair da conta sem querer com um clique errado.
  async function handleSair() {
    const ok = await confirm({
      title:   'Sair do sistema',
      message: 'Deseja realmente sair? Você vai precisar fazer login de novo pra continuar usando o programa.',
      danger:  true,
    })
    if (ok) logout()
  }

  const perfil  = usuario?.perfil
  const extras  = usuario?.permissoes_extras ?? []
  const negadas = usuario?.permissoes_negadas ?? []

  // NOVO: selo de notificação do item Faturas — conta quantas estão
  // em aberto, e destaca com cor diferente se alguma já venceu ou
  // vence hoje (mais urgente que só "disponível").
  const [faturasAbertas, setFaturasAbertas] = useState<{ vencimento: string }[]>([])
  useEffect(() => {
    if (perfil !== 'admin' || !empresa?.id) { setFaturasAbertas([]); return }
    window.api.faturas.listar(empresa.id)
      .then((lista: { status: string; vencimento: string }[]) => {
        setFaturasAbertas(lista.filter(f => f.status === 'aberta'))
      })
      .catch(() => setFaturasAbertas([]))
  }, [perfil, empresa?.id])

  const hojeISO = new Date().toISOString().slice(0, 10)
  const faturasVencidas  = faturasAbertas.filter(f => f.vencimento.slice(0, 10) < hojeISO)
  const faturasVenceHoje = faturasAbertas.filter(f => f.vencimento.slice(0, 10) === hojeISO)
  const corSeloFaturas: 'red' | 'amber' | 'blue' | null =
    faturasVencidas.length > 0 ? 'red' : faturasVenceHoje.length > 0 ? 'amber' : faturasAbertas.length > 0 ? 'blue' : null

  // ALTERADO: um item negado (Acessos extras, desmarcado mesmo sendo
  // do perfil por padrão) some do menu — sem isso, o link continuava
  // aparecendo mas levava pra um redirecionamento ao clicar.
  function podeVer(item: MenuItem): boolean {
    if (!!item.chave && negadas.includes(item.chave)) return false
    if (!item.perfis) return true
    if (!!perfil && item.perfis.includes(perfil)) return true
    return !!item.chave && extras.includes(item.chave)
  }

  // Grupos abertos por padrão; o grupo com a página atual sempre abre.
  const [abertos, setAbertos] = useState<Set<string>>(new Set(GRUPOS.map(g => g.id)))

  useEffect(() => {
    const grupoAtual = GRUPOS.find(g => g.itens.some(i => pathname.startsWith(i.to)))
    if (grupoAtual && !abertos.has(grupoAtual.id)) {
      setAbertos(prev => new Set(prev).add(grupoAtual.id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  function alternar(id: string) {
    setAbertos(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function renderItem(item: MenuItem) {
    if (!podeVer(item)) return null
    const Icon = item.icon

    if (item.emBreve) {
      return (
        <div
          key={item.to}
          title="Em breve"
          className="flex items-center gap-3 px-3 py-2 rounded-lg
                     text-sm text-gray-600 cursor-not-allowed opacity-60"
        >
          <Icon size={15} />
          {item.label}
          <span className="ml-auto text-[10px] bg-surface-hover text-gray-500 px-1.5 py-0.5 rounded-full">
            Em breve
          </span>
        </div>
      )
    }

    return (
      <NavLink
        key={item.to}
        to={item.to}
        className={({ isActive }) => clsx(
          'flex items-center gap-3 px-3 py-2 rounded-lg',
          'text-sm font-medium transition-colors',
          isActive
            ? 'bg-brand-600 text-white shadow-glow-sm'
            : 'text-gray-300 hover:bg-surface-hover hover:text-white'
        )}
      >
        <Icon size={15} />
        {item.label}
      </NavLink>
    )
  }

  function renderItemTopo(item: MenuItem, selo?: { texto: string; cor: 'red' | 'amber' | 'blue' } | null) {
    if (!podeVer(item)) return null
    const Icon = item.icon
    const coresSelo = {
      red:   'bg-red-500 text-white',
      amber: 'bg-amber-500 text-white',
      blue:  'bg-brand-500 text-white',
    }
    return (
      <NavLink
        key={item.to}
        to={item.to}
        title={colapsada ? item.label : undefined}
        className={({ isActive }) => clsx(
          'flex items-center gap-3 px-3 py-2.5 rounded-xl relative',
          'text-sm font-semibold transition-colors',
          colapsada && 'justify-center px-0',
          isActive
            ? 'bg-brand-600 text-white shadow-glow-sm'
            : 'text-white hover:bg-surface-hover'
        )}
      >
        <Icon size={16} className="shrink-0" />
        {!colapsada && item.label}
        {!colapsada && selo && (
          <span className={clsx('ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full', coresSelo[selo.cor])}>
            {selo.texto}
          </span>
        )}
        {colapsada && selo && (
          <span className={clsx('absolute top-1 right-1 w-2 h-2 rounded-full', coresSelo[selo.cor].split(' ')[0])} />
        )}
      </NavLink>
    )
  }

  function renderGrupo(grupo: MenuGroup) {
    const itensVisiveis = grupo.itens.filter(podeVer)
    if (itensVisiveis.length === 0) return null

    const Icon    = grupo.icon
    const aberto  = abertos.has(grupo.id)
    const temAtiva = grupo.itens.some(i => pathname.startsWith(i.to))

    // NOVO: recolhida, um grupo não tem como mostrar os subitens
    // (não cabe) — clicar no ícone reabre a barra inteira já com esse
    // grupo expandido, em vez de tentar caber uma lista ali.
    if (colapsada) {
      return (
        <button
          key={grupo.id}
          title={grupo.label}
          onClick={() => { alternarSidebar(); if (!aberto) alternar(grupo.id) }}
          className={clsx(
            'w-full flex items-center justify-center py-2.5 rounded-xl',
            temAtiva ? 'text-white bg-surface-hover' : 'text-gray-300 hover:bg-surface-hover hover:text-white'
          )}
        >
          <Icon size={16} />
        </button>
      )
    }

    return (
      <div key={grupo.id}>
        <button
          onClick={() => alternar(grupo.id)}
          className={clsx(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl',
            'text-sm font-semibold transition-colors',
            temAtiva ? 'text-white' : 'text-gray-300 hover:bg-surface-hover hover:text-white'
          )}
        >
          <Icon size={16} />
          <span className="flex-1 text-left">{grupo.label}</span>
          <ChevronDown
            size={14}
            className={clsx('transition-transform', aberto && 'rotate-180')}
          />
        </button>
        {aberto && (
          <div className="ml-4 mt-0.5 pl-3 border-l border-surface-border space-y-0.5">
            {itensVisiveis.map(renderItem)}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside
      onMouseEnter={() => !sidebarOpen && setExpandidaPorHover(true)}
      onMouseLeave={() => setExpandidaPorHover(false)}
      className={clsx(
        'shrink-0 h-screen flex flex-col relative',
        'bg-surface border-r border-surface-border',
        'py-4 transition-all duration-200',
        colapsada ? 'w-[68px] px-2' : 'w-60 px-3'
      )}
    >

      {/* Botão de recolher/expandir — fica preso na borda direita da
          barra, meio caminho da altura, do jeito que a maioria dos
          programas com esse recurso já deixa. */}
      <button
        onClick={alternarSidebar}
        title={colapsada ? 'Expandir menu' : 'Recolher menu'}
        className="absolute -right-3 top-16 z-10 w-6 h-6 rounded-full
                   bg-surface border border-surface-border
                   flex items-center justify-center
                   text-gray-400 hover:text-white hover:bg-surface-hover
                   transition-colors"
      >
        {colapsada ? <ChevronsRight size={12} /> : <ChevronsLeft size={12} />}
      </button>

      {/* Logo + empresa */}
      <div className={clsx('flex items-center gap-2.5 mb-6', colapsada ? 'px-0 justify-center' : 'px-2')}>
        <div className="w-8 h-8 rounded-lg bg-brand-500
                        flex items-center justify-center shrink-0">
          <Building2 size={15} className="text-white" />
        </div>
        {!colapsada && (
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-100 truncate leading-tight">
              ADM OBRA
            </p>
            <p className="text-[11px] text-gray-500 truncate leading-tight">
              {empresa?.nome ?? '—'}
            </p>
          </div>
        )}
      </div>

      {/* Menu principal */}
      <nav className="flex-1 space-y-1 overflow-y-auto">
        {renderItemTopo(ITEM_INICIO)}
        {renderItemTopo(ITEM_SUPERVISOR_INICIO)}
        {renderItemTopo(ITEM_SUPERVISOR_RELATORIOS)}
        {renderItemTopo(ITEM_SUPERVISOR_CONFIG)}
        {renderItemTopo(ITEM_CENTRAL)}
        {renderItemTopo(ITEM_MASTER)}
        {renderItemTopo(ITEM_SETOR_PESSOAL)}

        <div className="my-2 border-t border-surface-border" />

        {GRUPOS.map(renderGrupo)}
      </nav>

      {/* NOVO: Faturas fica fora da área que rola (nav acima) e antes
          do rodapé — ancorada, sempre visível, com selo de
          notificação (vermelho = vencida, amarelo = vence hoje, azul
          = só em aberto). */}
      <div className="mt-1">
        {renderItemTopo(
          ITEM_FATURAS,
          corSeloFaturas ? { texto: String(faturasAbertas.length), cor: corSeloFaturas } : null
        )}
      </div>

      {/* Usuário logado — clicar abre o menu suspenso (Configurações,
          Suporte, Trocar de obra, Sair), que fica aberto por cima do
          rodapé — mesmo padrão do menu de usuário do Claude.ai. */}
      <div className="relative mt-4 pt-4 border-t border-surface-border">
        {menuUsuarioAberto && (
          <>
            {/* Fundo invisível — clicar fora fecha o menu */}
            <div className="fixed inset-0 z-40" onClick={() => setMenuUsuarioAberto(false)} />

            <div className="absolute z-50 bottom-full left-2 right-2 mb-2
                             bg-surface-card border border-surface-border rounded-xl
                             shadow-2xl overflow-hidden py-1.5">
              <p className="px-3 py-2 text-xs text-gray-500 truncate">{usuario?.email}</p>
              <div className="border-t border-surface-border" />

              {(perfil === 'admin' || perfil === 'gestor' || perfil === 'master') && (
                <button
                  onClick={() => { setMenuUsuarioAberto(false); navigate('/configuracoes') }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-200 hover:bg-surface-hover transition-colors"
                >
                  <Settings size={14} className="shrink-0" /> Configurações
                </button>
              )}

              {/* NOVO: Suporte ainda não existe de verdade — fica
                  visível já no lugar certo, marcado "em breve", até a
                  gente construir o que vai ter ali. */}
              <button
                disabled
                className="w-full flex items-center justify-between gap-2.5 px-3 py-2 text-sm text-gray-600 cursor-not-allowed"
              >
                <span className="flex items-center gap-2.5"><HelpCircle size={14} className="shrink-0" /> Suporte</span>
                <span className="text-[10px] text-gray-600">em breve</span>
              </button>

              {obrasDisponiveis.length > 1 && (
                <button
                  onClick={() => { setMenuUsuarioAberto(false); trocarObra() }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-200 hover:bg-surface-hover transition-colors"
                >
                  <RefreshCw size={14} className="shrink-0" /> Trocar de obra
                </button>
              )}

              <div className="border-t border-surface-border" />

              <button
                onClick={() => { setMenuUsuarioAberto(false); handleSair() }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut size={14} className="shrink-0" /> Sair
              </button>
            </div>
          </>
        )}

        <button
          onClick={() => setMenuUsuarioAberto(v => !v)}
          className={clsx(
            'w-full flex items-center gap-2.5 py-1.5 rounded-lg hover:bg-surface-hover transition-colors',
            colapsada ? 'justify-center px-0' : 'px-2'
          )}
        >
          <div className="w-7 h-7 rounded-full bg-brand-500/10
                          flex items-center justify-center shrink-0
                          text-xs font-bold text-brand-400 uppercase">
            {usuario?.nome?.slice(0, 2) ?? '??'}
          </div>
          {!colapsada && (
            <div className="min-w-0 flex-1 text-left">
              <p className="text-xs font-medium text-gray-200 truncate">
                {usuario?.nome}
              </p>
              <p className="text-[11px] text-gray-500 truncate">
                {PERFIL_LABEL[perfil ?? 'gestor']}
              </p>
            </div>
          )}
        </button>
      </div>

      <ConfirmDialog {...dialogProps} />
    </aside>
  )
}
