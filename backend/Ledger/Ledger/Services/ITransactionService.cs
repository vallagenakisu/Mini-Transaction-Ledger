namespace Ledger.Services;

using Ledger.Dtos.Common;
using Ledger.Dtos.Transactions;

public interface ITransactionService
{
    Task<PagedResult<TransactionListItemDto>> GetAllAsync(
        DateTime? from, DateTime? to, int? accountId, int page, int pageSize);

    Task<TransactionDto> GetByIdAsync(int id);

    Task<TransactionDto> PostAsync(CreateTransactionDto request, int userId);

    Task<TransactionDto> TransferAsync(TransferDto request, int userId);

    Task<TransactionDto> ReverseAsync(int id, int userId);
}