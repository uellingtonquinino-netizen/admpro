import { usePreferenciasStore } from '@store/preferencias.store'

const SIMBOLOS = { BRL: 'R$', USD: '$', EUR: '€' }
const LOCALES  = { BRL: 'pt-BR', USD: 'en-US', EUR: 'de-DE' }

interface FormatOptions {
  compact?: boolean
}

export function useCurrency() {
  const moeda = usePreferenciasStore(s => s.moeda)

  function format(value: number, opts: FormatOptions = {}): string {
    if (opts.compact) {
      if (Math.abs(value) >= 1_000_000)
        return `${SIMBOLOS[moeda]} ${(value / 1_000_000).toFixed(1)}M`
      if (Math.abs(value) >= 1_000)
        return `${SIMBOLOS[moeda]} ${(value / 1_000).toFixed(1)}K`
    }

    return new Intl.NumberFormat(LOCALES[moeda], {
      style:    'currency',
      currency: moeda,
    }).format(value)
  }

  // NOTA: `parse` não existia mais na última versão deste hook na conversa
  // original (PARTE 73), mas LancamentoModal.tsx depende dele — restaurado
  // aqui a partir da versão anterior (PARTE 55) para manter o formulário
  // funcional, sem alterar o comportamento de `format`.
  function parse(raw: string): number {
    const cleaned = raw
      .replace(/[^0-9,.-]/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
    return parseFloat(cleaned) || 0
  }

  return { format, parse, moeda, simbolo: SIMBOLOS[moeda] }
}
