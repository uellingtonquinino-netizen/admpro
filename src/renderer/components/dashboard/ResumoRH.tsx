import { useCurrency } from '@hooks/useCurrency'
import Card             from '@components/ui/Card'
import { clsx }         from 'clsx'
import { formatReais }  from '@utils/folhaPagamentoCalculo'
import {
  Users, Wallet, CalendarHeart, UserRound,
} from 'lucide-react'

interface PorFuncao {
  funcao:         string
  quantidade:     number
  custo_salarial: number
}

interface PorStatus {
  status:     string
  quantidade: number
}

interface Aniversariante {
  nome:       string
  funcao:     string | null
  nascimento: string
}

interface ResumoRHData {
  totalAtivos:      number
  custoFolha:       number
  mediaIdade:       number | null
  porFuncao:        PorFuncao[]
  porStatus:        PorStatus[]
  aniversariantes:  Aniversariante[]
}

interface Props {
  data:    ResumoRHData | null
  loading: boolean
  // NOVO: total aproximado da Folha de Pagamento salva pro mês/ano
  // do filtro (null = nenhuma folha salva pra esse mês).
  totalFolha:        number | null
  loadingTotalFolha: boolean
}

const statusLabel: Record<string, string> = {
  ativo: 'Ativos', afastado: 'Afastados', ferias: 'Em férias', desligado: 'Desligados',
}

// Cada card tem seu próprio tema (fundo, borda e ícone combinando) —
// replicando o painel de referência em vez do card neutro padrão.
const TEMAS = {
  blue:   { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   iconBg: 'bg-blue-500',   text: 'text-white' },
  green:  { bg: 'bg-emerald-500/10',border: 'border-emerald-500/30',iconBg: 'bg-emerald-500',text: 'text-emerald-400' },
  amber:  { bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  iconBg: 'bg-amber-500',  text: 'text-amber-400' },
  purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', iconBg: 'bg-purple-500', text: 'text-white' },
}

export default function ResumoRH({ data, loading, totalFolha, loadingTotalFolha }: Props) {
  const { format } = useCurrency()

  const afastados  = data?.porStatus.find(s => s.status === 'afastado')?.quantidade ?? 0
  const emFerias    = data?.porStatus.find(s => s.status === 'ferias')?.quantidade ?? 0

  const maiorQuantidade = Math.max(1, ...(data?.porFuncao.map(f => f.quantidade) ?? [1]))

  const cards = data ? [
    {
      label: 'Colaboradores ativos', value: String(data.totalAtivos),
      icon: Users, tema: TEMAS.blue,
      sub: afastados || emFerias ? `${afastados} afastado(s) · ${emFerias} em férias` : 'Nenhum afastamento',
    },
    {
      label: 'Custo de Salários', value: format(data.custoFolha),
      icon: Wallet, tema: TEMAS.green,
      // ALTERADO: antes repetia o mesmo valor de cima (`format(data.custoFolha)`)
      // — agora mostra o total aproximado da Folha de Pagamento SALVA
      // pro mês/ano escolhido no filtro (soma de salário + adicionais
      // − descontos de cada colaborador, com DSR sobre hora extra).
      sub: loadingTotalFolha
        ? 'Calculando...'
        : totalFolha !== null
        ? `Total Aproximado da Folha ${formatReais(totalFolha)}`
        : 'Nenhuma folha salva pra esse mês',
    },
    {
      label: 'Média de idade', value: data.mediaIdade ? `${data.mediaIdade} anos` : '—',
      icon: UserRound, tema: TEMAS.amber,
      sub: 'Colaboradores ativos',
    },
    {
      label: 'Aniversariantes do mês', value: String(data.aniversariantes.length),
      icon: CalendarHeart, tema: TEMAS.purple,
      sub: data.aniversariantes.length ? data.aniversariantes[0].nome.split(' ')[0] + (data.aniversariantes.length > 1 ? ` +${data.aniversariantes.length - 1}` : '') : 'Nenhum este mês',
    },
  ] : []

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Users size={16} className="text-brand-400" />
        <h2 className="text-sm font-semibold text-gray-200">Recursos Humanos</h2>
      </div>

      {/* Cards RH */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        {loading || !data
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 shimmer rounded-xl" />
            ))
          : cards.map(card => {
              const Icon = card.icon
              return (
                <div
                  key={card.label}
                  className={clsx(
                    'rounded-xl border p-4',
                    card.tema.bg, card.tema.border
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', card.tema.iconBg)}>
                      <Icon size={18} className="text-white" />
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-white mb-1">{card.label}</p>
                  <p className={clsx('text-2xl font-bold', card.tema.text)}>{card.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{card.sub}</p>
                </div>
              )
            })
        }
      </div>

      {/* Por função + Aniversariantes */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <Card padding={false}>
            <div className="px-4 py-3 border-b border-surface-border flex items-center gap-2">
              <Users size={15} className="text-brand-400" />
              <p className="text-sm font-medium text-white">Colaboradores por função</p>
            </div>
            <div className="p-4 max-h-[520px] overflow-y-auto">
              {loading || !data ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 shimmer rounded-lg" />)}
                </div>
              ) : data.porFuncao.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">Nenhum colaborador ativo cadastrado.</p>
              ) : (
                <div className="space-y-4">
                  {data.porFuncao.map(f => {
                    const percentual = data.totalAtivos > 0 ? (f.quantidade / data.totalAtivos) * 100 : 0
                    return (
                      <div key={f.funcao}>
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-sm font-semibold text-white">{f.funcao}</p>
                          <p className="text-sm text-gray-300">
                            {f.quantidade} ({percentual.toFixed(0)}%) &nbsp;|&nbsp; <span className="text-brand-400">{format(f.custo_salarial)}</span>
                          </p>
                        </div>
                        <div className="h-2 rounded-full bg-surface-hover overflow-hidden">
                          <div
                            className="h-full rounded-full bg-brand-500"
                            style={{ width: `${(f.quantidade / maiorQuantidade) * 100}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </Card>
        </div>

        <div>
          <Card padding={false}>
            <div className="px-4 py-3 border-b border-surface-border flex items-center gap-2">
              <CalendarHeart size={15} className="text-purple-400" />
              <p className="text-sm font-medium text-white">Aniversariantes do mês</p>
            </div>
            <div className="p-4">
              {loading || !data ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 shimmer rounded-lg" />)}
                </div>
              ) : data.aniversariantes.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">Nenhum aniversariante este mês.</p>
              ) : (
                <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
                  {data.aniversariantes.map(a => {
                    const dia = Number(a.nascimento.slice(8, 10))
                    return (
                      <div key={a.nome} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-hover transition-colors">
                        <div className="w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-sm font-bold text-purple-300 shrink-0">
                          {dia}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white truncate">{a.nome}</p>
                          {a.funcao && <p className="text-xs text-gray-500 truncate">{a.funcao}</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
