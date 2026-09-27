import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Money } from '@/components/Money'
import { ACCOUNT_TYPES } from '@/lib/ledger'
import { cn } from '@/lib/utils'
import type { Account } from '@/types/api'

/**
 * The account chooser, grouped by account type in balance-sheet order.
 *
 * Grouping is not decoration — picking the right account is the one step where a user can
 * silently produce a wrong-but-balanced entry, and the type headings are the cue that
 * stops "Rent" being booked against an income account.
 */
export function AccountPicker({
  accounts,
  value,
  onChange,
  excludeId,
  placeholder = 'Choose an account',
  disabled = false,
  showBalances = true,
  id,
  className,
}: {
  accounts: Account[]
  value: number | null
  onChange: (accountId: number) => void
  /** The other side of a transfer — an account cannot face itself (R6). */
  excludeId?: number | null
  placeholder?: string
  disabled?: boolean
  showBalances?: boolean
  id?: string
  className?: string
}) {
  // Inactive accounts are hidden rather than shown disabled: R16 forbids posting to them,
  // so listing them would only offer a choice the server will refuse.
  const selectable = accounts.filter((account) => account.isActive && account.id !== excludeId)

  return (
    <Select
      value={value === null ? '' : String(value)}
      onValueChange={(next) => onChange(Number(next))}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={cn(className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="min-w-[22rem]">
        {ACCOUNT_TYPES.map((meta) => {
          const group = selectable.filter((account) => account.type === meta.type)
          if (group.length === 0) return null

          return (
            <SelectGroup key={meta.type}>
              <SelectLabel className="flex items-baseline justify-between">
                <span>{meta.type}</span>
                <span className="font-normal normal-case tracking-normal">
                  {meta.normalBalance}-normal
                </span>
              </SelectLabel>
              {group.map((account) => (
                <SelectItem key={account.id} value={String(account.id)}>
                  <span className="flex items-baseline gap-2">
                    <span className="num text-faint">{account.accountNumber}</span>
                    <span>{account.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          )
        })}
        {showBalances && selectable.length === 0 ? (
          <p className="px-2 py-3 text-[0.8125rem] text-muted">No active accounts.</p>
        ) : null}
      </SelectContent>
    </Select>
  )
}

/** The current balance of the chosen account, shown beneath a picker. */
export function AccountBalanceHint({ account }: { account: Account | undefined }) {
  if (!account) return null

  return (
    <span className="flex items-baseline gap-1.5 text-[0.75rem] text-faint">
      Balance
      <Money value={account.balance} signed className="text-[0.75rem]" />
      {account.allowsNegativeBalance ? (
        <span className="text-faint">· may go negative</span>
      ) : null}
    </span>
  )
}
