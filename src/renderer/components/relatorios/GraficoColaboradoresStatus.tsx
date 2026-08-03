import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

export interface ItemColaboradores { nome: string; total: number; cor: string }
interface Props { itens: ItemColaboradores[]; total: number }

export default function GraficoColaboradoresStatus({ itens, total }: Props) {
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-[130px] h-[130px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={itens} cx="50%" cy="50%" innerRadius={40} outerRadius={62} paddingAngle={2} dataKey="total" nameKey="nome" stroke="none">
              {itens.map(d => <Cell key={d.nome} fill={d.cor} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-xl font-mono font-bold text-white leading-none">{total}</p>
          <p className="text-[9px] text-gray-500 uppercase tracking-wide mt-0.5">Total</p>
        </div>
      </div>
      <div className="space-y-1.5 flex-1 min-w-0 max-h-[130px] overflow-y-auto">
        {itens.length === 0 ? (
          <p className="text-xs text-gray-500">Nenhum colaborador.</p>
        ) : itens.map(d => (
          <div key={d.nome} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.cor }} />
            <span className="text-gray-400 flex-1 truncate" title={d.nome}>{d.nome}</span>
            <span className="text-gray-200 font-semibold shrink-0">{d.total}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
