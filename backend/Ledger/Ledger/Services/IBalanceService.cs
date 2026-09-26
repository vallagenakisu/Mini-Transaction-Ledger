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