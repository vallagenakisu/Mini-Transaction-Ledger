namespace Ledger.Dtos.Transactions;

using System.ComponentModel.DataAnnotations;

public record CreateTransactionDto
{
    [Required]
    [MaxLength(300)]
    public string Description { get; init; } = string.Empty;   // R5

    [Required]
    public DateTime TransactionDate { get; init; }

    [MinLength(2, ErrorMessage = "A transaction must have at least two journal entries.")]
    public List<CreateJournalEntryDto> Entries { get; init; } = [];   // R1
}