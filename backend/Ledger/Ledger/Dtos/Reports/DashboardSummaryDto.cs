namespace Ledger.Dtos.Reports;

using Ledger.Dtos.Transactions;

public record DashboardSummaryDto(
    DateTime AsOf,
    int AccountCount,
    int TransactionCount,
    decimal TotalDebits,
    decimal TotalCredits,
    bool IsBalanced,
    IReadOnlyList<AccountTypeTotalDto> TotalsByType,
    IReadOnlyList<TransactionListItemDto> RecentTransactions);
