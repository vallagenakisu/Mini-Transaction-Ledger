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
    }
}