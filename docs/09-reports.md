# 09 — Reports

**Step 9 of 13.** Previous: `08-transactions-and-posting.md` (posting, locking, reversal ✅).
Next: `10-frontend.md`.
**Date:** 2026-09-26
**Goal:** turn the ledger's central invariant into something you can *look at*. The trial
balance is described in `01 §8` as "the highest-value-per-line endpoint in the project" — it
lists every account's debits and credits as of a date, and the grand totals at the bottom must
be equal. The dashboard summary is the same data aggregated one level up, for the landing page.

Unlike steps 7 and 8, this step is **already implemented** in the repository. Read it as the
explanation of code that exists, not as instructions to type. The reasoning is the point: this
is the step where `01 §1`'s claim — "a partial write is *detectable*, the trial balance stops
balancing" — stops being a promise and becomes an endpoint.

This step produces:

```
backend/Ledger/Ledger/
├── Dtos/Reports/
│   ├── TrialBalanceDto.cs          (TrialBalanceLineDto — one row per account)
│   ├── TrialBalanceReportDto.cs    (the report: grand totals + IsBalanced + lines)
│   ├── AccountTypeTotalDto.cs
│   └── DashboardSummaryDto.cs
├── Services/
│   ├── IReportService.cs
│   └── ReportService.cs
├── Controllers/
│   ├── ReportsController.cs        (GET /api/reports/trial-balance)
│   └── DashboardController.cs      (GET /api/dashboard/summary)
├── Data/DbSeeder.cs                (modified — five demo transactions)
└── Program.cs                      (modified — DI)
```

**Why this step is short.** Every hard problem was solved earlier. Balances are derived, not
stored (`01 §5.1`), so there is no cache to invalidate. Posting is atomic and balanced
(`08 §6.1`), so the totals cannot be half-written. Reports are therefore pure reads over data
that is already correct by construction — the only genuine engineering decisions left are
*which* aggregate to compute, and doing it in a fixed number of queries.

---

## 1. The one real design decision — which trial balance?

There are two conventions, and they are not the same report. Getting asked "why this one?" is
the most likely viva question in this step.

| Convention | Each account shows | Grand totals equal because |
|---|---|---|
| **Sum** (built) | total of all its debit entries, total of all its credit entries | every transaction balances (R2), so summing all debits over the whole ledger must equal summing all credits |
| **Net** | one figure, in the Dr or Cr column depending on which side its balance falls | the accounting equation: Assets + Expenses = Liabilities + Equity + Income |

`01 §8` specifies the first: *"lists every account with its total debits and total credits as of
a date"*. That is what the endpoint returns — but each row **also** carries `balance`, the net
figure on the account's normal side, because it is free (the numbers are already in hand) and
it is what the screen actually wants to show in a "Balance" column.

So the response serves both readings, and the distinction is worth stating out loud:

> **The sum convention's grand totals are, strictly, a tautology.** If every transaction
> balances, then total debits *must* equal total credits — arithmetic guarantees it. That does
> not make the report useless; it makes it a **checksum**. It cannot fail while the data is
> intact, so if it *ever* fails, something has gone wrong that no amount of application logic
> was guarding: a partial write, a direct SQL edit, a corrupted restore. `01 §1` names exactly
> this as the reason the double-entry shape was chosen. A check that can only fail when
> something is truly broken is precisely the check you want.

The net convention proves something different and arguably stronger — that the accounting
equation holds. You can read that off the built response too, by summing `balance` per type,
which is what the dashboard's `totalsByType` does. From the verified output below:

```
Assets 500,000 + Expenses 125,000            = 625,000
Liabilities 0 + Equity 500,000 + Income 125,000 = 625,000   ✓
```

---

## 2. DTOs

`Dtos/Reports/TrialBalanceDto.cs` — one row per account:

```csharp
namespace Ledger.Dtos.Reports;

public record TrialBalanceLineDto(
    int AccountId,
    string AccountNumber,
    string AccountName,
    string Type,
    decimal TotalDebits,
    decimal TotalCredits,
    decimal Balance);
```

`Dtos/Reports/TrialBalanceReportDto.cs`:

