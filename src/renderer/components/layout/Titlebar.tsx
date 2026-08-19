import { useState, useEffect } from 'react'
import { Minus, Square, X, Cloud, HardDrive } from 'lucide-react'
import { useEmpresaStore }     from '@store/empresa.store'

export default function Titlebar() {
  const empresaNome = useEmpresaStore(s => s.empresaNome)

  // NOVO: mostra sempre qual banco está ativo de verdade — depois de
  // um problema em que o programa caía silenciosamente pro SQLite
  // local (sem avisar ninguém) mesmo devendo usar o Supabase
  // compartilhado, isso fica visível o tempo todo, sem precisar
  // investigar nada pra descobrir.
  const [provider, setProvider] = useState<'sqlite' | 'supabase' | null>(null)
  useEffect(() => {
    window.api.app.getDatabaseProvider().then(setProvider)
  }, [])

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
          A
        </div>
        <span className="text-xs text-gray-400 font-medium">
          ADM OBRA
          {empresaNome && (
            <span className="ml-2 text-gray-600">— {empresaNome}</span>
          )}
        </span>
        {provider === 'supabase' && (
          <span title="Banco compartilhado (Supabase) — dados sincronizados entre computadores"
                className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
            <Cloud size={10} /> Nuvem
          </span>
        )}
        {provider === 'sqlite' && (
          <span title="Banco LOCAL (SQLite) — os dados NÃO são compartilhados com outros computadores"
                className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
            <HardDrive size={10} /> Local
          </span>
        )}
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
