namespace Ledger.Services;

using Ledger.Data;
using Ledger.Dtos.Reports;
using Ledger.Extensions;
using Ledger.Models;
using Microsoft.EntityFrameworkCore;

public class ReportService : IReportService
{
    private readonly AppDbContext _context;
    private readonly ITransactionService _transactionService;

    public ReportService(AppDbContext context, ITransactionService transactionService)
    {
        _context = context;
        _transactionService = transactionService;
    }

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

        var lines = new List<TrialBalanceLineDto>(accounts.Count);
        var grandDebits = 0m;
        var grandCredits = 0m;

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
                account.Id,
                account.AccountNumber,
                account.Name,
                account.Type.ToString(),
                debits,
                credits,
                balance));
        }

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

    public async Task<DashboardSummaryDto> GetDashboardSummaryAsync(int recentCount)
    {
        var accounts = await _context.Accounts
            .AsNoTracking()
            .ToListAsync();

        var rawBalances = await _context.JournalEntries
            .GroupBy(e => e.AccountId)
            .Select(g => new
            {
                AccountId = g.Key,
                Raw = g.Sum(e => e.Direction == EntryDirection.Debit ? e.Amount : -e.Amount),
            })
            .ToListAsync();

        var rawByAccount = rawBalances.ToDictionary(b => b.AccountId, b => b.Raw);

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

        var directionTotals = await _context.JournalEntries
            .GroupBy(e => e.Direction)
            .Select(g => new { Direction = g.Key, Total = g.Sum(e => e.Amount) })
            .ToListAsync();

        var totalDebits = directionTotals
            .FirstOrDefault(d => d.Direction == EntryDirection.Debit)?.Total ?? 0m;
        var totalCredits = directionTotals
            .FirstOrDefault(d => d.Direction == EntryDirection.Credit)?.Total ?? 0m;

        // "Recent transactions" is page 1 of the journal, which ITransactionService already
        // orders and projects. Calling it costs one query and avoids a second copy of the
        // list projection that would then have to be kept in step with the journal page.
        var recentPage = await _transactionService.GetAllAsync(
            from: null, to: null, accountId: null, page: 1, pageSize: recentCount);

        return new DashboardSummaryDto(
            AsOf: DateTime.UtcNow,
            AccountCount: accounts.Count,
            TransactionCount: recentPage.TotalCount,
            totalDebits,
            totalCredits,
            IsBalanced: totalDebits == totalCredits,
            totalsByType,
            recentPage.Items);
    }
}
