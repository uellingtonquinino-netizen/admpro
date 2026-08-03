import { useCurrency } from '@hooks/useCurrency'
import Badge           from '@components/ui/Badge'
import { clsx }        from 'clsx'
import { format }      from 'date-fns'
import { ptBR }        from 'date-fns/locale'

interface Lancamento {
  id:        number
  descricao: string
  valor:     number
  tipo:      'receita' | 'despesa'
  status:    string
  situacao?: string
  data:      string
  categoria: string
}

interface Props {
  lancamentos: Lancamento[]
}

// ALTERADO: "situacao" já vem calculada do banco (a_vencer / vencido /
// pago / cancelado) — antes mostrava sempre "Pago" pra qualquer coisa
// lançada, mesmo sem ter sido paga de verdade.
const statusColor: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = {
  pago:      'green',
  recebido:  'green',
  a_vencer:  'yellow',
  vencido:   'red',
  cancelado: 'gray',
}

const statusLabel: Record<string, string> = {
  pago:      'Pago',
  recebido:  'Recebido',
  a_vencer:  'A vencer',
  vencido:   'Vencido',
  cancelado: 'Cancelado',
}

export default function UltimosLancamentos({ lancamentos }: Props) {
  const { format: fmtCurrency } = useCurrency()

  if (!lancamentos.length) {
    return (
      <p className="text-sm text-gray-500 text-center py-8">
        Nenhum lançamento encontrado.
      </p>
    )
  }

  return (
    <div className="space-y-1">
      {lancamentos.map(l => (
        <div
          key={l.id}
          className="flex items-center gap-4 px-3 py-2.5 rounded-lg
                     hover:bg-surface-hover transition-colors"
        >
          {/* Indicador tipo */}
          <div className={clsx(
            'w-1.5 h-8 rounded-full shrink-0',
            l.tipo === 'receita' ? 'bg-emerald-500' : 'bg-red-500'
          )} />

          {/* Descrição + categoria */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-200 truncate">{l.descricao}</p>
            <p className="text-xs text-gray-500">{l.categoria}</p>
          </div>

          {/* Data */}
          <p className="text-xs text-gray-500 shrink-0">
            {format(new Date(l.data), 'dd MMM', { locale: ptBR })}
          </p>

          {/* Status */}
          <Badge color={statusColor[l.situacao ?? l.status] ?? 'gray'}>
            {statusLabel[l.situacao ?? l.status] ?? l.situacao ?? l.status}
          </Badge>

          {/* Valor */}
          <p className={clsx(
            'text-sm font-medium shrink-0 w-28 text-right',
            l.tipo === 'receita' ? 'text-emerald-400' : 'text-red-400'
          )}>
            {l.tipo === 'despesa' ? '− ' : '+ '}
            {fmtCurrency(l.valor)}
          </p>
        </div>
      ))}
    </div>
  )
}
