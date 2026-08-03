import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
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

export default function GraficoLinha({ data }: Props) {
  const { format } = useCurrency()

  // Saldo acumulado mês a mês
  let acumulado = 0
  const chartData = data.map(d => {
    acumulado += d.saldo
    return {
      name:      labelMes(d.mes),
      Acumulado: acumulado,
    }
  })

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart
        data={chartData}
        margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
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
          formatter={(value: number) => [format(value), 'Acumulado']}
          cursor={{ stroke: '#ffffff15' }}
        />
        <ReferenceLine y={0} stroke="#ffffff20" strokeDasharray="4 4" />
        <Line
          type="monotone"
          dataKey="Acumulado"
          stroke="#6366f1"
          strokeWidth={2.5}
          dot={{ fill: '#6366f1', r: 4, strokeWidth: 0 }}
          activeDot={{ r: 6, fill: '#818cf8' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
