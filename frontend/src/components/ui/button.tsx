import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,opacity] outline-none disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg:not([class*=size-])]:size-4',
  {
    variants: {
      variant: {
        solid: 'bg-primary text-primary-ink hover:bg-primary/88',
        outline: 'border border-rule-strong bg-card text-ink hover:bg-accent',
        ghost: 'text-muted hover:bg-accent hover:text-ink',
        danger: 'bg-danger text-white hover:bg-danger/88',
        quiet:
          'border border-transparent text-muted underline decoration-rule-strong decoration-1 underline-offset-4 hover:text-ink hover:decoration-ink',
      },
      size: {
        sm: 'h-8 px-3 text-[0.8125rem]',
        md: 'h-9 px-4',
        lg: 'h-11 px-6',
        icon: 'size-8',
      },
    },
    defaultVariants: { variant: 'solid', size: 'md' },
  },
)

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button'

  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
