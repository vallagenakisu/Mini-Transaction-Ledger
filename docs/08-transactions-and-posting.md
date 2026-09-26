# 08 — Transactions and Posting

**Step 8 of 13.** Previous: `07-accounts-and-balances.md` (accounts CRUD, balances, statement ✅).
Next: `09-reports.md`.
**Date:** 2026-09-26
**Goal:** the ledger starts accepting money. This is the hardest step in the project and the
one the viva will spend the most time on — the balancing invariant (R2), atomicity (`01 §7.2`),
the overdraft race condition (`01 §7.3`), reference-number generation (`01 §7.4`), and
reversal-instead-of-delete (R10–R14).

This is a **reference plan** — every file below has real code in it, but you type it into the
project yourself rather than have it written for you. Follow it in order; each numbered task
builds on the last, and each has something you can run and check before moving on.

This step produces:

```
backend/Ledger/Ledger/
├── Exceptions/
│   └── DomainException.cs          (+ NotFound / Validation / Conflict / Forbidden)
├── Middleware/
│   └── ExceptionHandlingMiddleware.cs
├── Dtos/
│   ├── Common/
│   │   └── PagedResult.cs
│   └── Transactions/
│       ├── CreateTransactionDto.cs
│       ├── CreateJournalEntryDto.cs
│       ├── TransferDto.cs
│       ├── TransactionDto.cs
│       ├── TransactionEntryDto.cs
│       └── TransactionListItemDto.cs
├── Services/
│   ├── ITransactionService.cs
│   └── TransactionService.cs
├── Controllers/
│   └── TransactionsController.cs
├── Data/AppDbContext.cs            (modified — the reference sequence)
├── Models/Transaction.cs           (modified — the R12/R13 property bug from 07 §7)
└── Program.cs                      (modified — middleware + DI)
```

**Order matters here more than in step 7.** The exceptions and the middleware come *first*,
because `TransactionService` throws instead of returning tuples, and a thrown exception with
no handler is a 500 with a stack trace in the response body. Build the safety net before you
build the thing that falls into it.

---

## 0. Before anything else — fix the step-7 bug

`07 §7` flagged this and deferred it. It is now this step's problem, because `ReverseAsync`
guards R12 and R13 on exactly these two properties.

`Models/Transaction.cs`, replace the last two lines:

```csharp
    // ReversalOfTransactionId set  → this transaction IS a reversal of another one.
    // ReversedByTransactionId set  → this transaction HAS BEEN reversed by another one.
    public bool IsReversal => ReversalOfTransactionId.HasValue;
    public bool IsReversed => ReversedByTransactionId.HasValue;
}
```

Read the two comment lines out loud once before moving on. Getting these backwards would make
R13 ("a reversal may not itself be reversed") silently guard the wrong condition, and the
only symptom would be a ledger that lets you reverse a reversal — which no test you write by
accident will catch.

---

## 1. Typed exceptions

`02 §2.4` already made this decision: services throw, one place converts to HTTP. The reason
to introduce it *now* rather than in step 7 is that posting has nine distinct failure modes
(R1–R9) across three call paths, and threading a tuple through all of them would bury the
happy path.

`Exceptions/DomainException.cs`:

```csharp
namespace Ledger.Exceptions;

/// <summary>
/// A business-rule failure. Every subclass carries the HTTP status it maps to, so the
/// middleware never needs a type switch — add an exception, and the mapping comes with it.
/// </summary>
public abstract class DomainException : Exception
{
    protected DomainException(string message) : base(message) { }

    public abstract int StatusCode { get; }
}

public sealed class NotFoundException : DomainException
{
    public NotFoundException(string message) : base(message) { }

    public override int StatusCode => StatusCodes.Status404NotFound;
}

public sealed class ValidationException : DomainException
{
    public ValidationException(string message) : base(message) { }

    public override int StatusCode => StatusCodes.Status400BadRequest;
}

public sealed class ConflictException : DomainException
{
    public ConflictException(string message) : base(message) { }

    public override int StatusCode => StatusCodes.Status409Conflict;
}

public sealed class ForbiddenException : DomainException
{
    public ForbiddenException(string message) : base(message) { }

    public override int StatusCode => StatusCodes.Status403Forbidden;
}
```

`StatusCodes` comes from `Microsoft.AspNetCore.Http`, which the Web SDK's implicit usings
already bring in — no `using` needed.

> **Why an abstract `StatusCode` instead of a `switch` in the middleware?** The mapping lives
> with the exception that owns it. A `switch` in the middleware is a second place to remember
> to edit, and the failure mode when you forget is a 500 on a rule you thought you'd handled.
> `02 §2.4` presents this as a table; the abstract property is that table, compiled.

`ForbiddenException` is not thrown anywhere in this step — R14 (only Admin may reverse) is
enforced by `[Authorize(Roles = Roles.Admin)]`, which is better because the framework rejects
the request before your code runs. It is defined now because `09`'s report filtering will use
it, and because the `02 §2.4` table promises it exists.

---

## 2. The exception-handling middleware

`Middleware/ExceptionHandlingMiddleware.cs`:

```csharp
namespace Ledger.Middleware;

using Ledger.Exceptions;
using Microsoft.AspNetCore.Mvc;

public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(
        RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (DomainException ex)
        {
            // Expected: a caller broke a documented rule. Warning, not Error — these are
            // not bugs, and logging them at Error makes real bugs invisible in the noise.
            _logger.LogWarning("{Rule} on {Path}: {Message}",
                ex.GetType().Name, context.Request.Path, ex.Message);

            await WriteProblemAsync(context, ex.StatusCode, ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception on {Path}", context.Request.Path);

            // Never echo ex.Message here — it can carry the schema, a SQL fragment,
            // or the connection string (02 §2.4).
            await WriteProblemAsync(
                context,
                StatusCodes.Status500InternalServerError,
                "An unexpected error occurred.");
        }
    }

    private static async Task WriteProblemAsync(HttpContext context, int status, string title)
    {
        // If the response has already begun streaming, the status line is long gone and
        // writing more would produce a corrupt body. Let it fail as a truncated response.
        if (context.Response.HasStarted)
        {
            return;
        }

        context.Response.Clear();
        context.Response.StatusCode = status;

        var problem = new ProblemDetails
        {
            Status = status,
            Title = title,
            Instance = context.Request.Path,
        };

        await context.Response.WriteAsJsonAsync(
            problem, options: null, contentType: "application/problem+json");
    }
}
```

Two details that are easy to get wrong:

- **`WriteAsJsonAsync` overwrites `Content-Type`.** Setting `context.Response.ContentType`
  first does nothing. The `contentType:` argument on the overload is the one that sticks, and
  RFC 7807 says the media type is `application/problem+json`.
- **`HasStarted`.** Once any byte of the body has gone out, the status code is already on the
  wire. Writing a `ProblemDetails` on top of a half-sent 200 gives the client malformed JSON
  after a success status — worse than the original failure.

