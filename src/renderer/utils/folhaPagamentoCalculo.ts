// NOVO: cálculo do valor de uma Folha de Pagamento — extraído de
// FolhaPagamentoEditor.tsx pra ser reaproveitado também no Início
// (ADM/Gestor) e no Painel do Supervisor, no card "Total Aproximado
// da Folha". Mantendo tudo numa função só evita o cálculo divergir
// entre as telas.

export interface ItemFolhaCalculo {
  salario_base:      number | null
  h_premio:          string | number | null
  producao:          string | number | null
  vale_transporte:   string | number | null
  insalubridade:     string | number | null
  periculosidade:    string | number | null
  adc_noturno:        string | number | null
  he_50:             string | number | null
  he_80:             string | number | null
  he_100:            string | number | null
  he_110:            string | number | null
  atrasos:           string | number | null
  faltas:             string | number | null
  outros_eventos:    string | number | null
}

export interface ResumoFolha {
  totalSalarios:   number
  totalAdicionais: number
  totalDescontos:  number
  totalGeral:      number
}

export const DIVISOR_HORAS_MES = 220

export function paraNumero(valor: string | number | null | undefined): number {
  if (valor === null || valor === undefined || valor === '') return 0
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0
  const n = Number(valor.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

// Os campos de hora (HE 50/80/100/110%, Adc Noturno, Atrasos) guardam
// HORA E MINUTO, não decimal puro — "27,02" é 27h e 2 MINUTOS (como a
// importação do espelho de ponto preenche), não 27,02 horas.
// CORRIGIDO: o dado pode chegar em 3 formatos diferentes dependendo
// de onde vem — número puro (27.02, às vezes vindo direto do banco),
// texto com PONTO (o Supabase às vezes devolve coluna numeric como
// texto: "27.10", não convertido pra número nem pra vírgula) ou
// texto com VÍRGULA (o formato que a própria tela usa, "27,10").
// Antes só tratava o primeiro caso — os outros dois quebravam
// ("txt.split is not a function") ou davam conta errada (tratava
// "27.10" como 27,10 horas decimais, ignorando que é hora+minuto).
export function horasParaDecimal(valor: string | number | null | undefined): number {
  if (valor === null || valor === undefined || valor === '') return 0

  let txt: string
  if (typeof valor === 'number') {
    txt = paraTextoHora(valor)
  } else if (valor.includes(',')) {
    txt = valor
  } else if (valor.includes('.')) {
    txt = paraTextoHora(Number(valor))
  } else {
    txt = valor
  }

  const [horasTxt, minutosTxt] = txt.split(',')
  const horas   = Number(horasTxt) || 0
  const minutos = minutosTxt ? Number(minutosTxt.padEnd(2, '0').slice(0, 2)) || 0 : 0
  return horas + minutos / 60
}

// Converte um valor CRU do banco (27.02, número ou texto) pro texto
// "H,MM" que o resto do cálculo entende (27,02) — preserva os
// dígitos exatos (não é conversão decimal de verdade), porque é
// assim que esses campos são gravados desde o início (ver
// handleSalvar do editor).
export function paraTextoHora(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return ''
  const numero = typeof v === 'number' ? v : Number(v.replace(',', '.'))
  if (!Number.isFinite(numero)) return ''
  const [inteiro, decimal] = numero.toFixed(2).split('.')
  return `${inteiro},${decimal}`
}

// Inversa de horasParaDecimal — usada pra SOMAR horas de dois
// espelhos do mesmo colaborador.
export function decimalParaHoraMinuto(decimal: number): string {
  let horas = Math.floor(decimal)
  let minutos = Math.round((decimal - horas) * 60)
  if (minutos === 60) { minutos = 0; horas += 1 }
  return `${horas},${String(minutos).padStart(2, '0')}`
}

// Reflexo do DSR (Descanso Semanal Remunerado) sobre hora extra —
// obrigatório por lei (Súmula 172 do TST). Fórmula padrão: DSR =
// (soma das horas extras do mês ÷ dias úteis do mês) × dias de
// descanso do mês (domingos + feriados). Considera os feriados
// nacionais fixos e os móveis (Carnaval, Sexta-feira Santa, Corpus
// Christi, calculados a partir da Páscoa) — NÃO inclui feriado
// estadual/municipal (varia por obra/cidade).
function calcularPascoa(ano: number): { mes: number; dia: number } {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return { mes, dia }
}

function feriadosDoAno(ano: number): { mes: number; dia: number }[] {
  const fixos = [
    { mes: 1, dia: 1 },   // Confraternização Universal
    { mes: 4, dia: 21 },  // Tiradentes
    { mes: 5, dia: 1 },   // Dia do Trabalho
    { mes: 9, dia: 7 },   // Independência
    { mes: 10, dia: 12 }, // Nossa Senhora Aparecida
    { mes: 11, dia: 2 },  // Finados
    { mes: 11, dia: 15 }, // Proclamação da República
    { mes: 12, dia: 25 }, // Natal
  ]
  const pascoa = new Date(ano, calcularPascoa(ano).mes - 1, calcularPascoa(ano).dia)
  const somarDias = (data: Date, dias: number) => {
    const nova = new Date(data)
    nova.setDate(nova.getDate() + dias)
    return { mes: nova.getMonth() + 1, dia: nova.getDate() }
  }
  const moveis = [
    somarDias(pascoa, -47), // Carnaval (terça-feira)
    somarDias(pascoa, -2),  // Sexta-feira Santa
    somarDias(pascoa, 60),  // Corpus Christi
  ]
  return [...fixos, ...moveis]
}

// dias úteis = todo dia que não é domingo nem feriado; dias de
// descanso = domingos + feriados do mês.
export function diasUteisERepousoDoMes(mesCompetencia: string): { diasUteis: number; diasRepouso: number } {
  const [ano, mes] = mesCompetencia.split('-').map(Number)
  const feriados = feriadosDoAno(ano)
  const ultimoDia = new Date(ano, mes, 0).getDate()

  let diasRepouso = 0
  for (let dia = 1; dia <= ultimoDia; dia++) {
    const data = new Date(ano, mes - 1, dia)
    const ehDomingo = data.getDay() === 0
    const ehFeriado = feriados.some(f => f.mes === mes && f.dia === dia)
    if (ehDomingo || ehFeriado) diasRepouso++
  }
  return { diasUteis: ultimoDia - diasRepouso, diasRepouso }
}

// Total de UM colaborador (salário + adicionais − descontos). Recebe
// o mês de competência porque o reflexo do DSR depende do calendário
// daquele mês. Isso é uma ESTIMATIVA pra conferência — não substitui
// o cálculo oficial do programa de folha.
export function calcularTotalItem(item: ItemFolhaCalculo, mesCompetencia: string): { salario: number; adicionais: number; descontos: number; total: number } {
  const salario  = item.salario_base ?? 0
  const valorHora = salario / DIVISOR_HORAS_MES

  const valorHorasExtras =
    horasParaDecimal(item.he_50)  * valorHora * 1.5 +
    horasParaDecimal(item.he_80)  * valorHora * 1.8 +
    horasParaDecimal(item.he_100) * valorHora * 2.0 +
    horasParaDecimal(item.he_110) * valorHora * 2.1 +
    horasParaDecimal(item.adc_noturno) * valorHora * 1.2

  const { diasUteis, diasRepouso } = diasUteisERepousoDoMes(mesCompetencia)
  const dsrSobreHorasExtras = diasUteis > 0 ? (valorHorasExtras / diasUteis) * diasRepouso : 0

  const adicionais =
    paraNumero(item.h_premio) + paraNumero(item.producao) + paraNumero(item.vale_transporte) +
    paraNumero(item.insalubridade) + paraNumero(item.periculosidade) + paraNumero(item.outros_eventos) +
    valorHorasExtras + dsrSobreHorasExtras

  const descontos =
    horasParaDecimal(item.atrasos) * valorHora +
    paraNumero(item.faltas) * (salario / 30)

  return { salario, adicionais, descontos, total: salario + adicionais - descontos }
}

export function calcularResumoFolha(itens: ItemFolhaCalculo[], mesCompetencia: string): ResumoFolha {
  let totalSalarios = 0, totalAdicionais = 0, totalDescontos = 0

  for (const item of itens) {
    const { salario, adicionais, descontos } = calcularTotalItem(item, mesCompetencia)
    totalSalarios += salario
    totalAdicionais += adicionais
    totalDescontos += descontos
  }

  return {
    totalSalarios,
    totalAdicionais,
    totalDescontos,
    totalGeral: totalSalarios + totalAdicionais - totalDescontos,
  }
}

export function formatReais(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
