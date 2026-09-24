# 04 — Domain Models

**Step 4 of 13.** Previous: `03-project-setup.md` (scaffold ✅). Next: `05-database-and-migrations.md`.
**Date:** 2026-09-24
**Goal:** define the four core entities and three enums that represent the ledger's domain logic, with no database wiring yet — just plain C# classes.

These models live in `backend/Ledger.Api/Models/` and are responsible for:
- Holding data and validation logic
- Enforcing invariants (e.g., amounts are always > 0)
- Computing derived values (e.g., account balance from journal entries)

Database mapping (EF Core configuration) comes in step 5.

---

## 1. The four entities and three enums

From `01-feature-spec.md §4`, here are the fields each model must have:

### 1.1 `UserRole` enum

Two roles, no others:

```csharp
public enum UserRole
{
    Accountant = 0,
    Admin = 1
}
```

**Why numeric values:** EF Core will store these as integers in the database. Explicit
numbering makes the storage stable if enums are reordered later.

### 1.2 `User` entity

| Field | Type | Constraints | Why |
|---|---|---|---|
| `Id` | `int` | PK, auto-increment | Standard surrogate key |
| `FullName` | `string` | Required, max 100 | User's display name |
| `Email` | `string` | Required, max 150, unique | Login identifier; MISL's user lookup key |
| `PasswordHash` | `string` | Required | BCrypt hash only, never plaintext |
| `Role` | `UserRole` | Required | Accountant or Admin |
| `IsActive` | `bool` | Default true | Soft delete: false = can't login |
| `CreatedAt` | `DateTime` | Default UtcNow | Audit trail |

**Properties to add as computed (not stored in DB):**
- None yet — password verification happens in the service layer.

**Navigation properties:**
- `ICollection<Transaction> CreatedTransactions` — transactions they posted

**Validation:**
- Email format (email regex or `[EmailAddress]`)
- PasswordHash is never empty
- FullName is never whitespace-only

### 1.3 `AccountType` enum

Five types, corresponding to the five accounting classes:

```csharp
public enum AccountType
{
    Asset = 0,
    Liability = 1,
    Equity = 2,
    Income = 3,
    Expense = 4
}
```

**The `NormalBalance()` extension:** accounts have a "normal balance" side based on type.
This is a *computed* property, not stored:

```csharp
public static EntryDirection NormalBalance(this AccountType type) =>
    type switch
    {
        AccountType.Asset => EntryDirection.Debit,
        AccountType.Liability => EntryDirection.Credit,
        AccountType.Equity => EntryDirection.Credit,
        AccountType.Income => EntryDirection.Credit,
        AccountType.Expense => EntryDirection.Debit,
        _ => throw new ArgumentOutOfRangeException(nameof(type))
    };
```

Put this extension in `backend/Ledger.Api/Extensions/AccountTypeExtensions.cs`.

### 1.4 `Account` entity

| Field | Type | Constraints | Why |
|---|---|---|---|
| `Id` | `int` | PK, auto-increment | Surrogate key |
| `AccountNumber` | `string` | Required, max 10, unique | Business key, e.g. "1002", "5001" |
| `Name` | `string` | Required, max 120 | Display name, e.g. "Bank Account", "Rent Expense" |
| `Type` | `AccountType` | Required | Asset / Liability / Equity / Income / Expense |
| `Currency` | `string` | Required, max 3 | ISO 4217, e.g. "USD", "BDT" |
| `AllowsNegativeBalance` | `bool` | Default false | Assets normally cannot go negative (overdraft guard). Income/Expense can. |
| `IsActive` | `bool` | Default true | Soft delete: false = no new entries to this account |
| `CreatedAt` | `DateTime` | Default UtcNow | Audit trail |

**Properties to add as computed (not stored in DB):**
- `NormalBalance` — calls `Type.NormalBalance()`

**Navigation properties:**
- `ICollection<JournalEntry> JournalEntries` — all entries posted to this account

**Validation:**
- AccountNumber is never empty and is unique per account
- Name is never empty
- Currency is a valid 3-letter ISO code

### 1.5 `EntryDirection` enum

Debit or credit:

```csharp
public enum EntryDirection
{
    Debit = 0,
    Credit = 1
}
```

### 1.6 `Transaction` entity

