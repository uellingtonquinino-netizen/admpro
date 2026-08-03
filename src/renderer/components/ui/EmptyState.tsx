import { clsx }          from 'clsx'
import { LucideIcon }    from 'lucide-react'
import Button            from './Button'

interface Props {
  icon?:        LucideIcon
  title:        string
  description?: string
  action?:      { label: string; onClick: () => void }
  className?:   string
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: Props) {
  return (
    <div className={clsx(
      'flex flex-col items-center justify-center',
      'py-16 px-4 text-center',
      className
    )}>
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-surface flex items-center
                        justify-center mb-4 border border-surface-border">
          <Icon size={24} className="text-gray-500" />
        </div>
      )}

      <p className="text-base font-medium text-gray-300 mb-1">{title}</p>

      {description && (
        <p className="text-sm text-gray-500 max-w-xs mb-5">{description}</p>
      )}

      {action && (
        <Button onClick={action.onClick} size="sm">
          {action.label}
        </Button>
      )}
    </div>
  )
}
