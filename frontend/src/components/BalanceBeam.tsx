import { CheckIcon } from 'lucide-react'

import { Money } from '@/components/Money'
import { cn } from '@/lib/utils'

/*
  The live balance indicator — the centrepiece of the New Entry form, and the reason the
  demo opens with it.

  R2 says total debits must exactly equal total credits or the transaction is refused. That
  rule is enforced in the service and again by the database, but stated in prose it is just
  a sentence. Drawn as a balance that visibly tips while you type, it becomes the thing the
  form is *about*: the beam is level only when the entry is postable, and the submit button
  is disabled until it is.

  The tilt is proportional to the imbalance and capped, so a 1-paisa difference still
  registers as a visible lean rather than silently rounding to level.
*/

const MAX_TILT_DEGREES = 7

export function BalanceBeam({
  debits,
  credits,
  className,
}: {
  debits: number
  credits: number
  className?: string
}) {
  const difference = debits - credits
  // Exact comparison, matching the server. The values here come from parsing user input at
  // two decimal places, so this is a comparison of two-decimal quantities, not of
  // accumulated float arithmetic — and the server re-checks it in `decimal` regardless.
  const balanced = difference === 0 && debits > 0
  const heaviest = Math.max(debits, credits, 1)
  const tilt = balanced ? 0 : (-difference / heaviest) * MAX_TILT_DEGREES

  return (
    <div
      className={cn(
        'rounded-panel border bg-card px-5 py-4 transition-colors',
        balanced ? 'border-balanced/45 bg-balanced-wash/40' : 'border-rule',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <figure className="min-w-0">
          <figcaption className="eyebrow mb-1">Debits</figcaption>
          <Money value={debits} className="text-lg text-debit" emphasis="strong" />
        </figure>
        <figure className="min-w-0 text-right">
          <figcaption className="eyebrow mb-1">Credits</figcaption>
          <Money value={credits} className="text-lg text-credit" emphasis="strong" />
        </figure>
      </div>

      {/* The beam gets its own full-width row: at 20rem of sidebar it has nowhere near
          enough room to sit between the two figures without colliding with them. */}
      <Beam tilt={tilt} balanced={balanced} />

      <p
        className={cn(
          'border-t pt-3 text-center text-[0.8125rem]',
          balanced ? 'border-balanced/30 text-balanced' : 'border-rule text-muted',
        )}
        aria-live="polite"
      >
        {balanced ? (
          <span className="inline-flex items-center gap-1.5 font-semibold tracking-[0.06em] uppercase">
            <CheckIcon className="size-3.5" strokeWidth={3} /> Balanced
          </span>
        ) : debits === 0 && credits === 0 ? (
          'Enter the two sides of the entry.'
        ) : (
          <>
            Out of balance by <Money value={Math.abs(difference)} emphasis="strong" /> —{' '}
            {difference > 0 ? 'credits' : 'debits'} are short.
          </>
        )}
      </p>
    </div>
  )
}

/**
 * The beam itself. Drawn rather than animated with a library: two pans hanging off a bar
 * that rotates about its fulcrum. The pans counter-rotate so they stay level, which is how
 * a real balance behaves and is the detail that makes the metaphor read.
 */
function Beam({ tilt, balanced }: { tilt: number; balanced: boolean }) {
  return (
    <svg
      viewBox="0 0 180 62"
      preserveAspectRatio="xMidYMid meet"
      className="my-1 h-16 w-full"
      role="img"
      aria-label={balanced ? 'Balanced' : 'Out of balance'}
    >
      {/* Stand and fulcrum */}
      <g
        className={cn('transition-colors', balanced ? 'stroke-balanced' : 'stroke-rule-strong')}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      >
        <path d="M90 22 V50" />
        <path d="M76 54 H104" />
      </g>

      <g
        style={{ transform: `rotate(${tilt}deg)`, transformOrigin: '90px 22px' }}
        className="transition-transform duration-500 ease-out"
      >
        {/* The bar */}
        <line
          x1="14"
          y1="22"
          x2="166"
          y2="22"
          strokeWidth="2"
          strokeLinecap="round"
          className={cn('transition-colors', balanced ? 'stroke-balanced' : 'stroke-rule-strong')}
        />
        <circle
          cx="90"
          cy="22"
          r="3.5"
          className={cn('transition-colors', balanced ? 'fill-balanced' : 'fill-rule-strong')}
        />

        {/* Pans counter-rotate so they hang level whatever the beam is doing. */}
        <Pan x={14} tilt={tilt} className="stroke-debit" />
        <Pan x={166} tilt={tilt} className="stroke-credit" />
      </g>
    </svg>
  )
}

function Pan({ x, tilt, className }: { x: number; tilt: number; className: string }) {
  return (
    <g
      style={{ transform: `rotate(${-tilt}deg)`, transformOrigin: `${x}px 22px` }}
      className={cn('transition-transform duration-500 ease-out', className)}
      strokeWidth="1.5"
      strokeLinecap="round"
      fill="none"
    >
      <path d={`M${x} 22 V34`} />
      <path d={`M${x - 11} 34 H${x + 11}`} />
      <path d={`M${x - 11} 34 L${x} 39 L${x + 11} 34`} strokeWidth="1.25" />
    </g>
  )
}
