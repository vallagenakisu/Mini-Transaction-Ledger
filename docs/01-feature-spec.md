# 01 — Feature Spec & Scope

**Project:** Mini Transaction Ledger
**Chosen from:** PDF problem statement #1
**Model:** Double-entry bookkeeping
**Stack:** ASP.NET Core + React + PostgreSQL (details in `02-*.md`)
**Date:** 2026-09-24

---

## 1. What the PDF asks for

> **Mini Transaction Ledger**
> - Create accounts, record debit/credit entries, compute running balances.
> - Simple REST backend (Spring Boot / .NET / Flask) + React/Angular frontend.
> - Dockerized with Postgres/SQLite.

Three verbs: **create accounts**, **record debit/credit entries**, **compute running
balances**. Everything below exists to serve those three and nothing else.

### Why this problem statement

1. **MISL builds core banking and microfinance software.** A ledger is their actual
   domain. Every design decision I make here is one they have opinions about, which
   means the viva conversation happens on ground where depth is visible.
2. It has **real invariants** — debits must equal credits, entries are immutable,
   balances are derived. Generic CRUD has no invariants to defend.
3. It forces the **money-representation** question (`decimal`, never `double`), which
   is the single most-asked fintech interview question.

---

## 2. The core decision: double-entry

### How it works

Every financial event is one **Transaction** containing **two or more JournalEntries**.
Each entry names an account, a direction (Debit or Credit), and a positive amount.

**The invariant: within a transaction, total debits must exactly equal total credits.**
If they don't, the transaction is rejected — it is never stored in an unbalanced state.

Example — paying 5,000 BDT rent from the bank account:

| Account | Direction | Amount |
|---|---|---|
| 5002 Rent Expense | Debit | 5,000.00 |
| 1002 Bank — Current Account | Credit | 5,000.00 |
| | **Totals** | **Dr 5,000 = Cr 5,000 ✓** |

### Why not single-entry

Single-entry (each row is just `+x` or `-x` on one account) satisfies the PDF's literal
wording and is less work. It was rejected because:

- It has **no self-checking property**. Double-entry's balancing rule means a corrupted
  or partial write is *detectable* — the trial balance stops balancing. That is the
  whole reason the technique has survived 500 years.
- Money always moves **from** somewhere **to** somewhere. Single-entry loses the other
  half of that fact, so you can never answer "where did this come from?"
- At a company that builds banking software, "why isn't this double-entry?" is a
  question with no good answer.

> **Viva framing:** double-entry isn't accounting trivia here — it's an *integrity
> constraint*. Treat it exactly like a foreign key: a rule the system refuses to violate.

### Normal balance — why direction alone isn't enough

A debit does not universally mean "increase". It depends on the account type:

| Account type | Normal balance | Debit does | Credit does |
|---|---|---|---|
| Asset (cash, bank, receivables) | **Debit** | increase | decrease |
| Expense (rent, salaries) | **Debit** | increase | decrease |
| Liability (payables, deposits) | **Credit** | decrease | increase |
| Equity (capital) | **Credit** | decrease | increase |
| Income (revenue, fees) | **Credit** | decrease | increase |

This table is the rule that the whole balance calculation reduces to. It comes from the
accounting equation:

```
Assets  =  Liabilities  +  Equity  +  (Income − Expenses)
```

Accounts on the left of the equals sign increase with debits; accounts on the right
increase with credits. *Memorise the equation, not the table — the table falls out of it.*

---

## 3. Actors & roles

Two roles. Resisting a third for the same reason as always: it doubles the permission
matrix for no extra marks.

| Role | Can do |
|---|---|
| **Accountant** | Log in; view the chart of accounts and balances; post transactions; view statements and the trial balance |
| **Admin** | Everything an Accountant can, **plus**: open new accounts, deactivate accounts, and **reverse** a posted transaction |

**Why reversal is Admin-only:** reversing is the only operation that changes what the
books say about the past. Posting adds to history; reversal edits the story of it.
That asymmetry is the justification — the permission boundary sits exactly where the
risk is, not on an arbitrary role string.

