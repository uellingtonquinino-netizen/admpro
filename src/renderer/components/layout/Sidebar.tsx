import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuthStore }    from '@store/auth.store'
import { useEmpresaStore } from '@store/empresa.store'
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
  UsersRound,
  Landmark,
  PackageSearch,
  PackagePlus,
  PackageMinus,
  Boxes,
  DatabaseBackup,
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
    ],
  },
]

// ALTERADO: "Usuários" e "Configurações" (as telas antigas, presas a
// uma única obra) saíram do menu — ficaram redundantes depois que o
// Painel Administrador passou a cobrir as duas coisas (cadastro de
// usuário por obra, e edição completa dos dados da obra), já do
// jeito certo pra quem administra várias obras ao mesmo tempo.
const MENU_BOTTOM: MenuItem[] = [
  { to: '/configuracoes', icon: Settings, label: 'Configurações', perfis: ['admin', 'gestor'] },
  { to: '/backup', icon: DatabaseBackup, label: 'Backup', perfis: ['admin', 'master'], chave: 'backup' },
]

export default function Sidebar() {
  const usuario  = useAuthStore(s => s.usuario)
  const logout   = useAuthStore(s => s.logout)
  const obrasDisponiveis = useAuthStore(s => s.obrasDisponiveis)
  const trocarObra = useAuthStore(s => s.trocarObra)
  const empresa  = useEmpresaStore(s => s.empresa)
  const { pathname } = useLocation()
  const { confirm, dialogProps } = useConfirm()

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

  function renderItemTopo(item: MenuItem) {
    if (!podeVer(item)) return null
    const Icon = item.icon
    return (
      <NavLink
        key={item.to}
        to={item.to}
        className={({ isActive }) => clsx(
          'flex items-center gap-3 px-3 py-2.5 rounded-xl',
          'text-sm font-semibold transition-colors',
          isActive
            ? 'bg-brand-600 text-white shadow-glow-sm'
            : 'text-white hover:bg-surface-hover'
        )}
      >
        <Icon size={16} />
        {item.label}
      </NavLink>
    )
  }

  function renderGrupo(grupo: MenuGroup) {
    const itensVisiveis = grupo.itens.filter(podeVer)
    if (itensVisiveis.length === 0) return null

    const Icon    = grupo.icon
    const aberto  = abertos.has(grupo.id)
    const temAtiva = grupo.itens.some(i => pathname.startsWith(i.to))

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
    <aside className="w-60 shrink-0 h-screen flex flex-col
                      bg-surface border-r border-surface-border
                      px-3 py-4">

      {/* Logo + empresa */}
      <div className="flex items-center gap-2.5 px-2 mb-6">
        <div className="w-8 h-8 rounded-lg bg-brand-500
                        flex items-center justify-center shrink-0">
          <Building2 size={15} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-100 truncate leading-tight">
            ADM PRO
          </p>
          <p className="text-[11px] text-gray-500 truncate leading-tight">
            {empresa?.nome ?? '—'}
          </p>
        </div>
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

        <div className="my-2 border-t border-surface-border" />

        {MENU_BOTTOM.map(renderItemTopo)}
      </nav>

      {/* Usuário logado + logout */}
      <div className="mt-4 pt-4 border-t border-surface-border">
        <div className="flex items-center gap-2.5 px-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-brand-500/10
                          flex items-center justify-center shrink-0
                          text-xs font-bold text-brand-400 uppercase">
            {usuario?.nome?.slice(0, 2) ?? '??'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-gray-200 truncate">
              {usuario?.nome}
            </p>
            <p className="text-[11px] text-gray-500 truncate">
              {PERFIL_LABEL[perfil ?? 'gestor']}
            </p>
          </div>
          <button
            onClick={handleSair}
            title="Sair"
            className="p-1.5 rounded-lg text-gray-500
                       hover:text-red-400 hover:bg-red-500/10
                       transition-colors"
          >
            <LogOut size={13} />
          </button>
        </div>

        {/* NOVO: só aparece pra quem administra mais de uma obra */}
        {obrasDisponiveis.length > 1 && (
          <button
            onClick={trocarObra}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg
                       text-xs text-gray-400 hover:text-brand-400 hover:bg-surface-hover
                       transition-colors"
          >
            <RefreshCw size={12} /> Trocar de obra
          </button>
        )}
      </div>

      <ConfirmDialog {...dialogProps} />
    </aside>
  )
}
