# 10 — Frontend

**Step 10 of 13.** Previous: `09-reports.md` (trial balance, dashboard summary ✅).
Next: `11-dockerization.md`.
**Date:** 2026-09-27
**Goal:** put the seven screens from `01 §9` on top of the finished API — and make the
ledger's central invariant something you can *watch happen*, not just something the
README claims.

The backend is feature-complete. Nothing in this step adds a rule; every rule it appears
to enforce is enforced again, authoritatively, on the server. What the client adds is
**legibility**: a debit and a credit that are visibly two sides of one fact, a balance
beam that will not let you post an entry that does not balance, a reversal that visibly
makes the journal *longer*, and a trial balance that prints.

This step produces:

```
frontend/
├── index.html                       fonts, pre-paint theme script
├── vite.config.ts                   react + tailwind plugins, @ alias, /api proxy
└── src/
    ├── index.css                    design tokens, base layer, print styles
    ├── main.tsx
    ├── App.tsx                      the route table
    ├── types/api.ts                 TS mirrors of every backend DTO
    ├── lib/
    │   ├── utils.ts                 cn()
    │   ├── format.ts                every money and date string in the app
    │   └── ledger.ts                the normal-balance table, for labelling only
    ├── api/
    │   ├── session.ts               where the JWT lives, and why
    │   ├── client.ts                axios instance + both interceptors + ApiError
    │   ├── auth.ts  accounts.ts  transactions.ts  reports.ts
    ├── auth/
    │   ├── context.ts  AuthProvider.tsx  useAuth.ts  guards.tsx
    ├── hooks/
    │   ├── useApi.ts                loading / error / data, in one place
    │   ├── useLedgerRevision.ts     "something was posted" signal
    │   └── useTheme.ts
    ├── components/
    │   ├── ui/                      button, field, select, dialog, menu, panel,
    │   │                            table, badge, skeleton, toaster
    │   ├── AppShell.tsx  Wordmark.tsx  IntegrityLight.tsx  PageHeader.tsx
    │   ├── Money.tsx  DirectionChip.tsx  BalanceBeam.tsx  Pagination.tsx
    │   ├── AccountPicker.tsx  AccountDialogs.tsx
    │   ├── AccountTransferDialog.tsx  RecentJournal.tsx
    │   ├── TransactionMarks.tsx  TransactionDetail.tsx  ReverseDialog.tsx
    │   └── states.tsx               EmptyState / ErrorState / FormError
    └── pages/
        Login · Accounts · AccountStatement · Overview · Journal ·
        NewEntry · TrialBalance · NotFound
```

---

## 1. The design language, and why it is not a generic dashboard

The default shape for this kind of app is a purple-gradient SaaS dashboard: rounded cards
in a grid, an icon in a coloured circle on each one, a donut chart. It would have been
faster. It was rejected because it communicates nothing about what this system *is*, and
because in a viva "why does it look like that?" is a question with an answer worth having.

The chosen language is **ledger paper, machined**. Three ideas carry it:

### 1.1 Paper, not chrome

Warm off-white ground, hairline rules instead of borders and shadows, no zebra striping,
one radius. Tables are meant to read like a ruled ledger sheet, so depth is expressed by
the rule and by the paper tone underneath it. A shadowed card around every table turns a
ledger into a feed.

Two conventions are borrowed straight from printed accounting and are worth pointing at:

| Convention | Where | Why it matters |
|---|---|---|
| **Single rule above a total, double rule below** | `@utility total-rule`, used by `<TotalRow>` | It is the printed signal for "this is the total and nothing follows it". An accountant looks for it. |
| **A blank cell, not `0.00`** | `<Money blankZero>` in the Dr/Cr columns | A zero in a Dr column means "no debits here". Printing `0.00` eleven times down a column buries the rows that actually moved. |

### 1.2 Debit and credit each get a hue — and it is not red/green

`--debit` is indigo, `--credit` is ochre.

