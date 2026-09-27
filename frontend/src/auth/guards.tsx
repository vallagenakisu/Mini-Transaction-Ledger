import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '@/auth/useAuth'

/**
 * Gates a route on being signed in, remembering where the user was headed so login can
 * send them back there instead of dumping them on the dashboard.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return children
}

/**
 * Gates a route on the Admin role.
 *
 * This is **UX, not security**. The server enforces every role rule independently from the
 * JWT's claims — `[Authorize(Roles = Roles.Admin)]` on the controller action. Deleting this
 * component would make the app uglier, not less safe: the request would still come back 403.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth()

  if (!isAdmin) {
    return <Navigate to="/" replace />
  }

  return children
}