> **Modern alternative worth naming in the viva:** .NET 8+ has `IExceptionHandler` +
> `builder.Services.AddExceptionHandler<T>()` + `app.UseExceptionHandler()`, which is the
> framework's own version of this. The explicit middleware is used here because the pipeline
> position is visible in `Program.cs` — and knowing *why* it must be first is the point.

---

## 3. The reference sequence

`01 §7.4`: `TXN-2026-000042` must be unique under concurrency, and `MAX(id) + 1` is the same
read-then-write race as the overdraft bug. A PostgreSQL sequence is atomic and lock-free.

`Data/AppDbContext.cs` — add to `OnModelCreating`:

```csharp
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);

        // 01 §7.4 — atomic reference numbers. Lowercase name on purpose: EF emits the
        // identifier quoted ("transaction_reference_seq"), and in PostgreSQL a quoted
        // all-lowercase identifier is the same object as the unquoted one, so the raw
        // nextval() call below doesn't need to match EF's quoting.
        modelBuilder.HasSequence<int>("transaction_reference_seq")
            .StartsAt(1)
            .IncrementsBy(1);
    }
```

Then:

```bash
cd backend/Ledger/Ledger
dotnet ef migrations add AddTransactionReferenceSequence
dotnet ef database update
```

Check it landed before going further:

```bash
psql -d ledger -c "SELECT nextval('transaction_reference_seq');"   # 1
psql -d ledger -c "SELECT nextval('transaction_reference_seq');"   # 2
```

Those two are now burned. That is the trade-off `01 §7.4` names: sequences leave **gaps**,
because `nextval` deliberately does not roll back — that is exactly what makes it lock-free.
For an internal reference, gaps are fine. If the numbering were legally required to be
gapless, a sequence would be the wrong tool.

---

## 4. DTOs

`Dtos/Common/PagedResult.cs` — reusable; `09`'s report endpoints will want it too:

```csharp
namespace Ledger.Dtos.Common;

public record PagedResult<T>(
    int Page,
    int PageSize,
    int TotalCount,
    IReadOnlyList<T> Items);
```

`Dtos/Transactions/CreateJournalEntryDto.cs`:

```csharp
namespace Ledger.Dtos.Transactions;

using System.ComponentModel.DataAnnotations;

public record CreateJournalEntryDto
{
    [Range(1, int.MaxValue, ErrorMessage = "AccountId is required.")]
    public int AccountId { get; init; }

    [Required]
    public string Direction { get; init; } = string.Empty;   // "Debit" | "Credit"

    [Range(0.0001, 1_000_000_000, ErrorMessage = "Amount must be greater than zero.")]
    public decimal Amount { get; init; }
}
```

`Direction` is a `string` rather than the `EntryDirection` enum for the same reason
`CreateAccountDto.Type` is: an unparseable value should come back as a 400 naming the bad
input, not as ASP.NET's generic enum binding error — and a raw enum would silently accept
`2`, which is not a direction.

`Dtos/Transactions/CreateTransactionDto.cs`:

```csharp
namespace Ledger.Dtos.Transactions;

using System.ComponentModel.DataAnnotations;

public record CreateTransactionDto
{
    [Required]
    [MaxLength(300)]
    public string Description { get; init; } = string.Empty;   // R5

    [Required]
    public DateTime TransactionDate { get; init; }

    [MinLength(2, ErrorMessage = "A transaction must have at least two journal entries.")]
    public List<CreateJournalEntryDto> Entries { get; init; } = [];   // R1
}
```

`Dtos/Transactions/TransferDto.cs`:

```csharp
namespace Ledger.Dtos.Transactions;

using System.ComponentModel.DataAnnotations;

public record TransferDto
{
    [Range(1, int.MaxValue)]
    public int FromAccountId { get; init; }

    [Range(1, int.MaxValue)]
    public int ToAccountId { get; init; }

    [Range(0.0001, 1_000_000_000)]
    public decimal Amount { get; init; }

    [Required]
    [MaxLength(300)]
    public string Description { get; init; } = string.Empty;

    [Required]
    public DateTime TransactionDate { get; init; }
}
```

`Dtos/Transactions/TransactionEntryDto.cs` and `TransactionDto.cs`:

```csharp
namespace Ledger.Dtos.Transactions;

public record TransactionEntryDto(
    int Id,
    int AccountId,
    string AccountNumber,
    string AccountName,
    string Direction,
    decimal Amount);
```

```csharp
namespace Ledger.Dtos.Transactions;

public record TransactionDto(
    int Id,
    string Reference,
    string Description,
    DateTime TransactionDate,
    DateTime PostedAt,
    string CreatedBy,
    bool IsReversal,
    bool IsReversed,
    int? ReversalOfTransactionId,
    int? ReversedByTransactionId,
    decimal TotalAmount,
    IReadOnlyList<TransactionEntryDto> Entries);
```

`Dtos/Transactions/TransactionListItemDto.cs` — the list shape, deliberately without
`Entries`:

```csharp
namespace Ledger.Dtos.Transactions;

public record TransactionListItemDto(
    int Id,
    string Reference,
    string Description,
    DateTime TransactionDate,
    DateTime PostedAt,
    string CreatedBy,
    bool IsReversal,
    bool IsReversed,
    decimal TotalAmount);
```

> **Why two response shapes?** `GET /api/transactions` returns a page of 25; including every
> transaction's entries would mean a join returning 50–150 rows to render a list that shows
> none of them. `01 §9` has the journal page *expand* a row to see entries — that expansion is
> a `GET /api/transactions/{id}`. The DTO split is the API honouring the UI's access pattern.

`TotalAmount` is the sum of the **debits**. By R2 that equals the sum of the credits, so it is
the unambiguous "size" of the transaction — and if it ever disagreed with the credit sum, the
invariant has already been violated somewhere upstream.

---

## 5. `ITransactionService`

```csharp
namespace Ledger.Services;

using Ledger.Dtos.Common;
using Ledger.Dtos.Transactions;

public interface ITransactionService
{
    Task<PagedResult<TransactionListItemDto>> GetAllAsync(
        DateTime? from, DateTime? to, int? accountId, int page, int pageSize);

    Task<TransactionDto> GetByIdAsync(int id);

    Task<TransactionDto> PostAsync(CreateTransactionDto request, int userId);

    Task<TransactionDto> TransferAsync(TransferDto request, int userId);

    Task<TransactionDto> ReverseAsync(int id, int userId);
}

```

Note what is **not** here: no `UpdateAsync`, no `DeleteAsync`. R10. The absence is the design.

`GetByIdAsync` returns a non-nullable `TransactionDto` and throws `NotFoundException` — unlike
`IAccountService.GetByIdAsync`, which returns `null`. That inconsistency is real and §10 deals
with it.

