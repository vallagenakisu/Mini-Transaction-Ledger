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
    
    private async Task<string> NextReferenceAsync()
    {
        // nextval() always returns bigint, whatever the sequence's own type.
        // EF Core's SqlQuery requires the scalar column be named "Value".
        var next = await _context.Database
            .SqlQueryRaw<long>("""SELECT nextval('transaction_reference_seq') AS "Value" """)
            .SingleAsync();

        return $"TXN-{DateTime.UtcNow:yyyy}-{next:D6}";
    }

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
    