---

## 4. Domain entities

### 4.1 `User`

| Field | Type | Notes |
|---|---|---|
| `Id` | int | PK |
| `FullName` | string(100) | required |
| `Email` | string(150) | required, **unique index**, login identifier |
| `PasswordHash` | string | BCrypt hash — never the plaintext |
| `Role` | enum `Accountant \| Admin` | |
| `IsActive` | bool | soft-delete flag |
| `CreatedAt` | DateTime (UTC) | audit |

### 4.2 `Account` — the chart of accounts

| Field | Type | Notes |
|---|---|---|
| `Id` | int | PK (surrogate) |
| `AccountNumber` | string(10) | **unique index**, e.g. `1002` — the business key |
| `Name` | string(120) | e.g. "Bank — Current Account" |
| `Type` | enum `Asset \| Liability \| Equity \| Income \| Expense` | determines normal balance |
| `Currency` | string(3) | `BDT` — see §8 on why it's stored but single-valued |
| `AllowsNegativeBalance` | bool | default `false` for Asset accounts (see R9) |
| `IsActive` | bool | closed accounts reject new entries |
| `CreatedAt` | DateTime (UTC) | |

> **Design decision — `NormalBalance` is computed from `Type`, not stored.**
> It is a pure function of the type (`Asset`/`Expense` → Debit, else Credit). Storing it
> would let the two disagree, and there is no scenario where an Asset account has a
> credit normal balance. Derive, don't duplicate.

> **Design decision — `AccountNumber` is a separate business key from `Id`.**
> Accountants identify accounts as "1002", not "row 7". The surrogate `Id` stays
> internal for foreign keys and joins; the number is what the API and UI show. Using
> the number as the PK instead would propagate a user-visible, potentially-renumbered
> string into every FK.

### 4.3 `Transaction` — the journal entry header

| Field | Type | Notes |
|---|---|---|
| `Id` | int | PK |
| `Reference` | string(20) | **unique**, e.g. `TXN-2026-000042` — see §7 on generation |
| `Description` | string(300) | required — the narration |
| `TransactionDate` | DateOnly | the date the event *happened* |
| `PostedAt` | DateTime (UTC) | the moment it was *recorded* |
| `CreatedByUserId` | int | FK → User |
| `ReversalOfTransactionId` | int? | self-FK, set only on a reversing transaction |
| `ReversedByTransactionId` | int? | self-FK, set on the original when reversed |

> **Design decision — `TransactionDate` and `PostedAt` are different fields.**
> A transaction dated 1 September can be entered on 20 September. Reports are run *as
> of* a transaction date; the audit trail cares about posting time. Collapsing them into
> one column makes backdated entries impossible to represent honestly.
> *Good viva question to volunteer: "why two dates?"*

### 4.4 `JournalEntry` — the journal line

| Field | Type | Notes |
|---|---|---|
| `Id` | int | PK |
| `TransactionId` | int | FK → Transaction, **cascade delete** |
| `AccountId` | int | FK → Account, **restrict delete** |
| `Direction` | enum `Debit \| Credit` | |
| `Amount` | decimal(18,4) | **always > 0** |

> **Design decision — `Amount` is always positive; `Direction` carries the sign.**
> The alternative (a signed amount, no direction column) makes the balancing check
> `SUM(amount) == 0`, which looks elegant but is worse: it permits a "debit of −500",
> which is meaningless in accounting, and it loses the distinction between a credit and
> a negative debit in every report. A `CHECK (amount > 0)` constraint enforces this at
> the database level, not just in C#.

### 4.5 Relationships

```
User 1 ──< Transaction 1 ──< JournalEntry >── 1 Account
             │      ▲                            (restrict delete)
             └──────┘
       ReversalOf / ReversedBy
       (two nullable self-FKs)
```