`userId` is passed in rather than the service reading `IHttpContextAccessor`, so the service
has no dependency on there being an HTTP request at all — which is what makes it unit-testable
(`02 §5`) and what lets `DbSeeder` call it later.

---

## 6. `TransactionService` — the core of the project

Build it in pieces. The whole file, in order:

```csharp
namespace Ledger.Services;

using Ledger.Data;
using Ledger.Dtos.Common;
using Ledger.Dtos.Transactions;
using Ledger.Exceptions;
using Ledger.Models;
using Microsoft.EntityFrameworkCore;

public class TransactionService : ITransactionService
{
    private readonly AppDbContext _context;
    private readonly IBalanceService _balanceService;

    public TransactionService(AppDbContext context, IBalanceService balanceService)
    {
        _context = context;
        _balanceService = balanceService;
    }
```

### 6.1 Posting — `PostAsync`

```csharp
    public async Task<TransactionDto> PostAsync(CreateTransactionDto request, int userId)
    {
        // ── Phase 1: validation that needs no database ────────────────────────────

        // R1 — at least two lines. The DTO attribute catches the common case; this
        // catches TransferAsync and any future internal caller that bypasses binding.
        if (request.Entries.Count < 2)
        {
            throw new ValidationException(
                "A transaction must have at least two journal entries.");
        }

        // R6 — not in the future. Normalise to a UTC midnight first: a client that sends
        // "2026-09-01" (no zone) binds to Kind=Unspecified, which Npgsql refuses to write
        // to a `timestamp with time zone` column.
        var transactionDate = DateTime.SpecifyKind(request.TransactionDate.Date, DateTimeKind.Utc);

        if (transactionDate > DateTime.UtcNow.Date)
        {
            throw new ValidationException("TransactionDate cannot be in the future.");
        }

        // Parse directions once, up front — R3 along the way.
        var lines = new List<(int AccountId, EntryDirection Direction, decimal Amount)>(
            request.Entries.Count);

        foreach (var entry in request.Entries)
        {
            if (!Enum.TryParse<EntryDirection>(entry.Direction, ignoreCase: true, out var direction))
            {
                throw new ValidationException(
                    $"Unknown direction '{entry.Direction}'. Expected 'Debit' or 'Credit'.");
            }

            if (entry.Amount <= 0m)
            {
                throw new ValidationException("Every entry amount must be greater than zero.");
            }

            lines.Add((entry.AccountId, direction, entry.Amount));
        }

        // R2 — the invariant. decimal equality is exact, which is the whole reason
        // 01 §7.1 rules out double: `0.1m + 0.2m == 0.3m` is true; the double form is not.
        var debits = lines.Where(l => l.Direction == EntryDirection.Debit).Sum(l => l.Amount);
        var credits = lines.Where(l => l.Direction == EntryDirection.Credit).Sum(l => l.Amount);

        if (debits != credits)
        {
            throw new ValidationException(
                $"Transaction does not balance: debits {debits:F2}, credits {credits:F2}, " +
                $"difference {Math.Abs(debits - credits):F2}.");
        }
```

The error message reports the difference, per `02 §2.4`. A validation error that tells you the
fix is worth more than one that says "invalid" — and on the New Entry form (`01 §9`) this
string is what the user sees.

```csharp
        // ── Phase 2: the database, under an explicit transaction ──────────────────

        await using var dbTransaction = await _context.Database.BeginTransactionAsync();

        var accountIds = lines
            .Select(l => l.AccountId)
            .Distinct()
            .OrderBy(id => id)
            .ToArray();

        var accounts = await LockAccountsAsync(accountIds);

        // R4 — every referenced account must exist and be active.
        foreach (var id in accountIds)
        {
            var account = accounts.SingleOrDefault(a => a.Id == id)
                ?? throw new NotFoundException($"Account {id} does not exist.");

            if (!account.IsActive)
            {
                throw new ValidationException(
                    $"Account {account.AccountNumber} is inactive and cannot accept new entries.");
            }
        }

        // R7 — one currency per transaction.
        var currencies = accounts.Select(a => a.Currency).Distinct().ToList();

        if (currencies.Count > 1)
        {
            throw new ValidationException(
                $"All entries in a transaction must share one currency; got {string.Join(", ", currencies)}.");
        }

        var transaction = new Transaction
        {
            Reference = await NextReferenceAsync(),
            Description = request.Description,
            TransactionDate = transactionDate,
            PostedAt = DateTime.UtcNow,
            CreatedByUserId = userId,
        };

        foreach (var line in lines)
        {
            transaction.JournalEntries.Add(new JournalEntry
            {
                AccountId = line.AccountId,
                Direction = line.Direction,
                Amount = line.Amount,
            });
        }

        _context.Transactions.Add(transaction);
        await _context.SaveChangesAsync();

        // R9 — overdraft guard, AFTER the write and still inside the lock.
        await EnforceOverdraftRuleAsync(accounts);

        await dbTransaction.CommitAsync();

        return await LoadDtoAsync(transaction.Id);
    }
```

**Three things in that block are the whole viva answer.** Understand each before typing it.

**(a) Why the lock is taken before anything is read.** `01 §7.3`: two 800-transfers against a
1,000 balance both read 1,000, both pass, and the account ends at −600. `SELECT … FOR UPDATE`
makes the second request block until the first commits, then re-read the true balance and
correctly reject. The lock has to be acquired *before* `GetBalanceAsync` runs, or it is
guarding nothing.

**(b) Why the overdraft check runs after `SaveChangesAsync`.** Because then it can just ask
`IBalanceService` for the *resulting* balance instead of hand-computing "current balance plus
my deltas". Those are two different implementations of the same rule, and `01 §5.1` is
specifically a warning about letting a second implementation exist. Writing first and
re-reading also handles the awkward case for free: one transaction with three lines touching
the same account.

This works only because the insert and the check share one connection inside one explicit
transaction — uncommitted rows are visible to the transaction that wrote them, and to nothing
else. If `EnforceOverdraftRuleAsync` throws, `await using` disposes `dbTransaction` without a
commit, which rolls the insert back. The row is never visible to anyone.

**(c) Why an *explicit* transaction at all.** `01 §7.2` is worth volunteering unprompted: a
single `SaveChangesAsync()` is *already* atomic — EF wraps it in an implicit transaction, so
the header and its entries commit together regardless. The explicit transaction is needed
because R9 is a **read-then-write**, and the read and the write must sit inside the same
transaction *and the same lock* for the check to mean anything. Candidates who say "explicit
transaction for atomicity" get the right code for the wrong reason.

### 6.2 The row lock

```csharp
    /// <summary>
    /// Pessimistic row lock (01 §7.3). Rows are locked in ascending id order so two
    /// concurrent transactions touching the same pair of accounts queue up rather than
    /// deadlock by grabbing them in opposite orders.
    /// </summary>
    private Task<List<Account>> LockAccountsAsync(int[] accountIds) =>
        _context.Accounts
            .FromSql($"""
                SELECT * FROM "Accounts"
                WHERE "Id" = ANY({accountIds})
                ORDER BY "Id"
                FOR UPDATE
                """)
            .ToListAsync();
```