Red and green were rejected deliberately. In accounting a debit is not "bad" and a credit
is not "good" — they are *directions*, and which one increases an account depends on the
account's type (`01 §2`). Colouring them red and green teaches the user something false,
and it burns the two colours that genuinely mean loss and profit on a distinction that
means neither. Red (`--danger`) is reserved for refusals and for the reversal stamp;
green (`--balanced`) is reserved for one thing only: debits equal credits.

The same two hues appear on the `Dr`/`Cr` chips, the amount inputs on the entry form, the
journal's two columns, the trial balance's two columns, and the two pans of the logo.

### 1.3 Numbers are mono and tabular

`IBM Plex Mono` with `font-variant-numeric: tabular-nums` for every amount, reference and
account number; `IBM Plex Sans` for text; `Instrument Serif` for page titles. Tabular
figures are why financial print has always used them: every digit has the same advance
width, so a column of amounts aligns on the decimal point without any layout work.

Light and dark are the same palette with the tokens redefined, so the metaphor and both
hues survive the switch. The theme class is set by an inline script in `index.html`
before first paint.

---

## 2. Talking to the API: the proxy, not CORS

`vite.config.ts` proxies `/api` to `http://localhost:5086`, and `api/client.ts` uses the
**relative** base URL `/api`:

```ts
export const api = axios.create({ baseURL: '/api' })
```

So the browser only ever makes same-origin requests, and **no CORS policy is configured
on either side** — there is nothing to configure. This is not laziness dressed up: it is
the same topology as production, where nginx serves the built assets and proxies `/api`
to the backend container (`02 §4`). One less thing that behaves differently between dev
and prod, and one less place for a permissive `AllowAnyOrigin()` to end up in a repo.

> **Viva point.** "Why no CORS?" — because the API is same-origin in both environments.
> If the frontend were deployed to a different host from the API, CORS would be required
> and would need an explicit allow-list of origins, not `*`, because the API uses a
> bearer token.

### 2.1 The two interceptors

```ts
// request — the only place in the app that knows about the Authorization header
api.interceptors.request.use((config) => {
  const session = readSession()
  if (session) config.headers.Authorization = `Bearer ${session.token}`
  return config
})

// response — a 401 means the token is gone or expired: tear the session down once,
// centrally, instead of letting every page invent its own recovery
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) notifyUnauthorized()
    return Promise.reject(describe(error))
  },
)
```

`describe()` flattens an `AxiosError` into an `ApiError` carrying `status`, a `message`
and any per-field validation errors. The message is taken from the ProblemDetails `title`
the exception middleware wrote (`08 §4`) — which is the message the domain exception
itself carried. That is why the UI can show

> Account 1001 would be driven to -9799999.00; it does not allow a negative balance.

verbatim, instead of "transfer failed". The server already writes a good sentence; the
client's job is not to replace it.

The interceptor runs outside React and cannot call a hook, so `AuthProvider` registers its
own sign-out function in `session.ts` on mount and the interceptor invokes whatever is
registered. One indirection, no global navigation hack, and the teardown path is identical
whether the user clicked **Sign out** or the token simply lapsed.

### 2.2 `asUtcInstant` — a real interoperability bug, found by building the client

The journal and statement filters send `?from=2026-09-01T00:00:00Z`, not `?from=2026-09-01`.
That is not cosmetic. A bare date binds to a `DateTime` with `Kind == Unspecified`, and
Npgsql refuses to write one to a `timestamp with time zone` column:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "$AUTH" \
  'http://localhost:5286/api/transactions?from=2026-09-01'
# 500

