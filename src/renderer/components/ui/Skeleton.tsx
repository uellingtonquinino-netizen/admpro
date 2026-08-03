import { clsx } from 'clsx'

interface Props {
  className?: string
  lines?:     number
  circle?:    boolean
}

function SkeletonItem({ className }: { className?: string }) {
  return (
    <div className={clsx(
      'shimmer rounded-md',
      className
    )} />
  )
}

export default function Skeleton({ className, lines = 1, circle }: Props) {
  if (circle) {
    return <SkeletonItem className={clsx('rounded-full', className)} />
  }

  if (lines === 1) {
    return <SkeletonItem className={clsx('h-4 w-full', className)} />
  }

  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonItem
          key={i}
          className={clsx(
            'h-4',
            i === lines - 1 ? 'w-3/4' : 'w-full'
          )}
        />
      ))}
    </div>
  )
}

// ── Skeleton de card ──────────────────────────────────────
export function SkeletonCard() {
  return (
    <div className="bg-surface rounded-xl border border-surface-border p-4 space-y-3">
      <div className="flex items-center gap-3">
        <SkeletonItem className="w-10 h-10 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonItem className="h-3 w-1/2" />
          <SkeletonItem className="h-3 w-1/3" />
        </div>
      </div>
      <SkeletonItem className="h-6 w-2/3" />
      <SkeletonItem className="h-3 w-1/4" />
    </div>
  )
}

// ── Skeleton de tabela ────────────────────────────────────
export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 bg-surface rounded-lg
                     border border-surface-border px-4 py-3"
        >
          <SkeletonItem className="h-3 w-24 shrink-0" />
          <SkeletonItem className="h-3 flex-1" />
          <SkeletonItem className="h-3 w-20 shrink-0" />
          <SkeletonItem className="h-3 w-16 shrink-0" />
          <SkeletonItem className="h-5 w-14 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  )
}
