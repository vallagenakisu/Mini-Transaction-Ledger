# 02 — Tech Stack & Architecture Decisions

**Project:** Mini Transaction Ledger (double-entry)
**Date:** 2026-09-24
**Format:** every decision is written as *choice → why → what was rejected*, because 25%
of the grade is literally "candidate can clearly explain code logic and data flow". A
decision you can't justify is worth less than the simpler alternative.

---

## 1. The stack

| Layer | Choice | One-line justification |
|---|---|---|
| Backend | **ASP.NET Core Web API** (latest LTS — .NET 10) | Strong typing, built-in DI, first-class JWT support |
| ORM | **EF Core** + **Npgsql** provider | Code-first migrations give a reproducible schema; LINQ keeps queries readable |
| Database | **PostgreSQL 17** (container) | Makes `docker-compose` a genuine multi-service setup; `numeric` type and `SELECT … FOR UPDATE` are both needed (see §2.5) |
| Money type | **C# `decimal` → `numeric(18,4)`** | Exact base-10 arithmetic. Never `double`/`float` — see `01 §7.1` |
| Password hashing | **BCrypt.Net-Next** | Adaptive work factor + per-hash salt; purpose-built for passwords |
| Auth | **JWT Bearer** (`Microsoft.AspNetCore.Authentication.JwtBearer`) | Stateless; the token carries `sub` and `role` claims |
| API docs | **Swagger / OpenAPI** | Lets the grader exercise the API without the frontend — cheap marks |
| Frontend | **React + Vite + TypeScript** | Fast dev server; TS catches DTO drift at compile time |
| Routing | **React Router** | Route guards are the natural home for role checks |
| HTTP | **axios** | Interceptors give one place to attach the token and handle 401 |
| Styling | **Tailwind CSS** | No naming bikeshed, no separate CSS files to keep in sync |
| Containers | **Docker + docker-compose** | Required by the PDF |

### Deliberately NOT used

Each row is a rehearsed viva answer.

| Rejected | Why |
|---|---|
| **AutoMapper** | Hides mapping in configuration. Manual `ToDto()` methods are a few more lines and are readable and greppable. I'd also have to explain profile resolution, which buys nothing at this size. |
| **Repository pattern over EF Core** | `DbContext` **is** a Unit of Work and `DbSet<T>` **is** a repository. Wrapping them adds a layer that only forwards calls and usually cripples `IQueryable` composition. Services use `DbContext` directly. |
| **MediatR / CQRS** | Solves fat-controller and pipeline problems this app doesn't have. |
| **4-project Clean Architecture** | Domain/Application/Infrastructure/Api as separate assemblies is right at scale. Here it's 4 `.csproj` files and a slower build to enforce boundaries that folders already make clear. |
| **TanStack Query** | Good library, but adds cache-invalidation semantics I'd have to defend. A small hand-written `useApi` hook is fully explainable. |
| **Redux / Zustand** | The only global state is "who is logged in". React Context does that in ~40 lines. |
| **Refresh tokens** | Deliberate scope cut (`01 §10`). Short-lived access token, re-login on expiry. |
| **A stored `Balance` column on `Account`** | A cached aggregate that can drift from the entries that produced it. Derived instead — see `01 §5.1`. |
| **`double` for money** | Binary floating point can't represent `0.1`. This is the canonical fintech disqualifier. |

---

## 2. Backend architecture

### 2.1 Request flow (the diagram to memorise)

```
HTTP request
    │
    ▼
[ Kestrel ]
    │
    ▼
[ ExceptionHandlingMiddleware ]  ← catches domain exceptions → ProblemDetails JSON
    │
    ▼
[ CORS ]
    │
    ▼
[ Authentication ]   ← validates JWT signature + expiry, builds ClaimsPrincipal
    │
    ▼
[ Authorization ]    ← evaluates [Authorize(Roles = "Admin")]
    │
    ▼
[ Routing → Controller ]
    │   • model binding + DataAnnotations validation on the DTO
    │   • reads userId & role from User.Claims — NEVER from the request body
    ▼
[ Service ]          ← business rules R1–R19, inside an explicit DB transaction
    │
    ▼
[ AppDbContext ]     ← EF Core: LINQ → SQL → Npgsql → PostgreSQL
    │
    ▼
[ Entity ] → mapped to DTO → JSON response
```