Two things EF Core needs told explicitly, both covered in `04`/`05`:
- **Two self-referencing FKs on `Transaction`** — EF cannot pair the navigations itself.
- **`DeleteBehavior.Restrict` on `JournalEntry → Account`** — an account that has ever
  been used must not be deletable. Combined with `Cascade` on `Transaction → JournalEntry`
  (a transaction owns its lines), this also avoids SQL Server-style multiple-cascade-path
  errors and, more importantly, is simply the correct business rule.

---

## 5. Balance calculation

### 5.1 Account balance

```
rawBalance = SUM(amount WHERE direction = Debit)
           − SUM(amount WHERE direction = Credit)

balance    = normalBalance(account.Type) == Debit
               ?  rawBalance
               : −rawBalance
```

So a bank account (Asset, normal Debit) with 10,000 debited and 3,000 credited has a
balance of **7,000**. A revenue account (Income, normal Credit) with 50,000 credited and
0 debited also reports **+50,000** — positive, because it's being read on its own normal
side. This is why the sign flip exists: *every account reports a positive balance when it
behaves normally*, which is what a user expects to see.

> **Design decision — balances are derived, never stored.**
> A stored balance is a cached aggregate. It can drift from the entries that produced it,
> and keeping it correct means touching it in every post and reverse path. Deriving it
> means it is **correct by construction**. The escape hatch at scale is a periodic
> snapshot row (balance as of a closing date) plus entries since — but that's an
> optimisation to name when asked, not to build now.

### 5.2 Running balance — the PDF's third verb

For an account statement, order that account's entries deterministically and accumulate:

```
ORDER BY TransactionDate, TransactionId, JournalEntryId
```

For each entry:
```
signedDelta = (entry.Direction == normalBalance(account.Type)) ? +amount : −amount
running    += signedDelta
```

> **Why the tiebreakers matter:** ordering by date alone is non-deterministic when two
> transactions share a date — the running balance column would shuffle between page
> loads. `TransactionId` then `JournalEntryId` makes the sequence stable and reproducible.
> *This is a small detail that is very easy to get asked about and very easy to get wrong.*

**Two ways to compute it, and be ready to discuss both:**

| Approach | How | Trade-off |
|---|---|---|
| **In-memory accumulation** (chosen) | Fetch the ordered entries, run a `foreach` adding to a running total | Trivially readable and testable; requires loading the page's rows |
| **SQL window function** | `SUM(signed) OVER (PARTITION BY account_id ORDER BY ...)` | Computed in the database, scales better; harder to express in LINQ and needs raw SQL |

Chosen: in-memory, because the statement is already paged and the logic stays in the
service layer where it can be unit-tested. **Name the window function as the scaling
answer** — knowing it exists is most of the point.

### 5.3 Opening balance for a date-filtered statement

If a statement is requested `from` a date, the running balance must **start from the
balance as of the day before**, not from zero. Otherwise the column is meaningless.
That is one extra aggregate query over all entries before `from`.

*This is exactly the kind of detail that separates "I built a table" from "I built a
ledger". Do not skip it.*

---

## 6. Business rules

All of these live in the **service layer**. Database `CHECK`/`UNIQUE` constraints back up
the ones that can be expressed there — defence in depth, not either/or.

### Posting a transaction
| # | Rule |
|---|---|
| R1 | A transaction must have **at least 2** journal entries |
| R2 | **SUM(debits) must exactly equal SUM(credits)** — the core invariant |
| R3 | Every `Amount` must be **> 0** (DB `CHECK` constraint as well) |
| R4 | Every referenced account must **exist and be active** |
| R5 | `Description` is required (max 300 chars) |
| R6 | `TransactionDate` must not be in the future |
| R7 | All entries in one transaction must share the same currency |
| R8 | The same account may appear more than once in a transaction (legitimate — e.g. a split), but not twice on the same side with the same amount by accident — *this is a warning in the UI, not a hard rule* |
| R9 | An Asset account may not be driven **negative** unless `AllowsNegativeBalance` is set — this is the overdraft guard, and it is where the concurrency problem lives (§7) |

