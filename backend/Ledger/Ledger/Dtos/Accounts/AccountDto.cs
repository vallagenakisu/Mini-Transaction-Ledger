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