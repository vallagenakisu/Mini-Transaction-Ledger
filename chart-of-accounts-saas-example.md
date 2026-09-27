# Chart of Accounts for SaaS Company

**Company Context:** Software-as-a-Service company with 3 employee categories (Executive, Non-Executive, Engineers), initial cash of 100,000 BDT.

---

## Understanding Debit & Credit by Account Type

### Key Principle: Normal Balance
- **Debit increases:** Assets, Expenses
- **Credit increases:** Liabilities, Equity, Income

When the opposite happens:
- **Credit decreases:** Assets, Expenses  
- **Debit decreases:** Liabilities, Equity, Income

---

## Your Chart of Accounts

### ASSETS (1000–1999)
These increase with Debit, decrease with Credit.

| Account # | Account Name | Type | What Debit Does | What Credit Does |
|---|---|---|---|---|
| 1001 | Cash in Hand | Asset | Increases cash | Decreases cash |
| 1002 | Bank Current Account | Asset | Deposits/money in | Withdrawals/money out |
| 1100 | Accounts Receivable | Asset | Client owes you | Client pays you |
| 1500 | Office Equipment | Asset | Buy equipment | Sell/depreciate equipment |
| 1501 | Furniture & Fixtures | Asset | Buy furniture | Sell/depreciate furniture |

**How you use them:**
- **1001/1002**: Track your actual cash. When you deposit 100,000 BDT initially, Debit Bank (or Cash) and Credit Owner's Capital.
- **1100**: When a client gets an invoice but hasn't paid yet, Debit A/R. When they pay, Credit A/R.
- **1500/1501**: When you buy equipment/furniture, Debit it. Over time, you'll depreciate it (reduce its value).

---

### LIABILITIES (2000–2999)
These increase with Credit, decrease with Debit.

| Account # | Account Name | Type | What Debit Does | What Credit Does |
|---|---|---|---|---|
| 2001 | Accounts Payable | Liability | You pay the vendor | Vendor gives you an invoice |
| 2100 | Salary Payable | Liability | You pay employees | You accrue salary expense |

**How you use them:**
- **2001**: When you buy something on credit (e.g., software licenses), Credit A/P. When you pay the vendor, Debit A/P.
- **2100**: At month-end, you accrue salaries owed. Credit this account and Debit the salary expense. When you pay, Debit this account and Credit Bank.

---

### EQUITY (3000–3999)
These increase with Credit, decrease with Debit. They represent ownership.

| Account # | Account Name | Type | What Debit Does | What Credit Does |
|---|---|---|---|---|
| 3001 | Owner's Capital/Equity | Equity | Owner withdraws funds | Owner invests funds |

**How you use it:**
- **Initial entry**: Debit Bank 100,000 BDT and Credit Owner's Capital 100,000 BDT.
- This records that the owner put 100,000 BDT into the company.

---

### INCOME (4000–4999)
These increase with Credit, decrease with Debit. Think: "More income makes us richer."

| Account # | Account Name | Type | What Debit Does | What Credit Does |
|---|---|---|---|---|
| 4001 | SaaS Service Revenue | Income | Refund/return | Client pays for service |
| 4002 | Consulting Revenue | Income | Refund/return | Consulting work delivered |
| 4003 | Support/Maintenance Revenue | Income | Refund/return | Support services provided |

**How you use them:**
- When a client pays for your SaaS subscription: **Debit Bank**, **Credit Service Revenue**.
- When a client signs up but hasn't paid: **Debit A/R**, **Credit Service Revenue**.
- If you offer consulting alongside SaaS: **Debit Bank**, **Credit Consulting Revenue**.

---

### EXPENSES (5000–5999)
These increase with Debit, decrease with Credit. Think: "More expenses make us poorer."

#### Salaries & Compensation
| Account # | Account Name | Type | What Debit Does | What Credit Does |
|---|---|---|---|---|
| 5001 | Executive Salaries | Expense | Accrue/pay salary | Reverse salary |
| 5002 | Non-Executive Salaries | Expense | Accrue/pay salary | Reverse salary |
| 5003 | Engineer Salaries | Expense | Accrue/pay salary | Reverse salary |
| 5004 | Employee Benefits | Expense | Pay benefits | Reverse benefits |

#### Operating Expenses
| Account # | Account Name | Type | What Debit Does | What Credit Does |
|---|---|---|---|---|
| 5100 | Office Rent | Expense | Pay rent | Reverse rent |
| 5101 | Utilities (Electricity, Water, Internet) | Expense | Pay utilities | Reverse utilities |
| 5102 | Office Supplies | Expense | Buy supplies | Reverse supplies |
| 5103 | Equipment Maintenance | Expense | Pay for maintenance | Reverse maintenance |
| 5104 | Furniture Maintenance | Expense | Pay for maintenance | Reverse maintenance |

#### Technology & Software
| Account # | Account Name | Type | What Debit Does | What Credit Does |
|---|---|---|---|---|
| 5200 | Cloud Hosting/Server Costs | Expense | Pay hosting fees | Reverse hosting |
| 5201 | Software Licenses | Expense | Buy licenses | Reverse licenses |
| 5202 | Third-party APIs | Expense | Pay for API usage | Reverse usage |