curl -s -H "$AUTH" 'http://localhost:5286/api/transactions?from=2026-09-10T00:00:00Z'
# 200 — 3 transactions
```

`POST` bodies are safe because `TransactionService.PostAsync` re-stamps the date with
`DateTime.SpecifyKind(..., DateTimeKind.Utc)`, and `asOf` on the reports is safe for the
same reason (`09 §4`). The two *query-string* filters on `GET /api/transactions` and
`GET /api/accounts/{id}/statement` have no such normalisation, so they throw.

The client is immune because every date filter goes through one helper:

```ts
export function asUtcInstant(dateInput: string | undefined) {
  return dateInput ? `${dateInput}T00:00:00Z` : undefined
}
```

**But the API is still wrong on its own terms** — a documented query parameter answering
500 is a defect, and anyone poking at Swagger or curl will hit it. See §9.

---

## 3. Auth on the client

1. `POST /api/auth/login` → `{ token, expiresAtUtc, user }`
2. Stored in `localStorage` under one key and held in `AuthContext`
3. `AuthProvider` initialises its state **from storage during the first render**, so a
   refresh does not log you out and there is no authenticated-or-not flicker
4. Request interceptor attaches the token; response interceptor tears down on 401
5. `RequireAuth` wraps the layout route; `RequireAdmin` exists for role-gated routes

`readSession()` discards a token whose `expiresAtUtc` has already passed. A token the app
knows is stale is worse than no token: it would paint a logged-in shell and then fail
every request.

### 3.1 Token storage — the trade-off, stated as a trade-off

`localStorage` is readable by any script on the page, so it is exposed to XSS. An
`httpOnly` cookie is not — but a cookie is sent automatically, so the app then needs CSRF
protection and the cross-origin story gets harder.

Chosen: `localStorage`, with a **short token lifetime** (`Jwt:ExpiryMinutes` = 120), no
refresh-token rotation, re-login on expiry, and no `dangerouslySetInnerHTML` anywhere in
the app so the XSS surface stays small.

> Do not call this "secure". Call it a trade-off with a named mitigation. It is the most
> likely security question in the viva (`02 §3`).

### 3.2 Hiding a button is UX, not security

`RequireAdmin`, and the `isAdmin` checks that hide **Open account**, **Edit**, **Close
account** and **Reverse**, decide what to *render*. They decide nothing about what is
*allowed*. The server re-checks the role from the token's claims on every request —
`[Authorize(Roles = Roles.Admin)]` — so deleting those checks would make the app uglier,
not less safe: the request would still come back 403. Verified in §8.5.

---

## 4. `useApi` — three states, one place

No TanStack Query. Seven pages, no cache requirements worth the dependency; what the app
*does* need is that loading, failed and loaded are handled the same way everywhere, so
that no page can forget one.

The interesting part is that **`loading` is derived, not stored**:

```ts
const requestKey = JSON.stringify([...deps, nonce])
const [result, setResult] = useState({ key: null, data: null, error: null })
// ...
return {
  data: result.data,
  loading: result.key !== requestKey,   // "what I hold is not what I want"
  reload,
}
```

Two consequences worth naming:

- There is no `setLoading(true)` inside the effect, so no cascading render and nothing to
  keep in sync. React's own lint rules flag the alternative.
- `data` survives a refetch, so changing a filter dims the existing table rather than
  blanking the page.

A cleanup flag drops responses that arrive after a newer request — the journal and
statement filters fire a request per change and they do not come back in order.

Trade-off to state: a larger app would want real caching, deduplication and background
refetching, and re-implementing those here would be the wrong instinct.

### 4.1 `useLedgerRevision`

One number, in a module-level store read through `useSyncExternalStore`. Every successful
mutation calls `bumpLedgerRevision()`; the integrity light in the sidebar lists it as a
dependency. It holds no data — only the fact that the data changed. Without it, the one
piece of UI that outlives a page navigation goes stale the moment you post something,
which is worse than not having it.

---

## 5. The pieces that carry the domain

### 5.1 `<Money>` — the only component that prints an amount

Fixed two decimals, grouped, mono, tabular, right-aligned, one treatment of zero. One
component means the display rule cannot drift between the statement, the journal and the
trial balance.

It **formats and never computes**. Amounts arrive from the API as JSON numbers, which
means they are IEEE-754 doubles by the time JavaScript sees them; the exact `decimal`
arithmetic lives in C# and Postgres (`01 §7.1`). Keeping the formatting in one file and
the totals on the server is what guarantees the client never quietly starts doing money
arithmetic of its own.

One trade-off declared in the code: grouping is the international convention
(`500,000.00`), not the local Bangladeshi lakh convention (`5,00,000.00`) that `BDT` would
imply. A real deployment would take grouping from the account's currency.

### 5.2 Dates are formatted in UTC, on purpose

```ts
const dayFormat = new Intl.DateTimeFormat('en-GB', { …, timeZone: 'UTC' })
```

Transaction dates are stored as UTC midnight. Formatting them in the viewer's local zone
would show the previous day to anyone west of Greenwich — a posting dated the 1st
appearing as the 31st is exactly the off-by-one an auditor finds. A transaction date is a
*calendar fact*, not an instant, so it is pinned to UTC.

### 5.3 `lib/ledger.ts` — the normal-balance table, for labelling only

The client carries a copy of the table from `01 §2` so it can write *words* next to
numbers: "Debit ↑ increases Utilities", "Credit ↓ decreases Bank — Current Account",
"3000–3999 · Credit-normal". It never recomputes a balance. Every figure printed came
from the API, which applied the same table server-side (`01 §5.1`); if the two disagreed,
the server would be right.

### 5.4 `<BalanceBeam>` — the live indicator

R2 enforced in the service and again by the database is, stated in prose, a sentence.
Drawn as a balance that tips while you type, it becomes what the form is *about*.

- Two pans hanging off a bar that rotates about its fulcrum, tilt proportional to the
  imbalance and capped at 7°. The pans counter-rotate so they hang level — which is how a
  real balance behaves, and is the detail that makes the metaphor read.
- The status line is `Balanced ✓`, or `Out of balance by 12,000.00 — credits are short.`
- **Submit is disabled until it is level.**

The comparison is done in **integer paisa**, never in floats:

```ts
function paisa(input: string) { return Math.round(Number(input) * 100) }
```

so `0.1 + 0.2 === 0.3` holds and the beam cannot go level on a rounding artefact. Note
what this is and is not: it is the client refusing to *offer* a submission it knows is
unbalanced. The server re-checks the same equality in `decimal` regardless.

### 5.5 The entry form has no direction dropdown

A line's amount is typed into either the **Debit** column or the **Credit** column,
exactly as a journal is written on paper. Typing in one clears the other, so a line can
never be both, and the direction is expressed by *where the number is* rather than by a
control the user has to translate. `CreateJournalEntryDto.Direction` is filled in at
submit time from which column holds the figure.

There is also an **Insert balancing figure** button, which puts the difference on the
short side — the "balancing figure" an accountant would write by hand.

### 5.6 The reversal stamp

`isReversal` and `isReversed` are computed from the two self-referencing foreign keys, not
stored as flags (`08 §5`): a transaction is *reversed* because another transaction points
at it. Nothing is edited to record that, and the UI says so —

- the reversed original keeps its reference, struck through, with a slightly askew
  outlined **REVERSED** stamp;
- the new row carries **REVERSAL** and a link to the transaction it reverses;
- `ReverseDialog` previews the exact mirrored entries before you confirm, and its body
  says *"the journal gets one row longer"*, because "reverse" sounds like "undo" and it
  matters that the user sees it is not.

### 5.7 `<IntegrityLight>` — the health light in the chrome

Total debits against total credits across the entire ledger, always visible in the
sidebar. It re-reads on every navigation and after every mutation — one small aggregate
query (`09 §8.7`), which is the price of the light being live rather than decorative.

The argument for putting it in the chrome rather than only on the report: a checksum that
is only checked when you go looking for it is not much of a checksum.

---

## 6. The pages

| Page | Route | Access | What it does |
|---|---|---|---|
| Login | `/login` | public | Split screen: a line drawing of a balance at rest on the left, the form on the right. Seeded demo users are one click to fill. |
| Chart of Accounts | `/` | `[A]` | **The landing page.** Accounts as cards, grouped by type in balance-sheet order with the number range, normal balance and a subtotal. Search + type/status filters. Admin gets open / edit / close. |
| Account Statement | `/accounts/:id` | `[A]` | Opening → movement → closing, then a ruled statement with Dr, Cr and a **running balance** column — and the two posting actions, both pre-filled with this account. |
| Overview | `/overview` | `[A]` | The **accounting equation** as the headline, the Dr/Cr checksum strip, recent journal. Read-only. |
| Journal | `/transactions` | `[A]` | Paged, filterable; a row expands into its lines with a double-ruled total. `?open=<id>` is the URL for one entry. |
| New Entry | `/transactions/new` | `[A]` | The entry sheet plus the balance beam. `?account=<id>` pre-fills line one. |
| Trial Balance | `/reports/trial-balance` | `[A]` | Every account, Dr/Cr columns, equal grand totals, `asOf`, print. |

`/accounts` redirects to `/`, so links written before the chart of accounts moved to the
root still resolve.

Four choices inside those worth defending:

**The landing page is the chart of accounts, not a summary.** The first build opened on the
dashboard, with a transfer form sitting on it that asked for two accounts from a standing
start. That is not how the work begins: a session begins with "I need to do something with
*this* account", so the app opens on the accounts, and every posting route is entered from
one of them. An aggregate is something you consult, not something you are handed — which is
why the equation view still exists, at `/overview`, as a page you navigate to.

**Operations are entered from an account, and therefore arrive half-answered.** Both actions
on a statement carry the account with them: `New transaction` opens `AccountTransferDialog`
with this account already on one side, and `Journal entry` links to
`/transactions/new?account=<id>`, which seeds line one. Because this is double-entry, that
context can never be the *whole* entry — the other side is still a choice, and the dialog
asks for it explicitly rather than guessing. What it removes is the question the app already
knew the answer to.

**Which side the account sits on is a labelled choice, not an inference.** The transfer
dialog's first control is `Debited / Credited` for the account you came from, each with its
plain-English effect — "increases this account ↑" — computed from `effectOf` against the
account *type*. It defaults to the type's normal balance. This matters because debit and
increase are not synonyms and the relationship inverts between an asset and a liability
(`01 §2`); a UI that picked silently would be teaching the wrong lesson half the time.

**The overview headline is the accounting equation, not four stat tiles.** Debit-normal
types on the left, credit-normal on the right, and the two totals are equal because every
transaction put the same amount on both sides. It is the trial balance's checksum restated
in five rows — and unlike "total transactions: 5", it is a number whose meaning you can
explain.

**The statement's brought-forward line only appears on page one.** On page two the
opening balance above it is the wrong starting point, and saying nothing is better than
printing a figure that does not reconcile.

**The trial balance carries a footnote saying what it does not prove.** Equal grand totals
are a *tautology used as a checksum*: every transaction was refused unless its own debits
equalled its own credits, so the sum cannot come out unequal. The report does not prove
the books are right — an amount posted to the wrong account balances perfectly. What it
proves is that nothing wrote to the ledger outside the posting path. Saying that out loud
is more convincing than the green tick above it.

**There is no route that edits or deletes a transaction.** The absence of those screens is
the same design decision as the absence of `PUT` and `DELETE` on the API (R10).

---

## 7. Wiring

```bash
# terminal 1 — API
cd backend/Ledger/Ledger && dotnet run --launch-profile http     # http://localhost:5086