```csharp
namespace Ledger.Dtos.Reports;

public record TrialBalanceReportDto(
    DateTime AsOf,
    decimal TotalDebits,
    decimal TotalCredits,
    bool IsBalanced,
    IReadOnlyList<TrialBalanceLineDto> Lines);
```

`IsBalanced` is the field the whole project points at. It is computed server-side rather than
left to the client to compare two numbers, so that there is **one** definition of "balanced" and
the frontend cannot accidentally introduce a tolerance.

`AsOf` is echoed back deliberately: the caller may omit it, and a report whose date is implicit
is a report you cannot file or screenshot meaningfully.

`Dtos/Reports/AccountTypeTotalDto.cs` and `DashboardSummaryDto.cs`:

```csharp
namespace Ledger.Dtos.Reports;

public record AccountTypeTotalDto(
    string Type,
    int AccountCount,
    decimal Total);
```

```csharp
namespace Ledger.Dtos.Reports;

using Ledger.Dtos.Transactions;

public record DashboardSummaryDto(
    DateTime AsOf,
    int AccountCount,
    int TransactionCount,
    decimal TotalDebits,
    decimal TotalCredits,
    bool IsBalanced,
    IReadOnlyList<AccountTypeTotalDto> TotalsByType,
    IReadOnlyList<TransactionListItemDto> RecentTransactions);
```

> **Note the reuse.** `RecentTransactions` is `TransactionListItemDto` — step 8's journal-row
> shape, unchanged. A `RecentTransactionDto` would have been a second copy of the same six
> fields, needing the same edit every time the journal row changes. `01 §9` describes the
> dashboard's recent list and the journal page as the same information at different lengths, so
> they share the type.

---

## 3. `IReportService`

```csharp
namespace Ledger.Services;

using Ledger.Dtos.Reports;

public interface IReportService
{
    Task<TrialBalanceReportDto> GetTrialBalanceAsync(DateTime? asOf);

    Task<DashboardSummaryDto> GetDashboardSummaryAsync(int recentCount);
}
```

Neither method throws. There is no "not found" for a report — an empty ledger produces a valid
trial balance of all zeros, which is a correct answer and not an error. (Verified below: it
returns 11 zero rows and `isBalanced: true`.) That is why `Ledger.Exceptions` gets no new
members in this step.

---

## 4. `ReportService`

### 4.1 The trial balance

```csharp
    public async Task<TrialBalanceReportDto> GetTrialBalanceAsync(DateTime? asOf)
    {
        // Npgsql rejects Kind=Unspecified against a `timestamp with time zone` column, so a
        // caller sending `?asOf=2026-09-30` would fail without this. Normalising to UTC
        // midnight also makes the bound mean "inclusive of that whole day", because
        // PostAsync stores every TransactionDate at UTC midnight (08 §6.1).
        var asOfUtc = DateTime.SpecifyKind((asOf ?? DateTime.UtcNow).Date, DateTimeKind.Utc);

        var accounts = await _context.Accounts
            .AsNoTracking()
            .OrderBy(a => a.AccountNumber)
            .ToListAsync();

        // One GROUP BY for the entire report. The shape 07 §6 had to fix in GetAllAsync:
        // asking per account would be 11 round trips here and N on a real chart of accounts.
        var sums = await _context.JournalEntries
            .Where(e => e.Transaction.TransactionDate <= asOfUtc)
            .GroupBy(e => e.AccountId)
            .Select(g => new
            {
                AccountId = g.Key,
                Debits = g.Sum(e => e.Direction == EntryDirection.Debit ? e.Amount : 0m),
                Credits = g.Sum(e => e.Direction == EntryDirection.Credit ? e.Amount : 0m),
            })
            .ToListAsync();

        var sumsByAccount = sums.ToDictionary(s => s.AccountId);
```

Three things are load-bearing here.

