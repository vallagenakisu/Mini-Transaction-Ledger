# 07 — Accounts and Balances

**Step 7 of 13.** Previous: `06-authentication-authorization.md` (login, JWT, role claims ✅).
Next: `08-transactions-and-posting.md`.
**Date:** 2026-09-26
**Goal:** the chart of accounts becomes a real API — CRUD guarded by role and by the
close-out rule, plus the balance math (`01 §5`) that everything from here on depends on:
current balance, running balance, and opening balance for a date-filtered statement.

This is a **reference plan** — every file below has real code in it, but you type it into
the project yourself rather than have it written for you. Follow it in order; each numbered
task builds on the last, and each has something you can run and check before moving on.

This step produces:

```
backend/Ledger/Ledger/
├── Dtos/
│   └── Accounts/
│       ├── AccountDto.cs
│       ├── CreateAccountDto.cs
│       ├── UpdateAccountDto.cs
│       ├── AccountStatementDto.cs
│       └── StatementEntryDto.cs
├── Services/
│   ├── IBalanceService.cs
│   ├── BalanceService.cs
│   ├── IAccountService.cs
│   └── AccountService.cs
└── Controllers/
    └── AccountsController.cs
```

`IBalanceService` is built **before** `IAccountService`, deliberately — `AccountService`
calls into it (a current-balance figure has to appear on `GET /api/accounts`), and `02 §2.3`
already decided the split: three different callers (accounts list, statement, and step 8's
overdraft check) share one implementation of the normal-balance sign rule. Build the shared
thing first.

---

## 1. DTOs

`Dtos/Accounts/AccountDto.cs` — the list/detail response shape:

```csharp
namespace Ledger.Dtos.Accounts;

public record AccountDto(
    int Id,
    string AccountNumber,
    string Name,
    string Type,
    string Currency,
    bool AllowsNegativeBalance,
    bool IsActive,
    decimal Balance);
```

`Dtos/Accounts/CreateAccountDto.cs` — the `POST /api/accounts` body:

```csharp
namespace Ledger.Dtos.Accounts;

using System.ComponentModel.DataAnnotations;

public record CreateAccountDto
{
    [Required]
    [MaxLength(10)]
    public string AccountNumber { get; init; } = string.Empty;

    [Required]
    [MaxLength(120)]
    public string Name { get; init; } = string.Empty;

    [Required]
    public string Type { get; init; } = string.Empty;

    [Required]
    [MaxLength(3)]
    public string Currency { get; init; } = "BDT";

    public bool AllowsNegativeBalance { get; init; }
}
```

`Dtos/Accounts/UpdateAccountDto.cs` — the `PUT /api/accounts/{id}` body:

```csharp
namespace Ledger.Dtos.Accounts;

using System.ComponentModel.DataAnnotations;

public record UpdateAccountDto
{
    [Required]
    [MaxLength(120)]
    public string Name { get; init; } = string.Empty;

    public bool AllowsNegativeBalance { get; init; }
}
```

`Dtos/Accounts/StatementEntryDto.cs` — one line of a statement:

```csharp
namespace Ledger.Dtos.Accounts;

public record StatementEntryDto(
    int TransactionId,
    string Reference,
    string Description,
    DateTime TransactionDate,
    string Direction,
    decimal Amount,
    decimal RunningBalance);
```

`Dtos/Accounts/AccountStatementDto.cs` — the statement response:

```csharp
namespace Ledger.Dtos.Accounts;

public record AccountStatementDto(
    int AccountId,
    string AccountNumber,
    string AccountName,
    decimal OpeningBalance,
    decimal ClosingBalance,
    int Page,
    int PageSize,
    int TotalCount,
    IReadOnlyList<StatementEntryDto> Entries);
```

**Why `Type` and `Direction` are `string`, not the enum, on the wire:** same call as step 6's
`UserDto.Role` — nothing in this project has registered a `JsonStringEnumConverter`, so an
enum property serializes as a bare integer by default. A client reading `"type": 0` has to
know that `0` means `Asset`; a client reading `"type": "Asset"` doesn't. `.ToString()` at the
DTO boundary keeps the wire format self-describing without touching global JSON config.