### Immutability & correction
| # | Rule |
|---|---|
| R10 | Transactions are **immutable**: there is no `PUT` and no `DELETE` on a transaction |
| R11 | A mistake is corrected by **reversing** — creating a new transaction with every debit and credit swapped, linked back via `ReversalOfTransactionId` |
| R12 | A transaction may be reversed **at most once** (guarded by `ReversedByTransactionId` already being set) |
| R13 | A reversal transaction may **not itself be reversed** |
| R14 | Only an **Admin** may reverse |

> **Why immutability, stated plainly for the viva:** a ledger is an audit trail. If a row
> can be edited or deleted, the trail proves nothing — you can no longer distinguish "this
> is what happened" from "this is what someone last decided it should look like". Reversal
> preserves both the error and the correction, which is what an auditor needs to see.
> This is also why the API has no `PUT /api/transactions/{id}`: its *absence* is a
> designed feature, and worth pointing out rather than letting it look like an omission.

### Accounts
| # | Rule |
|---|---|
| R15 | `AccountNumber` is unique (DB unique index) |
| R16 | Only an **Admin** may create or deactivate an account |
| R17 | An account with a **non-zero balance cannot be deactivated** — close it out first |
| R18 | An account's `Type` and `AccountNumber` are **immutable** after creation; only `Name` and `AllowsNegativeBalance` may be edited |
| R19 | A deactivated account rejects new entries but keeps its history readable |

> R18 exists because changing an account's type retroactively flips the sign of its
> entire history. The safe operation is to open a new account and transfer the balance.

---

## 7. The hard parts (where the marks are)

These four are worth more in the viva than any feature. Each is a known trap.

### 7.1 Money representation

- **C# `decimal`, never `double` or `float`.** Binary floating-point cannot represent
  `0.1` exactly, so `0.1 + 0.2 != 0.3`. `decimal` is base-10 and exact for the values
  money actually takes. Using `double` for currency is the canonical fintech interview
  disqualifier.
- **PostgreSQL `numeric(18,4)`**, configured via EF Core `.HasPrecision(18, 4)`.
  4 decimal places rather than 2 leaves room for fractional-unit arithmetic; display
  rounds to 2.
- **On the frontend**: JavaScript's `number` is an IEEE-754 double, so it has the exact
  problem `decimal` avoids. Mitigation: **the frontend never does money arithmetic** —
  every total, balance and running balance is computed server-side and sent ready to
  display. The one exception is the live "debits vs credits" indicator on the entry form,
  which is a UX aid only; the server re-validates R2 authoritatively.
  *Say this out loud if asked — knowing where the float risk is, and having confined it,
  is a better answer than claiming there isn't one.*

### 7.2 Atomicity

A transaction's header and all its entries must commit **together or not at all**. A
partially-written transaction is an unbalanced ledger — exactly the corruption
double-entry exists to prevent.

Implementation: wrap the post in an explicit database transaction
(`await db.Database.BeginTransactionAsync()`), insert, validate, commit; roll back on any
failure.

> **Subtle point worth raising unprompted:** a single `SaveChangesAsync()` is already
> atomic — EF Core wraps it in an implicit transaction. The explicit transaction is
> needed because the overdraft check in R9 requires a **read, then a write**, and those
> two must sit inside the same transaction for the check to mean anything. That
> distinction (implicit vs explicit, and *why* this case needs explicit) is a strong
> answer.

### 7.3 Concurrency — the R9 race condition

Two transfers of 800 from an account holding 1,000, arriving simultaneously:

```
  Request A                    Request B
  ─────────                    ─────────
  read balance → 1000
                               read balance → 1000
  1000 ≥ 800 ✓                 1000 ≥ 800 ✓
  write −800                   write −800
                               → balance is now −600, overdraft guard bypassed
```

Classic read-then-write race. Both checks passed because both read stale state.