**The date normalisation is the same trap step 8 hit.** A query string like `?asOf=2026-09-15`
binds to a `DateTime` with `Kind == Unspecified`, and Npgsql refuses to compare that against a
`timestamptz` column. `SpecifyKind(..., Utc)` after `.Date` fixes it *and* gives the bound a
clean meaning. Because `PostAsync` writes every `TransactionDate` at UTC midnight, `<= asOfUtc`
includes everything dated on `asOf` itself — the inclusive semantics a user expects from "as of
30 September".

**`SUM(CASE WHEN ...)` rather than two queries.** `g.Sum(e => e.Direction == Debit ? e.Amount :
0m)` translates to `SUM(CASE WHEN j."Direction" = 1 THEN j."Amount" ELSE 0.0 END)`. Both columns
come from one pass over the table. Two separate filtered aggregates would be two scans.

**The dictionary, not a join in memory.** `sums` only contains accounts that *have* entries in
range. The loop below walks `accounts` — all of them — and treats a dictionary miss as zero:

```csharp
        foreach (var account in accounts)
        {
            // An account with no entries in range is still a row — the report is the chart
            // of accounts, not just the accounts that happened to move.
            var debits = 0m;
            var credits = 0m;

            if (sumsByAccount.TryGetValue(account.Id, out var sum))
            {
                debits = sum.Debits;
                credits = sum.Credits;
            }

            // 01 §5.1 — the sign flip, so a credit-normal account reads positive when it
            // behaves normally.
            var rawBalance = debits - credits;
            var balance = account.Type.NormalBalance() == EntryDirection.Debit
                ? rawBalance
                : -rawBalance;

            grandDebits += debits;
            grandCredits += credits;

            lines.Add(new TrialBalanceLineDto(
                account.Id, account.AccountNumber, account.Name,
                account.Type.ToString(), debits, credits, balance));
        }
```

> **Why every account, including the silent ones?** `01 §9` calls the page "Every account, Dr/Cr
> columns". There is also a correctness reason to never filter by activity: an account with
> entries *must* appear or the grand totals stop matching the underlying data. Including all
> accounts makes that impossible to get wrong by accident — you cannot write a filter that
> accidentally drops a moved account if there is no filter.

And the return:

```csharp
        return new TrialBalanceReportDto(
            asOfUtc,
            grandDebits,
            grandCredits,

            // Exact decimal equality, deliberately. This is the assertion the whole project
            // exists to keep true (01 §1); a tolerance here would hide the very drift it is
            // supposed to detect.
            IsBalanced: grandDebits == grandCredits,
            lines);
    }
```

`grandDebits == grandCredits` on `decimal` is exact — the reason `01 §7.1` rules out `double`
for money. With `double`, accumulating a few hundred amounts could leave the two sums differing
in the last bit and turn `IsBalanced` into a coin flip. With `decimal`, equality means equality.

### 4.2 The dashboard summary

The totals-by-type computation normalises each account's balance *first*, then groups:

```csharp
        var balanceByAccount = accounts.ToDictionary(
            a => a.Id,
            a =>
            {
                var raw = rawByAccount.TryGetValue(a.Id, out var value) ? value : 0m;
                return a.Type.NormalBalance() == EntryDirection.Debit ? raw : -raw;
            });

        var totalsByType = accounts
            .GroupBy(a => a.Type)
            .OrderBy(g => g.Key)
            .Select(g => new AccountTypeTotalDto(
                g.Key.ToString(),
                g.Count(),
                g.Sum(a => balanceByAccount[a.Id])))
            .ToList();
```

Normalising before grouping keeps the sign flip in exactly one expression. Doing it inside the
`Sum` lambda would work, but it puts a conditional inside an aggregate inside a projection, and
that is where sign bugs hide.

`AccountCount` per type is included because a type showing `0` is ambiguous otherwise — is it
"no accounts of this type" or "accounts that net to zero"? In the verified output, Liability
shows `accountCount: 2, total: 0`, which reads correctly as the second.

Recent transactions delegate rather than re-query:

```csharp
        // "Recent transactions" is page 1 of the journal, which ITransactionService already
        // orders and projects. Calling it costs one query and avoids a second copy of the
        // list projection that would then have to be kept in step with the journal page.
        var recentPage = await _transactionService.GetAllAsync(
            from: null, to: null, accountId: null, page: 1, pageSize: recentCount);
```

