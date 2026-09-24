# 05 — Database and Migrations

**Step 5 of 13.** Previous: `04-domain-models.md` (entities + enums ✅). Next: `06-authentication-authorization.md`.
**Date:** 2026-09-24
**Goal:** wire the plain C# models from step 4 to PostgreSQL — `DbContext`, per-entity EF Core
configuration (precision, constraints, relationships), a connection string, the first migration,
and an idempotent seeder so the app has data on first run.

This step produces:

```
backend/Ledger/Ledger/
├── Data/
│   ├── AppDbContext.cs
│   ├── Configurations/
│   │   ├── UserConfiguration.cs
│   │   ├── AccountConfiguration.cs
│   │   ├── TransactionConfiguration.cs
│   │   └── JournalEntryConfiguration.cs
│   ├── Migrations/            ← EF-generated, do not hand-edit
│   └── DbSeeder.cs
├── appsettings.json
└── appsettings.Development.json   ← gitignored, holds the real local connection string
```

---

## 1. NuGet packages

Three packages, added via Rider's NuGet panel or `dotnet add package`:

| Package | Why |
|---|---|
| `Npgsql.EntityFrameworkCore.PostgreSQL` | The EF Core provider for PostgreSQL |
| `Microsoft.EntityFrameworkCore.Design` | Needed for `dotnet ef migrations add` to work |
| `Microsoft.EntityFrameworkCore.Tools` | The `dotnet ef` CLI commands |

```bash
cd backend/Ledger/Ledger
dotnet add package Npgsql.EntityFrameworkCore.PostgreSQL
dotnet add package Microsoft.EntityFrameworkCore.Design
dotnet add package Microsoft.EntityFrameworkCore.Tools
```