`FromSql` with an interpolated string **parameterises** the hole — `{accountIds}` becomes
`= ANY(@p0)` with an `integer[]` parameter, not string-concatenated SQL. That is the
difference between `FromSql` and `FromSqlRaw`, and it is why this is not an injection hole.
`02 §2.5` names this as one of the two reasons PostgreSQL is not optional here: EF Core has no
LINQ operator for row locking.

> **Honest footnote for the viva:** PostgreSQL does not formally *guarantee* that rows are
> locked in `ORDER BY` order. Ordering the read is nevertheless the standard deadlock
> mitigation and is what you will find in production code; the guaranteed-correct alternative
> is to lock each id in a separate ordered statement, which costs a round trip per account.
> Knowing the caveat is a better answer than not knowing it.

### 6.3 The overdraft rule

```csharp
    private async Task EnforceOverdraftRuleAsync(IEnumerable<Account> lockedAccounts)
    {
        foreach (var account in lockedAccounts)
        {
            // R9 is an Asset-account rule. A Liability going "negative" is a normal
            // overpayment, not an overdraft.
            if (account.Type != AccountType.Asset || account.AllowsNegativeBalance)
            {
                continue;
            }

            var balance = await _balanceService.GetBalanceAsync(account);

            if (balance < 0m)
            {
                throw new ConflictException(
                    $"Account {account.AccountNumber} would be driven to {balance:F2}; " +
                    "it does not allow a negative balance.");
            }
        }
    }
```

409 rather than 400 because the request is well-formed — it conflicts with the current *state*
of the account, and the same request could succeed after a deposit. `02 §2.4` puts overdraft in
the 409 row for exactly that reason.

### 6.4 Reference generation

```csharp
    private async Task<string> NextReferenceAsync()
    {
        // nextval() always returns bigint, whatever the sequence's own type.
        // EF Core's SqlQuery requires the scalar column be named "Value".
        var next = await _context.Database
            .SqlQueryRaw<long>("""SELECT nextval('transaction_reference_seq') AS "Value" """)
            .SingleAsync();

        return $"TXN-{DateTime.UtcNow:yyyy}-{next:D6}";
    }
```

That `AS "Value"` is not decoration — leave it off and EF throws at runtime saying it cannot
find the column. It is the single most common `SqlQuery` mistake.

The year comes from the posting time, not `TransactionDate`, because the reference identifies
*when it was recorded* — a September entry backdated to August is still a 2026 reference. The
sequence itself does not reset per year, so `TXN-2027-000104` follows `TXN-2026-000103`. Say
that out loud if asked; a per-year reset would need either a sequence per year or a composite
counter, and neither buys anything here.

### 6.5 Transfer

```csharp
    public Task<TransactionDto> TransferAsync(TransferDto request, int userId)
    {
        if (request.FromAccountId == request.ToAccountId)
        {
            throw new ValidationException("A transfer needs two different accounts.");
        }

        // 01 §8 — "a thinner mouth on the same pipe". This endpoint assembles the two
        // entries and hands them to the one validated path; it does NOT re-implement
        // any rule. Everything from R1 to R9 is enforced exactly once, in PostAsync.
        return PostAsync(
            new CreateTransactionDto
            {
                Description = request.Description,
                TransactionDate = request.TransactionDate,
                Entries =
                [
                    new()
                    {
                        AccountId = request.ToAccountId,
                        Direction = nameof(EntryDirection.Debit),
                        Amount = request.Amount,
                    },
                    new()
                    {
                        AccountId = request.FromAccountId,
                        Direction = nameof(EntryDirection.Credit),
                        Amount = request.Amount,
                    },
                ],
            },
            userId);
    }
```

**Debit the destination, credit the source.** On two Asset accounts that is exactly "money
left `from`, money arrived at `to`" — `01 §2` says a debit increases an Asset and a credit
decreases it. This method is not `async`; it returns `PostAsync`'s task directly, because
there is nothing to await after it. ("Did you duplicate the rules?" is the follow-up question
`01 §8` predicts. The answer is the four lines of comment above.)

### 6.6 Reversal

```csharp
    public async Task<TransactionDto> ReverseAsync(int id, int userId)
    {
        await using var dbTransaction = await _context.Database.BeginTransactionAsync();

        // Lock the original before reading its reversal state, or two concurrent
        // reversals both see ReversedByTransactionId == null and both proceed.
        var original = await _context.Transactions
            .FromSql($"""SELECT * FROM "Transactions" WHERE "Id" = {id} FOR UPDATE""")
            .SingleOrDefaultAsync()
            ?? throw new NotFoundException($"Transaction {id} does not exist.");

        // R12 — at most one reversal.
        if (original.IsReversed)
        {
            throw new ConflictException(
                $"Transaction {original.Reference} has already been reversed.");
        }

        // R13 — a reversal is not itself reversible. Reversing a reversal is just the
        // original again; allowing it would make the audit chain unbounded and unreadable.
        if (original.IsReversal)
        {
            throw new ConflictException(
                $"Transaction {original.Reference} is itself a reversal and cannot be reversed.");
        }

        var originalEntries = await _context.JournalEntries
            .Where(e => e.TransactionId == original.Id)
            .ToListAsync();

        var accountIds = originalEntries
            .Select(e => e.AccountId)
            .Distinct()
            .OrderBy(accountId => accountId)
            .ToArray();

        var accounts = await LockAccountsAsync(accountIds);

        var reversal = new Transaction
        {
            Reference = await NextReferenceAsync(),
            Description = $"Reversal of {original.Reference}: {original.Description}",

            // Dated today, NOT the original's date — see the note below.
            TransactionDate = DateTime.UtcNow.Date,
            PostedAt = DateTime.UtcNow,
            CreatedByUserId = userId,
            ReversalOfTransactionId = original.Id,
        };

        // R11 — every debit becomes a credit and vice versa, same amounts, same accounts.
        foreach (var entry in originalEntries)
        {
            reversal.JournalEntries.Add(new JournalEntry
            {
                AccountId = entry.AccountId,
                Amount = entry.Amount,
                Direction = entry.Direction == EntryDirection.Debit
                    ? EntryDirection.Credit
                    : EntryDirection.Debit,
            });
        }

        _context.Transactions.Add(reversal);
        await _context.SaveChangesAsync();          // reversal.Id is assigned here

        original.ReversedByTransactionId = reversal.Id;
        await _context.SaveChangesAsync();

        await EnforceOverdraftRuleAsync(accounts);

        await dbTransaction.CommitAsync();

        return await LoadDtoAsync(reversal.Id);
    }
```

Four points worth having ready:

