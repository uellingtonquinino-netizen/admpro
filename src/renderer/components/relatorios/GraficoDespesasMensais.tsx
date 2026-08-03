import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts'
import { useCurrency } from '@hooks/useCurrency'

interface Ponto { mes: string; total: number }
interface Props { data: Ponto[] }

function labelMes(mes: string): string {
  const [ano, m] = mes.split('-')
  const nome = new Date(Number(ano), Number(m) - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}/${ano.slice(2)}`
}

export default function GraficoDespesasMensais({ data }: Props) {
  const { format } = useCurrency()
  const chartData = data.map(d => ({ name: labelMes(d.mes), Total: d.total }))

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false}
          tickFormatter={v => format(v, { compact: true })} width={34} />
        <Tooltip
          contentStyle={{ backgroundColor: '#1a1d23', border: '1px solid #2a2d35', borderRadius: '10px', fontSize: '12px', color: '#e5e7eb' }}
          formatter={(value: number) => [format(value), 'Total']}
          cursor={{ stroke: '#ffffff15' }}
        />
        <Line type="monotone" dataKey="Total" stroke="#22c55e" strokeWidth={2.5}
          dot={{ fill: '#22c55e', r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: '#4ade80' }}>
          <LabelList dataKey="Total" position="top" formatter={(v: number) => format(v, { compact: true })}
            style={{ fill: '#9ca3af', fontSize: 10 }} />
        </Line>
      </LineChart>
    </ResponsiveContainer>
  )
}
