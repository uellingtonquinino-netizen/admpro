import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore }           from '@store/auth.store'
import { useFiltrosPeriodoStore } from '@store/filtrosPeriodo.store'
import { useBuscaStore }          from '@store/busca.store'
import { bateComBusca }           from '../utils/busca'
import { nomeEstado }             from '../utils/estados'
import FiltroPeriodo from '@components/ui/FiltroPeriodo'
import Select from '@components/ui/Select'
import GraficoAdmissoesDesligamentos from '@components/relatorios/GraficoAdmissoesDesligamentos'
import GraficoDespesasMensais        from '@components/relatorios/GraficoDespesasMensais'
import GraficoColaboradoresStatus, { ItemColaboradores } from '@components/relatorios/GraficoColaboradoresStatus'
import {
  UsersRound, ArrowLeftRight, Wallet, MapPin, ChevronRight,
  UserCheck, UserX, CalendarClock, ShieldCheck, LayoutDashboard,
} from 'lucide-react'

interface Obra { id: number; nome: string; titulo_obra: string | null; estado: string | null }
interface DadosPainel {
  obras:              Obra[]
  totalColaboradores: number
  idadeMedia:         number | null
  admissoes:          number
  desligamentos:      number
  totalAutorizacoes:  number
  totalNotasFiscais:  number
}
interface Graficos {
  admissoesDesligamentos: { mes: string; admissoes: number; desligamentos: number }[]
  despesasMensais:        { mes: string; total: number }[]
  colaboradores:          { ativos: number; ferias: number; afastados: number; desligados: number; total: number }
}