**Why `UpdateAccountDto` has no `Type` or `AccountNumber` field:** this is R18 made
structural rather than defended in code. If the DTO doesn't have the field, there's nothing to
bind, nothing to validate away, and nothing a future contributor can "helpfully" wire up by
accident. Compare to step 6's `02 §2.2` argument about `UserDto` and `PasswordHash` — same
principle, opposite direction: there it's about not *exposing* a field, here it's about not
*accepting* one.

---

## 2. `IBalanceService`

```csharp
namespace Ledger.Services;

using Ledger.Dtos.Accounts;
using Ledger.Models;

public interface IBalanceService
{
    Task<decimal> GetBalanceAsync(Account account);

    Task<decimal> GetOpeningBalanceAsync(Account account, DateTime asOfDateExclusive);

    Task<AccountStatementDto?> GetStatementAsync(
        int accountId, DateTime? from, DateTime? to, int page, int pageSize);
}
```

**Why the first two methods take an `Account` entity, not an `int accountId`:** every caller
that needs a balance — `AccountService` listing accounts, `AccountService` deactivating one —
has already loaded the row (it needs `Type` for the sign rule and `IsActive`/`AllowsNegativeBalance`
for its own checks anyway). Taking the entity avoids a second round-trip to re-fetch by id, and
it means this service has no "not found" case to invent for these two methods — that's the
caller's problem, at the point where the caller already solved it. `GetStatementAsync` is
different: the controller only has the route's `{id}`, so that one does its own lookup and
returns `null` on a miss, matching the nullable-for-not-found pattern from step 6's `IAuthService`.

```csharp
namespace Ledger.Services;

using Ledger.Data;
using Ledger.Dtos.Accounts;
using Ledger.Extensions;
using Ledger.Models;
using Microsoft.EntityFrameworkCore;

public class BalanceService : IBalanceService
{
    private readonly AppDbContext _context;

    public BalanceService(AppDbContext context)
    {
        _context = context;
    }

    public Task<decimal> GetBalanceAsync(Account account) =>
        ComputeBalanceAsync(account, asOfDateExclusive: null);

    public Task<decimal> GetOpeningBalanceAsync(Account account, DateTime asOfDateExclusive) =>
        ComputeBalanceAsync(account, asOfDateExclusive);

    private async Task<decimal> ComputeBalanceAsync(Account account, DateTime? asOfDateExclusive)
    {
        var query = _context.JournalEntries.Where(e => e.AccountId == account.Id);

        if (asOfDateExclusive is not null)
        {
            query = query.Where(e => e.Transaction.TransactionDate < asOfDateExclusive.Value);
        }

        var rawBalance = await query.SumAsync(e =>
            e.Direction == EntryDirection.Debit ? e.Amount : -e.Amount);

        return account.Type.NormalBalance() == EntryDirection.Debit ? rawBalance : -rawBalance;
    }

    public async Task<AccountStatementDto?> GetStatementAsync(
        int accountId, DateTime? from, DateTime? to, int page, int pageSize)
    {
        var account = await _context.Accounts.FindAsync(accountId);
        if (account is null)
        {
            return null;
        }

        var openingBalance = from is not null
            ? await GetOpeningBalanceAsync(account, from.Value)
            : 0m;

        var entriesQuery = _context.JournalEntries.Where(e => e.AccountId == accountId);

        if (from is not null)
        {
            entriesQuery = entriesQuery.Where(e => e.Transaction.TransactionDate >= from.Value);
        }

        if (to is not null)
        {
            entriesQuery = entriesQuery.Where(e => e.Transaction.TransactionDate <= to.Value);
        }

        var orderedEntries = await entriesQuery
            .OrderBy(e => e.Transaction.TransactionDate)
            .ThenBy(e => e.TransactionId)
            .ThenBy(e => e.Id)
            .Select(e => new
            {
                e.TransactionId,
                e.Transaction.Reference,
                e.Transaction.Description,
                e.Transaction.TransactionDate,
                e.Direction,
                e.Amount,
            })
            .ToListAsync();

        var normalBalance = account.Type.NormalBalance();
        var running = openingBalance;
        var allLines = new List<StatementEntryDto>(orderedEntries.Count);

        foreach (var entry in orderedEntries)
        {
            var signedDelta = entry.Direction == normalBalance ? entry.Amount : -entry.Amount;
            running += signedDelta;

            allLines.Add(new StatementEntryDto(
                entry.TransactionId,
                entry.Reference,
                entry.Description,
                entry.TransactionDate,
                entry.Direction.ToString(),
                entry.Amount,
                running));
        }

        var closingBalance = allLines.Count > 0 ? allLines[^1].RunningBalance : openingBalance;

        var pagedLines = allLines
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        return new AccountStatementDto(
            account.Id,
            account.AccountNumber,
            account.Name,
            openingBalance,
            closingBalance,
            page,
            pageSize,
            allLines.Count,
            pagedLines);
    }
}
```

