import { useEffect, useState } from 'react'
import { clsx }                from 'clsx'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react'
import type { Toast, ToastType } from '@hooks/useToast'

// ── Singleton store global ────────────────────────────────
type Listener = (toasts: Toast[]) => void
let _toasts:   Toast[]   = []
let _listeners: Listener[] = []

function notify() {
  _listeners.forEach(l => l([..._toasts]))
}

export const toast = {
  success: (message: string) => addToast(message, 'success'),
  error:   (message: string) => addToast(message, 'error'),
  warning: (message: string) => addToast(message, 'warning'),
  info:    (message: string) => addToast(message, 'info'),
}

function addToast(message: string, type: ToastType) {
  const id = crypto.randomUUID()
  _toasts = [..._toasts, { id, type, message }]
  notify()
  setTimeout(() => {
    _toasts = _toasts.filter(t => t.id !== id)
    notify()
  }, 4000)
}

function removeToast(id: string) {
  _toasts = _toasts.filter(t => t.id !== id)
  notify()
}

// ── Ícones e cores por tipo ───────────────────────────────
const config: Record<ToastType, {
  icon:  React.ReactNode
  bar:   string
  ring:  string
}> = {
  success: {
    icon: <CheckCircle2 size={16} className="text-emerald-400" />,
    bar:  'bg-emerald-500',
    ring: 'border-emerald-500/30',
  },
  error: {
    icon: <XCircle size={16} className="text-red-400" />,
    bar:  'bg-red-500',
    ring: 'border-red-500/30',
  },
  warning: {
    icon: <AlertTriangle size={16} className="text-yellow-400" />,
    bar:  'bg-yellow-500',
    ring: 'border-yellow-500/30',
  },
  info: {
    icon: <Info size={16} className="text-blue-400" />,
    bar:  'bg-blue-500',
    ring: 'border-blue-500/30',
  },
}

// ── Componente individual ─────────────────────────────────
function ToastItem({ toast: t }: { toast: Toast }) {
  const [visible, setVisible] = useState(false)
  const cfg = config[t.type]

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  return (
    <div
      className={clsx(
        'relative flex items-start gap-3 w-80',
        'bg-surface border rounded-xl px-4 py-3 shadow-2xl',
        'transition-all duration-300 overflow-hidden',
        cfg.ring,
        visible
          ? 'opacity-100 translate-x-0'
          : 'opacity-0 translate-x-8'
      )}
    >
      {/* Barra colorida lateral */}
      <div className={clsx('absolute left-0 top-0 bottom-0 w-1 rounded-l-xl', cfg.bar)} />

      {/* Ícone */}
      <span className="mt-0.5 shrink-0">{cfg.icon}</span>

      {/* Mensagem */}
      <p className="flex-1 text-sm text-gray-200 leading-snug">{t.message}</p>

      {/* Fechar */}
      <button
        onClick={() => removeToast(t.id)}
        className="shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  )
}

// ── Container global (montar uma vez no App) ──────────────
export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    _listeners.push(setToasts)
    return () => {
      _listeners = _listeners.filter(l => l !== setToasts)
    }
  }, [])

  return (
    <div className="fixed bottom-5 right-5 z-[999] flex flex-col gap-2 items-end">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}
