import { asUtcInstant, get, post, put } from '@/api/client'
import type {
  Account,
  AccountStatement,
  AccountType,
  CreateAccountRequest,
  UpdateAccountRequest,
} from '@/types/api'

export interface AccountFilters {
  type?: AccountType
  active?: boolean
}

export function listAccounts(filters: AccountFilters = {}) {
  return get<Account[]>('/accounts', { params: filters })
}

export function getAccount(id: number) {
  return get<Account>(`/accounts/${id}`)
}

export function createAccount(body: CreateAccountRequest) {
  return post<Account>('/accounts', body)
}

export function updateAccount(id: number, body: UpdateAccountRequest) {
  return put<Account>(`/accounts/${id}`, body)
}

/** Returns 204 No Content — there is nothing to read back but the refreshed list. */
export function deactivateAccount(id: number) {
  return post<void>(`/accounts/${id}/deactivate`)
}

export interface StatementQuery {
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export function getStatement(id: number, query: StatementQuery = {}) {
  return get<AccountStatement>(`/accounts/${id}/statement`, {
    params: {
      from: asUtcInstant(query.from),
      to: asUtcInstant(query.to),
      page: query.page,
      pageSize: query.pageSize,
    },
  })
}
