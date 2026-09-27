import type { User } from '@/types/api'

/*
  Where the JWT lives.

  Chosen: `localStorage`, with a short token lifetime (120 minutes, `Jwt:ExpiryMinutes`).
  The honest trade-off (02 §3): localStorage is readable by any script on the page, so it
  is exposed to XSS. An httpOnly cookie is not, but a cookie is sent automatically, which
  means the app then needs CSRF protection and the cross-origin SPA story gets harder.

  So this is not "secure storage" — it is a trade-off with a named mitigation: a short
  expiry, no refresh-token rotation, re-login when it lapses, and React's default JSX
  escaping plus zero `dangerouslySetInnerHTML` in the app to keep the XSS surface small.
*/

const STORAGE_KEY = 'misl.ledger.session'

export interface Session {
  token: string
  expiresAtUtc: string
  user: User
}

export function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const session = JSON.parse(raw) as Session
    if (!session.token || !session.user) return null

    // A token we already know is stale is worse than no token: it would let the app paint
    // a logged-in shell and then fail every request with a 401.
    if (Date.parse(session.expiresAtUtc) <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }

    return session
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

export function writeSession(session: Session): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/*
  The axios response interceptor lives outside React, so it cannot call a hook to log the
  user out. AuthProvider registers its own teardown here on mount instead, and the
  interceptor invokes whatever is registered. One indirection, no global navigation hacks.
*/
let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

export function notifyUnauthorized(): void {
  onUnauthorized?.()
}
