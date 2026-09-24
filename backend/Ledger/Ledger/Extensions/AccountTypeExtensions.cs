namespace Ledger.Extensions;

using Ledger.Models;

public static class AccountTypeExtensions
{
    public static EntryDirection NormalBalance(this AccountType type)
    {
        return type switch
        {
            AccountType.Asset => EntryDirection.Debit,
            AccountType.Liability => EntryDirection.Credit,
            AccountType.Equity => EntryDirection.Credit,
            AccountType.Expense => EntryDirection.Debit,
            AccountType.Income => EntryDirection.Credit,
            _ => throw new ArgumentException("Unknown account type")
        };
    }
}
