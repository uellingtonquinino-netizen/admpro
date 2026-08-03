import { useEffect, useState, useCallback } from 'react'
import { useEmpresaStore }                   from '@store/empresa.store'
import { useCurrency }                       from '@hooks/useCurrency'
import PageHeader                            from '@components/layout/PageHeader'
import Card                                  from '@components/ui/Card'
import { SkeletonCard }                      from '@components/ui/Skeleton'
import GraficoBarras                         from '@components/relatorios/GraficoBarras'
import GraficoLinha                          from '@components/relatorios/GraficoLinha'
import GraficoPizza                          from '@components/relatorios/GraficoPizza'
import SeletorPeriodo                        from '@components/relatorios/SeletorPeriodo'
import { clsx }                              from 'clsx'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
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
    </div>
  )
}