**Why `SumAsync` needs no empty-sequence special case:** `Sum` over zero rows is `0`, not an
exception and not `null` — that's true for `int`/`decimal`/`double` alike (it's `Average` that
has the empty-sequence problem, because there's no sensible average of nothing). This is what
makes a brand-new account with zero journal entries correctly report a balance of `0` with no
`if (!entries.Any())` guard anywhere. Worth saying out loud if asked, because the instinct to
add that guard is common and it isn't needed here.

**Why the statement fetches the *entire* filtered date range before paging, instead of asking
the database for just one page:** the running balance on page 2 has to continue from page 1's
closing balance. If you `Skip`/`Take` at the query level *before* accumulating, you'd need a
second aggregate query — "sum of all entries in range before this page's offset" — just to
know where the running total should resume. Fetching the whole range, accumulating once, and
slicing the *already-computed* list sidesteps that second query entirely. For a "mini" ledger
this is the right trade-off; `01 §5.2`'s named scaling answer (a `SUM(...) OVER (PARTITION BY
...)` window function, computed entirely in Postgres) is what you'd reach for once one
account's entry count stopped being something you'd comfortably hold in memory.

**Why `ORDER BY TransactionDate, TransactionId, JournalEntryId` and not just the date:**
`01 §5.2` — two transactions can share a `TransactionDate`. Without the id tiebreakers the
order isn't deterministic, and the running-balance column would shuffle between requests for
entries posted on the same day.

**What this service deliberately does not do:** anything about row locking. R9's overdraft
guard needs `SELECT ... FOR UPDATE` at the moment of posting (`01 §9`, `02 §2.5`) — that only
makes sense inside step 8's posting transaction. This service answers "what is the balance
right now," full stop; it is not concurrency-safe and isn't meant to be. Step 8 will call
`GetBalanceAsync` *inside* a locked transaction to make the overdraft check safe — the lock is
step 8's responsibility, not this service's.

---

## 3. `IAccountService`

```csharp
namespace Ledger.Services;

using Ledger.Dtos.Accounts;
using Ledger.Models;

public enum AccountMutationOutcome
{
    Success,
    NotFound,
    DuplicateAccountNumber,
    InvalidType,
    NonZeroBalance,
}

public interface IAccountService
{
    Task<IReadOnlyList<AccountDto>> GetAllAsync(AccountType? type, bool? isActive);

    Task<AccountDto?> GetByIdAsync(int id);

    Task<(AccountMutationOutcome Outcome, AccountDto? Account)> CreateAsync(CreateAccountDto request);

    Task<(AccountMutationOutcome Outcome, AccountDto? Account)> UpdateAsync(int id, UpdateAccountDto request);

    Task<AccountMutationOutcome> DeactivateAsync(int id);
}
```

**Why a result tuple instead of throwing, and instead of a generic `Result<T>` wrapper class:**
`02 §2.2` says a service returns DTOs, never an `IActionResult` — but create/update/deactivate
each have more than one non-exception outcome the controller needs to tell apart (success,
not-found, conflict, bad input). `ExceptionHandlingMiddleware` doesn't exist until step 8
(`02 §2.6`'s folder list puts it there), so throwing custom exceptions now means either an
unhandled 500 or a try/catch in every action — worse than just returning what happened. A
`(Outcome, Value)` tuple is the smallest thing that lets the controller pattern-match to a
status code without inventing a wrapper type that only this file uses.

```csharp
namespace Ledger.Services;