This is the same argument as `TransferAsync` delegating to `PostAsync` in `08 §6.5`: one
implementation, thinner mouth. It also yields `TransactionCount` for free — `recentPage
.TotalCount` is the journal's total, already computed by the same call.

> **A service depending on another service.** `ReportService` takes `ITransactionService` in its
> constructor. That is fine here because the dependency is one-directional and on the *read*
> path — reports read the journal; the journal knows nothing about reports. If it ever became
> mutual, the fix is to push the shared projection down into a query object both call, not to
> add a third service that wraps both.

---

## 5. Controllers

Two controllers, because `01 §8` specifies two different route prefixes and a controller should
mirror its prefix. `ReportsController`:

```csharp
[ApiController]
[Route("api/reports")]
[Authorize]
public class ReportsController : ControllerBase
{
    // ...
    [HttpGet("trial-balance")]
    public async Task<ActionResult<TrialBalanceReportDto>> GetTrialBalance(
        [FromQuery] DateTime? asOf) =>
        Ok(await _reportService.GetTrialBalanceAsync(asOf));
}
```

`DashboardController` adds one guard:

```csharp
    [HttpGet("summary")]
    public async Task<ActionResult<DashboardSummaryDto>> GetSummary([FromQuery] int recent = 5)
    {
        // Clamped rather than rejected, matching the paging guards in the other two
        // controllers: a dashboard widget asking for a silly number gets the default, not
        // a 400 that blanks the whole page.
        if (recent is < 1 or > 50)
        {
            recent = 5;
        }

        return Ok(await _reportService.GetDashboardSummaryAsync(recent));
    }
```

Both are `[Authorize]` with no role restriction — `01 §8` marks both endpoints `[A]`. An
Accountant who may post entries can certainly read what they add up to; restricting reports to
Admin would make the Accountant role unable to check its own work.

There is no `asOf` *validation*. A future `asOf` is harmless — R6 already prevents
future-dated transactions, so a future date simply includes everything — and a rule that can
only ever be satisfied is not worth an error path.

---

## 6. Demo data in the seeder

`08 §10` listed this as an optional loose end and tied it to this step: *"a grader opening the
app to an empty journal sees less than one opened to a working ledger"*. Five transactions now
seed alongside the chart of accounts:

```csharp
        var demoTransactions = new[]
        {
            (Description: "Owner's opening capital injection", Date: new DateTime(2026, 9, 1),
                Debit: "1001", Credit: "3001", Amount: 500_000m),
            (Description: "Move opening cash into the bank", Date: new DateTime(2026, 9, 2),
                Debit: "1002", Credit: "1001", Amount: 300_000m),
            (Description: "Consulting fees received", Date: new DateTime(2026, 9, 10),
                Debit: "1002", Credit: "4001", Amount: 125_000m),
            (Description: "September office rent", Date: new DateTime(2026, 9, 15),
                Debit: "5002", Credit: "1002", Amount: 45_000m),
            (Description: "September salaries", Date: new DateTime(2026, 9, 20),
                Debit: "5001", Credit: "1002", Amount: 80_000m),
        };
```

They exercise all five account types, so the dashboard and trial balance both have something in
every row. Two details matter more than the numbers:

**Entities are inserted directly, not posted through `ITransactionService`.** The seeder has no
HTTP request to take a user id from, and the service exists to guard rules this hand-checked
data already satisfies. The trade-off is explicit: seeded data bypasses R1–R9, so it must be
correct by inspection. Each row is one debit and one credit of equal amount, which is the
smallest possible balanced transaction — hard to get wrong, and easy to re-check.

**References come from the same sequence.** This is the part that would have been a live bug:

```csharp
    // Drawn from the same sequence TransactionService uses, so seeded and posted references
    // share one numbering and can never collide on the unique index.
    private static async Task<string> NextReferenceAsync(AppDbContext context)
    {
        var next = await context.Database
            .SqlQueryRaw<long>("""SELECT nextval('transaction_reference_seq') AS "Value" """)
            .SingleAsync();

        return $"TXN-{DateTime.UtcNow:yyyy}-{next:D6}";
    }
```

