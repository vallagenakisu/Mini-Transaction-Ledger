namespace Ledger.Controllers;

using Ledger.Dtos.Reports;
using Ledger.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/reports")]
[Authorize]
public class ReportsController : ControllerBase
{
    private readonly IReportService _reportService;

    public ReportsController(IReportService reportService)
    {
        _reportService = reportService;
    }

    // Both roles may read reports (01 §8) — reporting is the read side of the ledger, and an
    // Accountant who may post entries can certainly see what they add up to.
    [HttpGet("trial-balance")]
    public async Task<ActionResult<TrialBalanceReportDto>> GetTrialBalance(
        [FromQuery] DateTime? asOf) =>
        Ok(await _reportService.GetTrialBalanceAsync(asOf));
}