using Ledger.Data;
using Ledger.Dtos.Accounts;
using Ledger.Models;
using Microsoft.EntityFrameworkCore;

public class AccountService : IAccountService
{
    private readonly AppDbContext _context;
    private readonly IBalanceService _balanceService;

    public AccountService(AppDbContext context, IBalanceService balanceService)
    {
        _context = context;
        _balanceService = balanceService;
    }

    public async Task<IReadOnlyList<AccountDto>> GetAllAsync(AccountType? type, bool? isActive)
    {
        var query = _context.Accounts.AsQueryable();

        if (type is not null)
        {
            query = query.Where(a => a.Type == type.Value);
        }

        if (isActive is not null)
        {
            query = query.Where(a => a.IsActive == isActive.Value);
        }

        var accounts = await query.OrderBy(a => a.AccountNumber).ToListAsync();

        var result = new List<AccountDto>(accounts.Count);
        foreach (var account in accounts)
        {
            var balance = await _balanceService.GetBalanceAsync(account);
            result.Add(ToDto(account, balance));
        }

        return result;
    }

    public async Task<AccountDto?> GetByIdAsync(int id)
    {
        var account = await _context.Accounts.FindAsync(id);
        if (account is null)
        {
            return null;
        }

        var balance = await _balanceService.GetBalanceAsync(account);
        return ToDto(account, balance);
    }

    public async Task<(AccountMutationOutcome Outcome, AccountDto? Account)> CreateAsync(
        CreateAccountDto request)
    {
        if (!Enum.TryParse<AccountType>(request.Type, ignoreCase: true, out var type))
        {
            return (AccountMutationOutcome.InvalidType, null);
        }

        var duplicate = await _context.Accounts
            .AnyAsync(a => a.AccountNumber == request.AccountNumber);

        if (duplicate)
        {
            return (AccountMutationOutcome.DuplicateAccountNumber, null);
        }

        var account = new Account
        {
            AccountNumber = request.AccountNumber,
            Name = request.Name,
            Type = type,
            Currency = request.Currency,
            AllowsNegativeBalance = request.AllowsNegativeBalance,
            IsActive = true,
        };

        _context.Accounts.Add(account);
        await _context.SaveChangesAsync();

        // A brand-new account has no journal entries yet — its balance is trivially zero,
        // no need to ask IBalanceService for something we already know.
        return (AccountMutationOutcome.Success, ToDto(account, balance: 0m));
    }

    public async Task<(AccountMutationOutcome Outcome, AccountDto? Account)> UpdateAsync(
        int id, UpdateAccountDto request)
    {
        var account = await _context.Accounts.FindAsync(id);
        if (account is null)
        {
            return (AccountMutationOutcome.NotFound, null);
        }

        account.Name = request.Name;
        account.AllowsNegativeBalance = request.AllowsNegativeBalance;

        await _context.SaveChangesAsync();

        var balance = await _balanceService.GetBalanceAsync(account);
        return (AccountMutationOutcome.Success, ToDto(account, balance));
    }

    public async Task<AccountMutationOutcome> DeactivateAsync(int id)
    {
        var account = await _context.Accounts.FindAsync(id);
        if (account is null)
        {
            return AccountMutationOutcome.NotFound;
        }

        var balance = await _balanceService.GetBalanceAsync(account);
        if (balance != 0m)
        {
            return AccountMutationOutcome.NonZeroBalance;
        }

        account.IsActive = false;
        await _context.SaveChangesAsync();

        return AccountMutationOutcome.Success;
    }

