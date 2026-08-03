// NOVO: usado para calcular a data de retorno da Suspensão Disciplinar
// (e reutilizável em outros cálculos futuros) — pula fins de semana e
// feriados nacionais, avançando para o próximo dia útil.

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher)
function calcularPascoa(ano: number): Date {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(ano, mes - 1, dia)
}

function somarDias(data: Date, dias: number): Date {
  const d = new Date(data)
  d.setDate(d.getDate() + dias)
  return d
}

function feriadosDoAno(ano: number): Set<string> {
  const chave = (d: Date) => d.toISOString().slice(0, 10)
  const pascoa = calcularPascoa(ano)

  const feriados = [
    new Date(ano, 0, 1),   // Confraternização Universal
    new Date(ano, 3, 21),  // Tiradentes
    new Date(ano, 4, 1),   // Dia do Trabalho
    new Date(ano, 8, 7),   // Independência
    new Date(ano, 9, 12),  // Nossa Senhora Aparecida
    new Date(ano, 10, 2),  // Finados
    new Date(ano, 10, 15), // Proclamação da República
    new Date(ano, 10, 20), // Consciência Negra
    new Date(ano, 11, 25), // Natal
    somarDias(pascoa, -47), // Carnaval (terça-feira)
    somarDias(pascoa, -2),  // Sexta-feira Santa
    somarDias(pascoa, 60),  // Corpus Christi
  ]

  return new Set(feriados.map(chave))
}

function ehFimDeSemanaOuFeriado(data: Date): boolean {
  const diaSemana = data.getDay() // 0 = domingo, 6 = sábado
  if (diaSemana === 0 || diaSemana === 6) return true
  const feriados = feriadosDoAno(data.getFullYear())
  return feriados.has(data.toISOString().slice(0, 10))
}

// Recebe uma data e avança (se necessário) até o próximo dia útil.
export function proximoDiaUtil(data: Date): Date {
  let atual = new Date(data)
  while (ehFimDeSemanaOuFeriado(atual)) {
    atual = somarDias(atual, 1)
  }
  return atual
}
