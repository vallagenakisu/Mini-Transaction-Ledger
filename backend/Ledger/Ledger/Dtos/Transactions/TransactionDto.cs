namespace Ledger.Dtos.Transactions;

public record TransactionDto(
    int Id,
    string Reference,
    string Description,
    DateTime TransactionDate,
    DateTime PostedAt,
    string CreatedBy,
    bool IsReversal,
    bool IsReversed,
    int? ReversalOfTransactionId,
    int? ReversedByTransactionId,
    decimal TotalAmount,
    IReadOnlyList<TransactionEntryDto> Entries);
