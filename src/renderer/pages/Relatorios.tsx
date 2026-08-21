import { useEffect, useState, useCallback } from 'react'
import { useEmpresaStore }                   from '@store/empresa.store'
import { useCurrency }                       from '@hooks/useCurrency'
import { toast }                             from '@components/ui/ToastContainer'
import PageHeader                            from '@components/layout/PageHeader'
import Card                                  from '@components/ui/Card'
import Button                                from '@components/ui/Button'
import { SkeletonCard }                      from '@components/ui/Skeleton'
import GraficoBarras                         from '@components/relatorios/GraficoBarras'
import GraficoLinha                          from '@components/relatorios/GraficoLinha'
import GraficoPizza                          from '@components/relatorios/GraficoPizza'
import SeletorPeriodo                        from '@components/relatorios/SeletorPeriodo'
import {
  gerarRelatorioDespesasPorData, gerarRelatorioPorFornecedor,
  gerarRelatorioPorColaborador, gerarRelatorioConsolidado,
} from '../documentos/relatoriosFinanceiros'
import { formatDate }                        from '@utils/format'
import { clsx }                              from 'clsx'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
  Calendar,
  Building2,
  Users,
  Layers,
  Printer,
} from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────
interface ResumoMes {
  mes:      string   // 'YYYY-MM'
  receitas: number
  despesas: number
  saldo:    number
}

interface TopCategoria {
  nome:  string
  cor:   string
  total: number
}

interface Periodo {
  inicio: string  // 'YYYY-MM-DD'
  fim:    string
}

// ── Utilitário de período ─────────────────────────────────
function periodoAtual(): Periodo {
  const now   = new Date()
  const ano   = now.getFullYear()
  const mes   = String(now.getMonth() + 1).padStart(2, '0')
  return {
    inicio: `${ano}-01-01`,
    fim:    `${ano}-${mes}-${new Date(ano, now.getMonth() + 1, 0)
              .getDate().toString().padStart(2, '0')}`,
  }
}

