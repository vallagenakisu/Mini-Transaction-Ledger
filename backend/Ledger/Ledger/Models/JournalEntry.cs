namespace Ledger.Models;

public class JournalEntry
{
    public int Id { get; set; }
    public int TransactionId { get; set; }
    public int AccountId { get; set; }
    public EntryDirection Direction { get; set; }
    public decimal Amount { get; set; }
    public Transaction Transaction { get; set; }
    public Account Account { get; set; }

    public decimal SignedAmount => Direction == EntryDirection.Debit ? Amount : -Amount;
}