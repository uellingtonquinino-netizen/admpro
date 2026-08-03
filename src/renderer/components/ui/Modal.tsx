import { useEffect, useRef } from 'react'
import { X }                 from 'lucide-react'
import { clsx }              from 'clsx'

interface Props {
  open:       boolean
  onClose:    () => void
  title?:     string
  size?:      'sm' | 'md' | 'lg' | 'xl' | 'full'
  children:   React.ReactNode
}

const sizes = {
  sm:   'max-w-sm',
  md:   'max-w-md',
  lg:   'max-w-lg',
  xl:   'max-w-2xl',
  full: 'max-w-4xl',
}

export default function Modal({
  open, onClose, title, size = 'md', children
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Fechar com ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  // CORRIGIDO: antes o overlay centralizava com `flex items-center` e o
  // card tinha `max-h-[90vh] overflow-y-auto` — combinação que quebra em
  // formulários altos (bug conhecido: itens flex não encolhem abaixo do
  // conteúdo por padrão, então o scroll interno nunca ativava e o card
  // ficava cortado pela tela). Agora quem rola é o overlay inteiro, com
  // o cabeçalho fixo (sticky) no topo.
  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
      className="
        fixed inset-0 z-50 overflow-y-auto
        bg-black/60 backdrop-blur-sm animate-fade-in
      "
    >
      <div className="min-h-full flex items-start justify-center p-4">
        <div
          className={clsx(
            'w-full bg-surface rounded-xl shadow-2xl my-8',
            'border border-surface-border animate-scale-in',
            sizes[size]
          )}
        >
          {/* Header */}
          {title && (
            <div className="flex items-center justify-between
                            px-5 py-4 border-b border-surface-border
                            sticky top-0 bg-surface rounded-t-xl z-10">
              <h2 className="text-base font-semibold text-white">{title}</h2>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-200
                           hover:bg-surface-hover rounded-lg p-1
                           transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Body */}
          <div className="p-5">{children}</div>
        </div>
      </div>
    </div>
  )
}
