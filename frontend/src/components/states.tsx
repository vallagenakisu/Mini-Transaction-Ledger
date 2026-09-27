import { AlertTriangleIcon, InboxIcon, RefreshCwIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import type { ApiError } from '@/api/client'

/** Nothing to show, and that is a legitimate state — not a failure. */
export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string
  detail?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <InboxIcon className="size-5 text-faint" strokeWidth={1.5} />
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        {detail ? <p className="max-w-sm text-[0.8125rem] text-muted">{detail}</p> : null}
      </div>
      {action}
    </div>
  )
}

/**
 * A failed request, shown with the server's own sentence.
 *
 * The message comes from the ProblemDetails `title` the middleware wrote, which is the
 * message the domain exception carried — so "Debits (500.00) do not equal credits (450.00)"
 * reaches the user verbatim instead of being flattened to "something went wrong".
 */
export function ErrorState({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <AlertTriangleIcon className="size-5 text-danger" strokeWidth={1.5} />
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">
          {error.status > 0 ? `Request failed — ${error.status}` : 'Cannot reach the API'}
        </p>
        <p className="max-w-md text-[0.8125rem] text-muted">{error.message}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCwIcon /> Try again
        </Button>
      ) : null}
    </div>
  )
}

/** Inline form-level error — the same sentence, in the place the user is typing. */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null

  return (
    <p className="flex items-start gap-2 rounded-md border border-danger/35 bg-danger-wash px-3 py-2 text-[0.8125rem] text-danger">
      <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
      <span>{children}</span>
    </p>
  )
}