function formatMoeda(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// NOVO: filtro de verdade no 3º gráfico — Status usa rótulo, cor e
// ordem fixos (igual sempre foi); Setor/Função são dimensões livres
// (o nome vem do próprio cadastro), por isso usam uma paleta genérica
// ciclada pela ordem que o backend já manda (mais colaboradores primeiro).
const STATUS_ORDEM = ['ativo', 'ferias', 'afastado', 'desligado']
const STATUS_LABEL: Record<string, string> = { ativo: 'Ativos', ferias: 'Férias', afastado: 'Afastados', desligado: 'Desligados' }
const STATUS_COR: Record<string, string> = { ativo: '#22c55e', ferias: '#3b82f6', afastado: '#eab308', desligado: '#ef4444' }
const PALETA_GENERICA = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#f472b6', '#84cc16', '#06b6d4', '#eab308']

const OPCOES_DIMENSAO = [
  { value: 'status', label: 'Status' },
  { value: 'setor',  label: 'Setor' },
  { value: 'funcao', label: 'Função' },
]

const OPCOES_MESES = Array.from({ length: 12 }, (_, i) => {
  const n = i + 1
  return { value: String(n), label: n === 1 ? 'Último mês' : `Últimos ${n} meses` }
})

// NOVO: painel de resumo do Supervisor — a "home" de quem administra
// várias obras ao mesmo tempo. A 1ª caixa é sempre o retrato de agora
// (não passa pelo filtro De/Até); as outras duas seguem o período
// escolhido. Os gráficos logo abaixo somam TODAS as obras da gestão
// dele juntas, e ficam sempre visíveis (não dependem de clicar em
// nada). A lista "Obras por estado" é só navegação — clicar num
// estado leva pra página com a grade de obras daquele estado.
export default function PainelSupervisorInicio() {
  const usuario = useAuthStore(s => s.usuario)
  const navigate = useNavigate()
  const location = useLocation()

  const periodoSalvo    = useFiltrosPeriodoStore(s => s.supervisorInicio)
  const setPeriodoSalvo = useFiltrosPeriodoStore(s => s.setFiltroSupervisorInicio)
  const [dataInicio, setDataInicio] = useState(periodoSalvo.dataInicio)
  const [dataFim, setDataFim]       = useState(periodoSalvo.dataFim)

  const [dados, setDados] = useState<DadosPainel | null>(null)
  const [loading, setLoading] = useState(true)

  // NOVO: busca do topo filtra a lista de estados (por UF ou pelo
  // nome de alguma obra dentro dele) — mesmo padrão do resto do
  // sistema pra esse perfil.
  const buscaQuery    = useBuscaStore(s => s.query)
  const setBuscaQuery = useBuscaStore(s => s.setQuery)
  useEffect(() => {
    setBuscaQuery('')
    return () => setBuscaQuery('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  // Gráficos — ALTERADO: agora somam todas as obras da gestão dele,
  // sempre visíveis (não dependem mais de clicar num estado). Busca
  // 12 meses de uma vez e cada gráfico recorta o período que o
  // próprio seletor pedir, sem precisar refazer a chamada toda hora.
  const [graficos, setGraficos] = useState<Graficos | null>(null)
  const [loadingGraficos, setLoadingGraficos] = useState(true)
  const [mesesAdmissoes, setMesesAdmissoes] = useState('6')
  const [mesesDespesas, setMesesDespesas]   = useState('6')

  // CORRIGIDO: o filtro "Status" do 3º gráfico não fazia nada — só
  // tinha uma opção fixa e onChange vazio. Agora alterna de verdade
  // entre Status/Setor/Função, cada um contando os colaboradores de
  // um jeito — mesma base de "agora" das outras caixas, sem filtro
  // de período.
  const [dimensaoColaboradores, setDimensaoColaboradores] = useState('status')
  const [itensColaboradores, setItensColaboradores] = useState<ItemColaboradores[]>([])
  const [totalColaboradoresGrafico, setTotalColaboradoresGrafico] = useState(0)
  const [loadingColaboradores, setLoadingColaboradores] = useState(true)

  function carregarColaboradoresPorDimensao(dimensao: string) {
    const obraIds = usuario?.obras_supervisor ?? []
    setLoadingColaboradores(true)
    window.api.supervisor.colaboradoresPorDimensao({ empresa_ids: obraIds, dimensao })
      .then((resultado: { itens: { chave: string; total: number }[]; total: number }) => {
        let itens: ItemColaboradores[]
        if (dimensao === 'status') {
          // Ordem e cor fixas, sempre as mesmas — mesmo que uma obra
          // não tenha ninguém em algum status, a fatia aparece zerada.
          const mapa = new Map(resultado.itens.map(i => [i.chave, i.total]))
          itens = STATUS_ORDEM.map(chave => ({
            nome: STATUS_LABEL[chave], total: mapa.get(chave) ?? 0, cor: STATUS_COR[chave],
          }))
        } else {
          itens = resultado.itens.map((i, idx) => ({
            nome: i.chave, total: i.total, cor: PALETA_GENERICA[idx % PALETA_GENERICA.length],
          }))
        }
        setItensColaboradores(itens)
        setTotalColaboradoresGrafico(resultado.total)
      })
      .finally(() => setLoadingColaboradores(false))
  }

  function carregar(inicio = dataInicio, fim = dataFim) {
    const obraIds = usuario?.obras_supervisor ?? []
    setLoading(true)
    window.api.supervisor.painelInicio({ empresa_ids: obraIds, dataInicio: inicio, dataFim: fim })
      .then(setDados)
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    carregar()
    const obraIds = usuario?.obras_supervisor ?? []
    setLoadingGraficos(true)
    window.api.supervisor.graficosObras({ empresa_ids: obraIds, meses: 12 })
      .then(setGraficos)
      .finally(() => setLoadingGraficos(false))
    carregarColaboradoresPorDimensao('status')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Turnover: fórmula padrão de RH — média de admissões e
  // desligamentos do período, sobre o total de colaboradores ativos
  // agora (a mesma base da 1ª caixa).
  const turnover = useMemo(() => {
    if (!dados || dados.totalColaboradores === 0) return 0
    return Math.round(((dados.admissoes + dados.desligamentos) / 2 / dados.totalColaboradores) * 100)
  }, [dados])

  // Agrupamento por estado, ordem alfabética — só os estados onde
  // ele tem obra. Uma obra nova nesse estado já soma sozinha, porque
  // isso vem direto da lista de obras retornada pelo backend.
  const porEstado = useMemo(() => {
    if (!dados) return []
    const mapa = new Map<string, Obra[]>()
    for (const o of dados.obras) {
      const uf = (o.estado || 'SEM ESTADO').toUpperCase()
      if (!mapa.has(uf)) mapa.set(uf, [])
      mapa.get(uf)!.push(o)
    }
    return Array.from(mapa.entries())
      .map(([estado, obras]) => ({ estado, obras, total: obras.length }))
      .sort((a, b) => a.estado.localeCompare(b.estado, 'pt-BR'))
  }, [dados])

  const porEstadoFiltrado = useMemo(
    () => porEstado.filter(e => bateComBusca(buscaQuery, [e.estado, ...e.obras.map(o => o.nome)])),
    [porEstado, buscaQuery],
  )

  const maxPorEstado = Math.max(1, ...porEstado.map(e => e.total))

  const admissoesRecorte = graficos ? graficos.admissoesDesligamentos.slice(-Number(mesesAdmissoes)) : []
  const despesasRecorte  = graficos ? graficos.despesasMensais.slice(-Number(mesesDespesas)) : []
  const totalAdmissoesRecorte     = admissoesRecorte.reduce((s, d) => s + d.admissoes, 0)
  const totalDesligamentosRecorte = admissoesRecorte.reduce((s, d) => s + d.desligamentos, 0)
  const totalDespesasRecorte = despesasRecorte.reduce((s, d) => s + d.total, 0)
  const taxaAtividade = graficos && graficos.colaboradores.total > 0
    ? (graficos.colaboradores.ativos / graficos.colaboradores.total * 100).toFixed(1)
    : '0,0'

  return (
    <div className="max-w-6xl mx-auto">
      {/* Cabeçalho + filtro de período */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Painel de Resumo</h1>
          <p className="text-sm text-gray-500 mt-0.5">Visão geral das obras sob sua gestão</p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Período</span>
          <FiltroPeriodo
            dataInicio={dataInicio}
            dataFim={dataFim}
            onBuscar={(inicio, fim) => {
              setDataInicio(inicio); setDataFim(fim)
              setPeriodoSalvo({ dataInicio: inicio, dataFim: fim })
              carregar(inicio, fim)
            }}
          />
        </div>
      </div>

      {loading || !dados ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[1, 2, 3].map(i => <div key={i} className="h-40 shimmer rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">

          {/* Caixa 1 — Sua Gestão (sempre agora, sem filtro) — VERDE */}
          <div className="relative bg-surface border border-surface-border rounded-2xl p-5 overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                <UsersRound size={15} className="text-emerald-400" />
              </div>
              <p className="text-xs font-bold text-gray-300 uppercase tracking-wide">Sua Gestão</p>
            </div>
            <div className="flex items-end justify-between">
              <div className="space-y-1">
                <p className="text-sm text-gray-300">
                  <span className="font-semibold text-white">{dados.obras.length}</span> obra{dados.obras.length !== 1 && 's'}
                </p>
                <p className="text-sm text-gray-300">
                  <span className="font-semibold text-white">{dados.totalColaboradores.toLocaleString('pt-BR')}</span> colaboradores
                </p>
              </div>
              <div className="text-right">
                <p className="text-4xl font-mono font-bold text-white leading-none">{dados.idadeMedia ?? '—'}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-1">Idade média</p>
              </div>
            </div>
          </div>

          {/* Caixa 2 — Turnover (segue o período) — AZUL */}
          <div className="relative bg-surface border border-surface-border rounded-2xl p-5 overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-brand-500" />
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center">
                <ArrowLeftRight size={15} className="text-brand-400" />
              </div>
              <p className="text-xs font-bold text-gray-300 uppercase tracking-wide">Turnover</p>
            </div>
            <div className="flex items-end justify-between">
              <div className="space-y-1">
                <p className="text-sm text-gray-300">
                  <span className="font-semibold text-white">{dados.admissoes.toLocaleString('pt-BR')}</span> admissões
                </p>
                <p className="text-sm text-gray-300">
                  <span className="font-semibold text-white">{dados.desligamentos.toLocaleString('pt-BR')}</span> desligamentos
                </p>
              </div>
              <div className="text-right">
                <p className="text-4xl font-mono font-bold text-brand-400 leading-none">{turnover}%</p>
              </div>
            </div>
          </div>

          {/* Caixa 3 — Despesa Compras Acumulada (segue o período) — ÂMBAR */}
          <div className="relative bg-surface border border-surface-border rounded-2xl p-5 overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-amber-500" />
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                <Wallet size={15} className="text-amber-400" />
              </div>
              <p className="text-xs font-bold text-gray-300 uppercase tracking-wide">Despesa Compras Acumulada</p>
            </div>
            <div className="space-y-1 mb-2">
              <p className="text-xs text-gray-400">Autorizações: <span className="text-gray-200 font-medium">{formatMoeda(dados.totalAutorizacoes)}</span></p>
              <p className="text-xs text-gray-400">Notas Fiscais: <span className="text-gray-200 font-medium">{formatMoeda(dados.totalNotasFiscais)}</span></p>
            </div>
            <p className="text-2xl font-mono font-bold text-amber-400 leading-none">
              {formatMoeda(dados.totalAutorizacoes + dados.totalNotasFiscais)}
            </p>
          </div>
        </div>
      )}

      {/* ALTERADO: gráficos agora são uma seção própria, separada da
          lista de obras — somam TODAS as obras da gestão dele juntas,
          e ficam sempre visíveis (não dependem de clicar em nada). */}
      <div className="mb-8">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Visão Geral — Todas as Obras</p>
        {loadingGraficos || !graficos ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-64 shimmer rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Admissões e Desligamentos */}
            <div className="bg-surface border border-surface-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <UserCheck size={13} className="text-emerald-400" />
                  <p className="text-[11px] font-bold text-gray-300 uppercase tracking-wide">Admissões e Desligamentos</p>
                </div>
                <Select value={mesesAdmissoes} onChange={e => setMesesAdmissoes(e.target.value)}
                  options={OPCOES_MESES} className="text-[11px] !py-1 !w-auto" />
              </div>
              <div className="flex items-center gap-3 mb-1">
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Admissões
                </span>
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <span className="w-2 h-2 rounded-full bg-red-500" /> Desligamentos
                </span>
              </div>
              <GraficoAdmissoesDesligamentos data={admissoesRecorte} />
              <div className="flex gap-2 mt-2">
                <div className="flex-1 bg-surface-hover rounded-lg px-3 py-2">
                  <p className="text-[10px] text-gray-500 flex items-center gap-1"><UserCheck size={11} /> Total Admissões</p>
                  <p className="text-lg font-mono font-bold text-white">{totalAdmissoesRecorte}</p>
                </div>
                <div className="flex-1 bg-surface-hover rounded-lg px-3 py-2">
                  <p className="text-[10px] text-gray-500 flex items-center gap-1"><UserX size={11} /> Total Desligamentos</p>
                  <p className="text-lg font-mono font-bold text-white">{totalDesligamentosRecorte}</p>
                </div>
              </div>
            </div>

            {/* Despesas Mensais */}
            <div className="bg-surface border border-surface-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Wallet size={13} className="text-emerald-400" />
                  <p className="text-[11px] font-bold text-gray-300 uppercase tracking-wide">Despesas Mensais</p>
                </div>
                <Select value={mesesDespesas} onChange={e => setMesesDespesas(e.target.value)}
                  options={OPCOES_MESES} className="text-[11px] !py-1 !w-auto" />
              </div>
              <GraficoDespesasMensais data={despesasRecorte} />
              <div className="bg-surface-hover rounded-lg px-3 py-2 mt-2">
                <p className="text-[10px] text-gray-500 flex items-center gap-1"><CalendarClock size={11} /> Total no Período</p>
                <p className="text-lg font-mono font-bold text-white">{formatMoeda(totalDespesasRecorte)}</p>
              </div>
            </div>

            {/* Colaboradores */}
            <div className="bg-surface border border-surface-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <UsersRound size={13} className="text-emerald-400" />
                  <p className="text-[11px] font-bold text-gray-300 uppercase tracking-wide">Colaboradores</p>
                </div>
                <Select value={dimensaoColaboradores} onChange={e => {
                  setDimensaoColaboradores(e.target.value)
                  carregarColaboradoresPorDimensao(e.target.value)
                }} options={OPCOES_DIMENSAO} className="text-[11px] !py-1 !w-auto" />
              </div>
              {loadingColaboradores ? (
                <div className="h-[130px] shimmer rounded-lg" />
              ) : (
                <GraficoColaboradoresStatus itens={itensColaboradores} total={totalColaboradoresGrafico} />
              )}
              <div className="bg-surface-hover rounded-lg px-3 py-2 mt-3">
                <p className="text-[10px] text-gray-500 flex items-center gap-1"><ShieldCheck size={11} /> Taxa de Atividade</p>
                <p className="text-lg font-mono font-bold text-white">{taxaAtividade}%</p>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Obras por estado — ALTERADO: agora é só navegação, clicar
          leva pra página com a grade de obras daquele estado. */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Obras por estado</p>
        {loading ? null : porEstado.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma obra sob sua gestão ainda.</p>
        ) : porEstadoFiltrado.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum resultado para "{buscaQuery}".</p>
        ) : (
          <div className="space-y-2.5">
            {porEstadoFiltrado.map(grupo => (
              <button
                key={grupo.estado}
                onClick={() => navigate(`/supervisor/estado/${encodeURIComponent(grupo.estado)}`)}
                className="w-full relative bg-surface border border-surface-border rounded-2xl px-5 py-4
                           flex items-center gap-4 hover:border-brand-500/50 hover:bg-surface-hover
                           transition-colors overflow-hidden text-left"
              >
                <div
                  className="absolute inset-y-0 left-0 bg-brand-500/10"
                  style={{ width: `${(grupo.total / maxPorEstado) * 100}%` }}
                />
                <div className="relative w-9 h-9 rounded-lg bg-brand-500/15 flex items-center justify-center shrink-0">
                  <MapPin size={16} className="text-brand-400" />
                </div>
                <p className="relative flex-1 text-sm font-bold text-white uppercase tracking-wide">
                  {nomeEstado(grupo.estado)}
                </p>
                <p className="relative text-sm text-gray-300">
                  <span className="font-semibold text-white">{String(grupo.total).padStart(2, '0')}</span> obra{grupo.total !== 1 && 's'}
                </p>
                <ChevronRight size={16} className="relative text-gray-600 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {!loading && dados && dados.obras.length === 0 && (
        <div className="text-center py-10">
          <LayoutDashboard size={28} className="text-gray-700 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Você ainda não tem nenhuma obra sob sua gestão.</p>
        </div>
      )}
    </div>
  )
}
