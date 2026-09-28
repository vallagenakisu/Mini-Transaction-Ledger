import { CheckIcon, PrinterIcon, TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { getTrialBalance } from '@/api/reports'
import { Money } from '@/components/Money'
import { PageHeader } from '@/components/PageHeader'
import { ErrorState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Panel, PanelFooter, PanelHeader } from '@/components/ui/panel'
import { SkeletonRows } from '@/components/ui/skeleton'
import { TBody, TD, TH, THead, TR, Table, TotalRow } from '@/components/ui/table'
import { useApi } from '@/hooks/useApi'
import { formatDate, todayInput } from '@/lib/format'
import { cn } from '@/lib/utils'

export default function TrialBalance() {
  const [asOf, setAsOf] = useState('')
  const [hideDormant, setHideDormant] = useState(false)

  const report = useApi(() => getTrialBalance(asOf || undefined), [asOf])

  const lines = report.data?.lines ?? []
  const visible = hideDormant
    ? lines.filter((line) => line.totalDebits !== 0 || line.totalCredits !== 0)
    : lines
  const dormant = lines.length - visible.length

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Reports"
        title="Trial balance"
        actions={
          <>
            <Field label="As of" htmlFor="as-of">
              <Input
                id="as-of"
                type="date"
                value={asOf}
                max={todayInput()}
                className="w-[9.5rem]"
                onChange={(event) => setAsOf(event.target.value)}
              />
            </Field>
            <Button variant="outline" onClick={() => window.print()} className="print:hidden">
              <PrinterIcon /> Print
            </Button>
          </>
        }
        className="print:hidden"
      />

      {report.error ? (
        <Panel>
          <ErrorState error={report.error} onRetry={report.reload} />
        </Panel>
      ) : (
        <>
          {report.data ? <Verdict report={report.data} /> : null}

          <Panel>
            <PanelHeader
              eyebrow={
                report.data
                  ? `As of ${formatDate(report.data.asOf)} · inclusive`
                  : 'Trial balance'
              }
              title="Every account"
              actions={
                <label className="flex cursor-pointer items-center gap-2 text-[0.8125rem] text-muted print:hidden">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-[var(--debit)]"
                    checked={hideDormant}
                    onChange={(event) => setHideDormant(event.target.checked)}
                  />
                  Hide accounts with no activity
                </label>
              }
            />

            {report.loading && !report.data ? (
              <SkeletonRows rows={10} cols={5} />
            ) : (
              <div className="px-2 py-3">
                <Table>
                  <THead>
                    <tr>
                      <TH className="w-20">No.</TH>
                      <TH>Account</TH>
                      <TH className="hidden w-28 sm:table-cell">Type</TH>
                      <TH align="right" className="w-36">
                        <span className="text-debit">Debits</span>
                      </TH>
                      <TH align="right" className="w-36">
                        <span className="text-credit">Credits</span>
                      </TH>
                      <TH align="right" className="w-36">
                        Balance
                      </TH>
                    </tr>
                  </THead>
                  <TBody>
                    {visible.map((line) => (
                      <TR key={line.accountId} className="group hover:bg-accent/60">
                        <TD className="num text-[0.8125rem] text-muted">{line.accountNumber}</TD>
                        <TD>
                          <Link
                            to={`/accounts/${line.accountId}`}
                            className="text-ink underline decoration-transparent underline-offset-4 transition-colors group-hover:decoration-rule-strong"
                          >
                            {line.accountName}
                          </Link>
                        </TD>
                        <TD className="hidden text-[0.8125rem] text-muted sm:table-cell">
                          {line.type}
                        </TD>
                        <TD align="right">
                          <Money value={line.totalDebits} blankZero className="text-debit" />
                        </TD>
                        <TD align="right">
                          <Money value={line.totalCredits} blankZero className="text-credit" />
                        </TD>
                        <TD align="right">
                          <Money value={line.balance} signed emphasis="strong" />
                        </TD>
                      </TR>
                    ))}

                    {report.data ? (
                      <TotalRow>
                        <td colSpan={2}>
                          <span className="eyebrow">Grand totals</span>
                        </td>
                        <td className="hidden sm:table-cell" />
                        <td className="text-right">
                          <Money
                            value={report.data.totalDebits}
                            emphasis="strong"
                            className="text-[0.9375rem]"
                          />
                        </td>
                        <td className="text-right">
                          <Money
                            value={report.data.totalCredits}
                            emphasis="strong"
                            className="text-[0.9375rem]"
                          />
                        </td>
                        <td />
                      </TotalRow>
                    ) : null}
                  </TBody>
                </Table>
              </div>
            )}

            <PanelFooter>
              <span>
                {visible.length} of {lines.length} accounts
                {dormant > 0 ? ` · ${dormant} dormant hidden` : ''}
              </span>
              {report.data ? (
                <span className="num">
                  Difference{' '}
                  <Money
                    value={report.data.totalDebits - report.data.totalCredits}
                    className="text-[0.8125rem]"
                  />
                </span>
              ) : null}
            </PanelFooter>
          </Panel>

        </>
      )}
    </div>
  )
}

/** The verdict, large, because it is the point of the page. */
function Verdict({
  report,
}: {
  report: { totalDebits: number; totalCredits: number; isBalanced: boolean; asOf: string }
}) {
  const balanced = report.isBalanced

  return (
    <section
      className={cn(
        'grid gap-px overflow-hidden rounded-panel border bg-rule sm:grid-cols-[1fr_1fr_auto]',
        balanced ? 'border-balanced/40' : 'border-danger/45',
      )}
    >
      <div className="bg-card px-5 py-4">
        <p className="eyebrow mb-2 text-debit">Total debits</p>
        <Money value={report.totalDebits} className="text-[1.75rem]" emphasis="strong" />
      </div>
      <div className="bg-card px-5 py-4">
        <p className="eyebrow mb-2 text-credit">Total credits</p>
        <Money value={report.totalCredits} className="text-[1.75rem]" emphasis="strong" />
      </div>
      <div
        className={cn(
          'flex items-center gap-3 px-5 py-4 sm:min-w-56',
          balanced ? 'bg-balanced-wash' : 'bg-danger-wash',
        )}
      >
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full',
            balanced ? 'bg-balanced text-white' : 'bg-danger text-white',
          )}
        >
          {balanced ? (
            <CheckIcon className="size-4" strokeWidth={3} />
          ) : (
            <TriangleAlertIcon className="size-4" strokeWidth={2.5} />
          )}
        </span>
        <span>
          <span
            className={cn(
              'block text-[0.9375rem] font-medium',
              balanced ? 'text-balanced' : 'text-danger',
            )}
          >
            {balanced ? 'In balance' : 'Out of balance'}
          </span>
          <span className="block text-[0.75rem] text-muted">
            as of {formatDate(report.asOf)}
          </span>
        </span>
      </div>
    </section>
  )
}

/**
 * The honest footnote.
 *
 * The temptation is to present equal totals as if the report had discovered something. It has
 * not: because every posted transaction had equal debits and credits, summing all of them
 * must produce equal grand totals. It is arithmetic, not evidence of correct bookkeeping. Its
 * value is as a *checksum* — the only way it can fail is if something wrote to the database
 * outside the posting path, which is exactly the failure no amount of application code can
 * rule out. Saying this out loud is more convincing than the green tick.
 */
