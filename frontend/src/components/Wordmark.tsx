import { cn } from '@/lib/utils'

/**
 * The mark is a balance with two level pans — the invariant the whole application exists to
 * hold. Indigo pan for debits, ochre for credits, matching every Dr/Cr in the interface.
 */
export function BalanceMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-5', className)} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none">
        <path d="M12 4.5v15" />
        <path d="M4 8h16" />
        <path d="M9 19.5h6" />
      </g>
      <path d="M4 8l-2 4.4h4z" className="fill-debit" />
      <path d="M20 8l-2 4.4h4z" className="fill-credit" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <BalanceMark className="size-6 text-ink" />
      <span className="leading-none">
        <span className="block font-display text-[1.375rem] leading-none tracking-[0.01em] font-medium text-ink">
          Ledger
        </span>
        <span className="eyebrow mt-1 block text-[0.5625rem]">Double entry</span>
      </span>
    </span>
  )
}
