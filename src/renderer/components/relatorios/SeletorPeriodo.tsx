import { useState } from 'react'
import { clsx }     from 'clsx'
import { Calendar } from 'lucide-react'

interface Periodo {
  inicio: string
  fim:    string
}

interface Props {
  value:    Periodo
  onChange: (p: Periodo) => void
}

const PRESETS = [
  {
    label: 'Este mês',
    get(): Periodo {
      const n = new Date()
      const y = n.getFullYear()
      const m = n.getMonth()
      return {
        inicio: `${y}-${String(m + 1).padStart(2,'0')}-01`,
        fim:    `${y}-${String(m + 1).padStart(2,'0')}-${
                  new Date(y, m + 1, 0).getDate()
                }`,
      }
    },
  },
  {
    label: 'Últimos 3 meses',
    get(): Periodo {
      const n   = new Date()
      const fim = n.toISOString().split('T')[0]
      n.setMonth(n.getMonth() - 3)
      n.setDate(1)
      return { inicio: n.toISOString().split('T')[0], fim }
    },
  },
  {
    label: 'Últimos 6 meses',
    get(): Periodo {
      const n   = new Date()
      const fim = n.toISOString().split('T')[0]
      n.setMonth(n.getMonth() - 6)
      n.setDate(1)
      return { inicio: n.toISOString().split('T')[0], fim }
    },
  },
  {
    label: 'Este ano',
    get(): Periodo {
      const y = new Date().getFullYear()
      return { inicio: `${y}-01-01`, fim: `${y}-12-31` }
    },
  },
]

export default function SeletorPeriodo({ value, onChange }: Props) {
  const [aberto, setAberto] = useState(false)

  function aplicarPreset(preset: typeof PRESETS[0]) {
    onChange(preset.get())
    setAberto(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setAberto(v => !v)}
        className={clsx(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm',
          'border border-surface-border text-gray-300',
          'hover:bg-surface-hover transition-colors'
        )}
      >
        <Calendar size={14} />
        <span>
          {value.inicio} → {value.fim}
        </span>
      </button>

      {aberto && (
        <div className="absolute right-0 top-10 z-50
                        bg-surface border border-surface-border
                        rounded-xl shadow-xl p-4 w-80">
          {/* Presets */}
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
            Períodos rápidos
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => aplicarPreset(p)}
                className="px-3 py-1 rounded-lg text-xs
                           border border-surface-border text-gray-300
                           hover:bg-brand-500/10 hover:border-brand-500/30
                           transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Datas manuais */}
          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
            Período personalizado
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">De</label>
              <input
                type="date"
                value={value.inicio}
                onChange={e => onChange({ ...value, inicio: e.target.value })}
                className="input w-full"
              />
            </div>
            <div>
              <label className="label">Até</label>
              <input
                type="date"
                value={value.fim}
                onChange={e => onChange({ ...value, fim: e.target.value })}
                className="input w-full"
              />
            </div>
          </div>

          <button
            onClick={() => setAberto(false)}
            className="mt-4 w-full py-1.5 rounded-lg text-sm
                       bg-brand-600 hover:bg-brand-700
                       text-white transition-colors"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  )
}
