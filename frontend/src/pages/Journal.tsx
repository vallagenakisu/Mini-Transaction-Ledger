import { ChevronRightIcon, PlusIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { listAccounts } from '@/api/accounts'
import { listTransactions } from '@/api/transactions'
import { AccountPicker } from '@/components/AccountPicker'
import { Money } from '@/components/Money'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { Reference, TransactionMarks } from '@/components/TransactionMarks'
import { TransactionDetail } from '@/components/TransactionDetail'
import { EmptyState, ErrorState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Field, Input, Label } from '@/components/ui/field'
import { Panel, PanelFooter, PanelHeader } from '@/components/ui/panel'
import { SkeletonRows } from '@/components/ui/skeleton'
import { TBody, TD, TH, THead, TR, Table } from '@/components/ui/table'
import { useApi } from '@/hooks/useApi'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 25

export default function Journal() {
  // `?open=<id>` is how the dashboard, the statement and a posted reversal link to a
  // specific entry, so the URL is the source of truth for which row is expanded.
  const [searchParams, setSearchParams] = useSearchParams()
  const openId = Number(searchParams.get('open')) || null

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [accountId, setAccountId] = useState<number | null>(null)
  const [page, setPage] = useState(1)

  const accounts = useApi(() => listAccounts(), [])
  const journal = useApi(
    () =>
      listTransactions({
        from: from || undefined,
        to: to || undefined,
        accountId: accountId ?? undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    [from, to, accountId, page],
  )

  const filtered = from !== '' || to !== '' || accountId !== null

  function toggle(id: number) {
    setSearchParams(openId === id ? {} : { open: String(id) }, { replace: true })
  }

  function resetFilters() {
    setFrom('')
    setTo('')
    setAccountId(null)
    setPage(1)
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Ledger"
        title="The journal"
        actions={
          <Button asChild>
            <Link to="/transactions/new">
              <PlusIcon /> New entry
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-4">
        <Field label="From" htmlFor="journal-from">
          <Input
            id="journal-from"
            type="date"
            value={from}
            className="w-[9.5rem]"
            onChange={(event) => {
              setFrom(event.target.value)
              setPage(1)
            }}
          />
        </Field>
        <Field label="To" htmlFor="journal-to">
          <Input
            id="journal-to"
            type="date"
            value={to}
            className="w-[9.5rem]"
            onChange={(event) => {
              setTo(event.target.value)
              setPage(1)
            }}
          />
        </Field>
        <div className="min-w-[16rem] space-y-1.5">
          <Label htmlFor="journal-account">Touching account</Label>
          <AccountPicker
            id="journal-account"
            accounts={accounts.data ?? []}
            value={accountId}
            onChange={(next) => {
              setAccountId(next)
              setPage(1)
            }}
            placeholder="Any account"
          />
        </div>
        {filtered ? (
          <Button variant="quiet" size="sm" onClick={resetFilters}>
            <XIcon /> Clear filters
          </Button>
        ) : null}
      </div>

      <Panel>
        <PanelHeader
          eyebrow="Transactions"
          title={filtered ? 'Filtered journal' : 'All entries'}
          meta={
            journal.data
              ? `${journal.data.totalCount} transaction${journal.data.totalCount === 1 ? '' : 's'}`
              : undefined
          }
        />

        {journal.error ? (
          <ErrorState error={journal.error} onRetry={journal.reload} />
        ) : journal.loading && !journal.data ? (
          <SkeletonRows rows={8} cols={5} />
        ) : !journal.data || journal.data.items.length === 0 ? (
          <EmptyState
            title={filtered ? 'Nothing matches those filters' : 'The journal is empty'}
            detail={
              filtered
                ? 'Try a wider date range, or clear the account filter.'
                : 'Post the first entry to get started.'
            }
            action={
              filtered ? (
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button size="sm" asChild>
                  <Link to="/transactions/new">New entry</Link>
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="px-2 py-3">
              <Table>
                <THead>
                  <tr>
                    <TH className="w-8" />
                    <TH className="w-28">Date</TH>
                    <TH className="w-40">Reference</TH>
                    <TH>Description</TH>
                    <TH className="hidden w-36 md:table-cell">Posted by</TH>
                    <TH align="right" className="w-36">
                      Amount
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {journal.data.items.map((transaction) => {
                    const isOpen = openId === transaction.id

                    return [
                      <TR
                        key={transaction.id}
                        className={cn(
                          'group cursor-pointer',
                          isOpen ? 'bg-accent/70' : 'hover:bg-accent/60',
                        )}
                        onClick={() => toggle(transaction.id)}
                      >
                        <TD className="pr-0">
                          <ChevronRightIcon
                            className={cn(
                              'size-3.5 text-faint transition-transform',
                              isOpen && 'rotate-90',
                            )}
                          />
                        </TD>
                        <TD className="num whitespace-nowrap text-[0.8125rem] text-muted">
                          {formatDate(transaction.transactionDate)}
                        </TD>
                        <TD>
                          <Reference
                            value={transaction.reference}
                            reversed={transaction.isReversed}
                          />
                        </TD>
                        <TD className="max-w-[26rem]">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-ink">{transaction.description}</span>
                            <TransactionMarks transaction={transaction} />
                          </span>
                        </TD>
                        <TD className="hidden text-[0.8125rem] text-muted md:table-cell">
                          {transaction.createdBy}
                        </TD>
                        <TD align="right">
                          <Money value={transaction.totalAmount} emphasis="strong" />
                        </TD>
                      </TR>,

                      isOpen ? (
                        <tr key={`${transaction.id}-detail`} className="border-b border-rule">
                          <td colSpan={6} className="p-0">
                            <TransactionDetail
                              transactionId={transaction.id}
                              onReversed={(reversalId) => {
                                journal.reload()
                                setSearchParams({ open: String(reversalId) }, { replace: true })
                              }}
                            />
                          </td>
                        </tr>
                      ) : null,
                    ]
                  })}
                </TBody>
              </Table>
            </div>

            <PanelFooter>
              <Pagination
                page={journal.data.page}
                pageSize={journal.data.pageSize}
                totalCount={journal.data.totalCount}
                onPageChange={setPage}
                unit="transactions"
              />
            </PanelFooter>
          </>
        )}
      </Panel>
    </div>
  )
}