Hard-coding `TXN-2026-000001` through `-000005` would have seeded fine and then thrown a
unique-constraint violation on the **first** transaction a user posted, because the sequence
would still be sitting at 1. Pulling from `nextval` makes seeded and posted references one
continuous run. Verified below: the first posted transaction after seeding gets
`TXN-2026-000006`.

> The format string now lives in two places (`TransactionService.NextReferenceAsync` and this
> one). That is deliberate duplication of three lines rather than a shared abstraction pulled
> through a service the seeder cannot reach — but it is the kind of duplication to *name*, not
> to forget. If a third caller ever appears, extract it then.

**This does not change an existing database.** The seeder's first line is
`if (await context.Accounts.AnyAsync()) return;`. A development database that already has the
chart of accounts will never see the demo transactions — it is skipped entirely. Only a fresh
database (a new clone, or `docker compose down -v` in step 11) gets them. That is the intended
behaviour, and it is why the verification below runs against a brand-new database.

---

## 7. Wiring

One line in `Program.cs`, beside the others:

```csharp
builder.Services.AddScoped<IReportService, ReportService>();
```

`Scoped`, like every other service — one instance per request, sharing the request's
`AppDbContext`.

---

## 8. Verifying it

All output below is real, captured against a brand-new database so the seeder ran.

### 8.1 The trial balance

```bash
curl -s $B/api/reports/trial-balance -H "Authorization: Bearer $ADMIN" | jq
```

```json
{
  "asOf": "2026-09-26T00:00:00Z",
  "totalDebits": 1050000.0000,
  "totalCredits": 1050000.0000,
  "isBalanced": true,
  "lines": [ ... 11 rows ... ]
}
```

The rows that moved:

| Account | Type | Dr | Cr | Balance |
|---|---|---|---|---|
| 1001 Cash in Hand | Asset | 500,000 | 300,000 | 200,000 |
| 1002 Bank — Current Account | Asset | 425,000 | 125,000 | 300,000 |
| 3001 Owner's Capital | Equity | 0 | 500,000 | **500,000** |
| 4001 Service Revenue | Income | 0 | 125,000 | **125,000** |
| 5001 Salaries | Expense | 80,000 | 0 | 80,000 |
| 5002 Rent | Expense | 45,000 | 0 | 45,000 |

**Read the two bold figures.** Owner's Capital has zero debits and 500,000 credits, and reports
a **positive** 500,000. So does Service Revenue. That is `01 §5.1`'s sign flip working: every
account reports positive when it behaves normally. If either showed −500,000, `NormalBalance()`
would be wrong for that type — and this report is the fastest place to see it.

`lines` has 11 entries, not 6 — the five untouched accounts appear as zero rows.

### 8.2 `asOf` is a real filter, and inclusive

```bash
curl -s "$B/api/reports/trial-balance?asOf=2026-09-02" ...
```

```json
{ "asOf": "2026-09-02T00:00:00Z", "totalDebits": 800000.0000,
  "totalCredits": 800000.0000, "isBalanced": true }
```

800,000 is the first two transactions only (500,000 + 300,000) — so the 2 September transaction
*is* included, confirming the inclusive bound. Cash shows Dr 500,000 / Cr 300,000, Bank shows Dr
300,000 / Cr 0, and the later rent and salary rows are absent.

Before any activity:

```bash
curl -s "$B/api/reports/trial-balance?asOf=2026-08-01" ...
# { "totalDebits": 0, "totalCredits": 0, "isBalanced": true, "lineCount": 11 }
```

An empty ledger balances. This is the "no error for empty" case from §3 — zeros, `true`, and all
11 account rows still present.

A bare date with no timezone returns `200`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$B/api/reports/trial-balance?asOf=2026-09-15" ...
# 200
```

That is the `SpecifyKind` fix. Without it, this exact call is a 500.

### 8.3 Access control

```bash
# accountant reads the trial balance
curl -s -o /dev/null -w "%{http_code}\n" $B/api/reports/trial-balance -H "Authorization: Bearer $ACC"
# 200

