import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

interface Ponto { mes: string; admissoes: number; desligamentos: number }
interface Props { data: Ponto[] }

function labelMes(mes: string): string {
  const [ano, m] = mes.split('-')
  const nome = new Date(Number(ano), Number(m) - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}/${ano.slice(2)}`
}

export default function GraficoAdmissoesDesligamentos({ data }: Props) {
  const chartData = data.map(d => ({ name: labelMes(d.mes), Admissões: d.admissoes, Desligamentos: d.desligamentos }))

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="30%" barGap={3}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
        <Tooltip
          contentStyle={{ backgroundColor: '#1a1d23', border: '1px solid #2a2d35', borderRadius: '10px', fontSize: '12px', color: '#e5e7eb' }}
          cursor={{ fill: '#ffffff06' }}
        />
        <Bar dataKey="Admissões" fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={18} />
        <Bar dataKey="Desligamentos" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  )
}
