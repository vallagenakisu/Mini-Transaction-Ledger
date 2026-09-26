namespace Ledger.Services;

using Ledger.Data;
using Ledger.Dtos.Accounts;
using Ledger.Extensions;
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
        var accountIds = accounts.Select(a => a.Id).ToList();

        // Fetch all balances in one query using group-by instead of N+1
        var balances = await _context.JournalEntries
            .Where(e => accountIds.Contains(e.AccountId))
            .GroupBy(e => e.AccountId)
            .Select(g => new { AccountId = g.Key, RawBalance = g.Sum(e => e.Direction == EntryDirection.Debit ? e.Amount : -e.Amount) })
            .ToListAsync();

        var balanceDict = balances.ToDictionary(b => b.AccountId, b => b.RawBalance);

        var result = new List<AccountDto>(accounts.Count);
        foreach (var account in accounts)
        {
            var rawBalance = balanceDict.TryGetValue(account.Id, out var bal) ? bal : 0m;
            var finalBalance = account.Type.NormalBalance() == EntryDirection.Debit ? rawBalance : -rawBalance;
            result.Add(ToDto(account, finalBalance));
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
            CreatedAt = DateTime.UtcNow,
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