Verify the `dotnet-ef` CLI tool itself is installed (it's separate from the package):

```bash
dotnet tool install --global dotnet-ef
dotnet ef --version
```

---

## 2. `AppDbContext`

One `DbContext`, one `DbSet` per entity, and `OnModelCreating` delegates to the configuration
classes instead of a giant inline Fluent API block:

```csharp
namespace Ledger.Data;

using Ledger.Models;
using Microsoft.EntityFrameworkCore;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<Transaction> Transactions => Set<Transaction>();
    public DbSet<JournalEntry> JournalEntries => Set<JournalEntry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    }
}
```

**Why `ApplyConfigurationsFromAssembly` instead of configuring everything inline:** as the
schema grows, one `OnModelCreating` method configuring four entities' constraints, indexes, and
relationships becomes unreadable. `IEntityTypeConfiguration<T>` gives each entity its own file —
same principle as one model per file in step 4.

---

## 3. Entity configurations

Each configuration implements `IEntityTypeConfiguration<T>` and lives in `Data/Configurations/`.

### 3.1 `UserConfiguration`

```csharp
namespace Ledger.Data.Configurations;

using Ledger.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.Property(u => u.FullName).IsRequired().HasMaxLength(100);
        builder.Property(u => u.Email).IsRequired().HasMaxLength(150);
        builder.Property(u => u.PasswordHash).IsRequired();

        builder.HasIndex(u => u.Email).IsUnique();
    }
}
```

### 3.2 `AccountConfiguration`

```csharp
namespace Ledger.Data.Configurations;

using Ledger.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public class AccountConfiguration : IEntityTypeConfiguration<Account>
{
    public void Configure(EntityTypeBuilder<Account> builder)
    {
        builder.Property(a => a.AccountNumber).IsRequired().HasMaxLength(10);
        builder.Property(a => a.Name).IsRequired().HasMaxLength(120);
        builder.Property(a => a.Currency).IsRequired().HasMaxLength(3);

        builder.HasIndex(a => a.AccountNumber).IsUnique();
    }
}
```

### 3.3 `TransactionConfiguration`

This is the one with relationships worth thinking about — a transaction has a required FK to
its creator and two **optional, self-referencing** FKs for the reversal link.

```csharp
namespace Ledger.Data.Configurations;

using Ledger.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public class TransactionConfiguration : IEntityTypeConfiguration<Transaction>
{
    public void Configure(EntityTypeBuilder<Transaction> builder)
    {
        builder.Property(t => t.Reference).IsRequired().HasMaxLength(20);
        builder.Property(t => t.Description).IsRequired().HasMaxLength(300);

        builder.HasIndex(t => t.Reference).IsUnique();

        builder.HasOne(t => t.CreatedBy)
            .WithMany(u => u.CreatedTransactions)
            .HasForeignKey(t => t.CreatedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(t => t.ReversalOf)
            .WithOne(t => t.ReversedBy)
            .HasForeignKey<Transaction>(t => t.ReversalOfTransactionId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
```

**Why only one `HasOne`/`HasForeignKey` pair for the reversal link:** `ReversalOfTransactionId`
and `ReversedByTransactionId` describe the *same relationship* from two ends — original ↔
reversal is one one-to-one link. Configuring `HasOne(t => t.ReversalOf).WithOne(t => t.ReversedBy)`
tells EF Core about both navigation properties at once. Trying to configure
`ReversedByTransactionId` as a second, separate FK would create a second (wrong) relationship.

**Why `DeleteBehavior.Restrict` everywhere here:** the ledger is append-only — nothing should
ever cascade-delete a `User` or a `Transaction` through a foreign key. If someone tries to
delete a user who has posted transactions, or a transaction involved in a reversal pair, the
database throws rather than silently cascading. Deactivation (`IsActive = false`) is the
supported path, not deletion.

### 3.4 `JournalEntryConfiguration`

This is where the two PostgreSQL-specific pieces from `02 §2.5` live: exact decimal precision
and a database-level check constraint.

```csharp
namespace Ledger.Data.Configurations;

using Ledger.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

public class JournalEntryConfiguration : IEntityTypeConfiguration<JournalEntry>
{
    public void Configure(EntityTypeBuilder<JournalEntry> builder)
    {
        builder.Property(e => e.Amount).HasPrecision(18, 4);

        builder.ToTable(t => t.HasCheckConstraint("CK_JournalEntry_Amount_Positive", "\"Amount\" > 0"));

        builder.HasOne(e => e.Transaction)
            .WithMany(t => t.JournalEntries)
            .HasForeignKey(e => e.TransactionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(e => e.Account)
            .WithMany(a => a.JournalEntries)
            .HasForeignKey(e => e.AccountId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
```

**Why `Cascade` on `Transaction → JournalEntries` but `Restrict` on `Account → JournalEntries`:**
a journal entry cannot exist without its parent transaction — if a transaction were ever deleted,
its entries are meaningless orphans, so cascade makes sense structurally (even though in
practice transactions are never hard-deleted). An account, however, must **never** lose its
entries just because someone tries to delete the account — that would silently erase financial
history. `Restrict` forces deactivation instead.

**Why `HasPrecision(18, 4)` instead of a data annotation:** `[Column(TypeName = "numeric(18,4)")]`
on the model would leak a database concern into `Models/`, which step 4 deliberately kept free
of persistence detail. `HasPrecision` is the Fluent API equivalent, scoped to `Data/`.

---

## 4. Connection string

`appsettings.json` (committed — no secrets, just shape):

```json
{
  "ConnectionStrings": {
    "DefaultConnection": ""
  },
  "Logging": { "LogLevel": { "Default": "Information" } }
}
```

`appsettings.Development.json` (gitignored — real local value):

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=ledger;Username=postgres;Password=postgres"
  }
}
```

`.gitignore` already excludes `appsettings.*.local.json`; add `appsettings.Development.json` to
it as well, since it now holds a real (if only locally-relevant) password.

Register the context in `Program.cs`:

```csharp
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));
```

**Running Postgres locally before step 11's full Docker Compose setup:** a single bare container
is enough to develop and migrate against:

```bash
docker run --name misl-postgres \
  -e POSTGRES_DB=ledger -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 -d postgres:16