    private static AccountDto ToDto(Account account, decimal balance) => new(
        account.Id,
        account.AccountNumber,
        account.Name,
        account.Type.ToString(),
        account.Currency,
        account.AllowsNegativeBalance,
        account.IsActive,
        balance);
}
```

**Why the duplicate-`AccountNumber` check happens in the service before `SaveChangesAsync`,
even though step 5 already put a unique index on the column:** the index is the backstop that
makes a race condition impossible, not the primary error path. Without the pre-check, a
duplicate submission surfaces as a raw `DbUpdateException` wrapping a Postgres unique-violation
— which the controller would have to parse to tell apart from any other database failure. The
`AnyAsync` check turns the common case into a clean, named outcome; the index is what catches
the rare simultaneous-request case the check itself can't.

**Why R16 (Admin-only) isn't checked again inside `AccountService`:** `02 §2.2`'s layer table —
authorization is the controller's job (`[Authorize(Roles = ...)]`), business rules are the
service's job. Re-checking the role here would duplicate a check the pipeline already made
before the action method ever ran, per the middleware order from `02 §2.1`.

**Why R17 (`NonZeroBalance`) calls `_balanceService.GetBalanceAsync`, never a second aggregate
query written by hand:** this is `02 §2.3`'s "one implementation, several callers" argument
made concrete. If `AccountService` had its own `SUM(...)` for this check, there would be two
places in the codebase that could disagree about what an account's balance is — exactly the
drift `01 §5.1` says derived data must never allow.

---

## 4. `AccountsController`

```csharp
namespace Ledger.Controllers;

using Ledger.Authorization;
using Ledger.Dtos.Accounts;
using Ledger.Models;
using Ledger.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/accounts")]
[Authorize]
public class AccountsController : ControllerBase
{
    private readonly IAccountService _accountService;
    private readonly IBalanceService _balanceService;

