import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-[0.06em] uppercase [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'border-rule bg-sunk text-muted',
        outline: 'border-rule-strong bg-transparent text-muted',
        debit: 'border-transparent bg-debit-wash text-debit',
        credit: 'border-transparent bg-credit-wash text-credit',
        balanced: 'border-transparent bg-balanced-wash text-balanced',
        danger: 'border-transparent bg-danger-wash text-danger',
        /* An inked rubber stamp, slightly askew — for REVERSED and REVERSAL. */
        stamp: '-rotate-2 border-2 border-danger bg-transparent px-1.5 tracking-[0.12em] text-danger',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export function Badge({
  className,
  tone,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}
