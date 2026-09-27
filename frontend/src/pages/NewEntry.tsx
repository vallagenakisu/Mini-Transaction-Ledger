import { ArrowLeftIcon, PlusIcon, ScaleIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { listAccounts } from '@/api/accounts'
import { ApiError } from '@/api/client'
import { postTransaction } from '@/api/transactions'
import { AccountPicker } from '@/components/AccountPicker'
import { BalanceBeam } from '@/components/BalanceBeam'
import { Money } from '@/components/Money'
import { PageHeader } from '@/components/PageHeader'
import { FormError } from '@/components/states'
import { Button } from '@/components/ui/button'
import { AmountInput, Field, Input } from '@/components/ui/field'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel'
import { TBody, TD, TH, THead, TR, Table, TotalRow } from '@/components/ui/table'
import { useApi } from '@/hooks/useApi'
import { bumpLedgerRevision } from '@/hooks/useLedgerRevision'
import { todayInput } from '@/lib/format'
import { effectOf } from '@/lib/ledger'
import { cn } from '@/lib/utils'
import type { Account, CreateJournalEntryRequest } from '@/types/api'

/*
  The general journal entry form — the centrepiece of the demo.

  Two design decisions carry it:

  1. **No direction dropdown.** A line's amount is typed into either the Debit column or the
     Credit column, exactly as a journal is written on paper. Typing in one clears the other,
     so a line can never be both, and the direction is expressed by *where* the number is
     rather than by a control the user has to translate.

  2. **Money is compared in integer paisa, never in floats.** The running totals below are
     sums of `Math.round(value * 100)`, so `0.1 + 0.2 === 0.3` holds and the beam cannot go
     level on a rounding artefact. The server re-checks the same equality in `decimal`
     (01 §7.1) — this is the client refusing to *offer* a submission it knows is unbalanced,
     not the client deciding the rule.
*/

interface Line {
  key: number
  accountId: number | null
  debit: string
  credit: string
}

let nextKey = 0
const blankLine = (): Line => ({ key: nextKey++, accountId: null, debit: '', credit: '' })

/** Two-decimal money as an integer count of the minor unit. */
function paisa(input: string): number {
  const value = Number(input)
  if (input.trim() === '' || !Number.isFinite(value) || value <= 0) return 0
  return Math.round(value * 100)
}

export default function NewEntry() {
  const navigate = useNavigate()
  const accounts = useApi(() => listAccounts({ active: true }), [])
  const list = accounts.data ?? []

  /*
    `?account=<id>` is how an account's statement hands its own identity to this form: the
    first line arrives filled in, so an entry that began as "I need to do something with
    Cash" does not start by asking which account you meant.

    A junk value degrades to no pre-selection, and an id that is real but not postable — a
    closed account, say — is caught by the server with its own sentence. The form does not
    duplicate that check, because the list it was given only contains active accounts.
  */
  const [searchParams] = useSearchParams()
  const fromAccountId = Number(searchParams.get('account')) || null

  const [description, setDescription] = useState('')
  const [date, setDate] = useState(todayInput())
  const [lines, setLines] = useState<Line[]>(() => [
    { ...blankLine(), accountId: fromAccountId },
    blankLine(),
  ])
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const debitPaisa = lines.reduce((sum, line) => sum + paisa(line.debit), 0)
  const creditPaisa = lines.reduce((sum, line) => sum + paisa(line.credit), 0)
  const differencePaisa = debitPaisa - creditPaisa

  const entries = useMemo<CreateJournalEntryRequest[]>(
    () =>
      lines.flatMap<CreateJournalEntryRequest>((line) => {
        if (line.accountId === null) return []

        const debit = paisa(line.debit)
        if (debit > 0) {
          return [{ accountId: line.accountId, direction: 'Debit', amount: debit / 100 }]
        }

        const credit = paisa(line.credit)
        if (credit > 0) {
          return [{ accountId: line.accountId, direction: 'Credit', amount: credit / 100 }]
        }

        // A line with an account but no amount is just an unfinished row, not an error.
        return []
      }),
    [lines],
  )

  const chosen = lines
    .map((line) => list.find((account) => account.id === line.accountId))
    .filter((account): account is Account => account !== undefined)
  const currencies = [...new Set(chosen.map((account) => account.currency))]

  // Each of these is a rule the server enforces; stating them here turns a rejected POST
  // into a disabled button with a reason attached.
  const problems: string[] = []
  if (description.trim() === '') problems.push('Give the entry a description.')
  if (entries.length < 2) problems.push('An entry needs at least two lines (R1).')
  if (debitPaisa === 0 || creditPaisa === 0) problems.push('Both sides need an amount.')
  if (differencePaisa !== 0) problems.push('Debits and credits must be equal (R2).')
  if (currencies.length > 1)
    problems.push(`One currency per transaction (R7) — you have ${currencies.join(' and ')}.`)
  if (date > todayInput()) problems.push('The transaction date cannot be in the future (R6).')

  const postable = problems.length === 0

  function update(key: number, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    )
  }

  /** The balancing figure: the amount that would make the entry postable, on the short side. */
  function insertBalancingFigure() {
    if (differencePaisa === 0) return

    const amount = (Math.abs(differencePaisa) / 100).toFixed(2)
    const side = differencePaisa > 0 ? 'credit' : 'debit'

    const emptyLine = lines.find(
      (line) => paisa(line.debit) === 0 && paisa(line.credit) === 0,
    )

    if (emptyLine) {
      update(emptyLine.key, { [side]: amount } as Partial<Line>)
    } else {
      setLines((current) => [...current, { ...blankLine(), [side]: amount }])
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!postable) return

    setPending(true)
    setError(null)

    try {
      const posted = await postTransaction({
        description: description.trim(),
        transactionDate: date,
        entries,
      })

      bumpLedgerRevision()
      toast.success(`Posted ${posted.reference}`, { description: posted.description })
      navigate(`/transactions?open=${posted.id}`)
    } catch (caught: unknown) {
      // Reaching here means a rule only the server can check failed — an inactive account
      // (R4), an overdraft (R9), or a race lost to a concurrent posting. The message is the
      // server's own sentence.
      setError(caught instanceof ApiError ? caught.message : 'Could not post the entry.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-8">
      {fromAccountId ? (
        <Button variant="quiet" size="sm" asChild className="-mb-4 -ml-1">
          <Link to={`/accounts/${fromAccountId}`}>
            <ArrowLeftIcon /> Back to the account
          </Link>
        </Button>
      ) : null}

      <PageHeader
        eyebrow="Ledger"
        title="New journal entry"
      />

      <form onSubmit={handleSubmit} className="grid items-start gap-6 xl:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Panel>
            <PanelHeader eyebrow="Header" title="What this records" />
            <PanelBody className="grid gap-4 sm:grid-cols-[1fr_11rem]">
              <Field label="Description" htmlFor="entry-description">
                <Input
                  id="entry-description"
                  value={description}
                  maxLength={300}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="September office rent"
                />
              </Field>
              <Field
                label="Transaction date"
                htmlFor="entry-date"
                hint="Not in the future (R6)"
              >
                <Input
                  id="entry-date"
                  type="date"
                  value={date}
                  max={todayInput()}
                  onChange={(event) => setDate(event.target.value)}
                />
              </Field>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              eyebrow="Lines"
              title="The entry"
              actions={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLines((current) => [...current, blankLine()])}
                >
                  <PlusIcon /> Add line
                </Button>
              }
            />

            <div className="px-2 py-3">
              <Table>
                <THead>
                  <tr>
                    <TH>Account</TH>
                    <TH align="right" className="w-36">
                      <span className="text-debit">Debit</span>
                    </TH>
                    <TH align="right" className="w-36">
                      <span className="text-credit">Credit</span>
                    </TH>
                    <TH className="w-px">
                      <span className="sr-only">Remove</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {lines.map((line, index) => {
                    const account = list.find((item) => item.id === line.accountId)
                    const direction =
                      paisa(line.debit) > 0 ? 'Debit' : paisa(line.credit) > 0 ? 'Credit' : null

                    return (
                      <TR key={line.key} className="align-top">
                        <TD className="py-3">
                          <AccountPicker
                            accounts={list}
                            value={line.accountId}
                            onChange={(accountId) => update(line.key, { accountId })}
                            disabled={accounts.loading}
                            placeholder={`Line ${index + 1} account`}
                          />
                          {/* The sign convention, spelled out per line. It is the one thing
                              newcomers get wrong, and the answer depends on the account type
                              rather than on the direction alone (01 §2). */}
                          {account && direction ? (
                            <p className="mt-1.5 text-[0.75rem] text-faint">
                              {direction} {effectOf(direction, account.type) === 'increases' ? '↑' : '↓'}{' '}
                              <span className="text-muted">
                                {effectOf(direction, account.type)} {account.name}
                              </span>
                            </p>
                          ) : account ? (
                            <p className="mt-1.5 text-[0.75rem] text-faint">
                              {account.type} · {account.currency} · balance{' '}
                              <Money value={account.balance} signed className="text-[0.75rem]" />
                            </p>
                          ) : null}
                        </TD>

                        <TD className="py-3" align="right">
                          <AmountInput
                            aria-label={`Line ${index + 1} debit`}
                            value={line.debit}
                            placeholder="—"
                            className={cn(
                              paisa(line.debit) > 0 && 'border-debit/50 text-debit',
                            )}
                            onChange={(event) =>
                              // A line is one side or the other, never both.
                              update(line.key, { debit: event.target.value, credit: '' })
                            }
                          />
                        </TD>

                        <TD className="py-3" align="right">
                          <AmountInput
                            aria-label={`Line ${index + 1} credit`}
                            value={line.credit}
                            placeholder="—"
                            className={cn(
                              paisa(line.credit) > 0 && 'border-credit/50 text-credit',
                            )}
                            onChange={(event) =>
                              update(line.key, { credit: event.target.value, debit: '' })
                            }
                          />
                        </TD>

                        <TD className="py-3">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title="Remove line"
                            disabled={lines.length <= 2}
                            onClick={() =>
                              setLines((current) =>
                                current.filter((item) => item.key !== line.key),
                              )
                            }
                          >
                            <Trash2Icon />
                            <span className="sr-only">Remove line {index + 1}</span>
                          </Button>
                        </TD>
                      </TR>
                    )
                  })}

                  <TotalRow>
                    <td>
                      <span className="eyebrow">Totals</span>
                    </td>
                    <td className="text-right">
                      <Money value={debitPaisa / 100} emphasis="strong" className="text-debit" />
                    </td>
                    <td className="text-right">
                      <Money value={creditPaisa / 100} emphasis="strong" className="text-credit" />
                    </td>
                    <td />
                  </TotalRow>
                </TBody>
              </Table>
            </div>
          </Panel>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-20">
          <BalanceBeam debits={debitPaisa / 100} credits={creditPaisa / 100} />

          {differencePaisa !== 0 && (debitPaisa > 0 || creditPaisa > 0) ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={insertBalancingFigure}
            >
              <ScaleIcon /> Insert balancing figure
            </Button>
          ) : null}

          {error ? <FormError>{error}</FormError> : null}

          <Button type="submit" size="lg" className="w-full" disabled={!postable || pending}>
            {pending ? 'Posting…' : 'Post entry'}
          </Button>

          {problems.length > 0 ? (
            <div className="rounded-md border border-rule bg-sunk px-3 py-2.5">
              <p className="eyebrow mb-2">Before it can be posted</p>
              <ul className="space-y-1.5">
                {problems.map((problem) => (
                  <li
                    key={problem}
                    className="flex gap-2 text-[0.75rem] leading-relaxed text-muted"
                  >
                    <span className="mt-[0.45rem] size-1 shrink-0 rounded-full bg-rule-strong" />
                    {problem}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="px-1 text-[0.75rem] leading-relaxed text-faint">
              The server will check every rule again — balance, active accounts, currency and
              available funds — inside one database transaction, under a row lock on each
              account. Nothing is half-written.
            </p>
          )}
        </aside>
      </form>
    </div>
  )
}
