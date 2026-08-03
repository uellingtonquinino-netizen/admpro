import { clsx }             from 'clsx'
import { Loader2 }          from 'lucide-react'
import { ButtonHTMLAttributes, forwardRef } from 'react'

type Variant = 'primary' | 'ghost' | 'danger' | 'outline'
type Size    = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  Variant
  size?:     Size
  loading?:  boolean
  icon?:     React.ReactNode
}

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 hover:bg-brand-500 text-white shadow-glow-sm hover:shadow-glow',
  ghost:   'hover:bg-surface-hover text-gray-400 hover:text-gray-100',
  danger:  'bg-red-600/20 hover:bg-red-600/40 text-red-400 hover:text-red-300',
  outline: 'border border-surface-border hover:border-brand-500 text-gray-300 hover:text-white',
}

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2   text-sm',
  lg: 'px-5 py-2.5 text-base',
}

const Button = forwardRef<HTMLButtonElement, Props>(({
  variant  = 'primary',
  size     = 'md',
  loading  = false,
  icon,
  children,
  className,
  disabled,
  ...props
}, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    className={clsx(
      'inline-flex items-center gap-2 rounded-lg font-medium',
      'transition-all duration-200',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      variants[variant],
      sizes[size],
      className
    )}
    {...props}
  >
    {loading
      ? <Loader2 size={14} className="animate-spin shrink-0" />
      : icon && <span className="shrink-0">{icon}</span>
    }
    {children}
  </button>
))

Button.displayName = 'Button'
export default Button
