import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * The one container in the app. A panel is a sheet of paper: hairline rule, faint radius,
 * no drop shadow. Depth is expressed by the rule and the paper tone underneath it, which
 * is what keeps dense tables legible — a shadowed card around every table turns a ledger
 * into a feed.
 */
export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn('rounded-panel border border-rule bg-card', className)}
      {...props}
    />
  )
}

export function PanelHeader({
  eyebrow,
  title,
  meta,
  actions,
  className,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-rule px-5 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
        <h2 className="font-display text-xl leading-none font-medium text-ink">{title}</h2>
        {meta ? <p className="mt-2 text-[0.8125rem] text-muted">{meta}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function PanelBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-5 py-4', className)} {...props} />
}

export function PanelFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-rule px-5 py-3 text-[0.8125rem] text-muted',
        className,
      )}
      {...props}
    />
  )
}