**Chosen mitigation: a pessimistic row lock** — `SELECT ... FOR UPDATE` on the affected
account rows before computing the balance, inside the explicit transaction. The second
request blocks until the first commits, then re-reads the true balance and correctly
rejects.

Alternatives to be able to name:
- **Serializable isolation** + retry on serialization failure — more general, but needs
  retry logic and has a throughput cost.
- **Optimistic concurrency** via a version column — a natural fit in EF Core, but it
  needs a row to version, and the balance is derived rather than stored.

> Being able to *draw the interleaving above* is the whole answer. Most candidates cannot.

### 7.4 Reference number generation

`TXN-2026-000042` must be unique and gapless-ish.

- **Not** `MAX(id) + 1` — same read-then-write race as above.
- **Chosen: a PostgreSQL sequence.** Sequences are atomic and lock-free by design;
  concurrent callers are guaranteed distinct values.
- Trade-off to acknowledge: sequences can leave **gaps** on a rolled-back transaction,
  because a sequence increment is deliberately not transactional. For an internal
  reference that is fine. If the numbering were legally required to be gapless (some
  invoice regimes demand this), a sequence would be the wrong tool and you'd need a
  serialized counter table — which reintroduces the contention a sequence avoids.
- Backed by a **unique index** on `Reference` regardless, so the database is the final
  arbiter.

---

## 8. API surface (draft — finalised in `07`)

`[A]` = any authenticated user · `[Ad]` = Admin only

### Auth
| Method | Route | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | anonymous | email + password → JWT |
| GET | `/api/auth/me` | `[A]` | current user from token claims |

> No self-registration endpoint. Ledger users are provisioned, not self-served.
> Seeded demo accounts cover first login; the README publishes them.

### Accounts
| Method | Route | Access |
|---|---|---|
| GET | `/api/accounts` | `[A]` — chart of accounts with current balances; filter by type/active |
| GET | `/api/accounts/{id}` | `[A]` |
| POST | `/api/accounts` | `[Ad]` |
| PUT | `/api/accounts/{id}` | `[Ad]` — `Name` and `AllowsNegativeBalance` only (R18) |
| POST | `/api/accounts/{id}/deactivate` | `[Ad]` — rejected if balance ≠ 0 (R17) |
| GET | `/api/accounts/{id}/statement?from=&to=&page=` | `[A]` — entries **with running balance** |

### Transactions
| Method | Route | Access |
|---|---|---|
| GET | `/api/transactions?from=&to=&accountId=&page=&pageSize=` | `[A]` |
| GET | `/api/transactions/{id}` | `[A]` — header + all its entries |
| POST | `/api/transactions` | `[A]` — general journal: N balanced entries |
| POST | `/api/transactions/transfer` | `[A]` — convenience: `{fromAccountId, toAccountId, amount, description, date}` → builds the two entries server-side |
| POST | `/api/transactions/{id}/reverse` | `[Ad]` |

> **Why `POST /{id}/reverse` and not `DELETE /{id}`?**
> Because nothing is deleted. Reversal *creates* a new transaction. Modelling it as a
> resource action makes the audit trail, the permission check and the R12/R13 guards
> obvious; a `DELETE` would imply the opposite of what actually happens. Likewise
> `/transfer` exists alongside the general `POST /api/transactions` because a two-sided
> transfer is 90% of real usage and the client shouldn't have to assemble debits and
> credits by hand — **but both paths run through the same service method and the same
> validation.** The convenience endpoint is a thinner mouth on the same pipe, not a
> second implementation. *Be explicit about that — "did you duplicate the rules?" is the
> follow-up.*

### Reports
| Method | Route | Access |
|---|---|---|
| GET | `/api/reports/trial-balance?asOf=` | `[A]` |
| GET | `/api/dashboard/summary` | `[A]` |

> **The trial balance is the highest-value-per-line endpoint in the project.** It lists
> every account with its total debits and total credits as of a date, and the grand
> totals at the bottom **must be equal**. It is a handful of lines of LINQ, and it is a
> live, visible proof that the ledger's central invariant holds across the entire
> dataset. Build it, put it on screen, and open the demo with it.

