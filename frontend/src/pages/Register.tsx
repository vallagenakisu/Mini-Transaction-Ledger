import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'

import { register } from '@/api/auth'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/useAuth'
import { AuthLayout } from '@/components/AuthLayout'
import { FormError } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'

const MIN_PASSWORD = 8

export default function Register() {
  const { isAuthenticated } = useAuth()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setPending(true)
    setError(null)

    try {
      await register({ fullName, email, password })
      setDone(true)
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Registration failed.')
    } finally {
      setPending(false)
    }
  }

  if (done) {
    return (
      <AuthLayout>
        <h1 className="font-display text-[2rem] leading-tight font-medium text-ink">
          Request sent
        </h1>
        <p className="mt-4 text-[0.9375rem] text-muted">
          An administrator needs to approve <span className="text-ink">{email}</span> before you
          can sign in.
        </p>
        <Button asChild size="lg" variant="outline" className="mt-8 w-full">
          <Link to="/login">Back to sign in</Link>
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <h1 className="font-display text-[2rem] leading-tight font-medium text-ink">Register</h1>

      <form onSubmit={handleSubmit} className="mt-7 space-y-4">
        <Field label="Full name" htmlFor="full-name">
          <Input
            id="full-name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={100}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </Field>

        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            maxLength={150}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
          />
        </Field>

        <Field label="Password" htmlFor="password" hint={`At least ${MIN_PASSWORD} characters`}>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        <Field label="Confirm password" htmlFor="confirm">
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </Field>

        {error ? <FormError>{error}</FormError> : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? 'Sending…' : 'Register'}
        </Button>
      </form>

      <p className="mt-5 text-[0.875rem] text-muted">
        Have an account?{' '}
        <Link to="/login" className="text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
