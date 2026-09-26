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