namespace Ledger.Dtos.Transactions;

using System.ComponentModel.DataAnnotations;

public record TransferDto
{
    [Range(1, int.MaxValue)]
    public int FromAccountId { get; init; }

    [Range(1, int.MaxValue)]
    public int ToAccountId { get; init; }

    [Range(0.0001, 1_000_000_000)]
    public decimal Amount { get; init; }

    [Required]
    [MaxLength(300)]
    public string Description { get; init; } = string.Empty;

    [Required]
    public DateTime TransactionDate { get; init; }
}
