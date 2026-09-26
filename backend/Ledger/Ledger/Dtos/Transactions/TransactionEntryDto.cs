namespace Ledger.Dtos.Transactions;

public record TransactionEntryDto(
    int Id,
    int AccountId,
    string AccountNumber,
    string AccountName,
    string Direction,
    decimal Amount);
