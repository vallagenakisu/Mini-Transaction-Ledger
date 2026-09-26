namespace Ledger.Dtos.Transactions;

public record TransactionListItemDto(
    int Id,
    string Reference,
    string Description,
    DateTime TransactionDate,
    DateTime PostedAt,
    string CreatedBy,
    bool IsReversal,
    bool IsReversed,
    decimal TotalAmount);
