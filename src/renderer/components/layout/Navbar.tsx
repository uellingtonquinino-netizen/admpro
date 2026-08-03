import { useState, useRef, useEffect } from 'react'
import { useNavigate }                  from 'react-router-dom'
import { useEmpresaStore }              from '@store/empresa.store'
import { useAuthStore }                 from '@store/auth.store'
import { useBuscaStore }                from '@store/busca.store'
import { useDebounce }                  from '@hooks/useDebounce'
import { clsx }                         from 'clsx'
import {
  Bell, Search, HardHat, Truck, Clock, CalendarHeart, FileText, FileCheck, Receipt,
  PackagePlus, PackageMinus, PackageX, AlertTriangle, Boxes,
} from 'lucide-react'

// Ícone e cor por tipo de notificação — fica fácil acrescentar mais
// categorias depois, só adicionando uma entrada aqui.
const NOTIF_TEMA = {
  experiencia:    { icone: Clock,         cor: 'text-amber-400' },
  aniversario:    { icone: CalendarHeart, cor: 'text-purple-400' },
  ap_nova:        { icone: FileText,      cor: 'text-blue-400' },
  ap_aprovada:    { icone: FileCheck,     cor: 'text-emerald-400' },
  nf_nova:        { icone: Receipt,       cor: 'text-blue-400' },
  nf_aprovada:    { icone: FileCheck,     cor: 'text-emerald-400' },
  lote_novo:      { icone: FileText,      cor: 'text-blue-400' },
  lote_aprovado:  { icone: FileCheck,     cor: 'text-emerald-400' },
  almox_entrada:  { icone: PackagePlus,   cor: 'text-emerald-400' },
  almox_saida:    { icone: PackageMinus,  cor: 'text-blue-400' },
  estoque_minimo: { icone: AlertTriangle, cor: 'text-amber-400' },
  estoque_zerado: { icone: PackageX,      cor: 'text-red-400' },
} as const

interface ResultadoColaborador { tipo: 'colaborador'; id: number; nome: string; sub: string }
interface ResultadoFornecedor  { tipo: 'fornecedor';  id: number; nome: string; sub: string }
interface ResultadoProduto     { tipo: 'produto';     id: number; nome: string; sub: string }
type Resultado = ResultadoColaborador | ResultadoFornecedor | ResultadoProduto

interface Notificacao {
  tipo: 'experiencia' | 'aniversario' | 'ap_nova' | 'ap_aprovada' | 'nf_nova' | 'nf_aprovada' | 'lote_novo' | 'lote_aprovado' | 'almox_entrada' | 'almox_saida' | 'estoque_minimo' | 'estoque_zerado'
  id:   number
  nome: string
  sub:  string
  referenciaId?: number | null
}

