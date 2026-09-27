import type { CSSProperties } from 'react'
import { Toaster as Sonner } from 'sonner'

/** Sonner, wired to the app's own tokens so toasts follow the light/dark palette. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      offset={20}
      toastOptions={{ className: 'font-sans' }}
      style={
        {
          '--normal-bg': 'var(--card)',
          '--normal-text': 'var(--ink)',
          '--normal-border': 'var(--rule-strong)',
          '--success-bg': 'var(--card)',
          '--success-text': 'var(--balanced)',
          '--success-border': 'var(--balanced)',
          '--error-bg': 'var(--card)',
          '--error-text': 'var(--danger)',
          '--error-border': 'var(--danger)',
        } as CSSProperties
      }
    />
  )
}
