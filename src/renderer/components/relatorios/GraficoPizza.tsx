import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useCurrency } from '@hooks/useCurrency'

interface TopCategoria {
  nome:  string
  cor:   string
  total: number
}

interface Props {
  data: TopCategoria[]
}

const CORES_FALLBACK = [
  '#6366f1', '#22c55e', '#ef4444', '#f97316',
  '#eab308', '#06b6d4',
]

export default function GraficoPizza({ data }: Props) {
  const { format } = useCurrency()

  if (data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center
                      text-sm text-gray-500">
        Sem dados no período
      </div>
    )
  }

  const chartData = data.map(d => ({
    name:  d.nome,
    value: d.total,
    cor:   d.cor,
  }))

  const total = data.reduce((a, d) => a + d.total, 0)

  return (
    <div className="flex flex-col gap-4">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={3}
            dataKey="value"
          >
            {chartData.map((entry, i) => (
              <Cell
                key={entry.name}
                fill={entry.cor ?? CORES_FALLBACK[i % CORES_FALLBACK.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: '#1a1d23',
              border:          '1px solid #2a2d35',
              borderRadius:    '10px',
              fontSize:        '12px',
              color:           '#e5e7eb',
            }}
            formatter={(value: number, name: string) => [
              format(value),
              name,
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px', color: '#9ca3af' }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Lista com percentual */}
      <div className="space-y-2">
        {chartData.map((d, i) => {
          const pct = total > 0 ? (d.value / total) * 100 : 0
          return (
            <div key={d.name} className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{
                  backgroundColor:
                    d.cor ?? CORES_FALLBACK[i % CORES_FALLBACK.length],
                }}
              />
              <span className="text-xs text-gray-400 flex-1 truncate">
                {d.name}
              </span>
              <span className="text-xs text-gray-500 w-10 text-right">
                {pct.toFixed(1)}%
              </span>
              <span className="text-xs text-gray-300 w-24 text-right font-medium">
                {format(d.value)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