# anonymous
curl -s -o /dev/null -w "%{http_code}\n" $B/api/reports/trial-balance
# 401
```

### 8.4 The dashboard

```json
{
  "accountCount": 11,
  "transactionCount": 5,
  "totalDebits": 1050000.0000,
  "totalCredits": 1050000.0000,
  "isBalanced": true,
  "totalsByType": [
    { "type": "Asset",     "accountCount": 3, "total": 500000.0000 },
    { "type": "Liability", "accountCount": 2, "total": 0 },
    { "type": "Equity",    "accountCount": 1, "total": 500000.0000 },
    { "type": "Expense",   "accountCount": 3, "total": 125000.0000 },
    { "type": "Income",    "accountCount": 2, "total": 125000.0000 }
  ],
  "recentTransactions": [ "TXN-2026-000005 September salaries", ... ]
}
```

Check the accounting equation by hand:

```
Assets 500,000 + Expenses 125,000                = 625,000
Liabilities 0 + Equity 500,000 + Income 125,000  = 625,000   ✓
```

`recentTransactions` is newest-first (`TXN-...005` down to `...001`), which is
`ITransactionService.GetAllAsync`'s ordering — `TransactionDate` descending, then `Id`
descending — inherited for free.

The clamp works: `?recent=2` returns 2, `?recent=999` returns 5.

### 8.5 The sequence does not collide

The check that would have caught a hard-coded-reference bug:

```bash
# post a new transaction on a freshly seeded database
curl -s -X POST $B/api/transactions ... -d '{"description":"Utilities bill", ...}'
# { "id": 6, "reference": "TXN-2026-000006", "totalAmount": 12000.0000 }
```

`TXN-2026-000006` — continuing straight on from the five seeded references, no collision.

### 8.6 The report survives a reversal — and shows why reversal is not deletion

```bash
# trial balance after the new post
# { "totalDebits": 1062000.0000, "totalCredits": 1062000.0000, "isBalanced": true }