**Middleware order is not arbitrary** — a guaranteed viva question. Exception handling
must be *outermost* to catch everything below it. Authentication must run *before*
authorization, because authorization evaluates the identity that authentication produced.

### 2.2 Layer responsibilities

| Layer | Does | Must NOT do |
|---|---|---|
| **Controller** | Route, status code, model binding, reading claims | Contain business rules or touch `DbContext` |
| **Service** | Business rules, transaction boundaries, authorization-in-depth, entity↔DTO mapping | Know about `HttpContext` or return `IActionResult` |
| **DbContext** | Schema config, precision, constraints, change tracking | Contain business rules |
| **DTO** | The API contract | Be the same type as the entity |

> **Why DTOs, if they look like the entity?**
> (a) `User` has a `PasswordHash` — serialising the entity leaks it.
> (b) An entity change would silently become a breaking API change.
> (c) Accepting an entity directly enables **over-posting** — a client setting
> `Role = "Admin"` on their own profile, or setting `ReversedByTransactionId` by hand.
> Lead with (c); it's the security answer.

### 2.3 Services

| Service | Owns |
|---|---|
| `IAuthService` | Login, password verification, JWT issuance |
| `IAccountService` | Chart of accounts CRUD, R15–R19 (incl. the non-zero-balance close guard) |
| `ITransactionService` | Posting, the balancing check R1–R9, reversal R10–R14 |
| `IBalanceService` | Account balance, running balance, opening balance (`01 §5`) |
| `IReportService` | Trial balance, dashboard summary |

> `IBalanceService` is split out rather than folded into `IAccountService` because
> **three different callers need it**: the accounts list (current balance), the statement
> (running balance), and the transaction poster (the R9 overdraft check). One
> implementation of the normal-balance sign rule, used everywhere. If that rule were
> duplicated in three places and one copy drifted, the ledger would disagree with itself.

### 2.4 Error handling

Services throw typed exceptions; one middleware converts them to RFC 7807 `ProblemDetails`:

| Exception | HTTP status | Example |
|---|---|---|
| `NotFoundException` | 404 | unknown account id |
| `ValidationException` | 400 | **unbalanced transaction (R2)**, amount ≤ 0, future date |
| `ForbiddenException` | 403 | Accountant attempting a reversal |
| `ConflictException` | 409 | duplicate account number, already-reversed transaction, overdraft |
| anything else | 500 | logged server-side; **generic** message to the client |

> Chosen over a `Result<T>` type because exceptions keep the happy path readable and
> there is exactly **one** place that knows how a domain failure becomes an HTTP status.
> The acknowledged trade-off: exceptions as control flow aren't free — acceptable here
> because these are genuinely exceptional paths.
> **Never leak a raw exception message** — it can expose the schema or the connection string.

The unbalanced-transaction error should return *how much* it is out by
(`"Transaction does not balance: debits 5000.00, credits 4750.00, difference 250.00"`).
A validation error that tells you the fix is worth more than one that says "invalid".

### 2.5 Two things that need PostgreSQL specifically

1. **`numeric(18,4)`** — an exact decimal type. Configured in EF Core with
   `.HasPrecision(18, 4)`, plus a `CHECK (amount > 0)` constraint via
   `.ToTable(t => t.HasCheckConstraint(...))`. The database enforces R3 even if a future
   code path forgets to.
2. **`SELECT … FOR UPDATE`** — the pessimistic row lock backing the R9 overdraft guard
   (`01 §7.3`). Issued via `FromSqlRaw` inside the explicit transaction, because EF Core
   has no first-class LINQ operator for row locking.

Both are reasons the "database is optional" line in the PDF was declined.

