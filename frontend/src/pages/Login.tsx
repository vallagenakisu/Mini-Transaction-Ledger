import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'

import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/useAuth'
import { AuthLayout } from '@/components/AuthLayout'
import { FormError } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'

/** Published in the README as well — these are seeded demo users, not real credentials. */
const DEMO_USERS = [
  { role: 'Admin', email: 'admin@misl.com', password: 'Admin@123' },
  { role: 'Accountant', email: 'accountant@misl.com', password: 'Accountant@123' },
]

export default function Login() {
  const { isAuthenticated, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (isAuthenticated) {
    return <Navigate to={from} replace />
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)

    try {
      await signIn({ email, password })
      navigate(from, { replace: true })
    } catch (caught: unknown) {
      // The server answers a bad password with 401 "Invalid credentials" and says nothing
      // about which half was wrong — deliberate, so the endpoint cannot be used to discover
      // which email addresses exist.
      setError(caught instanceof ApiError ? caught.message : 'Sign-in failed.')
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className="font-display text-[2rem] leading-tight font-medium text-ink">Sign in</h1>

      <form onSubmit={handleSubmit} className="mt-7 space-y-4">
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@misl.com"
          />
        </Field>

        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </Field>

        {error ? <FormError>{error}</FormError> : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-5 text-[0.875rem] text-muted">
        No account?{' '}
        <Link to="/register" className="text-ink underline underline-offset-4">
          Register
        </Link>
      </p>

      <div className="mt-10 border-t border-rule pt-5">
        <p className="eyebrow mb-2">Demo users</p>
        <ul>
          {DEMO_USERS.map((user) => (
            <li key={user.email}>
              <button
                type="button"
                onClick={() => {
                  setEmail(user.email)
                  setPassword(user.password)
                }}
                className="flex w-full items-baseline justify-between gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent"
              >
                <span className="num truncate text-[0.8125rem] text-ink">{user.email}</span>
                <span className="eyebrow shrink-0">{user.role}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </AuthLayout>
  )
}
