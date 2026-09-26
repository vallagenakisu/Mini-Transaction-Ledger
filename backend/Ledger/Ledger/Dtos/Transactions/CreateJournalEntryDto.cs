namespace Ledger.Dtos.Transactions;

using System.ComponentModel.DataAnnotations;

public record CreateJournalEntryDto
{
    [Range(1, int.MaxValue, ErrorMessage = "AccountId is required.")]
    public int AccountId { get; init; }

    [Required]
    public string Direction { get; init; } = string.Empty;   // "Debit" | "Credit"

    [Range(0.0001, 1_000_000_000, ErrorMessage = "Amount must be greater than zero.")]
    public decimal Amount { get; init; }
}