#### Client & Marketing
| Account # | Account Name | Type | What Debit Does | What Credit Does |
|---|---|---|---|---|
| 5300 | Client Meeting Expenses | Expense | Pay for meetings (food, travel) | Reverse expenses |
| 5301 | Marketing & Advertising | Expense | Spend on marketing | Reverse marketing |

#### Administrative
| Account # | Account Name | Type | What Debit Does | What Credit Does |
|---|---|---|---|---|
| 5400 | Professional Fees (Accounting, Legal) | Expense | Pay professional fees | Reverse fees |
| 5401 | Insurance | Expense | Pay insurance | Reverse insurance |
| 5402 | Depreciation Expense | Expense | Record equipment depreciation | Reverse depreciation |

**How you use them:**
- **Monthly salary entry**: Debit Salary Expense, Credit Salary Payable (accrual).
- **When you pay salaries**: Debit Salary Payable, Credit Bank.
- **Monthly rent**: Debit Rent Expense, Credit Bank (or Accounts Payable if on credit).
- **Client lunch**: Debit Client Meeting Expenses, Credit Bank.

---

## Your First Entry: Opening Balance

When you start with 100,000 BDT cash:

```
Date: [Opening Date]
Description: Owner's capital injection

Debit: Bank Current Account (1002)      100,000 BDT
Credit: Owner's Capital (3001)                    100,000 BDT
```

This creates a balanced entry that records:
- You have 100,000 BDT in the bank (Debit = Asset increases)
- The owner invested 100,000 BDT (Credit = Equity increases)

---

## Example Transactions

### Month 1: First client pays for SaaS subscription (50,000 BDT)
```
Debit: Bank Current Account (1002)      50,000 BDT
Credit: SaaS Service Revenue (4001)             50,000 BDT
```
✓ Bank increases (asset), Revenue increases (income)

### Month 1: You pay executive salary (40,000 BDT)
```
Debit: Executive Salaries Expense (5001)  40,000 BDT
Credit: Bank Current Account (1002)              40,000 BDT
```
✓ Salary expense increases, Bank decreases

### Month 1: You buy office furniture (15,000 BDT) on credit
```
Debit: Furniture & Fixtures (1501)      15,000 BDT
Credit: Accounts Payable (2001)                 15,000 BDT
```
✓ Asset increases, Liability increases (you owe the vendor)

### Month 1: You pay the furniture vendor
```
Debit: Accounts Payable (2001)           15,000 BDT
Credit: Bank Current Account (1002)             15,000 BDT
```
✓ Liability decreases (you paid), Bank decreases

---

## Your Balance Sheet (What You Own vs. What You Owe)

After all Month 1 transactions:

**ASSETS:**
- Bank: 100,000 - 40,000 + 50,000 - 15,000 = **95,000 BDT**
- Furniture: **15,000 BDT**
- **Total Assets: 110,000 BDT**

**LIABILITIES:**
- Accounts Payable: **0 BDT** (paid the vendor)
- **Total Liabilities: 0 BDT**

**EQUITY:**
- Owner's Capital: **100,000 BDT**
- Retained Earnings (Revenue - Expenses): 50,000 - 40,000 = **10,000 BDT**
- **Total Equity: 110,000 BDT**

✓ **Assets = Liabilities + Equity** → 110,000 = 0 + 110,000 ✓

---

## Income Statement (What You Earned vs. What You Spent)

For Month 1:

**INCOME:**
- SaaS Service Revenue: **50,000 BDT**

**EXPENSES:**
- Executive Salaries: **40,000 BDT**
- **Total Expenses: 40,000 BDT**

**Net Income (Profit): 50,000 - 40,000 = 10,000 BDT**

---

## Accounts You Might Add Later

As your SaaS company grows:

1. **1200 – Prepaid Expenses** (Asset): When you pay for annual software licenses upfront
2. **1600 – Accumulated Depreciation** (Asset, contra): Tracks depreciation of equipment
3. **5500 – Training & Development** (Expense): Employee training costs
4. **5501 – Travel & Transportation** (Expense): Business travel
5. **5502 – Professional Development** (Expense): Conferences, courses
6. **4100 – Late Payment Penalties** (Income): If you charge clients for late payments
7. **5600 – Bad Debts Expense** (Expense): When a client doesn't pay
8. **2200 – Tax Payable** (Liability): When you owe taxes

---

## How to Use This in the App

1. **Open the first account**: Click "Open account" and create account 1002 (Bank) as an Asset
2. **Post the opening entry**: Go to New Entry, record your 100,000 BDT deposit
3. **Create all your accounts**: Open all the accounts above (or those you'll use immediately)
4. **Post real transactions**: Every client payment, salary, expense goes here
5. **Check the Trial Balance**: Reports → Trial Balance to verify your entries are balanced

---

## Remember

- **Every transaction has two sides**: One account Debits, another Credits
- **They must be equal**: Debits always = Credits (The Double-Entry Rule)
- **No deletion**: If you made a mistake, post a reversing entry (opposite amounts)
- **Debit/Credit isn't good/bad**: It's just directions. "Debit" doesn't mean negative.
