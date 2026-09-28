# Frontend at a glance — features & user flow

A plain-language walkthrough of what's built, page by page. For the *why* behind each
decision (design tokens, hooks, verification evidence, viva questions), see
[`10-frontend.md`](10-frontend.md) — this doc is the fast map, that one is the deep dive.

## Running it

```bash
# terminal 1 — API
cd backend/Ledger/Ledger && dotnet run --launch-profile http   # http://localhost:5086

# terminal 2 — frontend
cd frontend && npm run dev                                     # http://localhost:5173
```

Both need to be running — Vite proxies `/api/*` to the .NET process; if the backend isn't
up, every API call 502s.

**Login:**

| Role | Email | Password | Can do |
|---|---|---|---|
| Admin | `admin@misl.com` | `Admin@123` | everything, incl. open/edit/close accounts, reverse, approve users |
| Accountant | `accountant@misl.com` | `Accountant@123` | post entries & transfers, view everything; no admin actions |

The login screen has click-to-fill buttons for both, so you never have to type these.

---

## The core idea of the flow

**Everything starts from an account.** After login you land on the chart of accounts, as
cards. You pick the account you want to do something with, that opens its workspace
(statement + actions), and you post from there — with that account already filled in as
one side of the entry.

That's the whole navigation model:

```
login  →  accounts (cards)  →  pick one  →  its statement  →  post from here
                                                                ├─ New transaction  (2 accounts, dialog)
                                                                └─ Journal entry    (N accounts, full form)
```

One nuance that can't be designed away: this is **double-entry**, so "operate on this
account" never means only that account moves. Starting from an account answers one side of
the entry; the facing account is still an explicit choice. What the flow removes is the
question the app already knew the answer to.

---

## The screens

### 1. Login (`/login`)
Split screen. Right side is the sign-in form plus the two demo-user shortcuts (click to
fill). Left side (desktop only) is a single line drawing of a balance at rest, in the two
ledger hues — no copy. A **Register** link leads to `/register`.

### 1a. Register (`/register`)
Name, email, password (8+ characters), confirm. Anyone can register, but the new user is
always an **Accountant** and starts **not active** — signing in says an administrator has
to approve it. Anyone can ask for access; only an Admin can grant it.

### 2. Chart of accounts (`/`) — **the home screen**
Every account as a card, grouped into sections by type (Asset, Liability, Equity, Income,
Expense) with a subtotal per section. Each card shows the account number, name, balance,
currency and normal balance, plus badges for **Closed** and **Overdraft**.

- **Find** box filters by name or number as you type; Type and Status dropdowns alongside.
- Click any card → that account's workspace.
- **Admin only:** "Open account" button, plus Edit and Close icons that appear on card
  hover. An Accountant sees the same cards with no controls.
- **No accounts yet?** The page says so plainly, with an "Open the first account" button
  for an Admin (or "ask an administrator" for an Accountant). Filtering down to nothing
  gives a *different* message — "Nothing matches those filters" with a reset button — so
  an empty ledger and an over-narrow filter never look the same.

### 3. Account workspace (`/accounts/:id`)
The account's own page: opening balance → every entry with a running balance → closing
balance, with a date-range filter and pagination. Two action buttons in the header, both
carrying this account with them:

- **New transaction** — a dialog for the two-account case. First control asks which side
  *this* account is on (Debited / Credited), each labelled with its plain-English effect
  ("increases this account ↑"), defaulted to whatever increases it. Then you pick the
  facing account, amount, date, description. A preview shows both entries before you post.
- **Journal entry** — goes to the full multi-line form with this account already on line 1,
  for entries touching three or more accounts.

A **closed** account shows neither — you can't post to an inactive account, so the button
would only exist to be refused.

### 4. New entry (`/transactions/new`)
The general journal form — any number of lines across any accounts. No direction dropdown:
each line has a Debit column and a Credit column, and typing in one clears the other, like
writing a journal on paper.

- A **balance beam** tips toward the heavier side and levels when debits equal credits.
- A plain-English checklist lists whatever is blocking submission; the button stays
  disabled until it's empty.
- "Insert balancing figure" fills the difference on the short side.
- Arrived from an account? There's a back link to it, and line 1 is pre-filled.

### 5. Journal (`/transactions`)
Every transaction, newest first, filterable by date range and by account. Click a row to
expand its lines in place.

- **Admin only:** Reverse, which previews the mirrored entries it will create. Reversal is
  not a delete — it posts a *new* opposite transaction and both rows stay forever.
- A reversed transaction gets a REVERSED stamp and struck-through reference; the reversing
  one shows a REVERSAL badge linking back.
- Nothing here can be edited or deleted by anyone — there's no such button because there's
  no such endpoint.

### 6. Overview (`/overview`)
The whole-ledger position, **read-only**. A strip of four figures (accounts, transactions,
total debits, total credits), then the accounting equation — debit-normal types left,
credit-normal right, with an `=` badge that turns red if the two sides ever disagreed —
then the last few transactions posted.

Deliberately not the landing page and deliberately has no form on it: it's the ledger
reporting on itself, not a place you change it.

### 7. Trial balance (`/reports/trial-balance`)
Every account's total debits and credits as of a chosen date, with a verdict banner and a
Print button. Equal totals are a checksum on data integrity, not evidence the bookkeeping
is right — worth knowing, though the page no longer says it.

### 8. Users (`/users`) — Admin only
Every user with their role and status. **Approve** activates a new registration;
**Deactivate** blocks sign-in; the role dropdown switches Accountant ↔ Admin. Your own row
has no controls, so the last admin can never lock everyone out. A role change applies at
that user's next sign-in (the role travels inside their login token).

---

## A typical session

1. Log in as Admin → land on the **accounts**.
2. Find the account you care about (search or scan) → click its card.
3. Read its statement; post from it — **New transaction** for two accounts,
   **Journal entry** for more.
4. Made a mistake? → **Journal**, expand the transaction, **Reverse**, confirm the preview.
5. Check the whole ledger → **Overview** for the position, **Trial balance** to print it.

Log in as Accountant and repeat: identical except the account controls in step 2 and the
Reverse button in step 4 aren't there. An Accountant can still post from any account.

## Starting a ledger from nothing

1. **Open account** on the landing page. Number and type are fixed at creation; name and
   the overdraft flag can be changed later.
2. Repeat for the accounts you need — at minimum something to hold value (Cash/Bank) and
   something to fund it from (Owner's Capital).
3. Open the funding account and post the opening entry from it. There's no "opening
   balance" field anywhere: a starting balance is a real transaction in the journal,
   visible and reversible, because nothing in this system exists outside the posting path.

## Small things worth knowing

- **Dark mode** — top bar toggle; a real dark palette, not an inverted filter.
- **Mobile** — the sidebar becomes a horizontal scrolling strip under 1024px.
- **Nothing is ever deleted** — corrections are always a new, reversing transaction.
- **Colours mean direction, not good/bad** — debit indigo, credit ochre. Red is for
  refusals; green means one thing only: debits equal credits.
- **`/accounts` still works** — it redirects to `/`, since the chart of accounts moved to
  the root.
