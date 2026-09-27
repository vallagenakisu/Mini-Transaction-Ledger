import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
  className,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  lede?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-x-8 gap-y-4', className)}>
      <div className="max-w-2xl">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="font-display text-[2.125rem] leading-[1.05] tracking-[-0.01em] font-medium text-ink">
          {title}
        </h1>
        {lede ? <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-muted">{lede}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-end gap-2">{actions}</div> : null}
    </header>
  )
}
