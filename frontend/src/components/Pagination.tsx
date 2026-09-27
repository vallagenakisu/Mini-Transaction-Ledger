import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function Pagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  unit = 'rows',
}: {
  page: number
  pageSize: number
  totalCount: number
  onPageChange: (page: number) => void
  unit?: string
}) {
  const lastPage = Math.max(1, Math.ceil(totalCount / pageSize))
  const first = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, totalCount)

  return (
    <>
      <p className="num text-[0.8125rem] text-muted">
        {first}–{last} of {totalCount} {unit}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeftIcon />
        </Button>
        <span className="num px-2 text-[0.8125rem] text-muted">
          {page} / {lastPage}
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next page"
          disabled={page >= lastPage}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </>
  )
}