| Field | Type | Constraints | Why |
|---|---|---|---|
| `Id` | `int` | PK, auto-increment | Surrogate key |
| `Reference` | `string` | Required, max 20, unique | Business key, e.g. "TXN-2026-000042" |
| `Description` | `string` | Required, max 300 | What is this transaction? e.g. "Monthly rent for office" |
| `TransactionDate` | `DateOnly` | Required | When it happened (date only, no time — accounting convention) |
| `PostedAt` | `DateTime` | Required | When it was recorded (UTC timestamp). Immutable once set. |
| `CreatedByUserId` | `int` | Required, FK to `User` | Who posted it |
| `ReversalOfTransactionId` | `int?` | FK to `Transaction` | If this is a reversal, which transaction does it reverse? Self-referencing FK. |
| `ReversedByTransactionId` | `int?` | FK to `Transaction` | If this was reversed, which reversal transaction did it? Self-referencing FK. |

**Properties to add as computed:**
- `IsReversed` — true if `ReversedByTransactionId` is not null
- `IsReversal` — true if `ReversalOfTransactionId` is not null

**Navigation properties:**
- `User CreatedBy` — who posted this
- `Transaction? ReversalOf` — if this is a reversal, the original transaction
- `Transaction? ReversedBy` — if this was reversed, the reversal transaction
- `ICollection<JournalEntry> JournalEntries` — the entries that make up this transaction (cascade delete!)

**Validation:**
- Reference is never empty
- Description is never empty
- TransactionDate ≤ today (no future-dating)
- JournalEntries is not empty (a transaction must have 2+ entries)
- A transaction is immutable: once `PostedAt` is set, it cannot be edited

### 1.7 `JournalEntry` entity

| Field | Type | Constraints | Why |
|---|---|---|---|
| `Id` | `int` | PK, auto-increment | Surrogate key |
| `TransactionId` | `int` | Required, FK to `Transaction` | Which transaction does this belong to? |
| `AccountId` | `int` | Required, FK to `Account` | Which account is this posted to? |
| `Direction` | `EntryDirection` | Required | Debit or Credit |
| `Amount` | `decimal` | Required, **always > 0** | The amount. Check constraint in DB. |

**Properties to add as computed:**
- `SignedAmount` — direction-aware amount: `Direction == Account.NormalBalance ? +Amount : -Amount`

**Navigation properties:**
- `Transaction Transaction` — the transaction this entry is part of
- `Account Account` — the account this entry is posted to

