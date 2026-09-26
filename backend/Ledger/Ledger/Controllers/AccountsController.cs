namespace Ledger.Controllers;

using Ledger.Authorization;
using Ledger.Dtos.Accounts;
using Ledger.Models;
using Ledger.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/accounts")]
[Authorize]
public class AccountsController : ControllerBase
{
    private readonly IAccountService _accountService;
    private readonly IBalanceService _balanceService;

    public AccountsController(IAccountService accountService, IBalanceService balanceService)
    {
        _accountService = accountService;
        _balanceService = balanceService;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<AccountDto>>> GetAll(
        [FromQuery] string? type, [FromQuery] bool? active)
    {
        AccountType? parsedType = null;

        if (!string.IsNullOrWhiteSpace(type))
        {
            if (!Enum.TryParse<AccountType>(type, ignoreCase: true, out var value))
            {
                return BadRequest(new ProblemDetails { Title = $"Unknown account type '{type}'." });
            }

            parsedType = value;
        }

        var accounts = await _accountService.GetAllAsync(parsedType, active);
        return Ok(accounts);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<AccountDto>> GetById(int id)
    {
        var account = await _accountService.GetByIdAsync(id);
        return account is null ? NotFound() : Ok(account);
    }

    [HttpPost]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<AccountDto>> Create(CreateAccountDto request)
    {
        var (outcome, account) = await _accountService.CreateAsync(request);

        return outcome switch
        {
            AccountMutationOutcome.Success =>
                CreatedAtAction(nameof(GetById), new { id = account!.Id }, account),

            AccountMutationOutcome.DuplicateAccountNumber => Conflict(new ProblemDetails
            {
                Title = $"Account number '{request.AccountNumber}' is already in use.",
                Status = StatusCodes.Status409Conflict,
            }),

            AccountMutationOutcome.InvalidType => BadRequest(new ProblemDetails
            {
                Title = $"Unknown account type '{request.Type}'.",
            }),

            _ => BadRequest(),
        };
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<AccountDto>> Update(int id, UpdateAccountDto request)
    {
        var (outcome, account) = await _accountService.UpdateAsync(id, request);

        return outcome switch
        {
            AccountMutationOutcome.Success => Ok(account),
            AccountMutationOutcome.NotFound => NotFound(),
            _ => BadRequest(),
        };
    }

    [HttpPost("{id:int}/deactivate")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> Deactivate(int id)
    {
        var outcome = await _accountService.DeactivateAsync(id);

        return outcome switch
        {
            AccountMutationOutcome.Success => NoContent(),
            AccountMutationOutcome.NotFound => NotFound(),

            AccountMutationOutcome.NonZeroBalance => BadRequest(new ProblemDetails
            {
                Title = "Cannot deactivate an account with a non-zero balance.",
                Status = StatusCodes.Status400BadRequest,
            }),

            _ => BadRequest(),
        };
    }

    [HttpGet("{id:int}/statement")]
    public async Task<ActionResult<AccountStatementDto>> GetStatement(
        int id,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25)
    {
        if (page < 1)
        {
            page = 1;
        }

        if (pageSize is < 1 or > 200)
        {
            pageSize = 25;
        }

        var statement = await _balanceService.GetStatementAsync(id, from, to, page, pageSize);
        return statement is null ? NotFound() : Ok(statement);
    }
}
