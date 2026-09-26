namespace Ledger.Dtos.Accounts;

public record StatementEntryDto(
    int TransactionId,
    string Reference,
    string Description,
    DateTime TransactionDate,
    string Direction,
    decimal Amount,
    decimal RunningBalance);