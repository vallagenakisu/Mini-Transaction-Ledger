namespace Ledger.Controllers;

using Ledger.Dtos.Reports;
using Ledger.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/dashboard")]
[Authorize]
public class DashboardController : ControllerBase
{
    private readonly IReportService _reportService;

    public DashboardController(IReportService reportService)
    {
        _reportService = reportService;
    }

    [HttpGet("summary")]
    public async Task<ActionResult<DashboardSummaryDto>> GetSummary([FromQuery] int recent = 5)
    {
        // Clamped rather than rejected, matching the paging guards in the other two
        // controllers: a dashboard widget asking for a silly number gets the default, not
        // a 400 that blanks the whole page.
        if (recent is < 1 or > 50)
        {
            recent = 5;
        }

        return Ok(await _reportService.GetDashboardSummaryAsync(recent));
    }
}
