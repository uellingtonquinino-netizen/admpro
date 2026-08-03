import { clsx } from 'clsx'

interface Props {
  children:   React.ReactNode
  className?: string
  padding?:   boolean
  hover?:     boolean
  onClick?:   () => void
}

export default function Card({
  children,
  className,
  padding  = true,
  hover    = false,
  onClick,
}: Props) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-surface rounded-xl border border-surface-border shadow-card',
        padding && 'p-4',
        hover   && 'hover:border-brand-500/50 transition-colors cursor-pointer',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  )
}
