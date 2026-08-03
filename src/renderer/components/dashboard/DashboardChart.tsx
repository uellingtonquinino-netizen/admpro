import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { useCurrency } from '@hooks/useCurrency'

interface FluxoMensal {
  mes:      string
  receitas: number
  despesas: number
  saldo:    number
}

interface Props {
  data: FluxoMensal[]
}

const MESES_ABREV = [
  'Jan','Fev','Mar','Abr','Mai','Jun',
  'Jul','Ago','Set','Out','Nov','Dez',
]

function CustomTooltip({ active, payload, label }: any) {
  const { format } = useCurrency()
  if (!active || !payload?.length) return null

  return (
    <div className="bg-surface border border-surface-border rounded-xl
                    px-4 py-3 shadow-2xl text-xs space-y-1.5">
      <p className="text-gray-400 font-medium mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: p.color }}
          />
          <span className="text-gray-400 capitalize">{p.name}:</span>
          <span className="text-white font-medium">{format(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function DashboardChart({ data }: Props) {
  const formatted = data.map(d => ({
    ...d,
    mes: MESES_ABREV[Number(d.mes) - 1] ?? d.mes,
  }))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart
        data={formatted}
        margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="gradReceitas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0}   />
          </linearGradient>
          <linearGradient id="gradDespesas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}   />
          </linearGradient>
          <linearGradient id="gradSaldo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}   />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#ffffff08"
          vertical={false}
        />

        <XAxis
          dataKey="mes"
          tick={{ fill: '#6b7280', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />

        <YAxis
          tick={{ fill: '#6b7280', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v =>
            Math.abs(v) >= 1000
              ? `${(v / 1000).toFixed(0)}K`
              : String(v)
          }
          width={48}
        />

        <Tooltip content={<CustomTooltip />} />

        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: '#9ca3af', paddingTop: 12 }}
        />

        <Area
          type="monotone"
          dataKey="receitas"
          name="Receitas"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#gradReceitas)"
          dot={false}
          activeDot={{ r: 4, fill: '#10b981' }}
        />

        <Area
          type="monotone"
          dataKey="despesas"
          name="Despesas"
          stroke="#ef4444"
          strokeWidth={2}
          fill="url(#gradDespesas)"
          dot={false}
          activeDot={{ r: 4, fill: '#ef4444' }}
        />

        <Area
          type="monotone"
          dataKey="saldo"
          name="Saldo"
          stroke="#6366f1"
          strokeWidth={2}
          fill="url(#gradSaldo)"
          dot={false}
          activeDot={{ r: 4, fill: '#6366f1' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
