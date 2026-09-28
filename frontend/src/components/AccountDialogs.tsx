import { useState } from 'react'
import { toast } from 'sonner'

import { createAccount, deactivateAccount, updateAccount } from '@/api/accounts'
import { ApiError } from '@/api/client'
import { Money } from '@/components/Money'
import { bumpLedgerRevision } from '@/hooks/useLedgerRevision'
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
import { Field, Input, Label } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ACCOUNT_TYPES, accountTypeMeta } from '@/lib/ledger'
import type { Account, AccountType } from '@/types/api'

/**
 * Create, or rename. One dialog for both because R18 makes editing a strict subset of
 * creating: an account's **number, type and currency are immutable**, because the journal
 * already refers to them and changing the type would silently reinterpret the sign of every
 * entry ever posted against it. So in edit mode those three fields are shown, and locked.
 */
export function AccountDialog({
  account,
  open,
  onOpenChange,
  onSaved,
}: {
  /** Omitted for a new account. */
  account?: Account
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const editing = account !== undefined

  const [accountNumber, setAccountNumber] = useState(account?.accountNumber ?? '')
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'Asset')
  const [currency, setCurrency] = useState(account?.currency ?? 'BDT')
  const [allowsNegativeBalance, setAllowsNegativeBalance] = useState(
    account?.allowsNegativeBalance ?? false,
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const meta = accountTypeMeta(type)
  const ready = editing ? name.trim() !== '' : accountNumber.trim() !== '' && name.trim() !== ''

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!ready) return

    setPending(true)
    setError(null)

    try {
      if (editing) {
        await updateAccount(account.id, { name: name.trim(), allowsNegativeBalance })
        toast.success(`Updated ${account.accountNumber}`)
      } else {
        const created = await createAccount({
          accountNumber: accountNumber.trim(),
          name: name.trim(),
          type,
          currency: currency.trim().toUpperCase(),
          allowsNegativeBalance,
        })
        toast.success(`Opened ${created.accountNumber} ${created.name}`)
      }

      bumpLedgerRevision()
      onSaved()
      onOpenChange(false)
    } catch (caught: unknown) {
      // A duplicate account number comes back 409 from the unique index, not from a
      // pre-check — the database is the arbiter, so a concurrent create cannot slip past.
      setError(caught instanceof ApiError ? caught.message : 'Could not save the account.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit account' : 'Open an account'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <Field label="Number" htmlFor="account-number">
              <Input
                id="account-number"
                className="num"
                value={accountNumber}
                maxLength={10}
                disabled={editing}
                onChange={(event) => setAccountNumber(event.target.value)}
                placeholder="1003"
              />
            </Field>
            <Field label="Name" htmlFor="account-name">
              <Input
                id="account-name"
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                placeholder="Petty Cash"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <Field
              label="Type"
              htmlFor="account-type"
              hint={editing ? 'Immutable — R18' : `${meta.normalBalance}-normal · ${meta.blurb}`}
            >
              <Select
                value={type}
                onValueChange={(next) => setType(next as AccountType)}
                disabled={editing}
              >
                <SelectTrigger id="account-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((option) => (
                    <SelectItem key={option.type} value={option.type}>
                      {option.type}
                      <span className="num ml-2 text-[0.6875rem] text-faint">{option.range}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Currency" htmlFor="account-currency">
              <Input
                id="account-currency"
                className="num uppercase"
                value={currency}
                maxLength={3}
                disabled={editing}
                onChange={(event) => setCurrency(event.target.value)}
              />
            </Field>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-rule bg-sunk px-3 py-2.5">
            <input
              type="checkbox"
              className="mt-0.5 size-3.5 accent-[var(--debit)]"
              checked={allowsNegativeBalance}
              onChange={(event) => setAllowsNegativeBalance(event.target.checked)}
            />
            <span>
              <Label className="cursor-pointer">May go negative</Label>
              <span className="mt-1 block text-[0.75rem] leading-relaxed text-muted">
                Leave this off and the server refuses any entry that would overdraw the
                account — checked under a row lock, so two simultaneous withdrawals cannot
                both pass (R9).
              </span>
            </span>
          </label>

          {error ? <FormError>{error}</FormError> : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!ready || pending}>
              {pending ? 'Saving…' : editing ? 'Save changes' : 'Open account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Deactivation, which the server refuses unless the balance is exactly zero (R17).
 *
 * The dialog says so up front and disables the button, because the alternative — letting the
 * user click and then showing them a 400 — teaches nothing about why.
 */
export function DeactivateDialog({
  account,
  open,
  onOpenChange,
  onDone,
}: {
  account: Account
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const settled = account.balance === 0

  async function handleConfirm() {
    setPending(true)
    setError(null)

    try {
      await deactivateAccount(account.id)
      toast.success(`Closed ${account.accountNumber} ${account.name}`)
      bumpLedgerRevision()
      onDone()
      onOpenChange(false)
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Could not deactivate.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Close this account?</DialogTitle>
          <DialogDescription>
            <span className="num text-ink">{account.accountNumber}</span> {account.name} will stop
            accepting entries.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-baseline justify-between gap-4 rounded-md border border-rule bg-sunk px-3 py-2.5">
          <span className="eyebrow">Current balance</span>
          <Money value={account.balance} signed emphasis="strong" />
        </div>

        {!settled ? (
          <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
            An account with money in it cannot be closed — the balance has to go somewhere
            first, and letting it vanish would break the trial balance. Transfer it out, then
            close.
          </p>
        ) : null}

        {error ? <div className="mt-3">
          <FormError>{error}</FormError>
        </div> : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Keep open
            </Button>
          </DialogClose>
          <Button variant="danger" disabled={!settled || pending} onClick={handleConfirm}>
            {pending ? 'Closing…' : 'Close account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
