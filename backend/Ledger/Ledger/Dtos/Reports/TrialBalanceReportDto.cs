namespace Ledger.Dtos.Reports;

public record TrialBalanceReportDto(
    DateTime AsOf,
    decimal TotalDebits,
    decimal TotalCredits,
    bool IsBalanced,
    IReadOnlyList<TrialBalanceLineDto> Lines);
