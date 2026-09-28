# Mini Transaction Ledger

A double-entry bookkeeping ledger with a REST API and a React frontend. Every transaction
is a set of balanced debit/credit entries — the backend enforces the balancing invariant,
account rules, and audit-safe corrections (nothing is ever edited or deleted, only
reversed).

## Tech stack

| Layer | Choice |
|---|---|
| Backend | ASP.NET Core (.NET 10), Entity Framework Core, Npgsql |
| Database | PostgreSQL 17 |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 |
| Auth | JWT with role-based authorization (Accountant / Admin) |
| Containerization | Docker, docker-compose (3 services: frontend, backend, db) |

## Quick start

Requires only Docker Desktop — no local .NET SDK or Node install needed.

```bash
git clone <repo-url>
cd MISL
docker compose up --build
```

Then open **http://localhost:3000**.

First login (seeded automatically on first run, into an otherwise empty database):

| Role | Email | Password |
|---|---|---|
| Admin | `admin@misl.com` | `Admin@123` |
| Accountant | `accountant@misl.com` | `Accountant@123` |

New users can also self-register at `/register`, but every new account starts **inactive**
— an Admin has to approve it from the Users page before it can sign in.

To stop: `Ctrl+C`, then `docker compose down` (add `-v` to also wipe the database volume).

## Architecture

A summary follows. For the full version, see **[ARCHITECTURE.md](ARCHITECTURE.md)**, which is the required written explanation. It covers:
- the frontend layers and user flow
- each backend layer: middleware pipeline, controllers, services, data access
- request traces for login, posting and reversal
- the data model
- the Docker setup

All of it is drawn as ASCII diagrams.

```
 browser
    │
    ▼
 frontend   nginx :80 → host :3000
    │       serves the built React app
    │       proxies /api/* to the backend
    ▼
 backend    ASP.NET Core :8080 → host :5086
    │       REST API, JWT auth, business rules
    ▼
 db         PostgreSQL 17, named volume
```

Frontend and backend are two separate deployables that only talk to each other over HTTP
through nginx's reverse proxy — the browser never contacts the backend directly. This is
the same shape in local dev (Vite's dev-server proxy) as in the Docker deployment (nginx),
so nothing behaves differently between the two, and no CORS policy is needed either way.

On startup, the backend automatically applies any pending EF Core migrations and seeds the
two demo users if the database is empty. Compose's Postgres healthcheck (`pg_isready`)
makes the backend wait for Postgres to actually accept connections — not just for its
container to start — before doing this, closing a real startup race.

## Inner workings

**Double-entry, not single-entry.** Every transaction is a list of journal entries; the
sum of debits must exactly equal the sum of credits before it's accepted. This is enforced
in the service layer and is the one non-negotiable invariant of the whole app.

**Nothing is ever edited or deleted.** There is deliberately no `PUT`/`DELETE` on a
transaction. A mistake is corrected by *reversing* it — posting a brand-new transaction
with every debit and credit swapped, linked back to the original. Both the error and its
correction stay visible forever, because a ledger is an audit trail, not a spreadsheet.

**Money is `decimal`, never `double`/`float`** — both in C# and in Postgres'
`numeric(18,4)` column type. Binary floating point cannot represent values like `0.1`
exactly, which is unacceptable for currency. The frontend never performs money
arithmetic; every balance and total is computed server-side and sent ready to display.

**Posting a transaction is atomic and safe under concurrency.** Two simultaneous transfers
against the same account's balance is a classic read-then-write race: both requests could
read the same starting balance and both incorrectly pass an overdraft check that should
only have let one through. This is closed with a pessimistic row lock
(`SELECT ... FOR UPDATE`) inside an explicit database transaction — the second request
blocks until the first commits, then re-reads the true balance.

**Two roles: Accountant and Admin.** Both can post entries and view every report. Only an
Admin can open/edit/close accounts, reverse a transaction, or approve/deactivate other
users. A newly registered user is always created as an inactive Accountant — self-service
sign-up exists, but nobody can act until an Admin grants access.

## API surface

The routes are summarised below. **[API.md](API.md)** documents every endpoint in full:
- request and response bodies with examples
- validation rules and access level
- every error the endpoint can return
- what the server does internally on each call
- an end-to-end `curl` walkthrough

| Area | Routes |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| Users *(Admin)* | `GET /api/users`, `PATCH /api/users/{id}` |
| Accounts | `GET /api/accounts`, `POST /api/accounts`, `GET/PUT /api/accounts/{id}`, `POST /api/accounts/{id}/deactivate`, `GET /api/accounts/{id}/statement` |
| Transactions | `GET/POST /api/transactions`, `POST /api/transactions/transfer`, `POST /api/transactions/{id}/reverse` |
| Reports | `GET /api/reports/trial-balance`, `GET /api/dashboard/summary` |

## Project structure

```
/frontend            React + Vite SPA
/backend/Ledger      ASP.NET Core solution
/docker-compose.yml  three-service orchestration (frontend, backend, db)
/docs                design docs, one per build step — the reasoning behind every
                     decision above, written as the project was built
```

## Further reading

- `ARCHITECTURE.md`: the written explanation, with detailed diagrams of every layer
- `API.md`: full API reference, covering endpoints, payloads, errors and a curl walkthrough
- `docs/frontend-user-guide.md` — a screen-by-screen walkthrough of the UI
- `docs/00` through `docs/10` — the full design log, in build order: requirements,
  domain model, database, auth, transaction posting (atomicity/concurrency), reports,
  frontend
- `docs/02-tech-stack-and-architecture.md §4` — the Docker topology in detail
