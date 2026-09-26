namespace Ledger.Controllers;

using Ledger.Authorization;
using Ledger.Dtos.Common;
using Ledger.Dtos.Transactions;
using Ledger.Extensions;
using Ledger.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/transactions")]
[Authorize]
public class TransactionsController : ControllerBase
{
    private readonly ITransactionService _transactionService;

    public TransactionsController(ITransactionService transactionService)
    {
        _transactionService = transactionService;
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<TransactionListItemDto>>> GetAll(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int? accountId,
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

        var result = await _transactionService.GetAllAsync(from, to, accountId, page, pageSize);
        return Ok(result);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<TransactionDto>> GetById(int id) =>
        Ok(await _transactionService.GetByIdAsync(id));

    [HttpPost]
    public async Task<ActionResult<TransactionDto>> Post(CreateTransactionDto request)
    {
        var transaction = await _transactionService.PostAsync(request, User.GetUserId());
        return CreatedAtAction(nameof(GetById), new { id = transaction.Id }, transaction);
    }

    [HttpPost("transfer")]
    public async Task<ActionResult<TransactionDto>> Transfer(TransferDto request)
    {
        var transaction = await _transactionService.TransferAsync(request, User.GetUserId());
        return CreatedAtAction(nameof(GetById), new { id = transaction.Id }, transaction);
    }

    [HttpPost("{id:int}/reverse")]
    [Authorize(Roles = Roles.Admin)]   // R14
    public async Task<ActionResult<TransactionDto>> Reverse(int id)
    {
        var reversal = await _transactionService.ReverseAsync(id, User.GetUserId());
        return CreatedAtAction(nameof(GetById), new { id = reversal.Id }, reversal);
    }

    // There is deliberately no PUT and no DELETE here (R10). A ledger is an audit trail;
    // a mistake is corrected by POST /{id}/reverse, which adds a record rather than
    // removing one. The absence of these two verbs is a designed feature — 01 §6.
}
