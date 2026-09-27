namespace Ledger.Services;

using Ledger.Dtos.Reports;

public interface IReportService
{
    Task<TrialBalanceReportDto> GetTrialBalanceAsync(DateTime? asOf);

    Task<DashboardSummaryDto> GetDashboardSummaryAsync(int recentCount);
}
