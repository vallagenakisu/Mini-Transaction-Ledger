import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  )
}

export function THead({ className, ...props }: ComponentProps<'thead'>) {
  return (
    <thead
      className={cn('[&_th]:border-b [&_th]:border-rule-strong [&_th]:pb-2', className)}
      {...props}
    />
  )
}

export function TH({
  className,
  align = 'left',
  ...props
}: ComponentProps<'th'> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      className={cn(
        // `th` centres by default in every browser; a column head that does not sit over
        // its own column is the fastest way to make a data table unreadable.
        'eyebrow px-3 pt-0 text-left whitespace-nowrap',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      {...props}
    />
  )
}

export function TBody({ className, ...props }: ComponentProps<'tbody'>) {
  return (
    <tbody
      className={cn(
        '[&>tr]:border-b [&>tr]:border-rule [&>tr:last-child:not([data-total])]:border-0',
        className,
      )}
      {...props}
    />
  )
}

export function TR({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('transition-colors', className)} {...props} />
}

export function TD({
  className,
  align = 'left',
  ...props
}: ComponentProps<'td'> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <td
      className={cn(
        'px-3 py-2.5 align-middle',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      {...props}
    />
  )
}

/**
 * The grand-total row. Single rule above, double rule below — the printed-ledger
 * convention for "this is the total, and nothing follows it".
 */
export function TotalRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      data-total=""
      className={cn('total-rule [&>*]:px-3 [&>*]:py-3 [&>*]:font-medium', className)}
      {...props}
    />
  )
}
