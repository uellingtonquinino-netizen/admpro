// NOVO: substitui a macro VBA `Extenso()` usada nas planilhas de AP —
// converte um valor numérico em reais para texto por extenso em
// português (ex: 9986.04 -> "Nove Mil Novecentos e Oitenta e Seis
// Reais e Quatro Centavos").

const UNIDADES = [
  '', 'Um', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito', 'Nove',
]
const DEZ_A_DEZENOVE = [
  'Dez', 'Onze', 'Doze', 'Treze', 'Quatorze', 'Quinze',
  'Dezesseis', 'Dezessete', 'Dezoito', 'Dezenove',
]
const DEZENAS = [
  '', '', 'Vinte', 'Trinta', 'Quarenta', 'Cinquenta',
  'Sessenta', 'Setenta', 'Oitenta', 'Noventa',
]
const CENTENAS = [
  '', 'Cento', 'Duzentos', 'Trezentos', 'Quatrocentos', 'Quinhentos',
  'Seiscentos', 'Setecentos', 'Oitocentos', 'Novecentos',
]

function trescentosPorExtenso(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'Cem'

  const c = Math.floor(n / 100)
  const d = Math.floor((n % 100) / 10)
  const u = n % 10

  const partes: string[] = []
  if (c > 0) partes.push(CENTENAS[c])

  if (d === 1) {
    partes.push(DEZ_A_DEZENOVE[u])
  } else {
    if (d > 0) partes.push(DEZENAS[d])
    if (u > 0) partes.push(UNIDADES[u])
  }

  return partes.join(' e ')
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return 'Zero'

  const milhoes  = Math.floor(n / 1_000_000)
  const milhares = Math.floor((n % 1_000_000) / 1000)
  const resto     = n % 1000

  const blocos: string[] = []

  if (milhoes > 0) {
    blocos.push(
      milhoes === 1
        ? 'Um Milhão'
        : `${trescentosPorExtenso(milhoes)} Milhões`
    )
  }

  if (milhares > 0) {
    blocos.push(
      milhares === 1
        ? 'Mil'
        : `${trescentosPorExtenso(milhares)} Mil`
    )
  }

  if (resto > 0) {
    blocos.push(trescentosPorExtenso(resto))
  }

  // "e" antes do último bloco quando o resto é < 100 (regra comum de
  // extenso em português) — simplificado para o caso mais frequente
  if (blocos.length > 1 && resto > 0 && resto < 100) {
    return `${blocos.slice(0, -1).join(' ')} e ${blocos[blocos.length - 1]}`
  }

  return blocos.join(' ')
}

export function numeroPorExtenso(valor: number): string {
  const negativo = valor < 0
  valor = Math.abs(valor)

  const reais    = Math.floor(valor)
  const centavos = Math.round((valor - reais) * 100)

  const partes: string[] = []

  if (reais > 0) {
    const sufixoReais = reais === 1 ? 'Real' : 'Reais'
    partes.push(`${inteiroPorExtenso(reais)} ${sufixoReais}`)
  }

  if (centavos > 0) {
    const sufixoCentavos = centavos === 1 ? 'Centavo' : 'Centavos'
    partes.push(`${inteiroPorExtenso(centavos)} ${sufixoCentavos}`)
  }

  if (partes.length === 0) return 'Zero Reais'

  const texto = partes.join(' e ')
  return negativo ? `Menos ${texto}` : texto
}
