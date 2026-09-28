import { ArrowLeftIcon, PenLineIcon, SendHorizontalIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { getAccount, getStatement } from '@/api/accounts'
import { AccountTransferDialog } from '@/components/AccountTransferDialog'
import { Money } from '@/components/Money'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { EmptyState, ErrorState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Panel, PanelFooter, PanelHeader } from '@/components/ui/panel'
import { SkeletonRows } from '@/components/ui/skeleton'
import { TBody, TD, TH, THead, TR, Table, TotalRow } from '@/components/ui/table'
import { useApi } from '@/hooks/useApi'
import { formatDate } from '@/lib/format'
import { accountTypeMeta } from '@/lib/ledger'

const PAGE_SIZE = 25

export default function AccountStatement() {
  const { id } = useParams<{ id: string }>()
  const accountId = Number(id)

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [transferring, setTransferring] = useState(false)

  const account = useApi(() => getAccount(accountId), [accountId])
  const statement = useApi(
    () =>
      getStatement(accountId, {
        from: from || undefined,
        to: to || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    [accountId, from, to, page],
  )

  const meta = account.data ? accountTypeMeta(account.data.type) : null
  const filtered = from !== '' || to !== ''

  function setRange(nextFrom: string, nextTo: string) {
    setFrom(nextFrom)
    setTo(nextTo)
    setPage(1)
  }

  return (
    <div className="space-y-8">
      <div>
        <Button variant="quiet" size="sm" asChild className="mb-4 -ml-1">
          <Link to="/">
            <ArrowLeftIcon /> All accounts
          </Link>
        </Button>

        <PageHeader
          eyebrow={
            account.data
              ? `${account.data.accountNumber} · ${account.data.type} · ${meta?.normalBalance}-normal`
              : 'Statement'
          }
          title={account.data?.name ?? 'Statement'}
          /*
            The operations live here rather than on a landing page, because this is the one
            screen where the app already knows which account you mean. Both actions arrive
            with this account filled in; the only thing left to answer is the other side.

            A closed account offers neither — R16 forbids posting to an inactive account, so
            the button would exist only to be refused.
          */
          actions={
            account.data ? (
              account.data.isActive ? (
                <>
                  <Button variant="outline" asChild>
                    <Link to={`/transactions/new?account=${account.data.id}`}>
                      <PenLineIcon /> Journal entry
                    </Link>
                  </Button>
                  <Button onClick={() => setTransferring(true)}>
                    <SendHorizontalIcon /> New transaction
                  </Button>
                </>
              ) : (
                <Badge tone="outline">Closed</Badge>
              )
            ) : null
          }
        />
      </div>

      {/* Opening → movement → closing, the three figures a statement exists to reconcile. */}
      <div className="grid gap-px overflow-hidden rounded-panel border border-rule bg-rule sm:grid-cols-3">
        <Figure
          label={filtered && from ? `Opening ${formatDate(`${from}T00:00:00Z`)}` : 'Opening balance'}
          value={statement.data?.openingBalance}
        />
        <Figure
          label="Movement in period"
          value={
            statement.data
              ? statement.data.closingBalance - statement.data.openingBalance
              : undefined
          }
          hint={`${statement.data?.totalCount ?? 0} entries`}
          signed
        />
        <Figure
          label="Closing balance"
          value={statement.data?.closingBalance}
          strong
        />
      </div>

      <Panel>
        <PanelHeader
          eyebrow="Entries"
          title="Statement"
          actions={
            <div className="flex flex-wrap items-end gap-3">
              <Field label="From" htmlFor="statement-from">
                <Input
                  id="statement-from"
                  type="date"
                  value={from}
                  className="w-[9.5rem]"
                  onChange={(event) => setRange(event.target.value, to)}
                />
              </Field>
              <Field label="To" htmlFor="statement-to">
                <Input
                  id="statement-to"
                  type="date"
                  value={to}
                  className="w-[9.5rem]"
                  onChange={(event) => setRange(from, event.target.value)}
                />
              </Field>
              {filtered ? (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Clear dates"
                  onClick={() => setRange('', '')}
                >
                  <XIcon />
                </Button>
              ) : null}
            </div>
          }
        />

        {statement.error ? (
          <ErrorState error={statement.error} onRetry={statement.reload} />
        ) : statement.loading && !statement.data ? (
          <SkeletonRows rows={6} cols={5} />
        ) : !statement.data || statement.data.entries.length === 0 ? (
          <EmptyState
            title="No entries in this range"
          />
        ) : (
          <>
            <div className="px-2 py-3">
              <Table>
                <THead>
                  <tr>
                    <TH className="w-28">Date</TH>
                    <TH className="w-40">Reference</TH>
                    <TH>Description</TH>
                    <TH align="right" className="w-32">
                      Debit
                    </TH>
                    <TH align="right" className="w-32">
                      Credit
                    </TH>
                    <TH align="right" className="w-36">
                      Balance
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {/* The brought-forward line, and only on the first page — on page two the
                      figure above it would be the wrong starting point and saying so is
                      better than quietly printing a number that does not reconcile. */}
                  {page === 1 ? (
                    <TR className="text-muted">
                      <TD className="num text-[0.8125rem]">
                        {from ? formatDate(`${from}T00:00:00Z`) : '—'}
                      </TD>
                      <TD />
                      <TD className="italic">Balance brought forward</TD>
                      <TD />
                      <TD />
                      <TD align="right">
                        <Money value={statement.data.openingBalance} signed emphasis="muted" />
                      </TD>
                    </TR>
                  ) : null}

                  {statement.data.entries.map((entry, index) => (
                    <TR
                      key={`${entry.transactionId}-${index}`}
                      className="group hover:bg-accent/60"
                    >
                      <TD className="num whitespace-nowrap text-[0.8125rem] text-muted">
                        {formatDate(entry.transactionDate)}
                      </TD>
                      <TD>
                        <Link
                          to={`/transactions?open=${entry.transactionId}`}
                          className="num text-[0.8125rem] text-ink underline decoration-transparent underline-offset-4 transition-colors group-hover:decoration-rule-strong"
                        >
                          {entry.reference}
                        </Link>
                      </TD>
                      <TD className="max-w-[24rem] truncate text-ink">{entry.description}</TD>
                      <TD align="right">
                        {entry.direction === 'Debit' ? (
                          <Money value={entry.amount} className="text-debit" />
                        ) : (
                          <Money value={0} blankZero />
                        )}
                      </TD>
                      <TD align="right">
                        {entry.direction === 'Credit' ? (
                          <Money value={entry.amount} className="text-credit" />
                        ) : (
                          <Money value={0} blankZero />
                        )}
                      </TD>
                      <TD align="right">
                        <Money value={entry.runningBalance} signed emphasis="strong" />
                      </TD>
                    </TR>
                  ))}

                  <TotalRow>
                    <td colSpan={3}>
                      <span className="eyebrow">Closing balance</span>
                    </td>
                    <td />
                    <td />
                    <td className="text-right">
                      <Money value={statement.data.closingBalance} signed emphasis="strong" />
                    </td>
                  </TotalRow>
                </TBody>
              </Table>
            </div>

            <PanelFooter>
              <Pagination
                page={statement.data.page}
                pageSize={statement.data.pageSize}
                totalCount={statement.data.totalCount}
                onPageChange={setPage}
                unit="entries"
              />
            </PanelFooter>
          </>
        )}
      </Panel>

      {account.error ? <ErrorState error={account.error} onRetry={account.reload} /> : null}

      {transferring && account.data ? (
        <AccountTransferDialog
          account={account.data}
          open
          onOpenChange={setTransferring}
          onPosted={() => {
            // Both: the entry list gains a row, and the account's own balance moved.
            statement.reload()
            account.reload()
          }}
        />
      ) : null}
    </div>
  )
}

function Figure({
  label,
  value,
  hint,
  signed = false,
  strong = false,
}: {
  label: string
  value: number | undefined
  hint?: string
  signed?: boolean
  strong?: boolean
}) {
  return (
    <div className="bg-card px-5 py-4">
      <p className="eyebrow mb-2">{label}</p>
      {value === undefined ? (
        <span className="num text-xl text-faint">—</span>
      ) : (
        <Money
          value={value}
          signed={signed}
          className={strong ? 'text-2xl' : 'text-xl'}
          emphasis={strong ? 'strong' : 'normal'}
        />
      )}
      {hint ? <p className="mt-1.5 text-[0.75rem] text-faint">{hint}</p> : null}
    </div>
  )
}
