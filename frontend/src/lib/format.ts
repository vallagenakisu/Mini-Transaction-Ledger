/*
  Every amount and date in the UI is formatted here, and nowhere else.

  This module *formats*; it never *computes*. Amounts arrive from the API as JSON numbers,
  which means they are IEEE-754 doubles by the time JavaScript sees them — the exact
  `decimal` arithmetic lives in C# and Postgres (01 §7.1). The client's job is to display
  what the server worked out, and the only way to guarantee it never quietly starts doing
  money arithmetic of its own is to keep the formatting in one file and the totals on the
  server.
*/

const amountFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * `1234.5` → `"1,234.50"`. Always two decimals, always grouped.
 *
 * Grouping is the international convention (`5,00,000` would be the local Bangladeshi
 * lakh convention for the seeded BDT accounts). Chosen for consistency with the printed
 * figures in the docs and with how the API reports them; a real deployment would take
 * the grouping from the account's currency, not from the app.
 */
export function formatAmount(value: number): string {
  return amountFormat.format(value)
}

/** Signed variant, for the one place a net balance may legitimately read negative. */
export function formatSignedAmount(value: number): string {
  const formatted = amountFormat.format(Math.abs(value))
  return value < 0 ? `(${formatted})` : formatted
}

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const stampFormat = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
})

/**
 * `"2026-09-15T00:00:00Z"` → `"15 Sep 2026"`, rendered in **UTC**.
 *
 * Transaction dates are stored as UTC midnight. Formatting them in the viewer's local
 * zone would show the previous day to anyone west of Greenwich — a posting dated the 1st
 * appearing as the 31st is exactly the kind of off-by-one an auditor would find. A
 * transaction date is a calendar fact, not an instant, so it is pinned to UTC.
 */
export function formatDate(iso: string): string {
  return dayFormat.format(new Date(iso))
}

/** Timestamps (`postedAt`) are genuine instants, but shown in UTC for the same reason. */
export function formatTimestamp(iso: string): string {
  return `${stampFormat.format(new Date(iso))} UTC`
}

/** `"2026-09-15T00:00:00Z"` → `"2026-09-15"`, the value an `<input type="date">` wants. */
export function toDateInput(iso: string): string {
  return iso.slice(0, 10)
}

/** Today as `YYYY-MM-DD` in UTC — the default transaction date on the entry forms. */
export function todayInput(): string {
  return new Date().toISOString().slice(0, 10)
}

/** `"admin@misl.com"` → `"AU"`-style initials for the avatar chip. */
export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}
