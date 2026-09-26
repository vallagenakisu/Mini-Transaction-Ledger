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
