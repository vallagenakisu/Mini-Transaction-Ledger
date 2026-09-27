namespace Ledger.Data;

using Ledger.Models;
using Microsoft.EntityFrameworkCore;

public static class DbSeeder
{
    /// <summary>
    /// Seeds the two login users only. There is no self-registration endpoint by design
    /// (`01 §8`), so something has to provision the first accounts able to sign in — that is
    /// the entire job of this seeder now.
    ///
    /// It used to also insert eleven demo accounts and five worked-example transactions, so
    /// the chart of accounts was never empty on a first run. That traded away the one thing
    /// a ledger's own home screen should be able to show honestly: nothing yet. The chart of
    /// accounts now handles zero accounts as a real, designed state — see `Accounts.tsx`'s
    /// empty state — so a demo no longer needs data it did not create.
    ///
    /// Guarded on <see cref="AppDbContext.Users"/> rather than Accounts: accounts are now
    /// expected to reach zero in normal use (an operator can delete every seeded one), and
    /// that must never cause a restart to silently repopulate the chart of accounts under
    /// them. Users are the one table this seeder still owns exclusively.
    /// </summary>
    public static async Task SeedAsync(AppDbContext context)
    {
        if (await context.Users.AnyAsync())
        {
            return;
        }

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