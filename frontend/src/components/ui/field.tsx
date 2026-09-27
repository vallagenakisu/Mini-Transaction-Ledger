import * as LabelPrimitive from '@radix-ui/react-label'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn('eyebrow block', className)} {...props} />
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-md border border-rule-strong bg-card px-3 text-sm text-ink transition-colors',
        'placeholder:text-faint focus-visible:border-ring',
        'disabled:cursor-not-allowed disabled:bg-sunk disabled:text-muted',
        // A right-aligned mono field for amounts; the caller opts in with `text-right`.
        '[&[type=date]]:font-mono [&[type=date]]:text-[0.8125rem]',
        className,
      )}
      {...props}
    />
  )
}

/** The amount input: mono, right-aligned, tabular — so a column of them lines up. */
export function AmountInput({ className, ...props }: ComponentProps<'input'>) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={cn('num text-right tracking-tight', className)}
      {...props}
    />
  )
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label: string
  hint?: ReactNode
  error?: ReactNode
  htmlFor?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-[0.75rem] text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[0.75rem] text-faint">{hint}</p>
      ) : null}
    </div>
  )
}