# reverse it, then look again
# { "totalDebits": 1074000.0000, "totalCredits": 1074000.0000, "isBalanced": true }
```

**Both columns grew by 12,000 — they did not shrink back to 1,050,000.** The reversal *added* a
mirrored pair of entries rather than removing the original. And the affected accounts net to
where they started:

| Account | Dr | Cr | Balance |
|---|---|---|---|
| 5003 Utilities | 12,000 | 12,000 | **0** |
| 1002 Bank | 437,000 | 137,000 | **300,000** |

This is R10–R11 made visible in one screen: the *balance* is restored, the *history* is not
erased, and the totals balance at every step. It is the single best thing to demo in the viva
after the New Entry form.

### 8.7 No N+1

Counting `Executed DbCommand` lines in the app log around one request each:

```
trial-balance queries: 2      (11 accounts — an N+1 would be 12+)
dashboard queries:     5
```

Two for the trial balance: one `SELECT ... FROM "Accounts"`, one `GROUP BY j."AccountId"`. Both
are **constant in the number of accounts** — a thousand-account chart is still two queries. Five
for the dashboard: accounts, per-account raw balances, totals by direction, and the journal page
(count + rows) from `GetAllAsync`. Also constant.

This is the `07 §6` lesson applied before the bug happened rather than after.

---

## 9. Loose ends

**`AccountsController` still uses the tuple pattern.** Carried over from `08 §10`, unchanged and
still worth doing: `AccountMutationOutcome` disappears, `AccountService` throws
`ConflictException` / `NotFoundException` / `ValidationException`, and each action collapses to
one line. The middleware has existed since step 8, so the project currently has two error styles
side by side — the most likely thing a reviewer comments on. It stays a **separate commit** on
purpose; step 7's endpoint checks are its regression suite. Nothing in step 9 depends on it.

**No Balance Sheet or Income Statement.** `01 §11` puts both out of scope. Worth knowing the
answer if asked: both are groupings of the same `totalsByType` figures the dashboard already
computes — Balance Sheet is Asset / Liability / Equity, Income Statement is Income / Expense,
and the link between them is that net income closes into equity. Naming that is enough; building
it is not in scope.

**`GetStatementAsync` still pages in memory.** Unchanged from `07`, still correct, still answered
by "a SQL window function at scale". Reports do not touch it.

---

## 10. Viva questions this step answers

**"Your trial balance's totals always match. Isn't that circular?"**
Yes, and that is the point — it is a checksum, not a discovery. Given R2 holds per transaction,
arithmetic forces the grand totals to match. So the report can only fail if something outside
the application's guarantees broke the data: a partial write, a manual SQL edit, a bad restore.
`01 §1` chose the double-entry shape specifically so that class of failure is *detectable* at
all. A check that fires only on genuine corruption is exactly the check you want.

**"Why not store each account's balance and just read it?"**
`01 §5.1` — a stored balance is a cached aggregate that can drift from the entries that produced
it, and keeping it correct means touching it in every post, transfer and reversal path. Deriving
it makes it correct by construction. The escape hatch at scale is a periodic snapshot row plus
entries since, which is an optimisation to name, not to build at this data volume.

**"Why does Owner's Capital show +500,000 when it has no debits?"**
The sign flip, `01 §5.1`. Equity is credit-normal, so its raw `Dr − Cr` of −500,000 is negated
to report positive. Every account reads positive when it behaves normally, which is what a user
expects. §8.1 of this doc is where you would notice if `NormalBalance()` were wrong.

**"How many queries does the trial balance run?"**
Two, regardless of account count — one for the chart of accounts, one `GROUP BY` over journal
entries with `SUM(CASE WHEN direction = ...)`. Measured in §8.7. The alternative, asking each
account for its balance, is the N+1 that `07 §6` had to fix in `GetAllAsync`.

**"Why `decimal` equality with no tolerance on `IsBalanced`?"**
Because `decimal` is exact for these values — that is why `01 §7.1` chose it over `double` for
money. A tolerance would suppress precisely the small discrepancies the report exists to reveal.
With `double`, summing hundreds of amounts could leave the two totals differing in the last bit
and make `IsBalanced` non-deterministic.

**"After reversing a transaction, why did the trial-balance totals go up?"**
Because a reversal adds mirrored entries; it never deletes. R10 makes the ledger append-only, so
the Dr and Cr columns both grow while the affected accounts' *balances* return to where they
started (§8.6). A ledger where a correction shrank the totals would be a ledger you could not
audit.

**"Who can see reports, and why not Admin-only?"**
Both roles, per `01 §8`. An Accountant may post transactions, so preventing them from reading
the totals of their own work would make the role unusable. Reporting is the read side of a
permission they already hold.

**"Why two controllers for two endpoints?"**
The routes have different prefixes — `/api/reports` and `/api/dashboard` — and a controller
mirrors its prefix. They share `IReportService`, so there is no duplicated logic; only the
routing surface is split, which is what keeps `10`'s frontend calls readable.

---

## 11. Out of scope for this step

- **Balance Sheet / Income Statement** — `01 §11`, see §9.
- **CSV or PDF export** — not in `01 §8`'s endpoint table.
- **Caching report output** — the reports are two and five queries over a small dataset. Caching
  a report whose entire purpose is to reflect current state is the wrong first optimisation.
- **Date-range trial balance** (`from`/`to` rather than `asOf`) — a trial balance is a
  point-in-time statement by definition; a range report is the account statement, which `07`
  already built.

---

## 12. Where this leaves the project

Steps 0–9 are done, and the backend is feature-complete against `01 §8`'s endpoint table. Every
business rule R1–R19 is either enforced in code or explicitly deferred with a reason.

Next is `10-frontend.md` — Vite, routing, `AuthContext`, the axios interceptor, and the seven
pages in `01 §9`. Two of those pages are direct consumers of this step: the Dashboard reads
`/api/dashboard/summary`, and Trial Balance reads `/api/reports/trial-balance`. Both are close
to a `fetch` and a `<table>`, which is the payoff for having done the aggregation server-side.

The centrepiece remains the New Entry form's live balance indicator — the frontend echo of the
same R2 invariant this step just put on screen.
