namespace Ledger.Data;

using Ledger.Models;
using Microsoft.EntityFrameworkCore;

public static class DbSeeder
{
    public static async Task SeedAsync(AppDbContext context)
    {
        if (await context.Accounts.AnyAsync())
        {
            return;
        }

        var accounts = new[]
        {
            new Account { AccountNumber = "1001", Name = "Cash in Hand", Type = AccountType.Asset, Currency = "BDT", IsActive = true },
            new Account { AccountNumber = "1002", Name = "Bank — Current Account", Type = AccountType.Asset, Currency = "BDT", IsActive = true },
            new Account { AccountNumber = "1100", Name = "Accounts Receivable", Type = AccountType.Asset, Currency = "BDT", IsActive = true },
            new Account { AccountNumber = "2001", Name = "Accounts Payable", Type = AccountType.Liability, Currency = "BDT", IsActive = true },
            new Account { AccountNumber = "2100", Name = "Customer Deposits", Type = AccountType.Liability, Currency = "BDT", IsActive = true },
            new Account { AccountNumber = "3001", Name = "Owner's Capital", Type = AccountType.Equity, Currency = "BDT", IsActive = true },
            new Account { AccountNumber = "4001", Name = "Service Revenue", Type = AccountType.Income, Currency = "BDT", IsActive = true },
            new Account { AccountNumber = "4002", Name = "Fee Income", Type = AccountType.Income, Currency = "BDT", IsActive = true },
            new Account { AccountNumber = "5001", Name = "Salaries", Type = AccountType.Expense, Currency = "BDT", IsActive = true },
            new Account { AccountNumber = "5002", Name = "Rent", Type = AccountType.Expense, Currency = "BDT", IsActive = true },
            new Account { AccountNumber = "5003", Name = "Utilities", Type = AccountType.Expense, Currency = "BDT", IsActive = true },
        };
        context.Accounts.AddRange(accounts);

        var admin = new User
        {
            FullName = "Admin User",
            Email = "admin@misl.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Admin@123"),
            Role = UserRole.Admin,
            IsActive = true,
        };
        var accountant = new User
        {
            FullName = "Accountant User",
            Email = "accountant@misl.com",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Accountant@123"),
            Role = UserRole.Accountant,
            IsActive = true,
        };
        context.Users.AddRange(admin, accountant);

        await context.SaveChangesAsync();

        await SeedDemoTransactionsAsync(context, accounts, postedBy: admin);
    }

    /// <summary>
    /// A small worked example so the journal, trial balance and dashboard are legible the
    /// first time they are opened. Entities are inserted directly rather than through
    /// ITransactionService: the seeder has no HTTP request to take a user id from, and the
    /// service's job is to guard rules that this hand-checked data already satisfies.
    /// </summary>
    private static async Task SeedDemoTransactionsAsync(
        AppDbContext context, Account[] accounts, User postedBy)
    {
        var byNumber = accounts.ToDictionary(a => a.AccountNumber);

        // Every row is one debit and one credit of the same amount, so each transaction
        // balances — and therefore the seeded trial balance balances (01 §10).
        var demoTransactions = new[]
        {
            (Description: "Owner's opening capital injection", Date: new DateTime(2026, 9, 1),
                Debit: "1001", Credit: "3001", Amount: 500_000m),
            (Description: "Move opening cash into the bank", Date: new DateTime(2026, 9, 2),
                Debit: "1002", Credit: "1001", Amount: 300_000m),
            (Description: "Consulting fees received", Date: new DateTime(2026, 9, 10),
                Debit: "1002", Credit: "4001", Amount: 125_000m),
            (Description: "September office rent", Date: new DateTime(2026, 9, 15),
                Debit: "5002", Credit: "1002", Amount: 45_000m),
            (Description: "September salaries", Date: new DateTime(2026, 9, 20),
                Debit: "5001", Credit: "1002", Amount: 80_000m),
        };

        foreach (var demo in demoTransactions)
        {
            var transaction = new Transaction
            {
                Reference = await NextReferenceAsync(context),
                Description = demo.Description,
                TransactionDate = DateTime.SpecifyKind(demo.Date, DateTimeKind.Utc),
                PostedAt = DateTime.UtcNow,
                CreatedByUserId = postedBy.Id,
            };

            transaction.JournalEntries.Add(new JournalEntry
            {
                AccountId = byNumber[demo.Debit].Id,
                Direction = EntryDirection.Debit,
                Amount = demo.Amount,
            });

            transaction.JournalEntries.Add(new JournalEntry
            {
                AccountId = byNumber[demo.Credit].Id,
                Direction = EntryDirection.Credit,
                Amount = demo.Amount,
            });

            context.Transactions.Add(transaction);
        }

        await context.SaveChangesAsync();
    }

    // Drawn from the same sequence TransactionService uses, so seeded and posted references
    // share one numbering and can never collide on the unique index.
    private static async Task<string> NextReferenceAsync(AppDbContext context)
    {
        var next = await context.Database
            .SqlQueryRaw<long>("""SELECT nextval('transaction_reference_seq') AS "Value" """)
            .SingleAsync();

        return $"TXN-{DateTime.UtcNow:yyyy}-{next:D6}";
    }
}