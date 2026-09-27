import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthProvider } from '@/auth/AuthProvider'
import { RequireAuth } from '@/auth/guards'
import { AppShell } from '@/components/AppShell'
import { Toaster } from '@/components/ui/toaster'
import Accounts from '@/pages/Accounts'
import AccountStatement from '@/pages/AccountStatement'
import Journal from '@/pages/Journal'
import Login from '@/pages/Login'
import NewEntry from '@/pages/NewEntry'
import NotFound from '@/pages/NotFound'
import Overview from '@/pages/Overview'
import TrialBalance from '@/pages/TrialBalance'

/*
  The route table (01 §9).

  Everything except /login sits behind one <RequireAuth> on the layout route rather than
  repeated on each page — a route that forgets the guard is the kind of mistake that is
  invisible until someone finds it, so there is only one place to forget.

  `/` is the chart of accounts, not a summary. Work in a ledger starts by naming the account
  it concerns, so the landing page is the accounts themselves and every posting route is
  reachable from one of them. The whole-ledger position moved to /overview, which is a page
  you go to rather than the page you are given.

  Note what is *not* here: no route edits or deletes a transaction. The absence of those
  screens is the same design decision as the absence of PUT and DELETE on the API (R10).
*/
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Accounts />} />
            {/* The chart of accounts moved to the root; the old path still resolves. */}
            <Route path="/accounts" element={<Navigate to="/" replace />} />
            <Route path="/accounts/:id" element={<AccountStatement />} />
            <Route path="/overview" element={<Overview />} />
            <Route path="/transactions" element={<Journal />} />
            <Route path="/transactions/new" element={<NewEntry />} />
            <Route path="/reports/trial-balance" element={<TrialBalance />} />
            {/* An old bookmark to /reports lands somewhere sensible. */}
            <Route path="/reports" element={<Navigate to="/reports/trial-balance" replace />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>

        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  )
}
