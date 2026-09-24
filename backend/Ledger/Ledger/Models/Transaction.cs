namespace Ledger.Models;

public class Transaction
{
    public int Id { get; set; }
    public string Reference { get; set; }
    public string Description { get; set; }
    public DateTime TransactionDate { get; set; }
    public DateTime PostedAt { get; set; }
    public int CreatedByUserId { get; set; }
    public int? ReversalOfTransactionId { get; set; }
    public int? ReversedByTransactionId { get; set; }
    public User CreatedBy { get; set; }
    public Transaction ReversalOf { get; set; }
    public Transaction ReversedBy { get; set; }
    public ICollection<JournalEntry> JournalEntries { get; set; } = new List<JournalEntry>();

    public bool IsReversed => ReversalOfTransactionId.HasValue;
    public bool IsReversal => ReversedByTransactionId.HasValue;
}