**The reversal is dated today, not backdated to the original.** Backdating would silently
rewrite every report already run for that period — the August trial balance would change
retroactively, which is precisely the property an audit trail exists to prevent. Dating it
today means the error and the correction both appear, each in the period it belongs to.
`01 §6` frames this as the whole reason reversal exists instead of `DELETE`.

**R12 has a database backstop you already built.** `TransactionConfiguration` maps
`ReversalOf`/`ReversedBy` as a one-to-one, so EF created a **unique** index on
`ReversalOfTransactionId` (`IX_Transactions_ReversalOfTransactionId`, in the initial
migration). Two rows can never both claim to reverse the same transaction. The code check plus
the row lock turns the common case into a clean 409; the unique index is the final arbiter —
same defence-in-depth argument as the duplicate account number in `07`.

**`ReversedByTransactionId` is a plain column, not a foreign key.** EF used
`ReversalOfTransactionId` as the FK for that one-to-one, so the other column is denormalised
and *you* keep it in sync — that is the second `SaveChangesAsync`. It is strictly derivable
(`WHERE ReversalOfTransactionId = @id`), and it is stored anyway so that `IsReversed` on a
list of 25 transactions costs zero extra queries.

**The overdraft check applies to reversals too, and that is not paranoia.** Reversing usually
returns balances to a state that was already valid — but not always. Deposit 1,000; spend
1,000; now reverse the deposit. The account lands at −1,000, and R9 must still hold. The
correct remedy is to reverse the spend first, which is a business decision, not something the
ledger should silently allow around.

### 6.7 Reads

```csharp
    public async Task<PagedResult<TransactionListItemDto>> GetAllAsync(
        DateTime? from, DateTime? to, int? accountId, int page, int pageSize)
    {
        var query = _context.Transactions.AsQueryable();

        if (from is not null)
        {
            query = query.Where(t => t.TransactionDate >= from.Value);
        }

        if (to is not null)
        {
            query = query.Where(t => t.TransactionDate <= to.Value);
        }

        if (accountId is not null)
        {
            query = query.Where(t => t.JournalEntries.Any(e => e.AccountId == accountId.Value));
        }

        var totalCount = await query.CountAsync();

        var items = await query
            .OrderByDescending(t => t.TransactionDate)
            .ThenByDescending(t => t.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(t => new TransactionListItemDto(
                t.Id,
                t.Reference,
                t.Description,
                t.TransactionDate,
                t.PostedAt,
                t.CreatedBy.FullName,
                t.ReversalOfTransactionId != null,
                t.ReversedByTransactionId != null,
                t.JournalEntries
                    .Where(e => e.Direction == EntryDirection.Debit)
                    .Sum(e => e.Amount)))
            .ToListAsync();

        return new PagedResult<TransactionListItemDto>(page, pageSize, totalCount, items);
    }

    public Task<TransactionDto> GetByIdAsync(int id) => LoadDtoAsync(id);

    private async Task<TransactionDto> LoadDtoAsync(int id)
    {
        var transaction = await _context.Transactions
            .AsNoTracking()
            .Include(t => t.CreatedBy)
            .Include(t => t.JournalEntries)
                .ThenInclude(e => e.Account)
            .SingleOrDefaultAsync(t => t.Id == id)
            ?? throw new NotFoundException($"Transaction {id} does not exist.");

        var entries = transaction.JournalEntries
            .OrderBy(e => e.Id)
            .Select(e => new TransactionEntryDto(
                e.Id,
                e.AccountId,
                e.Account.AccountNumber,
                e.Account.Name,
                e.Direction.ToString(),
                e.Amount))
            .ToList();

        return new TransactionDto(
            transaction.Id,
            transaction.Reference,
            transaction.Description,
            transaction.TransactionDate,
            transaction.PostedAt,
            transaction.CreatedBy.FullName,
            IsReversal: transaction.ReversalOfTransactionId is not null,
            IsReversed: transaction.ReversedByTransactionId is not null,
            transaction.ReversalOfTransactionId,
            transaction.ReversedByTransactionId,
            TotalAmount: entries
                .Where(e => e.Direction == nameof(EntryDirection.Debit))
                .Sum(e => e.Amount),
            entries);
    }
}
```

**`GetAllAsync` pages in SQL** — `Skip`/`Take` are inside the `IQueryable`, so the database
returns 25 rows however large the journal grows. Contrast this deliberately with
`BalanceService.GetStatementAsync`, which pages **in memory**, because a running balance on
page 2 has to continue from page 1's closing figure. Being able to say "this one pages in SQL,
that one can't, and here's why" is a much stronger answer than having both the same.

**No N+1 anywhere here.** `GetAllAsync` is a single projection — `CreatedBy.FullName` and the
debit `Sum` become a join and a correlated aggregate in one statement. `LoadDtoAsync` uses
`Include` and maps in memory, which is one query for one transaction. Verify it the same way
step 7's fix was verified: count `Executed DbCommand` lines in the log for one request.

`LoadDtoAsync` maps in C# rather than projecting straight to the DTO because
`e.Direction.ToString()` inside an EF projection is provider-dependent — loading the entity and
calling `ToString()` in memory always works. `AsNoTracking` is safe here even right after a
write: it re-queries the database, and inside the open transaction the uncommitted rows are
visible on that same connection.

---

## 7. `TransactionsController`

```csharp
namespace Ledger.Controllers;

using Ledger.Authorization;
using Ledger.Dtos.Common;
using Ledger.Dtos.Transactions;
using Ledger.Extensions;
using Ledger.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/transactions")]
[Authorize]
public class TransactionsController : ControllerBase
{
    private readonly ITransactionService _transactionService;

    public TransactionsController(ITransactionService transactionService)
    {
        _transactionService = transactionService;
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<TransactionListItemDto>>> GetAll(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int? accountId,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25)
    {
        if (page < 1)
        {
            page = 1;
        }

        if (pageSize is < 1 or > 200)
        {
            pageSize = 25;
        }

        var result = await _transactionService.GetAllAsync(from, to, accountId, page, pageSize);
        return Ok(result);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<TransactionDto>> GetById(int id) =>
        Ok(await _transactionService.GetByIdAsync(id));

    [HttpPost]
    public async Task<ActionResult<TransactionDto>> Post(CreateTransactionDto request)
    {
        var transaction = await _transactionService.PostAsync(request, User.GetUserId());
        return CreatedAtAction(nameof(GetById), new { id = transaction.Id }, transaction);
    }

    [HttpPost("transfer")]
    public async Task<ActionResult<TransactionDto>> Transfer(TransferDto request)
    {
        var transaction = await _transactionService.TransferAsync(request, User.GetUserId());
        return CreatedAtAction(nameof(GetById), new { id = transaction.Id }, transaction);
    }

    [HttpPost("{id:int}/reverse")]
    [Authorize(Roles = Roles.Admin)]   // R14
    public async Task<ActionResult<TransactionDto>> Reverse(int id)
    {
        var reversal = await _transactionService.ReverseAsync(id, User.GetUserId());
        return CreatedAtAction(nameof(GetById), new { id = reversal.Id }, reversal);
    }

    // There is deliberately no PUT and no DELETE here (R10). A ledger is an audit trail;
    // a mistake is corrected by POST /{id}/reverse, which adds a record rather than
    // removing one. The absence of these two verbs is a designed feature — 01 §6.
}
```