---

## 9. Frontend scope

| Page | Route | Access | Contents |
|---|---|---|---|
| Login | `/login` | public | |
| Dashboard | `/` | `[A]` | Totals by account type, recent transactions, quick-transfer form |
| Chart of Accounts | `/accounts` | `[A]` | Grouped by type with balances; create/deactivate for `[Ad]` |
| Account Statement | `/accounts/:id` | `[A]` | Date filter, entries table with a **running balance column**, opening/closing balance |
| Journal | `/transactions` | `[A]` | Paged list with filters; expand a row to see its entries |
| New Entry | `/transactions/new` | `[A]` | Multi-row debit/credit form with a **live balance indicator** |
| Trial Balance | `/reports/trial-balance` | `[A]` | Every account, Dr/Cr columns, equal grand totals |

**The New Entry form is the centrepiece of the demo.** As rows are added it shows running
Dr and Cr totals and a status line — `Balanced ✓` or `Out of balance by 250.00` — with
submit disabled until it balances. It makes the invariant *visible*, which is far more
persuasive in a viva than describing it.

Cross-cutting:
- Token attached by an axios request interceptor; `401` response interceptor → `/login`
- `ProtectedRoute` (authenticated) and `AdminRoute` (role) guards
- Admin-only actions not rendered for Accountants

> Hiding a button is **UX, not security** — the server enforces every rule independently.
> Common trap question; say it before they ask.

---

## 10. Explicitly out of scope

Listing these shows the scope was *chosen*, not *missed*.

- **Multi-currency / FX** — `Currency` is stored on `Account` and validated to match
  within a transaction (R7), but only `BDT` is seeded. Real multi-currency needs rate
  tables, revaluation and a gain/loss account. The column exists so the model doesn't
  have to be rewritten later; the feature does not.
- Fiscal periods and period-close (locking a closed month against new postings)
- Balance Sheet and Income Statement reports — **trial balance only**
- Recurring / scheduled transactions
- Attachments (receipts, vouchers)
- Refresh-token rotation — short-lived JWT, re-login on expiry
- Approval workflow (maker-checker) on postings
- Soft-delete of users beyond `IsActive`
- Full audit log beyond `CreatedByUserId` + immutability + reversal linkage
- Unit tests *(revisit — see `02 §5`; a few service-layer tests on R2, R9 and the running
  balance would materially help the 20% Code Quality score)*

---

## 11. Seed data plan

So a grader sees a working ledger on first load, not an empty table.

**Chart of accounts** (standard numbering — the ranges are themselves a convention worth
explaining):

| Range | Type | Seeded |
|---|---|---|
| 1000–1999 | Asset | `1001` Cash in Hand · `1002` Bank — Current Account · `1100` Accounts Receivable |
| 2000–2999 | Liability | `2001` Accounts Payable · `2100` Customer Deposits |
| 3000–3999 | Equity | `3001` Owner's Capital |
| 4000–4999 | Income | `4001` Service Revenue · `4002` Fee Income |
| 5000–5999 | Expense | `5001` Salaries · `5002` Rent · `5003` Utilities |

**Users:** 1 Admin (`admin@misl.com`), 1 Accountant (`accountant@misl.com`).

**Transactions:** ~12 covering every shape the system supports —
capital injection (Dr Bank / Cr Capital), revenue (Dr Bank / Cr Service Revenue),
an expense (Dr Rent / Cr Bank), a transfer (Dr Cash / Cr Bank), a **3-line split**
(to prove R1 allows more than two entries), and **one reversed transaction** so the
reversal linkage is visible in the UI without the grader having to create it.

> Seeding runs on startup and is **idempotent** — it checks for existing rows before
> inserting, so restarting the container does not duplicate data. And because every
> seeded transaction is balanced, **the seeded trial balance balances**, which is the
> first thing to show in the demo.
