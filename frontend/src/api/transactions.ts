import { asUtcInstant, get, post } from '@/api/client'
import type {
  CreateTransactionRequest,
  PagedResult,
  Transaction,
  TransactionListItem,
  TransferRequest,
} from '@/types/api'

export interface JournalQuery {
  from?: string
  to?: string
  accountId?: number
  page?: number
  pageSize?: number
}

export function listTransactions(query: JournalQuery = {}) {
  return get<PagedResult<TransactionListItem>>('/transactions', {
    params: {
      from: asUtcInstant(query.from),
      to: asUtcInstant(query.to),
      accountId: query.accountId,
      page: query.page,
      pageSize: query.pageSize,
    },
  })
}

export function getTransaction(id: number) {
  return get<Transaction>(`/transactions/${id}`)
}

/** The general journal: N entries the caller balanced itself (R1, R2). */
export function postTransaction(body: CreateTransactionRequest) {
  return post<Transaction>('/transactions', body)
}

/**
 * The two-sided convenience path. Same service method, same validation as `postTransaction`
 * — "a thinner mouth on the same pipe" (01 §8), not a second implementation.
 */
export function transfer(body: TransferRequest) {
  return post<Transaction>('/transactions/transfer', body)
}

/** Admin only (R14). Creates a mirrored transaction; it never deletes the original (R10). */
export function reverseTransaction(id: number) {
  return post<Transaction>(`/transactions/${id}/reverse`)
}