Compare this to `AccountsController`: every action is one line plus a `CreatedAtAction`,
because the `switch` over outcomes moved into the middleware. That readability is what
`02 §2.4` bought by choosing exceptions over `Result<T>`, and the acknowledged cost is that
exceptions-as-control-flow aren't free — acceptable because these paths are genuinely
exceptional.

Keep the comment at the bottom. A reviewer scanning for CRUD completeness needs to see that
the missing verbs are a decision.

---

## 8. Wiring — `Program.cs`

```csharp
using Ledger.Data;
using Ledger.Extensions;
using Ledger.Middleware;
using Ledger.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddJwtAuthentication(builder.Configuration);
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IBalanceService, BalanceService>();
builder.Services.AddScoped<IAccountService, AccountService>();
builder.Services.AddScoped<ITransactionService, TransactionService>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
    await DbSeeder.SeedAsync(db);
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// FIRST in the pipeline — it can only catch what is downstream of it.
app.UseMiddleware<ExceptionHandlingMiddleware>();

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
```

**Position is the whole point.** Middleware catches exceptions thrown by what comes *after* it
in the pipeline. Register it below `UseAuthentication` and an exception from the auth
middleware sails straight past into a raw 500. It goes first.

While you are in the project file, delete the stray `<Folder Include="Service\" />` item from
`Ledger.csproj` — a leftover empty folder from step 3 that a reviewer will read as a directory
you meant to use and forgot.

---

## 9. Verifying it

Get a token first:

```bash
ADMIN=$(curl -s -X POST http://localhost:5086/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@misl.com","password":"Admin@123"}' | jq -r .token)

ACC=$(curl -s -X POST http://localhost:5086/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"accountant@misl.com","password":"Accountant@123"}' | jq -r .token)
```

### 9.1 The happy path

Owner puts 100,000 into Cash (account `1001`, id 1) against Owner's Capital (`3001`, id 6):

```bash
curl -s -X POST http://localhost:5086/api/transactions \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{
        "description": "Opening capital injection",
        "transactionDate": "2026-09-01T00:00:00Z",
        "entries": [
          { "accountId": 1, "direction": "Debit",  "amount": 100000 },
          { "accountId": 6, "direction": "Credit", "amount": 100000 }
        ]
      }' | jq
```

Expect `201`, a `Location` header, `reference` matching `TXN-2026-\d{6}`, and `totalAmount`
`100000.0000` — four decimal places, because the column is `numeric(18,4)`; `01 §7.1` says
display rounds to 2, and that is the frontend's job in step 10, not the API's.

Then confirm the two balances moved in opposite directions but both read *positive* — Cash is
debit-normal, Owner's Capital is credit-normal:

```bash
curl -s http://localhost:5086/api/accounts -H "Authorization: Bearer $ADMIN" \
  | jq '[.[] | select(.balance != 0) | {accountNumber, type, balance}]'
```

Both `100000`. If either is negative, the sign flip in `AccountTypeExtensions.NormalBalance()`
is wrong — not this step's code.

### 9.2 Every rule, one call each

```bash
# R2 — unbalanced. Expect 400 naming the difference.
curl -s -X POST http://localhost:5086/api/transactions \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"description":"Bad","transactionDate":"2026-09-01T00:00:00Z","entries":[
        {"accountId":1,"direction":"Debit","amount":5000},
        {"accountId":6,"direction":"Credit","amount":4750}]}' | jq '{status,title}'
# → 400 "Transaction does not balance: debits 5000.00, credits 4750.00, difference 250.00."

# R6 — future date. Expect 400 "TransactionDate cannot be in the future."
# R4 — accountId 9999. Expect 404 "Account 9999 does not exist."
# R4 — post to an account you deactivated first. Expect 400 "... is inactive ...".
# R3 — amount 0 or negative. Expect 400.
# Bad direction "Sideways". Expect 400 "Unknown direction 'Sideways'. Expected 'Debit' or 'Credit'."
```

R1 is worth running separately, because it is the one rule where the **DTO attribute** answers
before your service code does:

```bash
curl -s -X POST http://localhost:5086/api/transactions \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"description":"Lonely","transactionDate":"2026-09-01T00:00:00Z","entries":[
        {"accountId":1,"direction":"Debit","amount":10}]}' | jq
```

That comes back as ASP.NET's model-validation shape — `"title": "One or more validation errors
occurred."` with `errors.Entries[0]` carrying your `MinLength` message — **not** as your
middleware's `ProblemDetails`. Both are RFC 7807; they are produced by different layers.
`[ApiController]` short-circuits before the action runs, so `PostAsync`'s own R1 check never
fires on this path. That check still earns its place: `TransferAsync` and any future internal
caller bypass model binding entirely.

Now confirm the date handling, which is the gotcha that bit `CreatedAt` in step 7:

```bash
# No timezone on the date. Binds as Kind=Unspecified, which Npgsql would reject —
# SpecifyKind in PostAsync is what saves it. Expect 201, echoed back as "2026-09-02T00:00:00Z".
curl -s -X POST http://localhost:5086/api/transactions \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"description":"Naive date","transactionDate":"2026-09-02","entries":[
        {"accountId":1,"direction":"Debit","amount":1},
        {"accountId":6,"direction":"Credit","amount":1}]}' | jq '{id,reference,transactionDate}'
```

Cash is now **100,001**. The rest of §9 uses that figure.

After the R2 rejection, check that **nothing** was written:

```bash
psql -d ledger -c 'SELECT count(*) FROM "Transactions";'
psql -d ledger -c "SELECT last_value FROM transaction_reference_seq;"
```

The transaction count is unchanged. The sequence's `last_value` **has** moved, if the failure
happened after `NextReferenceAsync`. That gap is expected and is the documented trade-off from
§3 — and `Transactions_Id_seq` gaps the same way, so transaction ids skip too. Be ready to be
asked, because a grader who looks will see references jump.

### 9.3 R9 — the overdraft guard

Cash holds 100,001 and `allowsNegativeBalance` is false. Try to spend 150,000:

```bash
curl -s -X POST http://localhost:5086/api/transactions/transfer \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"fromAccountId":1,"toAccountId":2,"amount":150000,
       "description":"Overdraft attempt","transactionDate":"2026-09-02T00:00:00Z"}' \
  | jq '{status, title}'
```

Expect `409` — "Account 1001 would be driven to -49999.00; it does not allow a negative
balance." Then confirm the rollback worked: Cash is still exactly `100001` and the transaction
count is unchanged. **This is the single most important check in the step** — it proves the
explicit transaction actually rolls back a write that has already been `SaveChangesAsync`'d.

