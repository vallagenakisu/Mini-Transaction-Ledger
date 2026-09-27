import { PencilIcon, PlusIcon, SearchIcon, XCircleIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { listAccounts } from '@/api/accounts'
import { useAuth } from '@/auth/useAuth'
import { AccountDialog, DeactivateDialog } from '@/components/AccountDialogs'
import { Money } from '@/components/Money'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { Panel } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useApi } from '@/hooks/useApi'
import { ACCOUNT_TYPES } from '@/lib/ledger'
import { cn } from '@/lib/utils'
import type { Account, AccountType } from '@/types/api'

/*
  The home screen.

  This is deliberately the first thing after login rather than a summary page. An accounting
  session does not begin with an aggregate — it begins with "I need to do something with an
  account", so the landing page is the accounts themselves, and every operation starts by
  picking one. The whole-ledger view that used to live here is still a page, at /overview;
  it is a thing you consult, not the thing you are handed.

  Cards rather than a table: a card is a destination you click into, and the balance is the
  one figure you want at a glance. The dense tabular view of the same data — total debits and
  total credits per account, side by side — is what the trial balance is for, so duplicating
  it here would have been two answers to one question.
*/

type TypeFilter = AccountType | 'all'
type StatusFilter = 'all' | 'active' | 'inactive'