    public AccountsController(IAccountService accountService, IBalanceService balanceService)
    {
        _accountService = accountService;
        _balanceService = balanceService;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<AccountDto>>> GetAll(
        [FromQuery] string? type, [FromQuery] bool? active)
    {
        AccountType? parsedType = null;

        if (!string.IsNullOrWhiteSpace(type))
        {
            if (!Enum.TryParse<AccountType>(type, ignoreCase: true, out var value))
            {
                return BadRequest(new ProblemDetails { Title = $"Unknown account type '{type}'." });
            }

            parsedType = value;
        }

        var accounts = await _accountService.GetAllAsync(parsedType, active);
        return Ok(accounts);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<AccountDto>> GetById(int id)
    {
        var account = await _accountService.GetByIdAsync(id);
        return account is null ? NotFound() : Ok(account);
    }

    [HttpPost]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<AccountDto>> Create(CreateAccountDto request)
    {
        var (outcome, account) = await _accountService.CreateAsync(request);

        return outcome switch
        {
            AccountMutationOutcome.Success =>
                CreatedAtAction(nameof(GetById), new { id = account!.Id }, account),

            AccountMutationOutcome.DuplicateAccountNumber => Conflict(new ProblemDetails
            {
                Title = $"Account number '{request.AccountNumber}' is already in use.",
                Status = StatusCodes.Status409Conflict,
            }),

            AccountMutationOutcome.InvalidType => BadRequest(new ProblemDetails
            {
                Title = $"Unknown account type '{request.Type}'.",
            }),

            _ => BadRequest(),
        };
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<AccountDto>> Update(int id, UpdateAccountDto request)
    {
        var (outcome, account) = await _accountService.UpdateAsync(id, request);

        return outcome switch
        {
            AccountMutationOutcome.Success => Ok(account),
            AccountMutationOutcome.NotFound => NotFound(),
            _ => BadRequest(),
        };
    }

    [HttpPost("{id:int}/deactivate")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Deactivate(int id)
    {
        var outcome = await _accountService.DeactivateAsync(id);

        return outcome switch
        {
            AccountMutationOutcome.Success => NoContent(),
            AccountMutationOutcome.NotFound => NotFound(),

            AccountMutationOutcome.NonZeroBalance => BadRequest(new ProblemDetails
            {
                Title = "Cannot deactivate an account with a non-zero balance.",
                Status = StatusCodes.Status400BadRequest,
            }),

            _ => BadRequest(),
        };
    }

    [HttpGet("{id:int}/statement")]
    public async Task<ActionResult<AccountStatementDto>> GetStatement(
        int id,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
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

        var statement = await _balanceService.GetStatementAsync(id, from, to, page, pageSize);
        return statement is null ? NotFound() : Ok(statement);
    }
}
```

**Why `[Authorize]` sits on the class and `[Authorize(Roles = Roles.Admin)]` stacks on top of
three actions, rather than repeating both on every action:** ASP.NET Core combines multiple
`[Authorize]` attributes on the same action with **AND** semantics — an admin-only action still
requires the class-level "must be authenticated" check to pass, then additionally requires the
role match. Writing the base requirement once at the class level and the stricter one only
where R16 actually applies makes the two GET endpoints' looser requirement ("any authenticated
user") visible by its *absence* of an extra attribute, instead of by a repeated identical line
on every read action.

**Why `Create` returns `CreatedAtAction`, not a bare `Ok`:** a `201 Created` response should
carry a `Location` header pointing at the new resource — `CreatedAtAction(nameof(GetById), ...)`
builds that header from the same route the client would `GET` next, instead of a hand-typed
URL string that can drift from the actual route template.

**Why `pageSize` is clamped instead of validated-and-rejected:** an out-of-range page size on a
read-only, paginated GET isn't a client error worth a `400` for — silently falling back to a
sane default (`25`) is friendlier and there's no invariant at risk. Contrast this with `Create`'s
`InvalidType`, which *is* rejected: an unrecognized account type is a request that cannot be
honestly fulfilled, not a cosmetic preference like a page size.

---

## 5. Wiring — `Program.cs`

Add two `AddScoped` registrations alongside the ones step 6 added, in the same build-order as
this doc (`BalanceService` before `AccountService`, since the second depends on the first):

```csharp
builder.Services.AddScoped<IBalanceService, BalanceService>();
builder.Services.AddScoped<IAccountService, AccountService>();
```

They go next to `builder.Services.AddScoped<IAuthService, AuthService>();` from step 6, before
`builder.Build()`. Same lifetime reasoning as step 6: both depend on `AppDbContext`, which EF
Core registers as scoped, so a longer lifetime here would be the same captive-dependency bug
step 6 called out.

---

## 6. Verifying it

With Postgres up, `dotnet run`, and a token from step 6 (`https://localhost:<port>` — check
`Properties/launchSettings.json` for the exact port, and remember the HTTP port silently
307-redirects, so test against HTTPS):

```bash
ADMIN_TOKEN=$(curl -sk -X POST https://localhost:7113/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@misl.com","password":"Admin@123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")

ACCOUNTANT_TOKEN=$(curl -sk -X POST https://localhost:7113/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"accountant@misl.com","password":"Accountant@123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
```

**List — all 11 seeded accounts, each at balance 0:**
```bash
curl -sk https://localhost:7113/api/accounts -H "Authorization: Bearer $ACCOUNTANT_TOKEN"
```

**Create — Accountant forbidden, Admin allowed:**
```bash
curl -sk -o /dev/null -w '%{http_code}\n' -X POST https://localhost:7113/api/accounts \
  -H "Authorization: Bearer $ACCOUNTANT_TOKEN" -H 'Content-Type: application/json' \
  -d '{"accountNumber":"6001","name":"Test","type":"Expense","currency":"BDT","allowsNegativeBalance":false}'
# expect 403

curl -sk -X POST https://localhost:7113/api/accounts \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"accountNumber":"6001","name":"Test Expense","type":"Expense","currency":"BDT","allowsNegativeBalance":false}'
# expect 201 with Location header and the new account
```

**Create — duplicate `AccountNumber`:**
```bash
curl -sk -o /dev/null -w '%{http_code}\n' -X POST https://localhost:7113/api/accounts \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"accountNumber":"1001","name":"Duplicate","type":"Asset","currency":"BDT","allowsNegativeBalance":false}'
# expect 409
```

**Update — confirm `Type`/`AccountNumber` aren't even acceptable fields:**
```bash
curl -sk -X PUT https://localhost:7113/api/accounts/1 \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Cash Drawer","allowsNegativeBalance":false}'
# expect 200 — note there is no way to even attempt sending "type" in this body's contract
```

**Deactivate — a zero-balance seeded account succeeds:**
```bash
curl -sk -o /dev/null -w '%{http_code}\n' -X POST https://localhost:7113/api/accounts/6/deactivate \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# expect 204
```

**Statement — empty range, opening and closing balance both 0:**
```bash
curl -sk https://localhost:7113/api/accounts/1/statement -H "Authorization: Bearer $ADMIN_TOKEN"
```

Nothing here can be exercised against a *non-zero* balance until step 8 adds posting — that's
expected. The zero-balance cases above are still real tests: sign errors and off-by-one bugs in
the balance formula usually show up first in the empty case, not the populated one.

---

## 7. A pre-existing bug to know about before you get to step 8

`Models/Transaction.cs` (from step 4) has:

```csharp
public bool IsReversed => ReversalOfTransactionId.HasValue;
public bool IsReversal => ReversedByTransactionId.HasValue;
```

These read backwards. `ReversalOfTransactionId` being set means *this* transaction **is a
reversal** of another (`IsReversal` should read this), and `ReversedByTransactionId` being set
means *this* transaction **has been reversed** (`IsReversed` should read that). Nothing in
Step 7 calls either property, so it's not this step's concern to fix — but it will matter in
step 8's reversal logic (R12/R13), so it's flagged here rather than being a surprise there.

---

## 8. Viva questions this step answers

1. **Why is balance a computed method, not a column?** `01 §5.1` — a stored balance is a cache
   that can drift from the entries that produced it whenever a write path forgets to update it.
   Deriving it makes it correct by construction; the scaling answer (name it, don't build it)
   is a periodic snapshot plus entries-since.
2. **Why does the running-balance query sort by three columns, not just date?** Two
   transactions can share a `TransactionDate`. Without `TransactionId, JournalEntryId` as
   tiebreakers the order — and therefore the running balance shown — isn't deterministic
   across requests.
3. **Why fetch the whole date-filtered range before paging, instead of paging at the database
   level?** The running balance on page 2 must continue from page 1's closing balance. Paging
   before accumulating would need a second aggregate query just to find where to resume; fetching
   the full range once and slicing the computed list avoids that, and is the right trade-off at
   this project's scale. The window-function form is the named answer for when it stops being one.
4. **Why is `IBalanceService` separate from `IAccountService`?** Three independent callers need
   the same sign rule: the accounts list (current balance), the statement (running balance), and
   step 8's overdraft check. One implementation, three callers — folding it into `IAccountService`
   would make step 8's `ITransactionService` depend on account-CRUD logic for something that isn't
   about accounts CRUD at all.
5. **Why do `GetBalanceAsync`/`GetOpeningBalanceAsync` take an `Account` entity instead of an
   id?** Every internal caller has already loaded the row for its own reasons (it needs `Type`
   or `AllowsNegativeBalance`); taking the entity avoids a redundant fetch and removes any
   "not found" case from a method that, by construction, is never called with a bad id.
6. **Why can't `UpdateAccountDto` carry `Type` or `AccountNumber`?** R18 makes both write-once
   after creation. Leaving the fields off the DTO enforces that at the type level — there's no
   field to remember to reject, because it was never accepted.
7. **Where does the zero-balance check for deactivation live, and why there?**
   `AccountService`, by calling `IBalanceService.GetBalanceAsync` — never a second hand-written
   aggregate. Two implementations of "what is this account's balance" is exactly the drift risk
   `01 §5.1` warns about, just moved into application code instead of the database.
8. **Why does `AccountService` return a tuple instead of throwing on a duplicate account
   number?** `ExceptionHandlingMiddleware` doesn't exist until step 8. A tuple result the
   controller pattern-matches on maps cleanly to `409`/`400`/`404` today without an unhandled
   500 or a try/catch scattered across every action.
9. **Why is the duplicate-`AccountNumber` check done in code when the database already has a
   unique index?** The index is the backstop for a race condition between two simultaneous
   requests; the code check is what turns the *common* case into a clean `409` instead of a raw
   constraint-violation exception the controller would otherwise have to parse.

---

## 9. Out of scope for this step

- **Posting transactions** and the R9 overdraft guard that needs `IBalanceService` inside a
  locked transaction — step 8
- **Reversal** (R10–R14) — step 8
- The **trial balance** and dashboard summary that aggregate across *all* accounts — step 9
- `ExceptionHandlingMiddleware` / standardised `ProblemDetails` error bodies for every
  controller — introduced in step 8 alongside the posting service, where the number of failure
  modes first makes it worth it; the tuple-result pattern here is the interim answer
- Frontend accounts list, statement page, `<Money>` component — step 10
