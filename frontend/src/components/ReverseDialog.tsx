import { useState } from 'react'
import { toast } from 'sonner'

import { ApiError } from '@/api/client'
import { reverseTransaction } from '@/api/transactions'
import { DirectionChip } from '@/components/DirectionChip'
import { bumpLedgerRevision } from '@/hooks/useLedgerRevision'
import { Money } from '@/components/Money'
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
import { TBody, TD, TR, Table } from '@/components/ui/table'
import { opposite } from '@/lib/ledger'
import type { Transaction } from '@/types/api'

/**
 * Reversal, with its consequences spelled out.
 *
 * There is no delete in this application — not hidden, not admin-only, not anywhere (R10).
 * A mistake is corrected by posting a *new* transaction with every entry mirrored, which
 * returns the balances to where they were and leaves both rows in the journal permanently.
 * The dialog previews exactly the entries that will be created, because "reverse" sounds
 * like "undo" and it is important the user sees that the ledger will get longer, not shorter.
 */
export function ReverseDialog({
  transaction,
  open,
  onOpenChange,
  onReversed,
}: {
  transaction: Transaction
  open: boolean
  onOpenChange: (open: boolean) => void
  onReversed: (reversalId: number) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleConfirm() {
    setPending(true)
    setError(null)

    try {
      const reversal = await reverseTransaction(transaction.id)
      toast.success(`Reversed as ${reversal.reference}`, {
        description: 'The original entry stays in the journal — nothing was deleted.',
      })
      bumpLedgerRevision()
      onReversed(reversal.id)
      onOpenChange(false)
    } catch (caught: unknown) {
      // 409 if it has already been reversed (R12), 403 if the caller is not an Admin (R14).
      setError(caught instanceof ApiError ? caught.message : 'Could not reverse.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse this entry?</DialogTitle>
          <DialogDescription>
            Posts a mirrored entry. <span className="num text-ink">{transaction.reference}</span> is
            kept.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-rule bg-sunk px-4 py-3">
          <p className="eyebrow mb-2">The mirrored entries</p>
          <Table>
            <TBody>
              {transaction.entries.map((entry) => (
                <TR key={entry.id}>
                  <TD className="pl-0">
                    <span className="flex items-baseline gap-2">
                      <DirectionChip direction={opposite(entry.direction)} />
                      <span className="text-[0.8125rem] text-ink">{entry.accountName}</span>
                    </span>
                  </TD>
                  <TD align="right" className="pr-0">
                    <Money value={entry.amount} className="text-[0.8125rem]" />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>

        {error ? <div className="mt-3">
          <FormError>{error}</FormError>
        </div> : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button variant="danger" onClick={handleConfirm} disabled={pending}>
            {pending ? 'Posting reversal…' : 'Post the reversal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