### 2.6 Folder structure

```
backend/
└── Ledger.Api/
    ├── Controllers/      Auth, Accounts, Transactions, Reports, Dashboard
    ├── Services/         IAuthService, IAccountService, ITransactionService,
    │                     IBalanceService, IReportService  (+ implementations)
    ├── Data/
    │   ├── AppDbContext.cs
    │   ├── Configurations/   IEntityTypeConfiguration<T> per entity
    │   ├── Migrations/       EF-generated
    │   └── DbSeeder.cs       idempotent; seeds the two login users only (see `10 §7.1` —
    │                         it also seeded a demo chart of accounts until step 10)
    ├── Models/           User, Account, Transaction, JournalEntry,
    │                     AccountType, EntryDirection, UserRole
    ├── Dtos/             request + response records, grouped by feature
    ├── Middleware/       ExceptionHandlingMiddleware
    ├── Extensions/       ServiceCollection, ClaimsPrincipal, AccountType.NormalBalance()
    ├── Program.cs
    ├── appsettings.json
    └── Dockerfile
```

One project, folder-based layering — see the rejection table for why not four.
`AccountType.NormalBalance()` as an **extension method** keeps the single most important
domain rule (`01 §2`) in one named, testable place rather than inline in each service.

---

## 3. Frontend architecture

```
frontend/
└── src/
    ├── api/          axios instance + interceptors; one module per resource
    ├── auth/         AuthContext, useAuth, ProtectedRoute, AdminRoute
    ├── components/   Button, Table, Modal, Money, AccountPicker, EntryRow, BalanceIndicator
    ├── pages/        Login, Dashboard, Accounts, AccountStatement,
    │                 Journal, NewEntry, TrialBalance
    ├── types/        TS interfaces mirroring the backend DTOs
    ├── hooks/        useApi and friends
    ├── App.tsx       route table
    └── main.tsx
```

**Auth flow on the client:**
1. `POST /api/auth/login` → `{ token, user }`
2. Token + user held in `AuthContext`, persisted so a refresh doesn't log you out
3. axios **request** interceptor adds `Authorization: Bearer <token>`
4. axios **response** interceptor: on `401`, clear auth state, redirect to `/login`
5. `ProtectedRoute` / `AdminRoute` gate the route table

**A dedicated `<Money>` component** formats every amount — fixed 2 decimals, thousands
separators, right-aligned, consistent negative styling. One component means the display
rule cannot drift between the statement, the journal and the trial balance. It is also
the single place where the JS-float caveat from `01 §7.1` is contained: it *formats*,
it never *computes*.

> **Token storage — `localStorage` vs `httpOnly` cookie.**
> `localStorage` is readable by any JS on the page, so it is exposed to XSS; an
> `httpOnly` cookie is not, but then needs CSRF protection and complicates a
> cross-origin SPA. Chosen: `localStorage` + short token expiry, as a deliberate
> trade-off. **Know both sides — this is the most likely security question in the viva.**
> Do not call `localStorage` "secure"; call it a trade-off and name the mitigation.

---

## 4. Docker topology

Three services on one user-defined bridge network:

```
                 ┌──────────────────────────────────────────┐
  browser ──────►│  frontend   nginx :80  →  host :3000     │
                 │  (React build served as static files;    │
                 │   nginx also proxies /api → backend)     │
                 └───────────────────┬──────────────────────┘
                                     │  http://backend:8080
                 ┌───────────────────▼──────────────────────┐
                 │  backend    ASP.NET Core :8080 → :5000   │
                 └───────────────────┬──────────────────────┘
                                     │  Host=db;Port=5432
                 ┌───────────────────▼──────────────────────┐
                 │  db         postgres:17  (named volume)  │
                 └──────────────────────────────────────────┘
```

Points to be able to explain:

- **Multi-stage builds.** Backend: `sdk` image to build → `aspnet` runtime image to run.
  Frontend: `node` image to `npm run build` → `nginx` serving `dist/`. The shipped images
  contain no compiler and no source — smaller, and a smaller attack surface.
