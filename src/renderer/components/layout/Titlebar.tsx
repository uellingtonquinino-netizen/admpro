import { Minus, Square, X }   from 'lucide-react'
import { useEmpresaStore }     from '@store/empresa.store'

export default function Titlebar() {
  const empresaNome = useEmpresaStore(s => s.empresaNome)

  return (
    <div
      className="
        drag-region h-10 flex items-center justify-between
        bg-surface-card border-b border-surface-border
        select-none shrink-0
      "
    >
      {/* Logo + nome empresa */}
      <div className="no-drag flex items-center gap-2 px-4">
        <div className="w-5 h-5 rounded bg-brand-600 flex items-center
                        justify-center text-white text-xs font-bold">
          O
        </div>
        <span className="text-xs text-gray-400 font-medium">
          ADM PRO
          {empresaNome && (
            <span className="ml-2 text-gray-600">— {empresaNome}</span>
          )}
        </span>
      </div>

      {/* Controles da janela */}
      <div className="no-drag flex h-full">
        <button
          onClick={() => window.api.app.minimize()}
          className="
            w-12 h-full flex items-center justify-center
            text-gray-500 hover:text-gray-200 hover:bg-surface-hover
            transition-colors
          "
        >
          <Minus size={14} />
        </button>

        <button
          onClick={() => window.api.app.maximize()}
          className="
            w-12 h-full flex items-center justify-center
            text-gray-500 hover:text-gray-200 hover:bg-surface-hover
            transition-colors
          "
        >
          <Square size={12} />
        </button>

        <button
          onClick={() => window.api.app.close()}
          className="
            w-12 h-full flex items-center justify-center
            text-gray-500 hover:text-white hover:bg-red-600
            transition-colors
          "
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