**Validation:**
- Amount > 0 (enforced by DB CHECK constraint, also in C#)
- AccountId must exist (FK constraint)
- TransactionId must exist (FK constraint)

**Why Amount is always positive:** it's the *magnitude*. The sign comes from `Direction`.
This prevents confusion where a Debit could be negative (nonsense) or a Credit could be
positive (also nonsense). The account balance calculation in `IBalanceService` combines
`Direction` and `Amount` to derive the signed balance.

---

## 2. Folder structure and file layout

```
backend/Ledger.Api/
├── Models/
│   ├── User.cs
│   ├── Account.cs
│   ├── Transaction.cs
│   ├── JournalEntry.cs
│   ├── Enums/
│   │   ├── UserRole.cs
│   │   ├── AccountType.cs
│   │   └── EntryDirection.cs
├── Extensions/
│   └── AccountTypeExtensions.cs
├── Controllers/
├── Services/
├── Data/
├── Dtos/
└── Program.cs
```

File per model, enums in a dedicated `Enums/` subfolder, extension methods in
`Extensions/`. This keeps the namespace hierarchy clean and the viva story readable:
"Models are here, enums are a subfolder because they're tightly bound to their parent
type, extensions are separate because they add behavior."

---

## 3. Key decisions and their rationale

### 3.1 Why `decimal(18, 4)` and not `double` or `long`

**Problem:** `0.1 + 0.2 != 0.3` in IEEE-754 binary floating point. For money, this is a
show-stopper.

**Solution:** C# `decimal` is a 128-bit fixed-point type with 28–29 significant digits
and exactly 4 decimal places of precision. In SQL, this maps to `numeric(18, 4)` —
18 digits total, 4 after the decimal point, giving us 9.999 trillion to 0.0001 precision.

For a transaction ledger, this is sufficient (it covers from 1 cent to ~$10 trillion).

Alternative (not chosen): `long cents = amount * 10000` (store as integers, divide by
10000 for display). More performant, but requires discipline across the codebase; the
`decimal` type is self-documenting.

### 3.2 Why `DateOnly` for `TransactionDate`

A transaction happens on a *date*, not a *time*. The ledger does not care what time of
day it was posted. `DateOnly` (added in .NET 6) is the type for "a date with no time
component". EF Core maps it to SQL `DATE`.

`PostedAt` is `DateTime` because it records *when the entry was made into the system*,
which is a timestamp.

### 3.3 Why self-referencing FKs for reversals

Reversals are not a separate entity type; they are a special case of `Transaction`. The
two self-referencing FKs (`ReversalOfTransactionId`, `ReversedByTransactionId`) record
the relationship:

- Original transaction `X` has `ReversalOfTransactionId = null` and `ReversedByTransactionId = Y`
  (it was reversed by transaction Y).
- Reversal transaction `Y` has `ReversalOfTransactionId = X` and `ReversedByTransactionId = null`
  (it reverses transaction X).

Both can't be non-null; the constraints in `DbContext` (step 5) enforce this.

### 3.4 Why `IsActive` flags instead of hard deletes

Ledgers are immutable by law (accounting records can't be destroyed). `IsActive` is a
*soft delete* flag:

- Users: `IsActive = false` means they can't log in anymore, but their audit trail
  (`CreatedBy` on transactions they posted) remains intact.
- Accounts: `IsActive = false` means no new entries can be posted to them, but their
  balance history is preserved.

### 3.5 Why Amount is always positive

Storing `Direction` and `Amount` separately (instead of `Amount: decimal` which could be
negative) prevents bugs:

- A "debit of -100" is nonsensical.
- The balance calculation is clearer: `balance = Σ(entries where direction == normalBalance) - Σ(entries where direction != normalBalance)`.

---

## 4. Building the models: step-by-step

### Step 4a. Create the enum files

1. Create folder `backend/Ledger.Api/Models/Enums/`
2. Create three files:
   - `UserRole.cs`
   - `AccountType.cs`
   - `EntryDirection.cs`

Each enum is two lines of code.

### Step 4b. Create the extension

1. Create folder `backend/Ledger.Api/Extensions/`
2. Create `AccountTypeExtensions.cs` with the `NormalBalance()` method

### Step 4c. Create the entity models

1. Create `backend/Ledger.Api/Models/User.cs`
2. Create `backend/Ledger.Api/Models/Account.cs`
3. Create `backend/Ledger.Api/Models/Transaction.cs`
4. Create `backend/Ledger.Api/Models/JournalEntry.cs`

Each model is a plain C# class with properties. No `[Table]` attributes, no `[Required]`
data annotations yet — those come in step 5 when we wire EF Core.

### Step 4d. Compile and verify

```bash
cd /Users/turzo/Work/MISL/backend
dotnet build
```

If it builds, you're done. If there are compilation errors, they're typos in the models.

---

## 5. Viva questions this step answers

1. **What is the difference between `decimal` and `double` for money?** `double` is IEEE-754
   binary floating point; `0.1 + 0.2 != 0.3`. `decimal` is fixed-point, precise to 4 decimal
   places, with no rounding errors for money.
2. **Why is `Amount` always positive?** Because `Direction` (Debit/Credit) carries the sign.
   A "debit of -100" is nonsensical. The balance is `Σ(debits) - Σ(credits)` for an
   asset (or the opposite for a liability), computed in the service layer.
3. **Why `DateOnly` for `TransactionDate` but `DateTime` for `PostedAt`?** `TransactionDate`
   is when it *happened* (accounting date, no time). `PostedAt` is when it was *recorded in
   the system* (timestamp for audit).
4. **How do reversals work?** A reversal transaction is also a `Transaction`, with
   `ReversalOfTransactionId` pointing to the original. The original transaction has
   `ReversedByTransactionId` pointing to the reversal. This keeps the ledger immutable:
   you don't delete the original, you record that it was reversed.
5. **Why soft delete (`IsActive`) instead of hard delete?** Accounting records must be
   kept for audit and tax purposes. `IsActive = false` means "don't use this going forward"
   but preserves history.
6. **Why navigation properties?** They let EF Core handle the relationships (loading related
   entities) and provide a fluent API for business logic. Instead of manually joining tables,
   you can write `transaction.CreatedBy.Email`.
7. **Why separate `SignedAmount` property on `JournalEntry`?** The stored `Amount` is always
   positive (for clarity). `SignedAmount` is computed based on `Direction` and the account's
   normal balance, so the balance calculation in the service is readable.

---

## 6. Out of scope for this step

- No validation attributes (`[Required]`, `[MaxLength]`, `[EmailAddress]`) — those come
  with EF Core in step 5
- No JSON serialization attributes (`[JsonPropertyName]`) — DTOs handle that in step 6
- No database mapping (`[Table]`, `HasMaxLength`, `HasCheckConstraint`) — that's step 5
- No logic methods (e.g., `public decimal Balance { get; }` on Account) — that belongs in
  `IAccountService` (step 7), not the entity

This step is *definition*, not wiring.
