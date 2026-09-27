import type { AccountType, EntryDirection } from '@/types/api'

/*
  The normal-balance table from 01 §2 lives here, on the client, for one reason only:
  labelling. The UI wants to tell you that a debit *increases* Cash and *decreases*
  Accounts Payable, and that "Owner's Capital 500,000" is a credit-normal figure.

  It does not recompute balances. Every number the UI prints came from the API, which
  applied the same table server-side (01 §5.1). If the two ever disagreed the server
  would be right — this copy exists to write words next to numbers, not to produce them.
*/

interface AccountTypeMeta {
  type: AccountType
  /** The side that *increases* an account of this type. */
  normalBalance: EntryDirection
  /** Account-number range, the numbering convention seeded in 01 §11. */
  range: string
  /** Its place in the accounting equation, for the dashboard. */
  side: 'left' | 'right'
  blurb: string
}

/** Statement order — balance-sheet accounts first, then the income statement. */
export const ACCOUNT_TYPES: AccountTypeMeta[] = [
  {
    type: 'Asset',
    normalBalance: 'Debit',
    range: '1000–1999',
    side: 'left',
    blurb: 'What the business holds',
  },
  {
    type: 'Liability',
    normalBalance: 'Credit',
    range: '2000–2999',
    side: 'right',
    blurb: 'What it owes',
  },
  {
    type: 'Equity',
    normalBalance: 'Credit',
    range: '3000–3999',
    side: 'right',
    blurb: "The owners' residual claim",
  },
  {
    type: 'Income',
    normalBalance: 'Credit',
    range: '4000–4999',
    side: 'right',
    blurb: 'What it earned',
  },
  {
    type: 'Expense',
    normalBalance: 'Debit',
    range: '5000–5999',
    side: 'left',
    blurb: 'What it consumed',
  },
]

const byType = new Map(ACCOUNT_TYPES.map((meta) => [meta.type, meta]))

export function accountTypeMeta(type: AccountType): AccountTypeMeta {
  return byType.get(type) ?? ACCOUNT_TYPES[0]!
}

export function normalBalanceOf(type: AccountType): EntryDirection {
  return accountTypeMeta(type).normalBalance
}

/** Sort key so every list of types appears in the same order as ACCOUNT_TYPES. */
export function accountTypeOrder(type: AccountType): number {
  return ACCOUNT_TYPES.findIndex((meta) => meta.type === type)
}

/**
 * "Debit increases Cash in Hand" / "Credit decreases Accounts Payable" — the sentence the
 * entry form shows under each row, so the sign convention is never something the user has
 * to remember.
 */
export function effectOf(direction: EntryDirection, type: AccountType): 'increases' | 'decreases' {
  return direction === normalBalanceOf(type) ? 'increases' : 'decreases'
}

export const DIRECTIONS: EntryDirection[] = ['Debit', 'Credit']

export function abbreviate(direction: EntryDirection): 'Dr' | 'Cr' {
  return direction === 'Debit' ? 'Dr' : 'Cr'
}

export function opposite(direction: EntryDirection): EntryDirection {
  return direction === 'Debit' ? 'Credit' : 'Debit'
}
