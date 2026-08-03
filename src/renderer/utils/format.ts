// ── Moeda ─────────────────────────────────────────────────
export function formatCurrency(
  value: number,
  currency = 'BRL',
  locale   = 'pt-BR'
): string {
  return new Intl.NumberFormat(locale, {
    style:    'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value)
}

// ── Data ──────────────────────────────────────────────────
// CORRIGIDO: travava com "Cannot read properties of null" quando a
// data vinha vazia do banco (ex: colaborador sem data de admissão
// preenchida) — agora mostra "—" nesses casos, em vez de quebrar a
// tela inteira.
export function formatDate(
  date: string | Date | null | undefined,
  format: 'short' | 'long' | 'month' = 'short'
): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date
  if (isNaN(d.getTime())) return '—'
  const opts: Intl.DateTimeFormatOptions =
    format === 'long'
      ? { day: '2-digit', month: 'long',   year: 'numeric' }
      : format === 'month'
      ? { month: 'long', year: 'numeric' }
      : { day: '2-digit', month: '2-digit', year: 'numeric' }
  return d.toLocaleDateString('pt-BR', opts)
}

// ── Número compacto ───────────────────────────────────────
export function formatCompact(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    notation:              'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

// ── CPF/CNPJ ─────────────────────────────────────────────
export function formatCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  if (digits.length === 14) {
    return digits.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      '$1.$2.$3/$4-$5'
    )
  }
  return value
}

// ── Telefone ──────────────────────────────────────────────
export function formatTelefone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  }
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  }
  return value
}

// ── Truncar texto ─────────────────────────────────────────
export function truncate(text: string, max = 40): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}
