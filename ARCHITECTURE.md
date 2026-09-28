# Architecture & Internals — Written Explanation

This is the written explanation required alongside the README. It covers:

1. [System architecture](#1-system-architecture--birds-eye-view): how the frontend and backend interact.
2. [Frontend architecture](#2-frontend-architecture) and the [user flow](#3-frontend-user-flow).
3. [Backend architecture](#4-backend-architecture--layer-by-layer), layer by layer.
4. [How the API works internally](#5-how-the-api-works-internally), traced through real requests.
5. [Data model](#6-data-model).
6. [Docker setup](#7-docker-setup).

The design reasoning behind each decision is in `docs/00` to `docs/10`. This document explains how the finished system works.

---

## 1. System architecture — bird's-eye view

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Browser                                                                 │
│  React SPA  (routes, pages, forms — no business rules, no money maths)   │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │  HTTP, same origin:  /  and  /api/*
                                │  Authorization: Bearer <JWT>
┌───────────────────────────────▼──────────────────────────────────────────┐
│  frontend container — nginx                                              │
│    /        → static files (the built React app)                         │
│    /api/*   → reverse proxy to http://backend:8080                       │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │  HTTP on the private Compose network
┌───────────────────────────────▼──────────────────────────────────────────┐
│  backend container — ASP.NET Core Web API                                │
│    middleware → controllers → services → EF Core                         │
│    every business rule lives here                                        │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │  SQL (Npgsql), Host=db
┌───────────────────────────────▼──────────────────────────────────────────┐
│  db container — PostgreSQL 17                                            │
│    tables, unique indexes, CHECK constraints, reference sequence         │
│    data on a named volume (survives container restarts)                  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Division of responsibility.**

| Tier | Owns | Deliberately does not own |
|---|---|---|
| Frontend | Navigation, forms, display, fast feedback (for example the live debit/credit beam) | Validation that matters, money arithmetic, permission decisions |
| Backend | Every rule (R1–R19), authentication, authorization, balance computation | Presentation |
| Database | Durable storage and a last line of defence (unique keys, `Amount > 0`, foreign keys) | Business logic |

The browser only ever talks to one origin. The frontend calls the relative URL `/api/...`.
- In development, Vite's dev server proxies those calls to the API.
- In Docker, nginx proxies them.

Either way the frontend never learns the backend's real address, so there is no CORS configuration anywhere.

---

## 2. Frontend architecture

React 19 + TypeScript + Vite, styled with Tailwind. The code is layered so that each concern lives in exactly one place:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  App.tsx — route table                                                  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ <AuthProvider>  holds { user, token }, exposes signIn / signOut   │  │
│  │   /login, /register ............................ public          │  │
│  │   <RequireAuth> → <AppShell> (sidebar + top bar) ..... signed-in  │  │
│  │       /  /accounts/:id  /transactions  /transactions/new          │  │
│  │       /overview  /reports/trial-balance                           │  │
│  │       <RequireAdmin> /users ................................ Admin │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ render
┌──────────────────────────────▼──────────────────────────────────────────┐
│  pages/        Accounts, AccountStatement, NewEntry, Journal, Overview, │
│                TrialBalance, Users, Login, Register                     │
│  components/   dialogs (transfer, open/close account, reverse),         │
│                BalanceBeam, Money, AccountPicker, ui/ primitives        │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ useApi(() => listAccounts(), [deps])
┌──────────────────────────────▼──────────────────────────────────────────┐
│  hooks/useApi  →  { data, error, loading, reload }                      │
│    one hook gives every screen the same three states;                   │
│    discards stale responses when filters change quickly                 │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────┐
│  api/  one module per resource: accounts, transactions, reports,        │
│        auth, users — typed with types/api.ts (mirrors backend DTOs)     │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────┐
│  api/client.ts — the single axios instance, baseURL "/api"              │
│    request interceptor  : attach "Authorization: Bearer <token>"        │
│    response interceptor : 401 → clear session, back to /login           │
│                           any error → ApiError(message from server)     │
│  api/session.ts — token + user in localStorage, expiry checked on read  │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key frontend components and their purpose.**

| Component | Purpose |
|---|---|
| `AuthProvider` / `useAuth` | Holds the signed-in user. `signIn` calls the API and stores the session. `isAdmin` drives what the UI shows. |
| `RequireAuth` / `RequireAdmin` | Route guards. They exist for **UX, not security**: the server enforces every role independently, so removing a guard produces a 403, not a breach. |
| `api/client.ts` | The only place that knows about headers, the token, and how to turn a failed response into a readable message. |
| `useApi` | A small data-fetching hook. Every page gets consistent loading, error and loaded states, and a `reload()` to call after a mutation. |
| `Money` | The one component that formats amounts. It only formats; it never computes, which keeps JavaScript's floating-point numbers away from money. |
| `BalanceBeam` | A live debits-vs-credits indicator on the entry form. It is a UX aid only; the server re-checks the balance. |

**How an error reaches the screen.**

```
service throws ValidationException("Transaction does not balance: …")
   → middleware writes 400 ProblemDetails { title: "Transaction does not balance: …" }
   → axios response interceptor builds ApiError(message = title)
   → page shows it inline, or as a toast
```

The user reads the exact sentence the backend rule produced. No message is duplicated or re-invented on the client.

---

## 3. Frontend user flow

**Getting in.**

```
            ┌────────────┐   no account    ┌──────────────┐
            │  /login    │ ──────────────► │  /register   │
            └─────┬──────┘                 └──────┬───────┘
                  │                               │ creates an INACTIVE Accountant
                  │                               ▼
                  │                     "An administrator needs to approve you"
                  │                               │
                  │   Admin: /users → Approve ◄───┘
                  │
    valid + active│   wrong password → 401 "Invalid credentials"
                  │   not yet approved → 403 "account is not active"
                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  /  Chart of accounts (home) — cards grouped by type, with balances     │
└─────────────────────────────────────────────────────────────────────────┘
```

**Working in the ledger.** Everything starts from an account:

```
  /  Chart of accounts
   │
   ├── [Admin] Open account ───► dialog: number, name, type, currency, overdraft flag
   │
   └── click a card
         │
         ▼
  /accounts/:id  Account workspace
     opening balance → entries with running balance → closing balance
     (date filter + pagination)
         │
         ├── New transaction ──► dialog, 2 accounts
         │                        "this account is Debited / Credited"
         │                        + other account, amount, date, description
         │                        → preview both lines → POST /api/transactions
         │
         └── Journal entry ────► /transactions/new, N accounts
                                  Debit | Credit columns per line
                                  BalanceBeam levels when debits = credits
                                  submit is disabled until the checklist is clear

  /transactions  Journal (every transaction, newest first)
     expand a row → its lines
     [Admin] Reverse → preview mirrored lines → POST /{id}/reverse
             the original is stamped REVERSED; the new one is badged REVERSAL

  /overview               whole-ledger position (read-only)
  /reports/trial-balance  totals per account as of a date, balanced verdict
  /users   [Admin]        approve / deactivate users, switch roles
```

**The same session as a sequence.**

1. Sign in. Land on the chart of accounts.
2. Pick an account. Its statement opens.
3. Post from it. The two-line dialog covers most cases; the full journal form handles three or more lines.
4. Made a mistake? Go to the Journal and **Reverse** the transaction. There is no edit and no delete anywhere in the UI.
5. Check the whole ledger in Overview or Trial balance.

---

## 4. Backend architecture — layer by layer

ASP.NET Core Web API on .NET 10. It is a single project, layered by folder:

```
backend/Ledger/Ledger/
├── Program.cs            composition root: DI registrations, pipeline, migrate + seed
├── Controllers/          HTTP boundary — routes, [Authorize], status codes
├── Services/             business rules — one interface + implementation per area
├── Data/                 AppDbContext, entity configurations, migrations, seeder
├── Models/               entities: User, Account, Transaction, JournalEntry + enums
├── Dtos/                 request/response shapes, grouped by feature
├── Middleware/           ExceptionHandlingMiddleware
├── Exception/            DomainException hierarchy (each carries its HTTP status)
├── Extensions/           JWT setup, ClaimsPrincipal helpers, AccountType.NormalBalance()
├── Authorization/        role name constants
└── Configuration/        JwtSettings (bound from config / environment variables)
```

### 4.1 The full request pipeline

```
 HTTP request
     │
     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Kestrel web server  (listens on :8080 inside the container)              │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. ExceptionHandlingMiddleware   ← first, so it wraps everything below   │
│      DomainException  → its own status (400/403/404/409) + ProblemDetails│
│      anything else    → 500 "An unexpected error occurred." (logged,     │
│                         never echoes internals such as SQL or schema)    │
├──────────────────────────────────────────────────────────────────────────┤
│ 2. HttpsRedirection                                                      │
├──────────────────────────────────────────────────────────────────────────┤
│ 3. Authentication (JwtBearer)                                            │
│      validates signature (HMAC-SHA256), issuer, audience, expiry         │
│      → builds HttpContext.User from claims: sub (user id), role          │
├──────────────────────────────────────────────────────────────────────────┤
│ 4. Authorization                                                         │
│      [Authorize]                     → 401 if no valid token             │
│      [Authorize(Roles = "Admin")]    → 403 if wrong role                 │
├──────────────────────────────────────────────────────────────────────────┤
│ 5. Routing + model binding + [ApiController] validation                  │
│      JSON body → DTO; DataAnnotations fail → automatic 400               │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ CONTROLLER LAYER  — thin, no business logic                              │
│   AuthController        /api/auth      login, register, me               │
│   UsersController       /api/users     list, approve/deactivate/role     │
│   AccountsController    /api/accounts  CRUD-ish, deactivate, statement   │
│   TransactionsController /api/transactions  list, get, post, transfer,   │
│                                             reverse  (no PUT, no DELETE) │
│   ReportsController     /api/reports/trial-balance                       │
│   DashboardController   /api/dashboard/summary                           │
│  job: read the user id from the token, call ONE service method,          │
│       translate the result into 200/201/404…                             │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ SERVICE LAYER  — where the rules live                                    │
│                                                                          │
│   AuthService ──────── BCrypt verify, active check, issue JWT, register  │
│   UserService ──────── admin user management (cannot edit yourself)      │
│   AccountService ───┐  open/rename/deactivate, list with balances        │
│   TransactionService┤  post, transfer, reverse  (R1–R14)                 │
│   ReportService ────┤  trial balance, dashboard summary                  │
│                     ▼                                                    │
│   BalanceService ───── the ONE place a balance is computed               │
│                        (balance, opening balance, running statement)     │
│                                                                          │
│   Rule violations are thrown as DomainException subclasses:              │
│     ValidationException 400 · ForbiddenException 403 ·                   │
│     NotFoundException 404 · ConflictException 409                        │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ DATA ACCESS LAYER  — EF Core                                             │
│   AppDbContext: DbSets Users, Accounts, Transactions, JournalEntries     │
│   Configurations/: precision numeric(18,4), unique indexes,              │
│                    CHECK (Amount > 0), delete behaviours                 │
│   Raw SQL only where LINQ cannot express it:                             │
│     SELECT … FOR UPDATE   (row locks)                                    │
│     nextval('transaction_reference_seq')   (reference numbers)           │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ PostgreSQL 17                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Dependency injection

`Program.cs` registers every service as **scoped**, meaning one instance per HTTP request:

```
IAuthService        → AuthService
IUserService        → UserService
IBalanceService     → BalanceService
IAccountService     → AccountService      (uses IBalanceService)
ITransactionService → TransactionService  (uses IBalanceService)
IReportService      → ReportService
AppDbContext        → one per request, shared by every service in that request
```

Because the scope matches the request, every service touched by one request shares the same `AppDbContext`. That is what lets `TransactionService` and `BalanceService` read and write inside the **same** database transaction.

Controllers depend on interfaces, not concrete classes, so a service can be swapped or mocked without touching the HTTP layer.

### 4.3 Startup sequence

```
Program.cs
  build services (DI, JWT validation settings, EF Core + Npgsql)
  │
  ├─ Database.MigrateAsync()  → apply any pending migrations (creates schema on a fresh DB)
  ├─ DbSeeder.SeedAsync()     → if the Users table is empty, create the Admin + Accountant
  │
  └─ start the pipeline, begin listening on :8080
```

Configuration comes from `appsettings.json`, overridden by environment variables:
- `ConnectionStrings__DefaultConnection`
- `Jwt__Key`

Secrets are never baked into the image.

### 4.4 Where a balance comes from

A balance is never stored. It is **derived** from journal entries every time it is needed, so it can never drift out of sync with the history.

```
raw     = Σ debit amounts − Σ credit amounts       (for that account)

balance = raw        if the account type's normal balance is Debit  (Asset, Expense)
        = −raw       if the normal balance is Credit (Liability, Equity, Income)
```

`AccountType.NormalBalance()` is an extension method. It is the one place that encodes which side increases each account type.

The statement's **running balance** works like this:
1. Compute the opening balance: everything dated before the filter's `from` date.
2. Walk the entries in date order, adding each one if it is on the account's normal side and subtracting it otherwise.

The chart of accounts loads every account's balance in **one grouped query** rather than one query per account, which avoids the N+1 query problem.

---

## 5. How the API works internally

### 5.1 Authentication, end to end

```
 Browser                      AuthController / AuthService                 DB
    │ POST /api/auth/login          │                                       │
    │ { email, password } ────────► │ find user by email ─────────────────► │
    │                               │ BCrypt.Verify(password, hash)         │
    │                               │   ✗ → 401 "Invalid credentials"       │
    │                               │   (same answer for unknown email and  │
    │                               │    wrong password — no enumeration)   │
    │                               │ IsActive? ✗ → 403 "not active"        │
    │                               │ build JWT:                            │
    │                               │   sub=userId  email  jti  role        │
    │                               │   signed HMAC-SHA256, 120 min expiry  │
    │ ◄──── { token, expiresAtUtc, user }                                   │
    │ store in localStorage                                                 │
    │                                                                       │
    │ GET /api/accounts                                                     │
    │ Authorization: Bearer eyJ… ──► JwtBearer validates signature,         │
    │                                issuer, audience, lifetime             │
    │                                → User.GetUserId(), role claim         │
    │                                → [Authorize(Roles = Admin)] checks    │
```

Registration (`POST /api/auth/register`) does the following:
1. Lowercases the email.
2. Rejects a duplicate email with 409.
3. Hashes the password with BCrypt.
4. Always creates an **inactive Accountant**. Only an Admin, via `PATCH /api/users/{id}`, can activate the user or change the role.

### 5.2 Posting a transaction — the core path

`POST /api/transactions` is the single path through which money moves. `/transfer` is a thin wrapper: it builds two entries and calls the same `PostAsync`, so no rule is implemented twice.

```
POST /api/transactions
{ description, transactionDate, entries: [ {accountId, direction, amount}, … ] }
   │
   ▼
TransactionsController.Post
   │  userId = User.GetUserId()      (from the token, never from the body)
   ▼
TransactionService.PostAsync
   │
   │ ── Phase 1: validate in memory (no database yet) ──────────────────────
   │   R1  at least 2 entries                       ✗ 400
   │   R6  date not in the future                   ✗ 400
   │   R3  every amount > 0, direction valid        ✗ 400
   │   R2  Σ debits == Σ credits  (exact decimal)   ✗ 400 "does not balance"
   │
   │ ── Phase 2: database, inside ONE explicit transaction ─────────────────
   │   BEGIN
   │   SELECT * FROM "Accounts" WHERE "Id" = ANY(…) ORDER BY "Id" FOR UPDATE
   │        ↑ locks every involved account row (ascending id → no deadlocks)
   │   R4  each account exists and is active        ✗ 404 / 400
   │   R7  all accounts share one currency          ✗ 400
   │   reference = nextval('transaction_reference_seq') → "TXN-2026-000042"
   │   INSERT transaction header + all journal entries  (SaveChanges)
   │   R9  for each Asset account without overdraft:
   │        recompute balance → < 0 ?               ✗ 409, ROLLBACK
   │   COMMIT
   ▼
201 Created  +  Location: /api/transactions/{id}  +  TransactionDto
```

**Why the transaction is explicit.** A single `SaveChanges` is already atomic on its own. The explicit transaction is needed because the overdraft check is a *read after a write*, and the read has to happen while the locks are still held, before the commit.

**Why lock the rows.** Without the lock, two concurrent withdrawals can both pass the overdraft check:

```
   Request A                         Request B
   ─────────                         ─────────
   BEGIN; lock Cash (FOR UPDATE)
                                     BEGIN; lock Cash … waits ⏳
   insert −800, balance 200 ✓
   COMMIT  → lock released
                                     … lock acquired, reads the TRUE state
                                     insert −800, balance −600 ✗
                                     → 409, ROLLBACK
```

Without `FOR UPDATE`, both requests would read 1000, both would pass, and the account would end at −600.

**Why a sequence for references.** `MAX(id)+1` has the same read-then-write race. A PostgreSQL sequence hands out unique values atomically. A unique index on `Reference` backs it up.

### 5.3 Reversing a transaction

```
POST /api/transactions/{id}/reverse        [Authorize(Roles = Admin)]  (R14)
   BEGIN
   SELECT * FROM "Transactions" WHERE "Id" = {id} FOR UPDATE
        ↑ stops two admins reversing the same transaction at once
   R12  already reversed?        ✗ 409
   R13  is itself a reversal?    ✗ 409
   lock the involved accounts (same ordered FOR UPDATE)
   INSERT new transaction: every Debit ↔ Credit swapped, same amounts,
          ReversalOfTransactionId = original.Id, dated today
   UPDATE original: ReversedByTransactionId = reversal.Id
   R9 overdraft check again
   COMMIT
```

Nothing is updated in place except the link. Both the mistake and its correction stay in the journal permanently. That is also why there is **no `PUT` or `DELETE`** on transactions: their absence is the audit-trail guarantee.

### 5.4 Reports

| Endpoint | How it is computed |
|---|---|
| `GET /api/reports/trial-balance?asOf=` | Group journal entries by account up to the date. Sum debits and credits per account, then total both columns. Equal totals mean the ledger is internally consistent. |
| `GET /api/dashboard/summary` | One grouped query for every account's balance, then totals per account type (the accounting equation), overall debit/credit totals and recent transactions. |
| `GET /api/accounts/{id}/statement` | Opening balance, then entries with a running balance, then the closing balance, paginated. Computed by `BalanceService`. |

### 5.5 Rule summary

| Group | Rules | Enforced in |
|---|---|---|
| Posting | R1 ≥2 lines · R2 debits = credits · R3 amount > 0 · R4 account exists/active · R5 description · R6 no future date · R7 one currency · R9 no overdraft | `TransactionService` (R3 also a DB `CHECK`) |
| Immutability | R10 no edit/delete · R11 reverse by mirroring · R12 once only · R13 no reversing a reversal · R14 Admin only | API surface + `TransactionService` + `[Authorize]` |
| Accounts | R15 unique number · R16 Admin only · R17 non-zero balance can't be closed · R18 type/number immutable · R19 inactive rejects entries | `AccountService` + DB unique index + `[Authorize]` |

---

## 6. Data model

```
┌────────────────────┐          ┌──────────────────────────────┐
│ Users              │          │ Transactions                 │
├────────────────────┤ 1      * ├──────────────────────────────┤
│ Id              PK │─────────►│ Id                        PK │
│ FullName           │ created  │ Reference   UNIQUE (TXN-…)   │
│ Email       UNIQUE │   by     │ Description                  │
│ PasswordHash BCrypt│          │ TransactionDate              │
│ Role  Accountant|  │          │ PostedAt                     │
│       Admin        │          │ CreatedByUserId           FK │
│ IsActive           │          │ ReversalOfTransactionId   FK ├──┐ self-links:
│ CreatedAt          │          │ ReversedByTransactionId   FK ├──┘ original ⇄ reversal
└────────────────────┘          └──────────────┬───────────────┘
                                               │ 1
                                               │    (a transaction's lines are
                                               │ *   written and deleted together)
┌────────────────────┐          ┌──────────────▼───────────────┐
│ Accounts           │          │ JournalEntries               │
├────────────────────┤ 1      * ├──────────────────────────────┤
│ Id              PK │─────────►│ Id                        PK │
│ AccountNumber UNIQ │          │ TransactionId             FK │
│ Name               │          │ AccountId  FK (RESTRICT)     │
│ Type  Asset|Liab.| │          │ Direction  Debit | Credit    │
│   Equity|Income|Exp│          │ Amount numeric(18,4) CHECK>0 │
│ Currency           │          └──────────────────────────────┘
│ AllowsNegativeBal. │
│ IsActive           │          sequence: transaction_reference_seq
└────────────────────┘
```

- **Money** is stored as C# `decimal` in a PostgreSQL `numeric(18,4)` column. It is never `double`: `0.1 + 0.2` is exact in `decimal` but not in binary floating point.
- **No balance column.** Balances are derived from `JournalEntries` (see §4.4).
- **`RESTRICT` on Account and User.** An account or user referenced by history cannot be deleted out from under it.

---

## 7. Docker setup

Three services on one private Compose network:

```
                    your machine
  ┌──────────────────────────────────────────────────────────────┐
  │   localhost:3000                    localhost:5086 (debug)   │
  └──────┬──────────────────────────────────────┬────────────────┘
         │ port map 3000→80                     │ port map 5086→8080
  ┌──────▼─────────────┐   /api/*   ┌───────────▼──────────┐  Host=db  ┌────────────────┐
  │ frontend           │──────────► │ backend              │─────────► │ db             │
  │ nginx:alpine       │  http://   │ aspnet:10.0 runtime  │   :5432   │ postgres:17    │
  │ serves dist/       │ backend:   │ Ledger.dll           │           │ volume: pgdata │
  └────────────────────┘   8080     └──────────────────────┘           └────────────────┘
         └──────────────── Compose network "misl_default" (built-in DNS) ───────┘
```

### 7.1 Images are multi-stage builds

```
backend/Ledger/Ledger/Dockerfile
  stage "build"   mcr.microsoft.com/dotnet/sdk:10.0
                  COPY Ledger.csproj → dotnet restore   (cached unless the .csproj changes)
                  COPY source        → dotnet publish -c Release
  stage "runtime" mcr.microsoft.com/dotnet/aspnet:10.0
                  COPY --from=build /app/publish      (no SDK, no source code shipped)
                  ASPNETCORE_URLS=http://+:8080 → ENTRYPOINT dotnet Ledger.dll

frontend/Dockerfile
  stage "build"   node:22-alpine
                  COPY package*.json → npm ci           (cached unless dependencies change)
                  COPY source        → npm run build → dist/
  stage 2         nginx:alpine
                  COPY dist/ → /usr/share/nginx/html
                  COPY nginx.conf (proxy /api, SPA fallback to index.html)
```

`.dockerignore` files keep `bin/`, `obj/`, `node_modules/` and `dist/` out of the build context.

### 7.2 What `docker compose up --build` does

```
1. build misl-backend and misl-frontend images; pull postgres:17
2. create network misl_default (service names become DNS names) and volume pgdata
3. start db
4. healthcheck: pg_isready every 5s  ──►  db = healthy
5. start backend  (depends_on: db condition: service_healthy)
      → reads ConnectionStrings__DefaultConnection / Jwt__Key from the environment
      → migrate schema → seed 2 users → listen :8080
6. start frontend → nginx serves the app, proxies /api to backend:8080
7. open http://localhost:3000
```

**Four decisions worth noting.**

- **`Host=db`, not `localhost`.** Inside the backend container, `localhost` is the backend itself. Compose's DNS resolves the service name `db` to the database container.
- **`condition: service_healthy`.** Plain `depends_on` only waits for the Postgres *container* to start, not for Postgres to accept connections. The backend migrates on boot, so without the healthcheck it would race the database and crash.
- **Named volume.** Data survives `docker compose down`. Only `docker compose down -v` wipes it.
- **Environment variables for secrets.** ASP.NET Core maps `Jwt__Key` (double underscore) onto the `Jwt:Key` setting. The same image runs anywhere with different settings.

### 7.3 nginx routing

```
location /api/ { proxy_pass http://backend:8080/api/; }   → the API
location /     { try_files $uri /index.html; }            → the SPA
```

The `try_files` fallback is what makes deep links such as `/accounts/3` survive a browser refresh. nginx serves `index.html` and React Router renders the right page.
