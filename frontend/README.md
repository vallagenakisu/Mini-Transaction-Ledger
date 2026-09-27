# Ledger — frontend

React + TypeScript client for the Mini Transaction Ledger. Seven screens over the
ASP.NET Core API: the chart of accounts, account statements with a running balance, the
journal, a general-journal entry form with a live balance indicator, and the trial
balance.

The app opens on the chart of accounts and every posting route is entered from one of
them, so an entry always starts from the account it concerns — see
[`../docs/frontend-user-guide.md`](../docs/frontend-user-guide.md) for the flow.

The design decisions behind it — why debits are indigo and credits are ochre rather than
red and green, why there is no CORS policy, why the entry form has no direction dropdown
— are written up in [`../docs/10-frontend.md`](../docs/10-frontend.md).

## Running it

The API must be up first; the dev server proxies `/api` to it.

```bash
# terminal 1 — API on http://localhost:5086
cd ../backend/Ledger/Ledger
dotnet run --launch-profile http

# terminal 2 — client on http://localhost:5173
npm install
npm run dev
```

If the API is on a different port:

```bash
VITE_API_PROXY_TARGET=http://localhost:5286 npm run dev
```

## Seeded demo users

Both are created by `DbSeeder` on a fresh database, and the login screen will fill either
one for you.

| Email | Password | Role |
|---|---|---|
| `admin@misl.com` | `Admin@123` | Admin — may reverse transactions and manage accounts |
| `accountant@misl.com` | `Accountant@123` | Accountant — may post, may not reverse |

> The demo transactions only appear on a **fresh** database: the seeder returns early if
> any accounts already exist.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server with HMR and the `/api` proxy |
| `npm run build` | `tsc -b && vite build` → `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint over `src/` |

## Layout

```
src/
├── api/          axios instance, both interceptors, one module per resource
├── auth/         AuthContext, provider, useAuth, RequireAuth / RequireAdmin
├── components/   ui/ primitives (Radix + cva) and the domain components
├── hooks/        useApi, useLedgerRevision, useTheme
├── lib/          cn, money and date formatting, the normal-balance table
├── pages/        one file per route
└── types/api.ts  TypeScript mirrors of the backend DTOs
```

Two rules the codebase holds to:

- **`lib/format.ts` formats; it never computes.** Every amount on screen was calculated by
  the server in `decimal`. The one place the client adds money — the live balance beam on
  the entry form — sums integer paisa and the server re-checks it anyway.
- **Hiding a control is UX, not security.** Every role rule is enforced independently by
  the API from the token's claims.