export default function Relatorios() {
  const empresaId  = useEmpresaStore(s => s.empresaId)
  const { format } = useCurrency()

  const [periodo,    setPeriodo]    = useState<Periodo>(periodoAtual())
  const [resumo,     setResumo]     = useState<ResumoMes[]>([])
  const [topReceita, setTopReceita] = useState<TopCategoria[]>([])
  const [topDespesa, setTopDespesa] = useState<TopCategoria[]>([])
  const [loading,    setLoading]    = useState(true)

  // ── NOVO: Relatórios Financeiros detalhados (Despesas por Data,
  // Por Fornecedor, Por Colaborador, Consolidado) — pedido do
  // usuário. Usa o mesmo período selecionado acima.
  type TipoRelatorioDetalhado = 'despesasPorData' | 'porFornecedor' | 'porColaborador' | 'consolidado'
  const [tipoDetalhado, setTipoDetalhado] = useState<TipoRelatorioDetalhado>('despesasPorData')
  const [dadosDetalhados, setDadosDetalhados] = useState<any>(null)
  const [carregandoDetalhado, setCarregandoDetalhado] = useState(false)
  const [imprimindoDetalhado, setImprimindoDetalhado] = useState(false)

  const buscarRelatorioDetalhado = useCallback(async () => {
    if (!empresaId) return
    setCarregandoDetalhado(true)
    try {
      const params = { empresa_id: empresaId, dataInicio: periodo.inicio, dataFim: periodo.fim }
      const dados = tipoDetalhado === 'despesasPorData' ? await window.api.relatorios.despesasPorData(params)
        : tipoDetalhado === 'porFornecedor' ? await window.api.relatorios.porFornecedor(params)
        : tipoDetalhado === 'porColaborador' ? await window.api.relatorios.porColaborador(params)
        : await window.api.relatorios.consolidado(params)
      setDadosDetalhados(dados)
    } catch {
      setDadosDetalhados(null)
    } finally {
      setCarregandoDetalhado(false)
    }
  }, [empresaId, periodo, tipoDetalhado])

  useEffect(() => { buscarRelatorioDetalhado() }, [buscarRelatorioDetalhado])

  async function handleImprimirDetalhado() {
    if (!empresaId || !dadosDetalhados) return
    setImprimindoDetalhado(true)
    try {
      const empresaAtual = await window.api.empresas.buscarPorId(empresaId)
      const periodoTexto = `${formatDate(periodo.inicio)} a ${formatDate(periodo.fim)}`
      const html = tipoDetalhado === 'despesasPorData' ? gerarRelatorioDespesasPorData(empresaAtual, dadosDetalhados, periodoTexto, format)
        : tipoDetalhado === 'porFornecedor' ? gerarRelatorioPorFornecedor(empresaAtual, dadosDetalhados, periodoTexto, format)
        : tipoDetalhado === 'porColaborador' ? gerarRelatorioPorColaborador(empresaAtual, dadosDetalhados, periodoTexto, format)
        : gerarRelatorioConsolidado(empresaAtual, dadosDetalhados, periodoTexto, format)
      const nomes: Record<TipoRelatorioDetalhado, string> = {
        despesasPorData: 'Despesas por Data', porFornecedor: 'Despesas por Fornecedor',
        porColaborador: 'Pagamentos a Colaboradores', consolidado: 'Relatório Consolidado',
      }
      const resultado = await window.api.documentos.imprimir({ html, nomeArquivo: nomes[tipoDetalhado], landscape: true })
      if (!resultado.ok) toast.error('Erro ao gerar o documento — confere o console do navegador (F12) pra ver o motivo.')
    } catch (erro) {
      console.error('Erro ao imprimir relatório financeiro:', erro)
      toast.error(erro instanceof Error ? erro.message : 'Erro ao gerar o documento.')
    } finally {
      setImprimindoDetalhado(false)
    }
  }

  // ── Buscar dados ──────────────────────────────────────────
  const fetchDados = useCallback(async () => {
    if (!empresaId) return
    setLoading(true)
    try {
      const [res, topR, topD] = await Promise.all([
        window.api.relatorios.evolucaoMensal({
          empresa_id: empresaId,
          inicio:     periodo.inicio,
          fim:        periodo.fim,
        }),
        window.api.relatorios.topCategorias({
          empresa_id: empresaId,
          tipo:       'receita',
          inicio:     periodo.inicio,
          fim:        periodo.fim,
          limit:      6,
        }),
        window.api.relatorios.topCategorias({
          empresa_id: empresaId,
          tipo:       'despesa',
          inicio:     periodo.inicio,
          fim:        periodo.fim,
          limit:      6,
        }),
      ])
      setResumo(res)
      setTopReceita(topR)
      setTopDespesa(topD)
    } catch {
      // silencioso — gráficos ficam vazios
    } finally {
      setLoading(false)
    }
  }, [empresaId, periodo])

  useEffect(() => { fetchDados() }, [fetchDados])

  // ── Totalizadores ─────────────────────────────────────────
  const totalReceitas = resumo.reduce((a, r) => a + r.receitas, 0)
  const totalDespesas = resumo.reduce((a, r) => a + r.despesas, 0)
  const saldoPeriodo  = totalReceitas - totalDespesas
  const maiorMes      = resumo.reduce(
    (best, r) => r.saldo > best.saldo ? r : best,
    resumo[0] ?? { mes: '-', saldo: 0 }
  )

  // ── Cards de KPI ─────────────────────────────────────────
  const kpis = [
    {
      label:  'Receitas no período',
      value:  format(totalReceitas),
      icon:   TrendingUp,
      color:  'text-emerald-400',
      bg:     'bg-emerald-500/10',
    },
    {
      label:  'Despesas no período',
      value:  format(totalDespesas),
      icon:   TrendingDown,
      color:  'text-red-400',
      bg:     'bg-red-500/10',
    },
    {
      label:  'Saldo do período',
      value:  format(saldoPeriodo),
      icon:   DollarSign,
      color:  saldoPeriodo >= 0 ? 'text-brand-400' : 'text-red-400',
      bg:     saldoPeriodo >= 0 ? 'bg-brand-500/10' : 'bg-red-500/10',
    },
    {
      label:  'Melhor mês',
      value:  maiorMes?.mes !== '-'
                ? new Date(maiorMes.mes + '-01')
                    .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
                    .toUpperCase()
                : '-',
      icon:   PieChart,
      color:  'text-yellow-400',
      bg:     'bg-yellow-500/10',
    },
  ]

  return (
    <div>
      {/* Header */}
      <PageHeader
        title="Relatórios"
        subtitle="Evolução financeira e análise por categoria"
      >
        <SeletorPeriodo value={periodo} onChange={setPeriodo} />
      </PageHeader>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : kpis.map(k => {
              const Icon = k.icon
              return (
                <Card key={k.label}>
                  <div className={clsx(
                    'w-10 h-10 rounded-lg flex items-center justify-center mb-3',
                    k.bg
                  )}>
                    <Icon size={18} className={k.color} />
                  </div>
                  <p className="text-xs text-gray-400 mb-1">{k.label}</p>
                  <p className={clsx('text-xl font-semibold', k.color)}>
                    {k.value}
                  </p>
                </Card>
              )
            })
        }
      </div>

      {/* Gráfico de barras — evolução mensal */}
      <Card className="mb-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">
          Evolução Mensal
        </h3>
        {loading
          ? <div className="h-64 animate-pulse bg-surface-hover rounded-lg" />
          : <GraficoBarras data={resumo} />
        }
      </Card>

      {/* Gráfico de linha — saldo acumulado */}
      <Card className="mb-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">
          Saldo Acumulado
        </h3>
        {loading
          ? <div className="h-64 animate-pulse bg-surface-hover rounded-lg" />
          : <GraficoLinha data={resumo} />
        }
      </Card>

      {/* Pizza — top categorias */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-sm font-semibold text-gray-300 mb-4">
            Top Categorias — Receitas
          </h3>
          {loading
            ? <div className="h-56 animate-pulse bg-surface-hover rounded-lg" />
            : <GraficoPizza data={topReceita} />
          }
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-gray-300 mb-4">
            Top Categorias — Despesas
          </h3>
          {loading
            ? <div className="h-56 animate-pulse bg-surface-hover rounded-lg" />
            : <GraficoPizza data={topDespesa} />
          }
        </Card>
      </div>

      {/* NOVO: Relatórios Financeiros detalhados — Despesas por Data,
          Por Fornecedor, Por Colaborador, Consolidado (AP + Nota
          Fiscal + Folha) — usa o mesmo período selecionado acima. */}
      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold text-gray-300">Relatórios Financeiros Detalhados</h3>
          <Button
            variant="outline" size="sm" icon={<Printer size={14} />}
            onClick={handleImprimirDetalhado} loading={imprimindoDetalhado}
            disabled={!dadosDetalhados || carregandoDetalhado}
          >
            Imprimir
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          {([
            { value: 'despesasPorData', label: 'Despesas por Data', icon: Calendar },
            { value: 'porFornecedor',   label: 'Por Fornecedor',    icon: Building2 },
            { value: 'porColaborador',  label: 'Por Colaborador',   icon: Users },
            { value: 'consolidado',     label: 'Consolidado',       icon: Layers },
          ] as const).map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.value}
                onClick={() => setTipoDetalhado(t.value)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  tipoDetalhado === t.value
                    ? 'bg-brand-500 text-white'
                    : 'bg-surface-hover text-gray-400 hover:text-gray-200'
                )}
              >
                <Icon size={13} /> {t.label}
              </button>
            )
          })}
        </div>

        {carregandoDetalhado ? (
          <div className="h-40 animate-pulse bg-surface-hover rounded-lg" />
        ) : !dadosDetalhados ? (
          <p className="text-sm text-gray-500 text-center py-10">Nenhum dado encontrado nesse período.</p>
        ) : tipoDetalhado === 'consolidado' ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-brand-500/10 border border-brand-500/30 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Autorizações de Pagamento</p>
              <p className="text-lg font-semibold text-white">{format(dadosDetalhados.totalAP)}</p>
              <p className="text-xs text-gray-500 mt-1">{dadosDetalhados.quantidadeAP} AP(s)</p>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Notas Fiscais</p>
              <p className="text-lg font-semibold text-white">{format(dadosDetalhados.totalNF)}</p>
              <p className="text-xs text-gray-500 mt-1">{dadosDetalhados.quantidadeNF} nota(s)</p>
            </div>
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Folha de Pagamento (salário + adicionais)</p>
              <p className="text-lg font-semibold text-white">{format(dadosDetalhados.totalFolha)}</p>
              <p className="text-xs text-gray-500 mt-1">{dadosDetalhados.quantidadeFolha} folha(s)</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Total Geral</p>
              <p className="text-lg font-semibold text-emerald-400">{format(dadosDetalhados.totalGeral)}</p>
            </div>
          </div>
        ) : tipoDetalhado === 'despesasPorData' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border">
                  {['Data', 'Descrição', 'Fornecedor', 'Valor'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dadosDetalhados.length === 0 ? (
                  <tr><td colSpan={4} className="text-center text-gray-500 py-8">Nenhum lançamento nesse período.</td></tr>
                ) : dadosDetalhados.map((l: any) => (
                  <tr key={l.id} className="border-b border-surface-border last:border-0">
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{formatDate(l.data)}</td>
                    <td className="px-3 py-2 text-white">{l.descricao}</td>
                    <td className="px-3 py-2 text-gray-400">{l.fornecedor_nome ?? '—'}</td>
                    <td className="px-3 py-2 text-white text-right whitespace-nowrap">{format(Number(l.valor))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : tipoDetalhado === 'porFornecedor' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border">
                  {['Fornecedor', 'CNPJ/CPF', 'Lançamentos', 'Total'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dadosDetalhados.length === 0 ? (
                  <tr><td colSpan={4} className="text-center text-gray-500 py-8">Nenhuma despesa por fornecedor nesse período.</td></tr>
                ) : dadosDetalhados.map((f: any, i: number) => (
                  <tr key={i} className="border-b border-surface-border last:border-0">
                    <td className="px-3 py-2 text-white">{f.fornecedor_nome}</td>
                    <td className="px-3 py-2 text-gray-400">{f.documento ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-400">{f.quantidade}</td>
                    <td className="px-3 py-2 text-white text-right whitespace-nowrap">{format(Number(f.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border">
                  {['Colaborador', "AP's", 'Total'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dadosDetalhados.length === 0 ? (
                  <tr><td colSpan={3} className="text-center text-gray-500 py-8">Nenhum pagamento a colaborador nesse período.</td></tr>
                ) : dadosDetalhados.map((c: any, i: number) => (
                  <tr key={i} className="border-b border-surface-border last:border-0">
                    <td className="px-3 py-2 text-white">{c.colaborador_nome}</td>
                    <td className="px-3 py-2 text-gray-400">{c.quantidade}</td>
                    <td className="px-3 py-2 text-white text-right whitespace-nowrap">{format(Number(c.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
