# API Reference

This is the REST API for the Mini Transaction Ledger. Every endpoint below is taken from the controllers and DTOs in `backend/Ledger/Ledger`. For how requests travel through the layers internally, see [ARCHITECTURE.md §5](ARCHITECTURE.md#5-how-the-api-works-internally).

- [Conventions](#conventions): base URL, authentication, JSON, money, dates, paging, errors
- [Auth](#auth): register, login, current user
- [Users](#users-admin): Admin user management
- [Accounts](#accounts): chart of accounts, open/edit/close, statement
- [Transactions](#transactions): post, transfer, list, get, reverse
- [Reports](#reports): trial balance, dashboard summary
- [End-to-end walkthrough](#end-to-end-walkthrough-with-curl) with `curl`

---

## Conventions

### Base URL

| Running via | Base URL |
|---|---|
| Docker, through nginx (what the browser uses) | `http://localhost:3000/api` |
| Docker, backend directly (debugging) | `http://localhost:5086/api` |
| Local dev (`dotnet run`) | `http://localhost:5086/api` |

### Authentication

Every endpoint except `POST /auth/login` and `POST /auth/register` requires a JWT:

```
Authorization: Bearer <token>
```

- **Getting a token:** `POST /auth/login` issues it.
- **Signature and lifetime:** tokens are signed with HMAC-SHA256 and expire after **120 minutes**. There is no refresh endpoint; sign in again when the token expires.
- **Claims:** the token carries `sub` (user id), `email`, `jti` and `role`.
- **Identity:** the server takes the acting user from `sub`. It never takes it from the request body.

**Access levels used in this document:**

| Label | Meaning |
|---|---|
| Public | No token needed |
| Any user | Any valid token; Accountant or Admin |
| Admin | Token with `role = Admin`; otherwise **403** |

### JSON

- Request and response bodies are JSON (`Content-Type: application/json`).
- Property names are **camelCase**.
- Enum values travel as strings:

| Field | Values |
|---|---|
| `direction` | `"Debit"`, `"Credit"` |
| account `type` | `"Asset"`, `"Liability"`, `"Equity"`, `"Income"`, `"Expense"` |
| `role` | `"Accountant"`, `"Admin"` |

Enum strings in request bodies are case-insensitive.

### Money

- Amounts are **decimal numbers**, stored as PostgreSQL `numeric(18,4)`. Values read back from the database carry 4 decimal places, for example `10000.0000`.
- The server does all money arithmetic. **Balances are computed, never stored**:
  - `raw = Σ debits − Σ credits` for the account.
  - If the account type is debit-normal (`Asset`, `Expense`), the balance is `raw`.
  - If it is credit-normal (`Liability`, `Equity`, `Income`), the balance is `−raw`.
- So an account behaving normally shows a **positive** balance.

### Dates

- `transactionDate` is a calendar date, for example `"2026-09-28"`. The server stores it as UTC midnight and rejects future dates.
- Query-string date filters (`from`, `to`, `asOf`) should include a zone, for example `2026-09-01T00:00:00Z`. The frontend does this automatically.
- `postedAt` and `createdAt` are full UTC timestamps.

### Pagination

List endpoints that page take `page` (default `1`) and `pageSize` (default `25`, maximum `200`). Out-of-range values are clamped to the defaults rather than rejected.

Paged responses look like this:

```json
{ "page": 1, "pageSize": 25, "totalCount": 42, "items": [ ... ] }
```

The account statement is also paged, but it returns its own fields: `page`, `pageSize`, `totalCount`, `entries`.

### Errors

Every error is an RFC 7807 **ProblemDetails** body (`application/problem+json`). The `title` is a human-readable sentence, and the frontend shows it as-is.

**Rule violations** (thrown by the service layer):

```json
{
  "status": 400,
  "title": "Transaction does not balance: debits 10000.00, credits 9000.00, difference 1000.00.",
  "instance": "/api/transactions"
}
```

**Input validation.** A missing field, wrong length or bad email is caught by `[ApiController]` before any code runs. The response is a 400 with an `errors` map:

```json
{
  "title": "One or more validation errors occurred.",
  "status": 400,
  "errors": { "Password": ["The field Password must be a string with a minimum length of 8 ..."] }
}
```

| Status | Meaning in this API |
|---|---|
| `200 OK` | Read or update succeeded |
| `201 Created` | Something was created (user, account, transaction). The `Location` header points at it where applicable. |
| `204 No Content` | Account deactivated |
| `400 Bad Request` | Invalid input or a broken business rule (unbalanced, future date, inactive account…) |
| `401 Unauthorized` | Missing, invalid or expired token; wrong email or password |
| `403 Forbidden` | Valid token but wrong role; account not yet approved; changing your own access |
| `404 Not Found` | The id does not exist |
| `409 Conflict` | Clashes with existing state: duplicate email or account number, overdraft, already reversed |
| `500` | Unexpected. The body is always the generic `"An unexpected error occurred."`; internals are never leaked. |

---

## Auth

### `POST /auth/register`: request access

**Access:** Public.

Creates a new user who is **always an inactive Accountant**. An Admin has to approve the user (see [`PATCH /users/{id}`](#patch-usersid--approve-deactivate-change-role)) before they can sign in.

```json
// request
{
  "fullName": "Rahim Uddin",
  "email": "rahim@company.com",
  "password": "S3curePass!"
}
```

| Field | Rules |
|---|---|
| `fullName` | required, 2–100 chars |
| `email` | required, valid email, ≤150 chars. Trimmed and lowercased before saving. |
| `password` | required, 8–100 chars. Stored only as a BCrypt hash. |

```json
// 201 Created
{ "id": 3, "fullName": "Rahim Uddin", "email": "rahim@company.com", "role": "Accountant" }
```

| Error | When |
|---|---|
| 400 | Validation failed |
| 409 | `"An account with this email already exists."` |

---

### `POST /auth/login`: sign in

**Access:** Public.

```json
// request
{ "email": "admin@misl.com", "password": "Admin@123" }
```

```json
// 200 OK
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAtUtc": "2026-09-28T14:05:00Z",
  "user": { "id": 1, "fullName": "Admin User", "email": "admin@misl.com", "role": "Admin" }
}
```

| Error | When |
|---|---|
| 401 | `"Invalid credentials"`. The same answer for an unknown email and a wrong password, so the endpoint can't be used to find out which emails exist. |
| 403 | `"This account is not active. An administrator needs to approve it."` Only returned when the password was **correct**. |

---

### `GET /auth/me`: current user

**Access:** Any user.

Returns the user the token belongs to. The frontend uses it to restore a session.

```json
// 200 OK
{ "id": 1, "fullName": "Admin User", "email": "admin@misl.com", "role": "Admin" }
```

| Error | When |
|---|---|
| 401 | Token missing, invalid or expired, or the user no longer exists |

---

## Users (Admin)

The whole controller is `[Authorize(Roles = "Admin")]`. An Accountant gets **403** on every route here.

### `GET /users`: list all users

Not-yet-active users come first, then everyone else ordered by name.

```json
// 200 OK
[
  { "id": 3, "fullName": "Rahim Uddin", "email": "rahim@company.com",
    "role": "Accountant", "isActive": false, "createdAt": "2026-09-28T09:12:44Z" },
  { "id": 2, "fullName": "Accountant User", "email": "accountant@misl.com",
    "role": "Accountant", "isActive": true, "createdAt": "0001-01-01T00:00:00" }
]
```

---

### `PATCH /users/{id}`: approve, deactivate, change role

Both fields are optional; only the fields you send are changed.

```json
// approve a registration
{ "isActive": true }

// promote to Admin
{ "role": "Admin" }

// block sign-in
{ "isActive": false }
```

```json
// 200 OK — the updated user
{ "id": 3, "fullName": "Rahim Uddin", "email": "rahim@company.com",
  "role": "Accountant", "isActive": true, "createdAt": "2026-09-28T09:12:44Z" }
```

| Error | When |
|---|---|
| 400 | `"Unknown role '...'."` |
| 403 | `"You cannot change your own access."`, so the last Admin can never lock everyone out |
| 404 | `"User {id} not found."` |

> **Timing:** the role lives inside the JWT, so a role change takes effect at that user's **next sign-in**. A deactivated user's existing token stays valid until it expires (at most 120 minutes).

---

## Accounts

### `GET /accounts`: chart of accounts with balances

**Access:** Any user.

| Query | Optional | Example |
|---|---|---|
| `type` | yes | `?type=Asset` |
| `active` | yes | `?active=true` |

The response is ordered by account number. All balances are computed in **one grouped query**, not one query per account.

```json
// 200 OK
[
  { "id": 1, "accountNumber": "1000", "name": "Cash at Bank", "type": "Asset",
    "currency": "BDT", "allowsNegativeBalance": false, "isActive": true, "balance": 95000.0000 },
  { "id": 5, "accountNumber": "4000", "name": "Service Revenue", "type": "Income",
    "currency": "BDT", "allowsNegativeBalance": false, "isActive": true, "balance": 10000.0000 }
]
```

| Error | When |
|---|---|
| 400 | `"Unknown account type '...'."` |

---

### `GET /accounts/{id}`: one account

**Access:** Any user. Returns a single `AccountDto` (same shape as above), or **404**.

---

### `POST /accounts`: open an account

**Access:** Admin.

```json
// request
{
  "accountNumber": "1100",
  "name": "Accounts Receivable",
  "type": "Asset",
  "currency": "BDT",
  "allowsNegativeBalance": false
}
```

| Field | Rules |
|---|---|
| `accountNumber` | required, ≤10 chars, **unique**, **cannot be changed later** |
| `name` | required, ≤120 chars |
| `type` | required, one of the five types, **cannot be changed later** |
| `currency` | required, ≤3 chars, default `"BDT"` |
| `allowsNegativeBalance` | optional. Allows an **Asset** account to go below zero (an overdraft). |

**Response:** `201 Created`, with `Location: /api/accounts/{id}`, and a body containing the new account with `"balance": 0`.

| Error | When |
|---|---|
| 400 | Validation, or `"Unknown account type '...'."` |
| 403 | Not an Admin |
| 409 | `"Account number '1100' is already in use."` |

---

### `PUT /accounts/{id}`: edit an account

**Access:** Admin.

Only `name` and `allowsNegativeBalance` can be changed. The account's type and number are fixed by design: changing the type after the fact would flip the sign of the account's entire history.

```json
// request
{ "name": "Trade Receivables", "allowsNegativeBalance": false }
```

**Response:** `200 OK` with the updated `AccountDto`. **Errors:** 400, 403, 404.

---

### `POST /accounts/{id}/deactivate`: close an account

**Access:** Admin. There is no request body.

**Response:** `204 No Content`. After this:
- the account rejects new entries
- its history stays readable

| Error | When |
|---|---|
| 400 | `"Cannot deactivate an account with a non-zero balance."` Move the balance out first. |
| 403 | Not an Admin |
| 404 | Unknown id |

---

### `GET /accounts/{id}/statement`: statement with running balance

**Access:** Any user.

| Query | Default | Meaning |
|---|---|---|
| `from` | none | Entries dated on or after this. Everything before it becomes the **opening balance**. |
| `to` | none | Entries dated on or before this |
| `page` | 1 | |
| `pageSize` | 25 | Maximum 200 |

Entries are ordered by date, then transaction, then line. `runningBalance` is the balance after each line, and is computed over the **whole** filtered range before paging.

```json
// 200 OK
{
  "accountId": 1,
  "accountNumber": "1000",
  "accountName": "Cash at Bank",
  "openingBalance": 0,
  "closingBalance": 95000.0000,
  "page": 1,
  "pageSize": 25,
  "totalCount": 2,
  "entries": [
    { "transactionId": 1, "reference": "TXN-2026-000001", "description": "Owner investment",
      "transactionDate": "2026-09-01T00:00:00Z", "direction": "Debit",
      "amount": 100000.0000, "runningBalance": 100000.0000 },
    { "transactionId": 4, "reference": "TXN-2026-000004", "description": "Office rent",
      "transactionDate": "2026-09-05T00:00:00Z", "direction": "Credit",
      "amount": 5000.0000, "runningBalance": 95000.0000 }
  ]
}
```

**Error:** 404 for an unknown account.

---

## Transactions

Transactions are **immutable**. There is deliberately **no `PUT` and no `DELETE`** on this resource. A mistake is corrected by [reversing](#post-transactionsidreverse--reverse-a-transaction) it, which adds a new record rather than changing an old one.

### `POST /transactions`: post a journal entry

**Access:** Any user.

This is the one path that moves money. Any number of lines (at least 2) across any accounts.

```json
// request — invoice a client: AR up, revenue up
{
  "description": "Invoice #1001 — website build",
  "transactionDate": "2026-09-28",
  "entries": [
    { "accountId": 2, "direction": "Debit",  "amount": 10000 },
    { "accountId": 5, "direction": "Credit", "amount": 10000 }
  ]
}
```

| Field | Rules |
|---|---|
| `description` | required, ≤300 chars |
| `transactionDate` | required, **not in the future** |
| `entries` | **at least 2** |
| `entries[].accountId` | an existing, **active** account |
| `entries[].direction` | `"Debit"` or `"Credit"` |
| `entries[].amount` | **> 0** (also enforced by a database `CHECK` constraint) |

**What the server does, in order:**

1. **Validate in memory**: at least 2 lines, date not in the future, every amount > 0, directions valid, and **Σ debits == Σ credits** (exact decimal comparison).
2. **Open a database transaction** and lock every involved account row: `SELECT … FOR UPDATE`, taken in id order so two requests can't deadlock.
3. **Check the accounts**: each one exists and is active, and they all share one currency.
4. **Assign a reference** from a PostgreSQL sequence, for example `TXN-2026-000042`.
5. **Insert** the header and all lines.
6. **Overdraft check**: re-check every Asset account without the overdraft flag. If one would go negative, roll back.
7. **Commit.** Everything is written, or nothing is.

```json
// 201 Created — Location: /api/transactions/7
{
  "id": 7,
  "reference": "TXN-2026-000007",
  "description": "Invoice #1001 — website build",
  "transactionDate": "2026-09-28T00:00:00Z",
  "postedAt": "2026-09-28T10:41:07.512Z",
  "createdBy": "Admin User",
  "isReversal": false,
  "isReversed": false,
  "reversalOfTransactionId": null,
  "reversedByTransactionId": null,
  "totalAmount": 10000.0000,
  "entries": [
    { "id": 13, "accountId": 2, "accountNumber": "1100", "accountName": "Accounts Receivable",
      "direction": "Debit", "amount": 10000.0000 },
    { "id": 14, "accountId": 5, "accountNumber": "4000", "accountName": "Service Revenue",
      "direction": "Credit", "amount": 10000.0000 }
  ]
}
```

| Error | Example `title` |
|---|---|
| 400 | `"Transaction does not balance: debits 10000.00, credits 9000.00, difference 1000.00."` |
| 400 | `"A transaction must have at least two journal entries."` |
| 400 | `"TransactionDate cannot be in the future."` |
| 400 | `"Every entry amount must be greater than zero."` |
| 400 | `"Unknown direction 'Left'. Expected 'Debit' or 'Credit'."` |
| 400 | `"Account 1100 is inactive and cannot accept new entries."` |
| 400 | `"All entries in a transaction must share one currency; got BDT, USD."` |
| 404 | `"Account 99 does not exist."` |
| 409 | `"Account 1000 would be driven to -600.00; it does not allow a negative balance."` |

---

### `POST /transactions/transfer`: two-account shortcut

**Access:** Any user.

This moves `amount` from one account to another. It builds two lines and hands them to exactly the same `POST /transactions` path:
- **Debit** `toAccountId`
- **Credit** `fromAccountId`

Every rule above applies, and none is implemented a second time.

```json
// request — client pays: money into the bank, receivable cleared
{
  "fromAccountId": 2,
  "toAccountId": 1,
  "amount": 10000,
  "description": "Payment for invoice #1001",
  "transactionDate": "2026-09-28"
}
```

**Response:** `201 Created` with a `TransactionDto` (same shape as above).

**Errors:** everything listed for `POST /transactions`, plus 400 `"A transfer needs two different accounts."`

---

### `GET /transactions`: the journal

**Access:** Any user.

| Query | Meaning |
|---|---|
| `from`, `to` | Filter by `transactionDate` (inclusive) |
| `accountId` | Only transactions that touch this account |
| `page`, `pageSize` | Default 1 / 25, maximum 200 |

The results are newest first. `totalAmount` is the sum of the debit side.

```json
// 200 OK
{
  "page": 1,
  "pageSize": 25,
  "totalCount": 7,
  "items": [
    { "id": 7, "reference": "TXN-2026-000007", "description": "Invoice #1001 — website build",
      "transactionDate": "2026-09-28T00:00:00Z", "postedAt": "2026-09-28T10:41:07.512Z",
      "createdBy": "Admin User", "isReversal": false, "isReversed": false,
      "totalAmount": 10000.0000 }
  ]
}
```

---

### `GET /transactions/{id}`: one transaction with its lines

**Access:** Any user. Returns a full `TransactionDto` (see above), or **404** `"Transaction {id} does not exist."`

---

### `POST /transactions/{id}/reverse`: reverse a transaction

**Access:** Admin. There is no request body.

This creates a **new** transaction:
- It has every line of the original with **Debit and Credit swapped**, with the same accounts and amounts.
- It is dated today and described as `"Reversal of TXN-…: …"`.

The two transactions are linked both ways:
- the original gets `reversedByTransactionId`
- the reversal gets `reversalOfTransactionId`

The original row is locked (`FOR UPDATE`) first, so two Admins can't reverse it at the same time.

```json
// 201 Created — Location: /api/transactions/8
{
  "id": 8,
  "reference": "TXN-2026-000008",
  "description": "Reversal of TXN-2026-000007: Invoice #1001 — website build",
  "isReversal": true,
  "isReversed": false,
  "reversalOfTransactionId": 7,
  "reversedByTransactionId": null,
  "totalAmount": 10000.0000,
  "entries": [
    { "accountId": 2, "direction": "Credit", "amount": 10000.0000, "...": "..." },
    { "accountId": 5, "direction": "Debit",  "amount": 10000.0000, "...": "..." }
  ]
}
```

| Error | Example `title` |
|---|---|
| 403 | Not an Admin |
| 404 | `"Transaction 99 does not exist."` |
| 409 | `"Transaction TXN-2026-000007 has already been reversed."` |
| 409 | `"Transaction TXN-2026-000008 is itself a reversal and cannot be reversed."` |
| 409 | Overdraft: reversing would drive a protected Asset account negative |

---

## Reports

### `GET /reports/trial-balance`: trial balance as of a date

**Access:** Any user.

| Query | Default | Meaning |
|---|---|---|
| `asOf` | today | Include every transaction dated up to and including this day |

The report has one line **per account**, including accounts with no activity. Each line has total debits, total credits and the balance with its sign corrected for the account type. `isBalanced` compares the grand totals with **exact** decimal equality.

```json
// 200 OK
{
  "asOf": "2026-09-28T00:00:00Z",
  "totalDebits": 215000.0000,
  "totalCredits": 215000.0000,
  "isBalanced": true,
  "lines": [
    { "accountId": 1, "accountNumber": "1000", "accountName": "Cash at Bank", "type": "Asset",
      "totalDebits": 110000.0000, "totalCredits": 15000.0000, "balance": 95000.0000 }
  ]
}
```

> A balanced trial balance proves the ledger is internally consistent: every posting had equal sides. It does not prove every posting went to the *right* accounts.

---

### `GET /dashboard/summary`: whole-ledger overview

**Access:** Any user.

| Query | Default | Meaning |
|---|---|---|
| `recent` | 5 | How many recent transactions to include (1–50; anything else falls back to 5) |

```json
// 200 OK
{
  "asOf": "2026-09-28T10:45:00Z",
  "accountCount": 8,
  "transactionCount": 7,
  "totalDebits": 215000.0000,
  "totalCredits": 215000.0000,
  "isBalanced": true,
  "totalsByType": [
    { "type": "Asset",     "accountCount": 3, "total": 105000.0000 },
    { "type": "Liability", "accountCount": 1, "total": 0 },
    { "type": "Equity",    "accountCount": 1, "total": 100000.0000 },
    { "type": "Income",    "accountCount": 1, "total": 10000.0000 },
    { "type": "Expense",   "accountCount": 2, "total": 5000.0000 }
  ],
  "recentTransactions": [ /* TransactionListItemDto, newest first */ ]
}
```

`totalsByType` is what the Overview page uses to show the accounting equation, **Assets + Expenses = Liabilities + Equity + Income**.

---

## Endpoint summary

| Method | Route | Access | Success |
|---|---|---|---|
| POST | `/api/auth/register` | Public | 201 |
| POST | `/api/auth/login` | Public | 200 |
| GET | `/api/auth/me` | Any user | 200 |
| GET | `/api/users` | Admin | 200 |
| PATCH | `/api/users/{id}` | Admin | 200 |
| GET | `/api/accounts` | Any user | 200 |
| GET | `/api/accounts/{id}` | Any user | 200 |
| POST | `/api/accounts` | Admin | 201 |
| PUT | `/api/accounts/{id}` | Admin | 200 |
| POST | `/api/accounts/{id}/deactivate` | Admin | 204 |
| GET | `/api/accounts/{id}/statement` | Any user | 200 |
| GET | `/api/transactions` | Any user | 200 |
| GET | `/api/transactions/{id}` | Any user | 200 |
| POST | `/api/transactions` | Any user | 201 |
| POST | `/api/transactions/transfer` | Any user | 201 |
| POST | `/api/transactions/{id}/reverse` | Admin | 201 |
| GET | `/api/reports/trial-balance` | Any user | 200 |
| GET | `/api/dashboard/summary` | Any user | 200 |

---

## End-to-end walkthrough with curl

This walkthrough runs against the Docker stack and uses `jq` to pull fields out of responses. It follows a SaaS company from an empty ledger to a paid invoice.

```bash
API=http://localhost:3000/api

# 1. Sign in as Admin and keep the token
TOKEN=$(curl -s -X POST $API/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@misl.com","password":"Admin@123"}' | jq -r .token)
AUTH="Authorization: Bearer $TOKEN"

# 2. Open four accounts
for body in \
  '{"accountNumber":"1000","name":"Cash at Bank","type":"Asset","currency":"BDT"}' \
  '{"accountNumber":"1100","name":"Accounts Receivable","type":"Asset","currency":"BDT"}' \
  '{"accountNumber":"3000","name":"Owner Capital","type":"Equity","currency":"BDT"}' \
  '{"accountNumber":"4000","name":"Service Revenue","type":"Income","currency":"BDT"}'
do
  curl -s -X POST $API/accounts -H "$AUTH" -H "Content-Type: application/json" -d "$body"
done

# look up their ids
curl -s $API/accounts -H "$AUTH" | jq '.[] | {id, accountNumber, name}'
# assume: 1=Cash, 2=AR, 3=Capital, 4=Revenue

# 3. Owner puts 100,000 into the business (Cash up, Capital up)
curl -s -X POST $API/transactions -H "$AUTH" -H "Content-Type: application/json" -d '{
  "description": "Owner investment", "transactionDate": "2026-09-28",
  "entries": [
    {"accountId":1,"direction":"Debit","amount":100000},
    {"accountId":3,"direction":"Credit","amount":100000}]}'

# 4. Invoice a client for 10,000 (AR up, Revenue up)
curl -s -X POST $API/transactions -H "$AUTH" -H "Content-Type: application/json" -d '{
  "description": "Invoice #1001", "transactionDate": "2026-09-28",
  "entries": [
    {"accountId":2,"direction":"Debit","amount":10000},
    {"accountId":4,"direction":"Credit","amount":10000}]}'

# 5. Client pays (transfer AR → Cash)
curl -s -X POST $API/transactions/transfer -H "$AUTH" -H "Content-Type: application/json" -d '{
  "fromAccountId":2, "toAccountId":1, "amount":10000,
  "description":"Payment for invoice #1001", "transactionDate":"2026-09-28"}'

# 6. Try an unbalanced entry → 400, nothing is written
curl -s -X POST $API/transactions -H "$AUTH" -H "Content-Type: application/json" -d '{
  "description": "Broken", "transactionDate": "2026-09-28",
  "entries": [
    {"accountId":1,"direction":"Debit","amount":500},
    {"accountId":4,"direction":"Credit","amount":400}]}' | jq .title

# 7. Cash statement: 100,000 → 110,000
curl -s "$API/accounts/1/statement" -H "$AUTH" | jq '{openingBalance, closingBalance}'

# 8. Trial balance: debits == credits
curl -s "$API/reports/trial-balance" -H "$AUTH" | jq '{totalDebits, totalCredits, isBalanced}'
```