Now one that fits, which §9.4 will reverse:

```bash
curl -s -X POST http://localhost:5086/api/transactions/transfer \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"fromAccountId":1,"toAccountId":2,"amount":40000,
       "description":"Fund the bank account","transactionDate":"2026-09-03T00:00:00Z"}' | jq
```

Check the entries it built: **`1002` Bank is the Debit, `1001` Cash is the Credit.** Destination
debited, source credited (§6.5). Balances are now Cash `60001`, Bank `40000`.

### 9.4 Reversal — R10 to R14

Reverse the **transfer** — note the id, call it `$TXN`:

```bash
# R14 — Accountant may not reverse. Expect 403, from the framework, before your code runs.
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  http://localhost:5086/api/transactions/$TXN/reverse -H "Authorization: Bearer $ACC"

# Admin reverses. Expect 201.
REV=$(curl -s -X POST http://localhost:5086/api/transactions/$TXN/reverse \
  -H "Authorization: Bearer $ADMIN" | tee /dev/stderr | jq -r .id)
```

In that response, check three things: `description` reads `Reversal of TXN-2026-…: Fund the
bank account`, `isReversal` is `true`, and the entries are **mirrored** — Bank is now the
Credit, Cash the Debit. Then re-fetch the original and confirm `isReversed` is `true` with
`reversedByTransactionId` pointing at the new one. If those two booleans look swapped, §0 was
not applied.

```bash
# R12 — reverse the same one twice. Expect 409 "has already been reversed."
curl -s -X POST http://localhost:5086/api/transactions/$TXN/reverse \
  -H "Authorization: Bearer $ADMIN" | jq .title

# R13 — reverse the reversal. Expect 409 "is itself a reversal".
curl -s -X POST http://localhost:5086/api/transactions/$REV/reverse \
  -H "Authorization: Bearer $ADMIN" | jq .title

# Net effect: the transfer is undone. Cash back to 100001, Bank back to 0.
curl -s http://localhost:5086/api/accounts -H "Authorization: Bearer $ADMIN" \
  | jq '[.[] | select(.balance != 0) | {accountNumber, balance}]'

# R10 — neither verb exists. Both expect 405.
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE \
  http://localhost:5086/api/transactions/$TXN -H "Authorization: Bearer $ADMIN"
curl -s -o /dev/null -w '%{http_code}\n' -X PUT \
  http://localhost:5086/api/transactions/$TXN -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d '{}'
```

Original plus reversal netting to zero, with **both** transactions still on the record, is the
best single artefact in the project (`02 §5`) and the third unit test named there.

Prove the database backs R12 up independently — this should fail:

```bash
psql -d ledger -v txn="$TXN" <<'SQL'
INSERT INTO "Transactions"
  ("Reference", "Description", "TransactionDate", "PostedAt",
   "CreatedByUserId", "ReversalOfTransactionId")
VALUES ('DUP-1', 'second reversal attempt', now(), now(), 1, :txn);
SQL
# → ERROR: duplicate key value violates unique constraint
#          "IX_Transactions_ReversalOfTransactionId"
#    DETAIL: Key ("ReversalOfTransactionId")=(4) already exists.
```

That index came free with the one-to-one mapping in `TransactionConfiguration` — you did not
write it, and it is still the thing that makes R12 impossible to violate rather than merely
unlikely.

**Then try to reverse the capital injection, and expect it to fail.** By this point Cash is
100,001 and the injection was 100,000 — reversing it credits Cash and would land it at
`-49999` if the 40,000 transfer were still live, or at `1` if it has been reversed. Run the
reversal *before* undoing the transfer and you get:

```
409 — Account 1001 would be driven to -39999.00; it does not allow a negative balance.
```

That is **not a bug**, and it is worth provoking on purpose. It is the §6.6 scenario: money
came in, money was spent, and reversing the inflow now would overdraw the account. The ledger
is correctly insisting you reverse the spend first. Most candidates never discover that
reversal and R9 interact at all.

### 9.5 The race, demonstrated

Two 80,000 transfers out of the 100,001 balance, fired simultaneously:

```bash
for i in 1 2; do
  curl -s -o /tmp/race-$i.json -w "req$i -> %{http_code}\n" \
    -X POST http://localhost:5086/api/transactions/transfer \
    -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
    -d '{"fromAccountId":1,"toAccountId":2,"amount":80000,
         "description":"Race '"$i"'","transactionDate":"2026-09-04T00:00:00Z"}' &
done
wait
curl -s http://localhost:5086/api/accounts/1 -H "Authorization: Bearer $ADMIN" | jq .balance
```

Expect exactly one `201` and one `409`, and Cash at `20001` — never `-59999`. Note that the
*second* request to arrive is not necessarily the one that fails; whichever grabs the lock
first wins, so the order in the output varies between runs.

**Now go and see the bug the lock prevents.** Delete the `FOR UPDATE` line from
`LockAccountsAsync`, rebuild, restart, and fire two 15,000 transfers against the remaining
20,001:

```
req1 -> 201
req2 -> 201
Cash after: -9999.0000
```

Both passed a check that neither should have passed. Put the line back, restart, and watch it
become one `201` and one `409` again. Having *watched* this happen is worth more in the viva
than describing it — `01 §7.3` says being able to draw the interleaving is the whole answer,
and you will draw it much better once you have seen the number go negative.

### 9.6 Reads

```bash
# Paging, newest first.
curl -s "http://localhost:5086/api/transactions?page=1&pageSize=2" \
  -H "Authorization: Bearer $ADMIN" | jq '{totalCount, count: (.items|length)}'

# Filter to one account — includes the reversal, because it touches account 1 too.
curl -s "http://localhost:5086/api/transactions?accountId=1" \
  -H "Authorization: Bearer $ADMIN" | jq '.items[].reference'

# Date range.
curl -s "http://localhost:5086/api/transactions?from=2026-09-01Z&to=2026-09-01Z" \
  -H "Authorization: Bearer $ADMIN" | jq .totalCount

# Detail, with entries and account names.
curl -s http://localhost:5086/api/transactions/1 -H "Authorization: Bearer $ADMIN" | jq

# Unknown id → 404 as ProblemDetails, from the middleware.
curl -s -D - http://localhost:5086/api/transactions/9999 -H "Authorization: Bearer $ADMIN"
```

That last one should carry `Content-Type: application/problem+json` and a body of
`{"title":"Transaction 9999 does not exist.","status":404,"instance":"/api/transactions/9999"}`.
If the content type says `application/json`, the `contentType:` argument in §2 was dropped.

Finally, re-run step 7's statement endpoint now that there are real entries behind it:

```bash
curl -s "http://localhost:5086/api/accounts/1/statement" -H "Authorization: Bearer $ADMIN" \
  | jq '{openingBalance, closingBalance,
         lines: [.entries[] | {reference, direction, amount, runningBalance}]}'
```

