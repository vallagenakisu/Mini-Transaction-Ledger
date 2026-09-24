namespace Ledger.Models;

public class Account
{
    public int Id { get; set; }
    public string AccountNumber { get; set; }
    public string Name { get; set; }
    public AccountType Type { get; private set; }
    public string Currency { get; set; }
    public bool AllowsNegativeBalance { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public ICollection<JournalEntry> JournalEntries { get; set; } = new List<JournalEntry>();
}