export default function Navbar() {
  const navigate      = useNavigate()
  const empresa       = useEmpresaStore(s => s.empresa)
  const empresaId     = useEmpresaStore(s => s.empresaId)
  const usuario       = useAuthStore(s => s.usuario)
  const perfil        = usuario?.perfil

  const [aberto, setAberto]         = useState(false)
  const [query, setQuery]           = useState('')
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [buscando, setBuscando]     = useState(false)
  const caixaRef = useRef<HTMLDivElement>(null)

  // CORRIGIDO: o Administrador (master), o Supervisor, o Escritório
  // Central e o Setor Pessoal não têm colaborador/fornecedor pra
  // buscar (nem obra fixa pra buscar dentro dela) — a busca do topo
  // pra esses quatro perfis filtra a própria lista que está na tela
  // do painel de cada um, via store compartilhado, em vez de chamar
  // a busca de colaborador/fornecedor. O Setor Pessoal ficou de fora
  // dessa lista até agora — a busca dele nunca filtrava a própria
  // página, porque caía direto na busca de colaborador/fornecedor
  // (que nem funciona pra ele, já que não tem uma obra fixa).
  const perfilBuscaPropria    = perfil === 'master' || perfil === 'supervisor' || perfil === 'central' || perfil === 'setor_pessoal'
  // CORRIGIDO: a busca do topo pesquisava colaborador/fornecedor pra
  // TODOS os perfis, mas Gestor e Almoxarife não têm acesso às
  // páginas de Colaboradores/Fornecedores — o resultado clicado não
  // levava a lugar nenhum. Almoxarife passa a buscar material/
  // ferramenta (o que ele realmente usa); Gestor não tem nada
  // equivalente pra buscar aqui, então a busca fica desativada pra
  // ele (as próprias telas de AP/Notas Fiscais já filtram por dentro).
  const perfilBuscaProdutos   = perfil === 'almoxarife'
  const perfilSemBusca        = perfil === 'gestor'
  const buscaGlobalQuery      = useBuscaStore(s => s.query)
  const setBuscaGlobalQuery   = useBuscaStore(s => s.setQuery)

  const [notifAberto, setNotifAberto]         = useState(false)
  const [notifVistas, setNotifVistas]         = useState(false)
  const [notificacoes, setNotificacoes]       = useState<Notificacao[]>([])
  const [carregandoNotif, setCarregandoNotif] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  const queryDebounced = useDebounce(query, 300)

  // Busca real — o que depende do perfil de quem está logado.
  useEffect(() => {
    if (perfilBuscaPropria || perfilSemBusca) { setResultados([]); return }
    if (!empresaId || !queryDebounced.trim()) { setResultados([]); return }
    setBuscando(true)
    if (perfilBuscaProdutos) {
      window.api.produtos.listar({ empresa_id: empresaId, busca: queryDebounced }).then((produtos: any[]) => {
        const itens: Resultado[] = produtos.slice(0, 8).map((p: any) => ({
          tipo: 'produto', id: p.id, nome: p.nome, sub: p.codigo,
        }))
        setResultados(itens)
      }).finally(() => setBuscando(false))
      return
    }
    Promise.all([
      window.api.colaboradores.listar({ empresa_id: empresaId, busca: queryDebounced, page: 1, perPage: 5 }),
      window.api.fornecedores.listar({ empresa_id: empresaId, busca: queryDebounced }),
    ]).then(([colabs, forns]) => {
      const itensColab: Resultado[] = (colabs.items ?? colabs).slice(0, 5).map((c: any) => ({
        tipo: 'colaborador', id: c.id, nome: c.nome, sub: c.funcao || c.cpf || '—',
      }))
      const itensForn: Resultado[] = forns.slice(0, 5).map((f: any) => ({
        tipo: 'fornecedor', id: f.id, nome: f.nome, sub: f.cnpj || f.cpf || '—',
      }))
      setResultados([...itensColab, ...itensForn])
    }).finally(() => setBuscando(false))
  }, [queryDebounced, empresaId, perfilBuscaPropria, perfilBuscaProdutos, perfilSemBusca])

  // ALTERADO: sistema de notificações reorganizado — aniversariante do
  // dia e experiência vencendo (só ADM, é quem cuida do RH), estoque
  // mínimo/zerado (ADM e Almoxarife), e os eventos pontuais (AP nova
  // pro Gestor, AP autorizada/entrada/saída pro ADM) vindos do banco.
  async function carregarNotificacoes() {
    if (!empresaId || !perfil) return
    setCarregandoNotif(true)
    try {
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      const mesAtual = hoje.getMonth() + 1
      const diaAtual  = hoje.getDate()

      const itens: Notificacao[] = []

      // Eventos pontuais — o backend já filtra pelo perfil de quem
      // está logado (AP nova só chega pro Gestor, etc.). Pro
      // Supervisor, busca em TODAS as obras que ele acompanha — a
      // notificação fica registrada na obra que enviou o lote, não
      // na obra "dele" (ele não tem uma obra própria de verdade).
      const eventos = perfil === 'supervisor'
        ? await window.api.notificacoes.eventos({ empresa_ids: usuario?.obras_supervisor ?? [], perfil })
        : await window.api.notificacoes.eventos({ empresa_id: empresaId, perfil })
      itens.push(...eventos.map((e: any) => ({
        tipo: e.tipo as Notificacao['tipo'], id: e.id, nome: e.titulo, sub: e.mensagem ?? '',
        referenciaId: e.referencia_id ?? null,
      })))

      // RH (aniversariante do dia, experiência vencendo) — ADM e Gestor.
      if (perfil === 'admin' || perfil === 'gestor') {
        const [experiencias, aniversariantesMesAtual] = await Promise.all([
          window.api.relatoriosRH.vencimentoExperiencia({ empresa_id: empresaId, dias: 5 }),
          window.api.relatoriosRH.aniversariantes({ empresa_id: empresaId, mes: mesAtual }),
        ])

        itens.push(...experiencias
          .filter((c: any) => c.dias_restantes >= 0)
          .map((c: any) => ({
            tipo: 'experiencia' as const, id: c.id, nome: c.nome,
            sub: c.dias_restantes === 0 ? 'Experiência vence hoje' : `Experiência vence em ${c.dias_restantes}d`,
          })))

        itens.push(...aniversariantesMesAtual
          .filter((a: any) => Number(a.nascimento.slice(8, 10)) === diaAtual)
          .map((a: any) => ({
            tipo: 'aniversario' as const, id: a.id, nome: a.nome,
            sub: 'Aniversário é hoje!',
          })))
      }

      // Estoque mínimo/zerado — ADM, Almoxarife e Gestor.
      if (perfil === 'admin' || perfil === 'almoxarife' || perfil === 'gestor') {
        const [minimos, zerados] = await Promise.all([
          window.api.notificacoes.estoqueMinimo(empresaId),
          window.api.notificacoes.estoqueZerado(empresaId),
        ])

        itens.push(...minimos.map((p: any) => ({
          tipo: 'estoque_minimo' as const, id: p.id, nome: p.nome,
          sub: `Estoque baixo: ${p.estoque_atual}${p.unidade ? ` ${p.unidade}` : ''}`,
        })))
        itens.push(...zerados.map((p: any) => ({
          tipo: 'estoque_zerado' as const, id: p.id, nome: p.nome,
          sub: 'Estoque zerado',
        })))
      }

      setNotificacoes(itens)
    } finally {
      setCarregandoNotif(false)
    }
  }

  useEffect(() => { carregarNotificacoes() }, [empresaId, perfil])

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false)
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [])

  function irPara(item: Resultado) {
    setAberto(false)
    setQuery('')
    if (item.tipo === 'colaborador') {
      navigate('/colaboradores', { state: { editColaboradorId: item.id } })
    } else if (item.tipo === 'fornecedor') {
      navigate('/fornecedores', { state: { editFornecedorId: item.id } })
    } else {
      navigate('/almoxarifado/painel-inicial', { state: { editProdutoId: item.id } })
    }
  }

  function abrirNotificacao(n: Notificacao) {
    setNotifAberto(false)
    if (n.tipo === 'experiencia' || n.tipo === 'aniversario') {
      navigate('/colaboradores', { state: { editColaboradorId: n.id } })
    } else if (n.tipo === 'ap_nova') {
      navigate('/autorizacao-pagamento')
    } else if (n.tipo === 'nf_nova') {
      navigate('/notas-fiscais')
    } else if (n.tipo === 'ap_aprovada' || n.tipo === 'nf_aprovada' || n.tipo === 'lote_aprovado') {
      // CORRIGIDO: essas notificações também chegam pro Supervisor e
      // pro Central (quando um aprova algo que o outro precisa saber),
      // mas eles não têm acesso à lista de AP/Nota Fiscal — só ao
      // próprio painel. Levar pra lá, direto no lote quando der.
      if (perfil === 'supervisor') {
        navigate('/supervisor', { state: { loteId: n.referenciaId } })
      } else if (perfil === 'central') {
        navigate('/central', { state: { loteId: n.referenciaId } })
      } else if (n.tipo === 'ap_aprovada') {
        navigate('/autorizacao-pagamento')
      } else {
        navigate('/notas-fiscais')
      }
    } else if (n.tipo === 'lote_novo') {
      navigate('/supervisor', { state: { loteId: n.referenciaId } })
    } else if (n.tipo === 'almox_entrada') {
      navigate('/almoxarifado/entradas')
    } else if (n.tipo === 'almox_saida') {
      navigate('/almoxarifado/saidas')
    } else {
      navigate('/almoxarifado/estoque')
    }
  }

  return (
    <header className="h-14 shrink-0 flex items-center
                       px-6 gap-4
                       bg-surface border-b border-surface-border">

      {/* Espaço reservado — cada página já mostra seu próprio título,
          maior, logo abaixo; o pequeno título aqui em cima era
          redundante e foi removido. */}
      <div className="flex-1" />

      {/* Busca — ALTERADO: Gestor não tem colaborador/fornecedor/
          material pra buscar aqui (as próprias telas dele já
          filtram por dentro), então a caixa nem aparece pra ele. */}
      {!perfilSemBusca && (
      <div className="relative" ref={caixaRef}>
        <div className="flex items-center gap-2 px-3 py-1.5
                        rounded-lg bg-surface-hover border border-surface-border
                        text-xs text-gray-300 focus-within:border-brand-500">
          <Search size={13} className="text-gray-500 shrink-0" />
          <input
            value={perfilBuscaPropria ? buscaGlobalQuery : query}
            onChange={e => {
              if (perfilBuscaPropria) { setBuscaGlobalQuery(e.target.value); return }
              setQuery(e.target.value); setAberto(true)
            }}
            onFocus={() => { if (!perfilBuscaPropria) setAberto(true) }}
            placeholder={perfilBuscaPropria ? 'Buscar nesta página…' : 'Buscar…'}
            className="bg-transparent outline-none w-48 placeholder:text-gray-500"
          />
        </div>

        {!perfilBuscaPropria && aberto && query.trim() && (
          <div className="absolute right-0 mt-1 w-80 bg-surface border border-surface-border
                          rounded-lg shadow-xl max-h-80 overflow-y-auto z-50">
            {buscando ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-9 shimmer rounded-lg" />)}
              </div>
            ) : resultados.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-6">Nenhum resultado encontrado.</p>
            ) : (
              resultados.map(item => (
                <button
                  key={`${item.tipo}-${item.id}`}
                  onClick={() => irPara(item)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left
                             hover:bg-surface-hover transition-colors"
                >
                  {item.tipo === 'colaborador'
                    ? <HardHat size={14} className="text-brand-400 shrink-0" />
                    : item.tipo === 'fornecedor'
                    ? <Truck size={14} className="text-brand-400 shrink-0" />
                    : <Boxes size={14} className="text-brand-400 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-200 truncate">{item.nome}</p>
                    <p className="text-xs text-gray-500 truncate">{item.sub}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      )}

      {/* Notificações */}
      <div className="relative" ref={notifRef}>
        <button
          onClick={() => {
            setNotifAberto(v => !v)
            setNotifVistas(true)
            if (perfil === 'supervisor') {
              window.api.notificacoes.marcarEventosComoLidos({ empresa_ids: usuario?.obras_supervisor ?? [], perfil })
            } else if (empresaId && perfil) {
              window.api.notificacoes.marcarEventosComoLidos({ empresa_id: empresaId, perfil })
            }
          }}
          className="relative p-2 rounded-lg text-gray-500
                     hover:bg-surface-hover hover:text-gray-300
                     transition-colors"
        >
          <Bell size={15} />
          {/* CORRIGIDO: o número some assim que o usuário abre o sino
              uma vez, em vez de continuar aparecendo pra sempre. */}
          {!notifVistas && notificacoes.length > 0 && (
            <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-0.5 rounded-full
                             bg-red-500 text-[9px] font-bold text-white
                             flex items-center justify-center">
              {notificacoes.length > 9 ? '9+' : notificacoes.length}
            </span>
          )}
        </button>

        {notifAberto && (
          <div className="absolute right-0 mt-1 w-80 bg-surface border border-surface-border
                          rounded-lg shadow-xl max-h-96 overflow-y-auto z-50">
            <div className="px-3 py-2 border-b border-surface-border">
              <p className="text-sm font-medium text-white">Notificações</p>
            </div>
            {carregandoNotif ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-9 shimmer rounded-lg" />)}
              </div>
            ) : notificacoes.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-6">Nenhuma notificação no momento.</p>
            ) : (
              notificacoes.map((n, i) => {
                const tema = NOTIF_TEMA[n.tipo]
                const Icone = tema.icone
                return (
                  <button
                    key={`${n.tipo}-${n.id}-${i}`}
                    onClick={() => abrirNotificacao(n)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left
                               hover:bg-surface-hover transition-colors"
                  >
                    <Icone size={14} className={clsx(tema.cor, 'shrink-0')} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-200 truncate">{n.nome}</p>
                      <p className={clsx('text-xs truncate', tema.cor)}>{n.sub}</p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Nome da empresa */}
      <span className="text-xs text-gray-500 hidden md:block">
        {empresa?.nome}
      </span>
    </header>
  )
}
