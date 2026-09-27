import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { login as loginRequest } from '@/api/auth'
import {
  clearSession,
  readSession,
  setUnauthorizedHandler,
  writeSession,
  type Session,
} from '@/api/session'
import { AuthContext, type AuthContextValue } from '@/auth/context'
import type { LoginRequest } from '@/types/api'

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialised from storage so a page refresh does not log you out, and so the first
  // render already knows whether to show the app or the login screen — no auth flicker.
  const [session, setSession] = useState<Session | null>(() => readSession())

  const signOut = useCallback(() => {
    clearSession()
    setSession(null)
  }, [])

  // The axios 401 interceptor calls this. Registering it here means the teardown path is
  // identical whether the user clicked "Sign out" or the token simply expired.
  useEffect(() => {
    setUnauthorizedHandler(signOut)
    return () => setUnauthorizedHandler(null)
  }, [signOut])

  const signIn = useCallback(async (credentials: LoginRequest) => {
    const response = await loginRequest(credentials)
    const next: Session = {
      token: response.token,
      expiresAtUtc: response.expiresAtUtc,
      user: response.user,
    }
    writeSession(next)
    setSession(next)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      isAuthenticated: session !== null,
      // Role comes from the login payload, but the server re-checks it on every request
      // from the token's claims. This flag decides what to *render*, never what to allow.
      isAdmin: session?.user.role === 'Admin',
      signIn,
      signOut,
    }),
    [session, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