- **Service names are DNS names.** `Host=db` works because Compose's embedded DNS resolves
  service names on the shared network. That is *why* the connection string says `db` and
  not `localhost`.
- **`depends_on` + `healthcheck`.** Plain `depends_on` waits for the container to *start*,
  not for Postgres to be *ready to accept connections*. Without a `pg_isready` healthcheck
  and `condition: service_healthy`, the backend races the database and crashes applying
  migrations. *Mention this as a bug actually hit — it proves the setup was run, not copied.*
- **Named volume** for `/var/lib/postgresql/data` so data survives `docker compose down`.
- **Secrets via environment variables**, not baked into `appsettings.json`. ASP.NET Core's
  configuration binder maps `ConnectionStrings__Default` (double underscore) onto the
  nested key `ConnectionStrings:Default` — be ready to explain that mapping.
- **Migrations on startup** vs a separate migration step: applying them in `Program.cs` on
  boot is the pragmatic choice for a demo and is what makes `docker compose up` a
  one-command setup. Acknowledge the production caveat — with multiple replicas, two
  instances can race to migrate, so real deployments run migrations as a separate job.
- **`.dockerignore`** in both apps to keep `node_modules/`, `bin/`, `obj/` out of the
  build context.

---

## 5. Open decision to revisit

**Tests.** `01 §10` lists them as out of scope, but Code Quality is 20% and three xUnit
tests over `ITransactionService` and `IBalanceService` would be cheap and would *prove*
the invariants:

1. An unbalanced transaction is rejected (R2)
2. The running balance sign flips correctly for a Credit-normal account (`01 §5.2`)
3. A reversal produces exactly mirrored entries and leaves the net balance at zero (R11)

That third test is the best single artefact in the whole project — it demonstrates the
ledger's correctness property in about fifteen lines.
**Decision: add them if the schedule holds after Docker is done.** Revisit at step 10.

---

## 6. Build order

Each step produces one doc in `docs/` and roughly one commit, so the repo shows
"meaningful commits showing the development progress" as the PDF demands.

| Step | Doc | Output |
|---|---|---|
| 0 | `00-assessment-breakdown.md` | ✅ requirements, environment, decision log |
| 1 | `01-feature-spec.md` | ✅ double-entry model, entities, rules R1–R19, API surface |
| 2 | `02-tech-stack-and-architecture.md` | ✅ this file |
| 3 | `03-project-setup.md` | ✅ doc written — .NET SDK, `git init`, `.gitattributes`, solution + folders, first run |
| 4 | `04-domain-models.md` | entities, enums, `NormalBalance()`, EF configurations, the two self-FKs |
| 5 | `05-database-and-migrations.md` | DbContext, precision + check constraints, connection string, first migration, idempotent seeder |
| 6 | `06-authentication-authorization.md` | BCrypt, login, JWT issue/validate, role policies |
| 7 | `07-accounts-and-balances.md` | accounts CRUD, balance + running balance, statement endpoint |
| 8 | `08-transactions-and-posting.md` | the balancing check, explicit DB transaction, row lock, reversal |
| 9 | `09-reports.md` | trial balance, dashboard summary |
| 10 | `10-frontend.md` | Vite, routing, AuthContext, interceptors, pages, the live balance indicator |
| 11 | `11-dockerization.md` | Dockerfiles, nginx config, compose, healthchecks |
| 12 | `12-readme-and-writeup.md` | README + the required written explanation |
| 13 | `13-viva-prep.md` | consolidated Q&A bank drawn from every "viva point" above |

Steps 7 and 8 are split deliberately: posting a transaction is the hardest part of the
project (atomicity, concurrency, the balancing invariant) and deserves its own doc and
its own commit.

**Working agreement:** Turzo writes the code. Claude helps where it turns repetitive —
DTO boilerplate, EF configuration classes, repeated CRUD controllers, Tailwind markup —
and writes the doc for each step. **Anything that can't be explained does not go in.**
