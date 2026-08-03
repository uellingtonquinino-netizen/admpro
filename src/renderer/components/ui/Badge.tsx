import { clsx } from 'clsx'

type Color = 'green' | 'red' | 'yellow' | 'blue' | 'gray' | 'purple'

interface Props {
  color?:    Color
  children:  React.ReactNode
  className?: string
}

const colors: Record<Color, string> = {
  green:  'bg-emerald-500/20 text-emerald-400',
  red:    'bg-red-500/20     text-red-400',
  yellow: 'bg-yellow-500/20  text-yellow-400',
  blue:   'bg-blue-500/20    text-blue-400',
  gray:   'bg-gray-500/20    text-gray-400',
  purple: 'bg-purple-500/20  text-purple-400',
}

export default function Badge({ color = 'gray', children, className }: Props) {
  return (
    <span className={clsx(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
      colors[color],
      className
    )}>
      {children}
    </span>
  )
}
