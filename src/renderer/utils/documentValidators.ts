// NOVO: formatação automática de CPF/CNPJ — usada tanto nos formulários
// de cadastro (aplicada enquanto o usuário digita) quanto na hora de
// exibir esses documentos nos formulários gerados (garante que fiquem
// no mesmo formato em todo lugar, mesmo que o valor salvo esteja sem
// pontuação).

export function formatCPF(valor?: string | null): string {
  if (!valor) return ''
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function formatCNPJ(valor?: string | null): string {
  if (!valor) return ''
  const d = valor.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

// Formata CPF (11 dígitos) ou CNPJ (14 dígitos) automaticamente conforme
// a quantidade de números — útil onde o mesmo campo aceita PF ou PJ.
export function formatCpfCnpj(valor?: string | null): string {
  if (!valor) return ''
  const d = valor.replace(/\D/g, '')
  return d.length > 11 ? formatCNPJ(valor) : formatCPF(valor)
}

// Formata uma sequência de dígitos digitados como duração HH:MM
// (não é hora do relógio — pode passar de 23h, ex: horas extras
// acumuladas). Os 2 últimos dígitos digitados viram os minutos.
export function formatHoras(valor?: string | null): string {
  if (!valor) return ''
  const d = valor.replace(/\D/g, '').slice(0, 6)
  if (d.length <= 2) return d
  const minutos = d.slice(-2)
  const horas = d.slice(0, -2)
  return `${horas}:${minutos}`
}

// Formata hora do relógio (00:00 a 23:59) — usado em campos como
// "Hora de saída" / "Hora de retorno". Insere os dois primeiros
// dígitos como hora e os dois seguintes como minuto.
export function formatHoraRelogio(valor?: string | null): string {
  if (!valor) return ''
  const d = valor.replace(/\D/g, '').slice(0, 4)
  if (d.length <= 2) return d
  return `${d.slice(0, 2)}:${d.slice(2, 4)}`
}

// Formata valor monetário digitado como "1.000,00" — cada dígito
// digitado entra como centavo (estilo calculadora), com separador de
// milhar automático.
export function formatMoeda(valor?: string | null): string {
  if (!valor) return ''
  const digitos = valor.replace(/\D/g, '')
  if (!digitos) return ''
  const numero = Number(digitos) / 100
  return numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Converte de volta "1.000,00" para número (1000), para salvar no banco.
export function parseMoeda(valor?: string | null): number | null {
  if (!valor) return null
  const limpo = valor.replace(/\./g, '').replace(',', '.')
  const n = Number(limpo)
  return Number.isNaN(n) ? null : n
}

// Formata CEP no padrão pedido: 00.000-000
export function formatCEP(valor?: string | null): string {
  if (!valor) return ''
  const d = valor.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}-${d.slice(5)}`
}

const DIAS_SEMANA = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado',
]

// Descobre automaticamente o dia da semana a partir de uma data
// "YYYY-MM-DD" (do input type="date") — evita o mesmo problema de fuso
// horário já corrigido em fmtData, lendo os componentes diretamente.
export function diaDaSemana(dataISO?: string | null): string {
  if (!dataISO) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dataISO)
  if (!match) return ''
  const [, ano, mes, dia] = match
  const data = new Date(Number(ano), Number(mes) - 1, Number(dia))
  return DIAS_SEMANA[data.getDay()]
}
