import type { ReactNode } from 'react'

import { Wordmark } from '@/components/Wordmark'

/** The split screen shared by sign-in and registration. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden items-center justify-center border-r border-rule p-16 lg:flex">
        <BalanceMark />
      </div>

      <div className="flex items-center justify-center px-6 py-14">
        <div className="w-full max-w-sm">
          <Wordmark className="mb-10" />
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * The left panel is one drawing and nothing else.
 *
 * It replaced a headline, a paragraph and a worked ledger example — all of which spent
 * words on the single thing the picture already states. A beam at rest, with one pan in
 * each of the two ledger hues, *is* the premise of double-entry; a caption underneath it
 * would only be the same claim, more slowly.
 */
function BalanceMark() {
  return (
    <svg
      viewBox="0 0 240 200"
      fill="none"
      role="img"
      aria-label="A balance at rest, its two pans level"
      className="w-full max-w-[23rem] text-rule-strong"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M98 176h44" stroke="currentColor" />
      <path d="M120 176V58" stroke="currentColor" />
      <circle cx="120" cy="54" r="3.5" fill="currentColor" />
      <path d="M44 54h152" stroke="currentColor" />
      <path d="M48 54v32" stroke="currentColor" />
      <path d="M192 54v32" stroke="currentColor" />

      <path d="M18 86h60" className="stroke-debit" />
      <path d="M18 86a30 30 0 0 0 60 0" className="stroke-debit" />

      <path d="M162 86h60" className="stroke-credit" />
      <path d="M162 86a30 30 0 0 0 60 0" className="stroke-credit" />
    </svg>
  )
}
