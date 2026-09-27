import { SendHorizontalIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { listAccounts } from '@/api/accounts'
import { ApiError } from '@/api/client'
import { transfer } from '@/api/transactions'
import { AccountBalanceHint, AccountPicker } from '@/components/AccountPicker'
import { DirectionChip } from '@/components/DirectionChip'
import { Money } from '@/components/Money'
import { FormError } from '@/components/states'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AmountInput, Field, Input, Label } from '@/components/ui/field'
import { useApi } from '@/hooks/useApi'
import { bumpLedgerRevision } from '@/hooks/useLedgerRevision'
import { todayInput } from '@/lib/format'
import { DIRECTIONS, effectOf, normalBalanceOf, opposite } from '@/lib/ledger'
import { cn } from '@/lib/utils'
import type { Account, EntryDirection } from '@/types/api'

/**
 * A two-sided transaction, started *from* an account.
 *
 * This replaced a context-free "quick transfer" panel that sat on the landing page with two
 * blank account pickers. The difference is not cosmetic: a transaction always has a reason,
 * and the reason is almost always "something happened to *this* account". Opening the form
 * from an account means one side is already answered, and the only question left is the one
 * the user actually came to answer — what the other side is.
 *
 * Because this is double-entry, "operate on this account" can never mean *only* this
 * account moves. So the form asks two things explicitly rather than guessing:
 *
 *   1. **Which side is this account on** — debited or credited. Defaulted to the account's
 *      normal balance (so the default on Cash is "debit / increases"), and labelled with the
 *      plain-English effect, because "debit" and "increase" are not synonyms and the
 *      relationship flips with the account type (01 §2).
 *   2. **What the other side is** — a picker that cannot offer this same account (R6).
 *
 * It posts to `POST /api/transactions/transfer`, which assembles the two entries server-side
 * and then runs the identical validated path as the general journal (01 §8) — the shortcut is
 * a thinner mouth on the same pipe, not a second implementation.
 */
export function AccountTransferDialog({
  account,
  open,
  onOpenChange,
  onPosted,
}: {
  account: Account
  open: boolean
  onOpenChange: (open: boolean) => void
  onPosted: () => void
}) {
  const accounts = useApi(() => listAccounts({ active: true }), [])

  // Default to the side that *increases* this account — the common case, and it makes the
  // sign convention the first thing the form teaches rather than something it assumes.
  const [side, setSide] = useState<EntryDirection>(() => normalBalanceOf(account.type))
  const [counterId, setCounterId] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(todayInput())
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const list = useMemo(() => accounts.data ?? [], [accounts.data])
  const counter = useMemo(
    () => list.find((item) => item.id === counterId),
    [list, counterId],
  )

  const counterSide = opposite(side)
  const parsed = Number(amount)
  const amountValid = amount.trim() !== '' && Number.isFinite(parsed) && parsed > 0
  const ready = counterId !== null && amountValid && description.trim() !== ''

  // Which account ends up on which side of the entry. The API names its two fields for the
  // *flow* of money — `to` is debited, `from` is credited — so the mapping is stated once,
  // here, rather than being re-derived at the call site.
  const debited = side === 'Debit' ? account : counter
  const credited = side === 'Debit' ? counter : account

  const sameCurrency = counter === undefined || counter.currency === account.currency

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!ready || !debited || !credited) return

    setPending(true)
    setError(null)

    try {
      const posted = await transfer({
        fromAccountId: credited.id,
        toAccountId: debited.id,
        amount: parsed,
        description: description.trim(),
        transactionDate: date,
      })

      bumpLedgerRevision()
      toast.success(`Posted ${posted.reference}`, { description: posted.description })
      onPosted()
      onOpenChange(false)
    } catch (caught: unknown) {
      // R9 arrives here as a 409 carrying the server's own sentence — "Account 1001 has a
      // balance of 30,001.00; this entry would take it to -39,999.00" — so the user is told
      // the actual constraint instead of "transfer failed".
      setError(caught instanceof ApiError ? caught.message : 'Could not post the transaction.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New transaction</DialogTitle>
          <DialogDescription>
            One side is <span className="text-ink">{account.name}</span>. Choose which side it
            sits on, then the account facing it — both halves are posted as one entry.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{account.name} is…</Label>
            <div className="grid grid-cols-2 gap-2">
              {DIRECTIONS.map((direction) => {
                const selected = side === direction
                const effect = effectOf(direction, account.type)

                return (
                  <button
                    key={direction}
                    type="button"
                    onClick={() => setSide(direction)}
                    aria-pressed={selected}
                    className={cn(
                      'rounded-md border px-3 py-2.5 text-left transition-colors',
                      selected
                        ? direction === 'Debit'
                          ? 'border-debit/55 bg-debit-wash'
                          : 'border-credit/55 bg-credit-wash'
                        : 'border-rule bg-card hover:bg-accent',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <DirectionChip direction={direction} />
                      <span className="text-[0.8125rem] font-medium text-ink">{direction}ed</span>
                    </span>
                    <span className="mt-1 block text-[0.75rem] text-muted">
                      {effect} this account {effect === 'increases' ? '↑' : '↓'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <Field
            label={`Facing account — will be ${counterSide.toLowerCase()}ed`}
            htmlFor="counter-account"
            hint={
              counter ? (
                <AccountBalanceHint account={counter} />
              ) : (
                'The other half of the entry'
              )
            }
          >
            <AccountPicker
              id="counter-account"
              accounts={list}
              value={counterId}
              onChange={setCounterId}
              excludeId={account.id}
              disabled={accounts.loading}
              placeholder="Choose the other account"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field label="Amount" htmlFor="transfer-amount">
              <AmountInput
                id="transfer-amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Field label="Date" htmlFor="transfer-date" hint="Not in the future (R6)">
              <Input
                id="transfer-date"
                type="date"
                value={date}
                max={todayInput()}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
          </div>

          <Field label="Description" htmlFor="transfer-description">
            <Input
              id="transfer-description"
              value={description}
              maxLength={300}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this entry records"
            />
          </Field>

          {/* The preview spells out the two entries the server will create, so the shortcut
              never hides what it is about to write to the journal. */}
          {debited && credited && amountValid ? (
            <div className="space-y-1.5 rounded-md border border-rule bg-sunk px-3 py-2.5">
              <p className="eyebrow">Will post</p>
              {[
                { direction: 'Debit' as EntryDirection, target: debited },
                { direction: 'Credit' as EntryDirection, target: credited },
              ].map(({ direction, target }) => (
                <p
                  key={direction}
                  className="flex items-baseline justify-between gap-3 text-[0.8125rem]"
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <DirectionChip direction={direction} />
                    <span className="truncate text-ink">{target.name}</span>
                  </span>
                  <Money
                    value={parsed}
                    className={cn(
                      'text-[0.8125rem]',
                      direction === 'Debit' ? 'text-debit' : 'text-credit',
                    )}
                  />
                </p>
              ))}
            </div>
          ) : null}

          {/* R7 is a server rule; saying it here turns a rejected POST into a visible reason. */}
          {!sameCurrency && counter ? (
            <FormError>
              One currency per transaction (R7) — {account.name} is {account.currency} and{' '}
              {counter.name} is {counter.currency}.
            </FormError>
          ) : null}

          {error ? <FormError>{error}</FormError> : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!ready || !sameCurrency || pending}>
              <SendHorizontalIcon /> {pending ? 'Posting…' : 'Post transaction'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