# terminal 2 — client
cd frontend && npm install && npm run dev                        # http://localhost:5173
```

`VITE_API_PROXY_TARGET` overrides the proxy target if the API is on another port.

Dependencies added in this step: `react-router-dom`, `axios`, `tailwindcss` +
`@tailwindcss/vite`, `clsx` + `tailwind-merge` + `class-variance-authority`,
`lucide-react`, `sonner`, and five Radix primitives (`slot`, `label`, `select`, `dialog`,
`dropdown-menu`). The `components/ui/*` files are shadcn-style — Radix behaviour, cva
variants, restyled onto this palette — rather than generated by the shadcn CLI, so every
token in them belongs to this design system.

Deliberately **not** added: a chart library. The overview's five proportional rules are
`div`s with a percentage width. Five numbers do not need an axis, and a donut chart would
have been the most generic thing on the page.

### 7.1 The one backend change this step made: the seeder

`DbSeeder` used to insert eleven demo accounts and five worked-example transactions, so
the app was never opened to an empty screen (`08 §12`, `09 §2`). That has been cut — it
now seeds **the two login users and nothing else**.

Two reasons, in order of weight:

1. **An operator starting a real ledger has to be able to start from nothing.** The demo
   data was not removable: deleting the accounts only lasted until the next restart.
2. **The frontend now treats zero accounts as a designed state**, not a hole to be papered
   over — the chart of accounts has a real empty state that says what to do next
   (`§6`), and it is a better first impression than eleven accounts nobody opened.

The guard moved with it, from `Accounts.AnyAsync()` to `Users.AnyAsync()`:

```csharp
if (await context.Users.AnyAsync())
{
    return;
}
```

That change is the load-bearing half. With the old guard, an operator who deleted every
account would find all eleven back after the next `dotnet run` — the seeder would see an
empty `Accounts` table and conclude the database was fresh. Accounts are now expected to
reach zero in normal use, so the guard has to key on the one table the seeder still owns
exclusively. Users are that table, and they cannot be self-served: there is no
registration endpoint by design (`01 §8`, `06 §10`), so something has to provision the
first login or nobody can sign in at all.

> **Viva point.** "Why does your seeder no longer seed the domain?" Because seed data that
> cannot be deleted is not seed data, it is a fixture — and a ledger whose chart of
> accounts reappears after you clear it is lying to its operator about who owns the
> records. The seeder's remaining job is the one thing the API deliberately refuses to do
> for itself: create a user.

---

## 8. Verifying it

Run against a throwaway database (`ledger_fe`) seeded from scratch, driven with a headless
browser so each check is a real click, not a curl. Console was clean apart from the
deliberate 409 in §8.4.

### 8.1 The three states

Every page renders skeleton rows while loading, an `ErrorState` carrying the server's
sentence with a **Try again** button, and an `EmptyState` when there is legitimately
nothing (an account with no entries, a filter that matches nothing).

### 8.2 Posting a general journal entry

Description *"Electricity bill for September"*, `5003 Utilities` debit 12,000,
`1002 Bank` credit 12,000.

- With only the debit filled: beam tilts left, status reads
  `Out of balance by 12,000.00 — credits are short.`, **Post entry** disabled, and the
  checklist shows *"Both sides need an amount"* and *"Debits and credits must be equal (R2)"*.
- With both: beam level and green, `BALANCED`, button enabled.
- Posting redirects to `/transactions?open=6` with the new entry already expanded, and
  the toast reads `Posted TXN-2026-000006`.

### 8.3 Reversal, and what it does to the numbers

| After | Ledger Dr | Ledger Cr | Transactions |
|---|---|---|---|
| seeding | 1,050,000.00 | 1,050,000.00 | 5 |
| posting the 12,000 entry | 1,062,000.00 | 1,062,000.00 | 6 |
| reversing it | 1,074,000.00 | 1,074,000.00 | 7 |

**Both columns grew.** Utilities shows `12,000.00` in the Dr column *and* `12,000.00` in
the Cr column of the trial balance, netting to `0.00`, while the journal keeps both rows —
the original struck through and stamped **REVERSED**, the new one marked **REVERSAL** with
a link back to `#6`. That is R10 and R11 visible in one screen, and it is the best thing
to show after the New Entry form.

### 8.4 R9 reaches the user intact

A transfer of 9,999,999.00 out of `1001 Cash in Hand` (balance 200,000.00), posted from
that account's own statement → HTTP 409,
rendered inline under the form:

> Account 1001 would be driven to -9799999.00; it does not allow a negative balance.

The preview above it had already spelled out the two entries the server would create
(`Dr Accounts Receivable` / `Cr Cash in Hand`), so the transfer shortcut never hides what
it does to the journal.

### 8.5 Role gating

Signed in as `accountant@misl.com`:

- Chart of accounts: no **Open account**, and no **Edit** / **Close** on any card
- Journal, expanded row: no **Reverse**
- Everything read-only still works — reports are `[A]`, not `[Ad]` (`09 §5`)

And the server does not rely on any of that: the same actions attempted directly return
403 from `[Authorize(Roles = Roles.Admin)]`.

### 8.6 Filters

`from` / `to` / account on the journal, `from` / `to` on the statement, `asOf` on the
trial balance. All send zone-aware instants (§2.2). Changing a filter resets to page 1;
clearing is one button; the previous rows stay on screen while the new ones load.

### 8.6b The account-first flow

Re-verified end to end after the landing page moved to the chart of accounts, against a
fresh throwaway database (`ledger_ui`), headless, both roles, console clean:

| Check | Result |
|---|---|
| Login redirects to | `/` — "Chart of accounts", 11 cards, nav item **Accounts** lit |
| Search `bank` | 11 cards → 1, count label follows |
| Click a card | `/accounts/1`, header actions `Journal entry` + `New transaction` |
| Transfer dialog default side | `Dr · Debited · increases this account ↑` on an Asset |
| Preview before posting | `Dr Cash in Hand 7,500.00` / `Cr Bank — Current Account 7,500.00` |
| Posting | `TXN-2026-000006`, dialog closed, closing balance 200,000 → **207,500** |
| `/transactions/new?account=1` | line one pre-selected as `1001 Cash in Hand`, back link present |
| `/overview` | read-only; equation **Holds**; strip reads 11 / 6 / 1,057,500.00 / 1,057,500.00 |
| `/accounts` (legacy) | redirects to `/` |
| Accountant | no **Open account**, no card controls — but **can** still post from an account |
| Empty ledger (all accounts deleted) | "No accounts yet" + **Open the first account**, and creating one through that CTA renders its card immediately |
| Filtered to a type with no accounts | "Nothing matches those filters" + **Reset filters** — a different sentence from the one above, deliberately |
| Dark · 430px | both hold; 0px horizontal overflow |

### 8.7 Build, types and lint

```bash
npm run build     # tsc -b && vite build — 0 errors
npx eslint .      # 0 problems
```

Bundle: 567 kB raw, **177 kB gzipped**, one chunk. Not split, because the app is seven
pages behind a login and the first navigation is the one that matters; route-level
`React.lazy` is the obvious next move if that stops being true.

### 8.8 Responsive and dark

Checked at 1440px and at 430px. Below `lg` the rail becomes a horizontal scrolling nav
strip and the two-column layouts stack; no horizontal page scroll at phone width. Dark
mode is the same palette with the tokens redefined — both ledger hues and the paper
metaphor survive.

---

## 9. Loose ends

- **`GET /api/transactions?from=2026-09-01` returns 500** (§2.2), as does the statement's
  `from`/`to`. The client never sends that shape, but the API should not answer 500 to a
  documented parameter. The fix is two lines per controller — normalise before handing it
  to the service, exactly as `PostAsync` and `GetTrialBalanceAsync` already do:

  ```csharp
  if (from is { } f) from = DateTime.SpecifyKind(f.Date, DateTimeKind.Utc);
  if (to   is { } t) to   = DateTime.SpecifyKind(t.Date, DateTimeKind.Utc);
  ```

  Worth doing as its own commit, with a curl for each shape as the check.

- **`AccountsController` still uses the tuple/`AccountMutationOutcome` pattern** while
  everything else throws typed exceptions (`08 §10`, `09 §9`). Unchanged again here. The
  client cannot tell the difference — both produce a ProblemDetails — which is precisely
  why it keeps not getting done.

- **No tests.** `02 §5` flagged three service-level tests as cheap and high-value and said
  "revisit at step 10". Still the right call and still not done; the schedule went into
  Docker. If any are written, the reversal test is the one worth having.

- **One request per page, no cache.** Navigating back to the chart of accounts refetches.
  Correct for a ledger — stale balances are worse than a spinner — but it is a choice, not
  an oversight.

- **`recent` on the overview is fixed at 8.** The API clamps it to 1–50; nothing in the
  UI exposes it.

- **The account filters are component state, not URL state.** A filtered chart of accounts
  cannot be linked to or restored by a refresh. It would be a small change to move `type`,
  `status` and the search term into `useSearchParams`, and it is the obvious next step if
  the chart ever grows past a screen; it was left out rather than half-built.

- **Search is client-side.** The chart of accounts is a bounded list already in memory, so
  a round trip per keystroke would buy nothing — but this stops being true at a few hundred
  accounts, at which point it belongs in the `GET /api/accounts` query.

- **No optimistic updates anywhere.** A posting either succeeded on the server or it did
  not, and for money that is the only honest thing to show.

---

## 10. Viva questions this step answers

**"Where is the double-entry rule enforced?"**
In `TransactionService.PostAsync`, in `decimal`, inside the database transaction — and
nowhere else. The beam on the form is a *preview* of that rule: it decides whether to
offer the submit button, not whether the entry is valid. The two comparisons are separate
implementations of the same rule on purpose, because the client cannot be trusted and the
server cannot be interactive.

**"Why does the app open on a list of accounts rather than a dashboard?"**
Because that is where the work starts. The first build opened on a summary carrying a
transfer form that asked for two accounts from a standing start — a form with no context,
on a page whose job was to report. Landing on the accounts means every posting route is
entered from the account it concerns, so one side of the entry is answered before the form
opens. The summary still exists at `/overview`; it became a page you consult rather than
the page you are handed. Note what this does *not* do: it does not make the app
single-entry. The facing account is still an explicit choice, because it has to be.

**"Why does the client have a copy of the normal-balance table?"**
To write words next to numbers — "Debit increases Cash in Hand". It never produces a
figure. Every balance on screen came from the API.

**"Why `localStorage` and not an httpOnly cookie?"**
See §3.1. Name both sides, name the mitigation, do not call it secure.

**"You hide the Reverse button from Accountants. Is that the authorization?"**
No. It is UX. The authorization is `[Authorize(Roles = Roles.Admin)]` on the action, which
reads the role from the token's claims. Remove the client check and the request comes back
403.

**"How did you avoid CORS?"**
Relative `/api` base URL plus a dev proxy, matching nginx in production. Same origin in
both environments, so there is no policy to write. If they were ever split, CORS with an
explicit origin allow-list would be required — not `*`, because of the bearer token.

**"JavaScript numbers are floats. Doesn't that break the money?"**
The client never computes money that anybody stores. `<Money>` formats; the totals come
from the server in `decimal`. The one place the client does add amounts — the live beam —
sums integer paisa, and the server re-checks the same equality before writing anything.

**"Why does the trial balance page argue against itself?"**
Because equal totals are arithmetic, not evidence. The report's real value is detecting a
write that bypassed the posting path, and claiming more than that would be the kind of
thing an examiner pulls on.

**"Why does reversing make the totals go up?"**
Because a reversal is a new transaction, not a deletion. Both columns grow by the same
amount and the affected accounts net to zero. The journal is an audit trail; it is only
ever appended to (R10).

**"Why is there no direction dropdown on the entry form?"**
Because a journal is written with two columns, and putting the number in a column is both
fewer interactions and closer to the domain. The direction is derived at submit time.

**"What would you change with more time?"**
The 500 in §9 first. Then the three service tests from `02 §5`. Then route-level code
splitting and a keyboard-driven entry form — tab through account, amount, enter to add a
line — because that is what a data-entry clerk would actually ask for.

---

## 11. Out of scope

- Client-side search across transactions (the API has no full-text endpoint)
- CSV / PDF export — `window.print()` on the trial balance is the whole export story
- Optimistic UI, offline support, a service worker
- i18n and currency-aware grouping (§5.1)
- An account tree / sub-accounts UI — the chart is flat by design (`01 §10`)
- Per-user preferences beyond the theme toggle

---

## 12. Where this leaves the project

Every endpoint in `01 §8` now has a screen, and every rule from R1 to R19 that a user can
trip over has a place where it is explained rather than merely refused.

Next is `11-dockerization.md`: multi-stage builds for both apps, nginx serving `dist/` and
proxying `/api`, Postgres with a healthcheck and a named volume, and the whole thing
behind one `docker compose up`. The frontend is already shaped for it — relative API base
URL, no build-time host configuration, and a static `dist/` with nothing server-side in it.
