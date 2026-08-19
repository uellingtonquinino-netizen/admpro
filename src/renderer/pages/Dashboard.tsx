import { useEffect, useState }     from 'react'
import { useEmpresaStore }          from '@store/empresa.store'
import { toast }                    from '@components/ui/ToastContainer'
import Card                         from '@components/ui/Card'
import UltimosLancamentos           from '@components/dashboard/UltimosLancamentos'
import ResumoRH                     from '@components/dashboard/ResumoRH'
import {
  Wallet,
  RefreshCw,
  Calendar,
} from 'lucide-react'
import Button from '@components/ui/Button'
import { calcularResumoFolha } from '@utils/folhaPagamentoCalculo'

// ALTERADO: os cards de resumo financeiro (Receitas/Despesas/Saldo/A
// receber), o gráfico de fluxo de caixa e o saldo por conta saíram
// do Início — fica só o resumo de RH e os Últimos Lançamentos.

interface DashboardData {
  lancamentos:  {
    id:          number
    descricao:   string
    valor:       number
    tipo:        'receita' | 'despesa'
    status:      string
    data:        string
    categoria:   string
  }[]
}

interface ResumoRHData {
  totalAtivos:      number
  custoFolha:       number
  mediaIdade:       number | null
  porFuncao:        { funcao: string; quantidade: number; custo_salarial: number }[]
  porStatus:        { status: string; quantidade: number }[]
  aniversariantes:  { nome: string; funcao: string | null; nascimento: string }[]
}

// ── Helpers ───────────────────────────────────────────────
const MES_ATUAL  = new Date().getMonth() + 1
const ANO_ATUAL  = new Date().getFullYear()

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

export default function Dashboard() {
  const empresaId    = useEmpresaStore(s => s.empresaId)

  const [data,      setData]      = useState<DashboardData | null>(null)
  const [rhData,    setRhData]    = useState<ResumoRHData | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [loadingRh, setLoadingRh] = useState(true)
  const [mes,       setMes]       = useState(MES_ATUAL)
  const [ano,       setAno]       = useState(ANO_ATUAL)
  // NOVO: total aproximado da Folha de Pagamento SALVA pro mês/ano
  // escolhido no filtro (null = nenhuma folha salva pra esse mês).
  const [totalFolha,        setTotalFolha]        = useState<number | null>(null)
  const [loadingTotalFolha, setLoadingTotalFolha]  = useState(true)

  // ── Buscar dados ─────────────────────────────────────────
  async function fetchDashboard() {
    if (!empresaId) return
    setLoading(true)
    try {
      const lancamentos = await window.api.lancamentos.listar({
        empresa_id: empresaId,
        mes, ano,
        page: 1, perPage: 5,
      })
      setData({ lancamentos: lancamentos.items })
    } catch {
      toast.error('Erro ao carregar dashboard.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDashboard() }, [empresaId, mes, ano])

  // ── Buscar dados de RH ────────────────────────────────────
  // CORRIGIDO: não mandava o mês nenhum pro backend — os
  // aniversariantes sempre vinham do mês REAL de hoje, ignorando
  // qualquer mês escolhido no filtro. Também não reagia a mudança de
  // mês/ano (useEffect só tinha empresaId nas dependências).
  async function fetchResumoRH() {
    if (!empresaId) return
    setLoadingRh(true)
    try {
      const rh = await window.api.colaboradores.resumoRH({ empresa_id: empresaId, mes })
      setRhData(rh)
    } catch {
      toast.error('Erro ao carregar resumo de RH.')
    } finally {
      setLoadingRh(false)
    }
  }

  useEffect(() => { fetchResumoRH() }, [empresaId, mes])

  // NOVO: busca a Folha de Pagamento salva pro mês/ano escolhido, e
  // calcula o total aproximado (mesma conta usada no editor da
  // Folha) — mostrado no rodapé do card "Custo de Salários".
  async function fetchTotalFolha() {
    if (!empresaId) return
    setLoadingTotalFolha(true)
    try {
      const mesCompetencia = `${ano}-${String(mes).padStart(2, '0')}`
      const folha = await window.api.folhaPagamento.buscarPorCompetencia({
        empresa_id: empresaId, mes_competencia: `${mesCompetencia}-01`,
      })
      if (!folha) { setTotalFolha(null); return }
      setTotalFolha(calcularResumoFolha(folha.itens, mesCompetencia).totalGeral)
    } catch (erro) {
      console.error('Erro ao buscar o total da folha:', erro)
      setTotalFolha(null)
    } finally {
      setLoadingTotalFolha(false)
    }
  }

  useEffect(() => { fetchTotalFolha() }, [empresaId, mes, ano])

  async function handleAtualizar() {
    await Promise.all([fetchDashboard(), fetchResumoRH(), fetchTotalFolha()])
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Início</h1>
          <span className="inline-block mt-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-500/15 text-brand-300 border border-brand-500/30">
            {MESES[mes - 1]} {ano}
          </span>
        </div>
        <div className="flex items-center gap-2">
        {/* Filtro mês/ano */}
        <div className="relative">
          <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <select
            value={mes}
            onChange={e => setMes(Number(e.target.value))}
            className="input w-36 text-sm pl-8"
          >
            {MESES.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>

        <div className="relative">
          <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <select
            value={ano}
            onChange={e => setAno(Number(e.target.value))}
            className="input w-28 text-sm pl-8"
          >
            {[ANO_ATUAL - 1, ANO_ATUAL, ANO_ATUAL + 1].map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <Button
          variant="primary"
          size="sm"
          icon={<RefreshCw size={14} />}
          onClick={handleAtualizar}
          loading={loading || loadingRh}
        >
          Atualizar
        </Button>
        </div>
      </div>

      {/* Recursos Humanos */}
      <ResumoRH data={rhData} loading={loadingRh} totalFolha={totalFolha} loadingTotalFolha={loadingTotalFolha} />

      {/* Financeiro */}
      <div className="flex items-center gap-2 mb-3">
        <Wallet size={16} className="text-brand-400" />
        <h2 className="text-sm font-semibold text-gray-200">Financeiro</h2>
      </div>

      {/* Últimos lançamentos */}
      <Card padding={false}>
        <div className="px-4 py-3 border-b border-surface-border
                        flex items-center justify-between">
          <p className="text-sm font-medium text-white">
            Últimos lançamentos
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.hash = '#/lancamentos'}
          >
            Ver todos
          </Button>
        </div>
        <div className="p-4">
          {loading || !data
            ? <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 shimmer rounded-lg" />
                ))}
              </div>
            : <UltimosLancamentos lancamentos={data.lancamentos} />
          }
        </div>
      </Card>
    </div>
  )
}