The running balance should climb and fall in step with the entries, ending at the same figure
`GET /api/accounts/1` reports. Step 7 could only test this against zero balances; this is the
first time that code is exercised for real.

---

## 10. Two loose ends, deliberately

**`AccountsController` still uses the tuple pattern.** `07 §9` called it "the interim answer"
until the middleware existed. It now exists, so the project has two error styles side by side,
and a reviewer will notice. Converting is about twenty lines — `AccountMutationOutcome`
disappears, `AccountService` throws `ConflictException` / `NotFoundException` /
`ValidationException`, and each controller action collapses to one line like
`TransactionsController`'s. **Recommendation: do it**, as a separate commit after this step's
work is verified green, so that if something breaks you know which change broke it. Step 7's
24 endpoint checks are the regression suite for that commit.

**`BalanceService.GetStatementAsync` still pages in memory.** Unchanged and still correct — the
running balance genuinely needs every prior row. The scaling answer is a SQL window function
(`SUM(...) OVER (ORDER BY ...)`), which is worth *naming* in the viva and not worth building at
this project's data volume. Leave it; know the answer.

**Optional: demo transactions in the seeder.** `02 §2.6` describes `DbSeeder` as "idempotent
chart of accounts + demo transactions", and a grader opening the app to an empty journal sees
less than one opened to a working ledger. Three or four postings through the seeder — a capital
injection, a revenue entry, a rent payment — make the dashboard and trial balance in `09`
immediately legible. Build them by inserting `Transaction` + `JournalEntry` entities directly
rather than calling `ITransactionService`, so the seeder does not need an HTTP user id, and
keep the `if (await context.Accounts.AnyAsync()) return;` idempotency guard covering them.

---

## 11. Viva questions this step answers

1. **Why an explicit database transaction when `SaveChangesAsync` is already atomic?** Because
   R9 is a read-then-write. The header-plus-entries insert would commit atomically either way;
   the explicit transaction is what puts the balance *check* and the *write* inside the same
   unit, so the check can't be invalidated between the two. (`01 §7.2`)
2. **Draw the overdraft race.** Two requests read 1,000, both compare against 800, both pass,
   both write −800, balance lands at −600 with the guard never having failed. `SELECT … FOR
   UPDATE` inside the transaction makes the second one block until the first commits, then
   re-read 200 and reject. (`01 §7.3`)
3. **Why a pessimistic lock rather than serializable isolation or optimistic concurrency?**
   Serializable is more general but needs retry-on-serialization-failure logic and costs
   throughput. Optimistic concurrency needs a row to version — and the balance is *derived*,
   so there is no row to version. The affected account rows are exactly what needs locking, so
   lock them.
4. **Why is the overdraft checked after the insert rather than before?** Because after the
   insert, "what is the resulting balance" is a question `IBalanceService` already answers.
   Checking before would mean computing current-balance-plus-my-deltas by hand — a second
   implementation of the balance rule, which is the drift risk `01 §5.1` exists to avoid. It
   is safe because the uncommitted rows are visible inside the transaction that wrote them,
   and the rollback is automatic if the check throws.
5. **Why are account rows locked in ascending id order?** Deadlock avoidance. Two concurrent
   transfers between the same two accounts, grabbing them in opposite orders, would each hold
   what the other needs. A consistent ordering makes them queue instead.
6. **Why a PostgreSQL sequence for the reference and not `MAX(id) + 1`?** `MAX + 1` is the same
   read-then-write race as the overdraft. Sequences are atomic and lock-free by design. The
   cost is gaps on rollback, because a sequence increment is deliberately non-transactional —
   fine for an internal reference, wrong if the numbering were legally required to be gapless.
   (`01 §7.4`)
7. **Why `POST /{id}/reverse` and not `DELETE /{id}`?** Nothing is deleted. Reversal *creates*
   a transaction. A `DELETE` would imply the opposite of what happens and would leave nowhere
   to hang the R12/R13 guards or the Admin-only check. The audit trail has to show both the
   error and the correction. (`01 §6`)
8. **Why is a reversal dated today instead of the original's date?** Backdating it would change
   reports already run for that period. Dating it today records when the correction was made,
   which is what an auditor needs to see.
9. **Does `POST /transfer` duplicate the validation in `POST /transactions`?** No — it builds
   two entries and calls `PostAsync`. One implementation of R1–R9, two entry points. (`01 §8`)
10. **Why does `GET /api/transactions` page in SQL when the statement pages in memory?** The
    journal list has no cross-row state, so `Skip`/`Take` push down to the database cleanly. A
    statement's page-2 running balance depends on page 1's closing figure, so the rows have to
    be accumulated in order before they can be sliced. Different constraints, different answer.
11. **Why exceptions instead of the tuple-result pattern used in step 7?** Nine failure modes
    across three call paths. Tuples kept the happy path readable with four; at nine they bury
    it. One middleware is the single place that knows how a domain failure becomes an HTTP
    status. The cost — exceptions as control flow aren't free — is acceptable because these
    paths are genuinely exceptional. (`02 §2.4`)
12. **Why must the exception middleware be registered first?** It can only catch what is
    downstream of it in the pipeline. Behind `UseAuthentication`, an auth failure returns a raw
    500 with a stack trace.
13. **Why is `Amount` always positive with a separate `Direction` column?** A signed amount
    makes the balancing check `SUM = 0`, which looks neater but permits "a debit of −500" —
    meaningless in accounting — and loses the credit/negative-debit distinction in every
    report. `CHECK (Amount > 0)` enforces it in the database, not just in C#. (`01 §4.4`)
14. **What stops two concurrent reversals of the same transaction?** Three things, in order:
    the `FOR UPDATE` on the original row, the `IsReversed` check, and the unique index on
    `ReversalOfTransactionId` that EF created from the one-to-one mapping. The first two make
    the common case a clean 409; the index is the final arbiter.

---

## 12. Out of scope for this step

- **R8** (the same account twice on the same side with the same amount) — `01 §6` makes this a
  UI warning, not a server rule, because the pattern is legitimate. It belongs to the New Entry
  form in step 10.
- **Trial balance and dashboard summary** — step 9. They read what this step writes.
- **Multi-currency** — R7 rejects mixed currencies; it does not convert. `01 §10` explains why
  real FX (rate tables, revaluation, a gain/loss account) is out of scope.
- **Fiscal-period locking** — nothing stops a posting into a closed month, because there are no
  periods. `01 §10`.
- **Attachments, approval workflow, recurring transactions** — `01 §10`.
- **Converting `AccountsController` to the exception pattern** — §10 above; recommended, but as
  its own commit.
- **Unit tests over R2, R9 and the reversal round-trip** — `02 §5` defers the decision to step
  10. If the schedule holds, those three tests are the highest-value code in the repo.
