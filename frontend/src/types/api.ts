/*
  TypeScript mirrors of the backend DTOs. Hand-written rather than generated: the set is
  small, and writing them out is what forced me to notice that the API never exposes a
  stored balance — every `balance` below is computed per request (01 §5.1).

  Casing is camelCase because that is ASP.NET Core's default JSON policy; the C# records
  are PascalCase and the serializer bridges the two.
*/

export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense'
export type EntryDirection = 'Debit' | 'Credit'
export type UserRole = 'Admin' | 'Accountant'

export interface User {
  id: number
  fullName: string
  email: string
  role: UserRole
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  fullName: string
  email: string
  password: string
}

/** A user as the admin-only user list sees it — includes status, unlike `User`. */
export interface ManagedUser extends User {
  isActive: boolean
  createdAt: string
}

export interface UpdateUserRequest {
  isActive?: boolean
  role?: UserRole
}

export interface LoginResponse {
  token: string
  expiresAtUtc: string
  user: User
}

export interface Account {
  id: number
  accountNumber: string
  name: string
  type: AccountType
  currency: string
  allowsNegativeBalance: boolean
  isActive: boolean
  /** Derived server-side from the journal, never stored (01 §5.1). */
  balance: number
}

export interface CreateAccountRequest {
  accountNumber: string
  name: string
  type: AccountType
  currency: string
  allowsNegativeBalance: boolean
}

export interface UpdateAccountRequest {
  name: string
  allowsNegativeBalance: boolean
}

export interface StatementEntry {
  transactionId: number
  reference: string
  description: string
  transactionDate: string
  direction: EntryDirection
  amount: number
  /** Cumulative, sign-corrected for the account's normal balance (01 §5.2). */
  runningBalance: number
}

export interface AccountStatement {
  accountId: number
  accountNumber: string
  accountName: string
  openingBalance: number
  closingBalance: number
  page: number
  pageSize: number
  totalCount: number
  entries: StatementEntry[]
}

export interface TransactionEntry {
  id: number
  accountId: number
  accountNumber: string
  accountName: string
  direction: EntryDirection
  amount: number
}

export interface TransactionListItem {
  id: number
  reference: string
  description: string
  transactionDate: string
  postedAt: string
  createdBy: string
  isReversal: boolean
  isReversed: boolean
  /** One side of the transaction — debits and credits are equal, so either will do. */
  totalAmount: number
}

export interface Transaction extends TransactionListItem {
  reversalOfTransactionId: number | null
  reversedByTransactionId: number | null
  entries: TransactionEntry[]
}

export interface CreateJournalEntryRequest {
  accountId: number
  direction: EntryDirection
  amount: number
}

export interface CreateTransactionRequest {
  description: string
  transactionDate: string
  entries: CreateJournalEntryRequest[]
}

export interface TransferRequest {
  fromAccountId: number
  toAccountId: number
  amount: number
  description: string
  transactionDate: string
}

export interface PagedResult<T> {
  page: number
  pageSize: number
  totalCount: number
  items: T[]
}

export interface TrialBalanceLine {
  accountId: number
  accountNumber: string
  accountName: string
  type: AccountType
  totalDebits: number
  totalCredits: number
  balance: number
}

export interface TrialBalanceReport {
  asOf: string
  totalDebits: number
  totalCredits: number
  isBalanced: boolean
  lines: TrialBalanceLine[]
}

export interface AccountTypeTotal {
  type: AccountType
  accountCount: number
  total: number
}

export interface DashboardSummary {
  asOf: string
  accountCount: number
  transactionCount: number
  totalDebits: number
  totalCredits: number
  isBalanced: boolean
  totalsByType: AccountTypeTotal[]
  recentTransactions: TransactionListItem[]
}

/** RFC 7807 — what the exception middleware writes for every domain failure (08 §4). */
export interface ProblemDetails {
  type?: string
  title?: string
  status?: number
  detail?: string
  errors?: Record<string, string[]>
}
