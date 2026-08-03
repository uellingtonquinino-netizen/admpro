import { useCurrency } from '@hooks/useCurrency'
import { Wallet, CreditCard, PiggyBank, Building2 } from 'lucide-react'
import { clsx } from 'clsx'

interface Conta {
  id:    number
  nome:  string
  saldo: number
  tipo:  string
}

interface Props {
  contas: Conta[]
}

const tipoIcon: Record<string, React.ReactNode> = {
  corrente:   <Wallet    size={16} />,
  poupanca:   <PiggyBank size={16} />,
  cartao:     <CreditCard size={16} />,
  investimento: <Building2 size={16} />,
}

export default function SaldoContas({ contas }: Props) {
  const { format } = useCurrency()

  const saldoTotal = contas.reduce((acc, c) => acc + c.saldo, 0)

  if (!contas.length) {
    return (
      <p className="text-sm text-gray-500 text-center py-8">
        Nenhuma conta cadastrada.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {contas.map(conta => (
        <div
          key={conta.id}
          className="flex items-center gap-3 p-2.5 rounded-lg
                     hover:bg-surface-hover transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center
                          justify-center text-brand-400 shrink-0">
            {tipoIcon[conta.tipo] ?? <Wallet size={16} />}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-200 truncate">{conta.nome}</p>
            <p className="text-xs text-gray-500 capitalize">{conta.tipo}</p>
          </div>

          <p className={clsx(
            'text-sm font-medium shrink-0',
            conta.saldo >= 0 ? 'text-emerald-400' : 'text-red-400'
          )}>
            {format(conta.saldo)}
          </p>
        </div>
      ))}

      {/* Total */}
      <div className="border-t border-surface-border mt-3 pt-3
                      flex items-center justify-between px-2">
        <p className="text-xs text-gray-400 font-medium">Saldo total</p>
        <p className={clsx(
          'text-sm font-semibold',
          saldoTotal >= 0 ? 'text-emerald-400' : 'text-red-400'
        )}>
          {format(saldoTotal)}
        </p>
      </div>
    </div>
  )
}
