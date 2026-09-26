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