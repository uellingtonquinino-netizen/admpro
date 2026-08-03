import { usePreferenciasStore } from '@store/preferencias.store'
import Card                     from '@components/ui/Card'
import { clsx }                 from 'clsx'

const MOEDAS = [
  { value: 'BRL', label: 'Real Brasileiro (R$)'   },
  { value: 'USD', label: 'Dólar Americano ($)'     },
  { value: 'EUR', label: 'Euro (€)'                },
]

const TEMAS = [
  { value: 'dark',  label: 'Escuro'  },
  { value: 'light', label: 'Claro'   },
  { value: 'auto',  label: 'Sistema' },
]

const DATAS = [
  { value: 'dd/MM/yyyy', label: 'DD/MM/AAAA' },
  { value: 'MM/dd/yyyy', label: 'MM/DD/AAAA' },
  { value: 'yyyy-MM-dd', label: 'AAAA-MM-DD' },
]

export default function ConfigPreferencias() {
  const {
    moeda,      setMoeda,
    tema,       setTema,
    formatoData, setFormatoData,
  } = usePreferenciasStore()

  function renderOpcoes<T extends string>(
    label:    string,
    opcoes:   { value: T; label: string }[],
    valor:    T,
    onChange: (v: T) => void
  ) {
    return (
      <div>
        <p className="text-sm text-gray-400 mb-2">{label}</p>
        <div className="flex flex-wrap gap-2">
          {opcoes.map(o => (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm border transition-colors',
                valor === o.value
                  ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                  : 'border-surface-border text-gray-400 hover:bg-surface-hover'
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-gray-200 mb-5">
        Preferências do sistema
      </h2>

      <div className="space-y-6">
        {renderOpcoes('Moeda', MOEDAS, moeda, setMoeda)}
        {renderOpcoes('Tema',  TEMAS,  tema,  setTema)}
        {renderOpcoes('Formato de data', DATAS, formatoData, setFormatoData)}

        {/* Notificações */}
        <div>
          <p className="text-sm text-gray-400 mb-3">Notificações</p>
          <div className="space-y-2">
            {[
              { id: 'vencimentos', label: 'Avisar vencimentos próximos' },
              { id: 'saldo_baixo', label: 'Avisar saldo baixo em contas' },
              { id: 'resumo',      label: 'Resumo diário automático'     },
            ].map(n => (
              <label
                key={n.id}
                className="flex items-center gap-3 cursor-pointer
                           py-2 px-3 rounded-lg hover:bg-surface-hover
                           transition-colors"
              >
                <input
                  type="checkbox"
                  defaultChecked
                  className="accent-brand-500 w-4 h-4"
                />
                <span className="text-sm text-gray-300">{n.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-6 text-xs text-gray-500">
        Preferências salvas automaticamente no dispositivo.
      </p>
    </Card>
  )
}
