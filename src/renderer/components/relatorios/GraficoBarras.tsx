import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useCurrency } from '@hooks/useCurrency'

interface ResumoMes {
  mes:      string
  receitas: number
  despesas: number
  saldo:    number
}

interface Props {
  data: ResumoMes[]
}

function labelMes(mes: string) {
  const [ano, m] = mes.split('-')
  return new Date(Number(ano), Number(m) - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'short' })
    .replace('.', '')
    .toUpperCase()
}

export default function GraficoBarras({ data }: Props) {
  const { format } = useCurrency()

  const chartData = data.map(d => ({
    name:     labelMes(d.mes),
    Receitas: d.receitas,
    Despesas: d.despesas,
  }))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={chartData}
        margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
        barCategoryGap="30%"
        barGap={4}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#ffffff08"
          vertical={false}
        />
        <XAxis
          dataKey="name"
          tick={{ fill: '#6b7280', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => format(v, { compact: true })}
          width={72}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1a1d23',
            border:          '1px solid #2a2d35',
            borderRadius:    '10px',
            fontSize:        '12px',
            color:           '#e5e7eb',
          }}
          formatter={(value: number) => [format(value), '']}
          cursor={{ fill: '#ffffff06' }}
        />
        <Legend
          wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }}
        />
        <Bar
          dataKey="Receitas"
          fill="#22c55e"
          radius={[4, 4, 0, 0]}
          maxBarSize={40}
        />
        <Bar
          dataKey="Despesas"
          fill="#ef4444"
          radius={[4, 4, 0, 0]}
          maxBarSize={40}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
