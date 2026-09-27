import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-sm bg-sunk', className)} />
}

/** Placeholder rows sized like the table they stand in for, so nothing jumps on load. */
export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-px px-5 py-3">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-4 py-2.5">
          {Array.from({ length: cols }, (_, col) => (
            <Skeleton
              key={col}
              className={cn('h-3.5', col === 0 ? 'w-28' : col === 1 ? 'flex-1' : 'w-20')}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