export default function Accounts() {
  const { isAdmin } = useAuth()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [closing, setClosing] = useState<Account | null>(null)

  const accounts = useApi(
    () =>
      listAccounts({
        type: typeFilter === 'all' ? undefined : typeFilter,
        active: statusFilter === 'all' ? undefined : statusFilter === 'active',
      }),
    [typeFilter, statusFilter],
  )

  // Search is client-side on purpose: the chart of accounts is a bounded list that is already
  // in memory, and a round trip per keystroke would buy nothing.
  const needle = search.trim().toLowerCase()
  const list = (accounts.data ?? []).filter(
    (account) =>
      needle === '' ||
      account.name.toLowerCase().includes(needle) ||
      account.accountNumber.toLowerCase().includes(needle),
  )

  // "Nothing here yet" and "nothing matches what you asked for" are different statements, and
  // conflating them is how an empty list becomes confusing.
  const narrowed = needle !== '' || typeFilter !== 'all' || statusFilter !== 'active'

  function resetFilters() {
    setSearch('')
    setTypeFilter('all')
    setStatusFilter('active')
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Ledger"
        title="Chart of accounts"
        actions={
          isAdmin ? (
            <Button onClick={() => setCreating(true)}>
              <PlusIcon /> Open account
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[13rem] flex-1 space-y-1.5 sm:max-w-xs">
          <Label htmlFor="filter-search">Find</Label>
          <span className="relative block">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-faint" />
            <Input
              id="filter-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or number"
              className="pl-8"
            />
          </span>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="filter-type">Type</Label>
          <Select value={typeFilter} onValueChange={(next) => setTypeFilter(next as TypeFilter)}>
            <SelectTrigger id="filter-type" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {ACCOUNT_TYPES.map((meta) => (
                <SelectItem key={meta.type} value={meta.type}>
                  {meta.type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="filter-status">Status</Label>
          <Select
            value={statusFilter}
            onValueChange={(next) => setStatusFilter(next as StatusFilter)}
          >
            <SelectTrigger id="filter-status" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="inactive">Closed only</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {narrowed ? (
          <Button variant="quiet" size="sm" onClick={resetFilters}>
            <XIcon /> Reset
          </Button>
        ) : null}

        <p className="num ml-auto text-[0.8125rem] text-muted">
          {list.length} account{list.length === 1 ? '' : 's'}
        </p>
      </div>

      {accounts.error ? (
        <Panel>
          <ErrorState error={accounts.error} onRetry={accounts.reload} />
        </Panel>
      ) : accounts.loading && !accounts.data ? (
        <LoadingCards />
      ) : list.length === 0 ? (
        <Panel>
          {narrowed ? (
            <EmptyState
              title="Nothing matches those filters"
              detail="Try a different type, or clear the search."
              action={
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Reset filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No accounts yet"
              detail={
                isAdmin
                  ? 'A ledger starts with the accounts it can post to. Open the first one — typically a cash or bank account, and an equity account to fund it from.'
                  : 'Nothing can be posted until an administrator opens the first account.'
              }
              action={
                isAdmin ? (
                  <Button size="sm" onClick={() => setCreating(true)}>
                    <PlusIcon /> Open the first account
                  </Button>
                ) : null
              }
            />
          )}
        </Panel>
      ) : (
        <div className="space-y-8">
          {ACCOUNT_TYPES.map((meta) => {
            const group = list.filter((account) => account.type === meta.type)
            if (group.length === 0) return null

            const subtotal = group.reduce((sum, account) => sum + account.balance, 0)

            return (
              <section key={meta.type} className="space-y-3">
                <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule pb-2">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="font-display text-xl leading-none font-medium text-ink">{meta.type}</h2>
                    <span className="eyebrow">
                      {meta.range} · {meta.normalBalance}-normal
                    </span>
                    <span className="text-[0.8125rem] text-faint">{meta.blurb}</span>
                  </div>
                  <span className="flex items-baseline gap-2">
                    <span className="eyebrow">Subtotal</span>
                    <Money
                      value={subtotal}
                      signed
                      emphasis="strong"
                      className="text-[0.9375rem]"
                    />
                  </span>
                </header>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {group.map((account) => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      normalBalance={meta.normalBalance}
                      isAdmin={isAdmin}
                      onEdit={() => setEditing(account)}
                      onClose={() => setClosing(account)}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {creating ? (
        <AccountDialog open onOpenChange={setCreating} onSaved={accounts.reload} />
      ) : null}

      {editing ? (
        <AccountDialog
          key={editing.id}
          account={editing}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          onSaved={accounts.reload}
        />
      ) : null}

      {closing ? (
        <DeactivateDialog
          key={closing.id}
          account={closing}
          open
          onOpenChange={(open) => !open && setClosing(null)}
          onDone={accounts.reload}
        />
      ) : null}
    </div>
  )
}

/**
 * One account, as a destination.
 *
 * The whole card is the link — via an absolutely positioned anchor rather than by wrapping
 * the card in one, because the admin controls are buttons and nesting a button inside an
 * anchor is invalid and behaves differently in every browser. The controls sit above the
 * overlay on their own stacking layer.
 */
function AccountCard({
  account,
  normalBalance,
  isAdmin,
  onEdit,
  onClose,
}: {
  account: Account
  normalBalance: string
  isAdmin: boolean
  onEdit: () => void
  onClose: () => void
}) {
  return (
    <article
      className={cn(
        'group relative flex flex-col justify-between gap-4 rounded-panel border bg-card px-4 py-3.5 transition-colors',
        'focus-within:border-rule-strong hover:border-rule-strong hover:bg-accent/45',
        account.isActive ? 'border-rule' : 'border-dashed border-rule',
      )}
    >
      <Link
        to={`/accounts/${account.id}`}
        className="absolute inset-0 rounded-panel outline-none focus-visible:border focus-visible:border-ring"
      >
        <span className="sr-only">Open the statement for {account.name}</span>
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="num block text-[0.75rem] text-faint">{account.accountNumber}</span>
          <h3
            className={cn(
              'mt-0.5 truncate text-[0.9375rem] font-medium',
              account.isActive ? 'text-ink' : 'text-muted',
            )}
            title={account.name}
          >
            {account.name}
          </h3>
        </div>

        <span className="flex shrink-0 flex-col items-end gap-1">
          {!account.isActive ? <Badge tone="outline">Closed</Badge> : null}
          {account.allowsNegativeBalance ? (
            <Badge tone="neutral" title="This account may go negative (R8)">
              Overdraft
            </Badge>
          ) : null}
        </span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <span>
          <Money value={account.balance} signed emphasis="strong" className="text-[1.375rem]" />
          <span className="eyebrow mt-1 block">
            {account.currency} · {normalBalance}-normal
          </span>
        </span>

        {/* Admin-only controls are simply absent for an Accountant. That is UX — the server
            rejects the request from the token's role claim either way. */}
        {isAdmin ? (
          <span className="relative z-10 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <Button variant="ghost" size="icon" title="Edit account" onClick={onEdit}>
              <PencilIcon />
              <span className="sr-only">Edit {account.name}</span>
            </Button>
            {account.isActive ? (
              <Button variant="ghost" size="icon" title="Close account" onClick={onClose}>
                <XCircleIcon />
                <span className="sr-only">Close {account.name}</span>
              </Button>
            ) : null}
          </span>
        ) : null}
      </div>
    </article>
  )
}

function LoadingCards() {
  return (
    <div className="space-y-8">
      {Array.from({ length: 2 }, (_, section) => (
        <div key={section} className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, card) => (
              <Skeleton key={card} className="h-[6.5rem] w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