```

This is throwaway — step 11 replaces it with a proper `docker-compose.yml` service, a named
volume, and a healthcheck the API container waits on.

---

## 5. First migration

```bash
cd backend/Ledger/Ledger
dotnet ef migrations add InitialCreate -o Data/Migrations
dotnet ef database update
```

`migrations add` reads the model graph (all four `DbSet`s + configurations) and generates a
`Migrations/<timestamp>_InitialCreate.cs` with `Up()`/`Down()` methods plus a model snapshot.
`database update` actually runs the SQL against the running Postgres container.

**Check it did the right thing** before moving on:

```bash
docker exec -it misl-postgres psql -U postgres -d ledger -c "\d journal_entries"
```

Confirm `amount` is `numeric(18,4)` and a `CK_JournalEntry_Amount_Positive` check constraint is
listed.

Never hand-edit a generated migration file. If the model changes, generate a new migration.

---

## 6. Idempotent seeder

The seeder has to run every time the app starts (so a fresh container has data) without
duplicating rows on every restart:

```csharp
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

        // Demo transactions go here once IBalanceService/posting rules exist (steps 7–8) —
        // seeding balanced entries by hand here would duplicate validation the service owns.
    }
}
```

Call it from `Program.cs`, after the app is built but before `app.Run()`:

```csharp
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
    await DbSeeder.SeedAsync(db);
}
```

`MigrateAsync()` here means the container applies pending migrations on startup — useful once
this runs inside Docker in step 11, where there's no developer around to run `dotnet ef database
update` by hand.

**Why the seeder stops at accounts + users for now:** demo *transactions* need `IBalanceService`
and the posting/validation pipeline (steps 7–8) to guarantee they're actually balanced and legal.
Hand-building balanced `JournalEntry` rows here would duplicate that logic in two places — a
trap the project already called out in `01 §8` for the transfer endpoint. The seeder gets a
short follow-up entry once posting exists.

**Why `BCrypt.Net.BCrypt.HashPassword` doesn't require step 6 to exist first:** hashing a literal
string is a static call from the `BCrypt.Net-Next` package — it needs no service, no DI, no
auth pipeline. Add the package now:

```bash
dotnet add package BCrypt.Net-Next
```

Step 6 builds `IAuthService.Login()`, which *verifies* against these same hashes.

---

## 7. Building it: step-by-step

### Step 5a. Install packages
`Npgsql.EntityFrameworkCore.PostgreSQL`, `Microsoft.EntityFrameworkCore.Design`,
`Microsoft.EntityFrameworkCore.Tools`, `BCrypt.Net-Next`. Confirm `dotnet ef --version` works.

### Step 5b. Create `AppDbContext`
`Data/AppDbContext.cs` with the four `DbSet`s and `OnModelCreating`.

### Step 5c. Create the four configuration classes
`Data/Configurations/UserConfiguration.cs`, `AccountConfiguration.cs`,
`TransactionConfiguration.cs`, `JournalEntryConfiguration.cs`.

### Step 5d. Wire up connection string + DI
`appsettings.json` shape, `appsettings.Development.json` (gitignored) with the real value,
`AddDbContext` in `Program.cs`.

### Step 5e. Start Postgres and migrate
```bash
docker run --name misl-postgres -e POSTGRES_DB=ledger -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
dotnet ef migrations add InitialCreate -o Data/Migrations
dotnet ef database update
```

### Step 5f. Write and wire the seeder
`Data/DbSeeder.cs`, called from `Program.cs` via `MigrateAsync()` + `SeedAsync()`.

### Step 5g. Verify
```bash
dotnet build
dotnet run
docker exec -it misl-postgres psql -U postgres -d ledger -c "SELECT account_number, name FROM accounts;"
```
11 accounts and 2 users should be present. Restart the app — row counts must not change.

---

## 8. Viva questions this step answers

1. **What does `IEntityTypeConfiguration<T>` buy you over inline `OnModelCreating` code?**
   One file per entity's mapping concerns, applied in bulk via
   `ApplyConfigurationsFromAssembly` — scales cleanly as entities grow, and keeps
   `AppDbContext` itself trivial.
2. **Why is `Amount` both `HasPrecision(18, 4)` *and* a `CHECK` constraint?** Precision fixes
   *how* the number is stored (no floating-point drift). The check constraint enforces a
   *business rule* (amounts are always positive) at the database layer, so it holds even if a
   future code path bypasses the service layer.
3. **Why `DeleteBehavior.Restrict` on `Transaction.CreatedBy` and the reversal self-FK, but
   `Cascade` on `JournalEntry.Transaction`?** A ledger never cascade-deletes a user or a
   transaction — deactivation is the only supported removal path. A journal entry, however, has
   no independent existence outside its transaction, so cascading there is structurally correct
   (even though in practice transactions are immutable and never deleted).
4. **How is the self-referencing reversal relationship modelled with only one `HasOne`/`HasForeignKey`
   pair?** `ReversalOf`/`ReversedBy` are two ends of the *same* one-to-one relationship, not two
   relationships — `HasOne(...).WithOne(...)` describes both navigation properties from a single
   configuration call.
5. **Why does the seeder check `AnyAsync()` before inserting?** Idempotency — the seeder runs on
   every container start (via `Program.cs`), and a restart must not duplicate the chart of
   accounts or users.
6. **Why can BCrypt hashing happen in the seeder before `IAuthService` exists?** Hashing is a
   stateless static call from the `BCrypt.Net-Next` library; it needs no DI registration or
   service wiring. Only *verifying* a login needs the service, built in step 6.
7. **Why didn't the seeder include demo transactions yet?** Building balanced journal entries by
   hand here would bypass the validation `IBalanceService`/posting pipeline (steps 7–8) is
   responsible for — the same "don't duplicate the rules" principle applied to the `/transfer`
   endpoint in `01 §8`.

---

## 9. Out of scope for this step

- Demo **transactions** in the seeder — deferred to after step 8 (posting/validation exists)
- JWT / login itself — step 6
- The `docker-compose.yml` Postgres service, healthchecks, named volumes — step 11
- Repository/unit-of-work abstraction over `AppDbContext` — not planned at all; services use
  `AppDbContext` directly (`02 §2.2`)
