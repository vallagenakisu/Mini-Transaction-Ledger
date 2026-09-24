# 00 — Assessment Breakdown

**Source:** `Fresher_Assessment_Project_FSA_HR_MISL_2026.pdf`
**Company:** Millennium Information Solution Ltd. (MISL)
**Role:** Trainee / Assistant Software Engineer
**Deadline:** Tuesday, 28 September 2026, 11:59 PM (submit by email)
**Date this doc written:** 2026-09-24

---

## 1. What they are actually testing

The PDF states the objective as four abilities:

1. Learn and apply new technologies quickly
2. Build a simple but complete full-stack web application
3. Package and run the app using Docker
4. **Explain how the code and components work internally**

Point 4 is the one that carries the assessment. Read the weights:

| Criteria | Weight | What it means |
|---|---|---|
| Architecture Understanding | 25% | Can explain code logic and data flow |
| Learning Ability | 25% | How quickly/effectively new frameworks are applied |
| Code Quality | 20% | Readability, structure, meaningful naming |
| Functionality | 15% | App fulfils basic requirements and runs |
| Documentation & Presentation | 10% | Clarity of README and explanation |
| Dockerization | 5% | Proper use of Docker / docker-compose |

**50% of the grade is explanation and learning. Only 15% is "does it work".**

Implication for how we build: a small, clean, fully-understood app beats a large
feature-rich one. Every file must be defensible line-by-line in the viva. No
feature goes in that I cannot explain.

The note at the bottom of the PDF makes this explicit:

> You can use AI, internet references or official documentation but must be able
> to explain all code and architecture decisions.

---

## 2. The three offered problem statements

### Option 1 — Mini Transaction Ledger
- Create accounts, record debit/credit entries, compute running balances
- REST backend (Spring Boot / .NET / Flask) + React/Angular frontend
- Dockerized with Postgres/SQLite
- *No auth requirement stated.*

### Option 2 — Employee Leave Tracker
- CRUD for employees, leaves, status (approved/pending)
- **Add a REST auth layer (JWT)** — explicitly required
- Frontend dashboards

### Option 3 — Mini Payment Router Simulator
- API to "quote" and "transfer" between dummy Digital Finance Service Providers
- Basic request validation and logging to file
- Docker multi-service setup

---

## 3. Hard technical requirements (non-negotiable)

- **Frontend:** any modern framework → *our choice: React*
- **Backend:** any language/framework → *our choice: ASP.NET Core*
- **Database:** optional (in-memory / JSON file / SQLite / any simple DB)
- **Containerization:** app **must** run inside Docker containers (frontend + backend),
  using `docker-compose` for the multi-container setup

---

## 4. Submission requirements (the literal checklist)

### 4.1 Source code repository (GitHub/GitLab)
Required folder structure, quoted from the PDF:

```
/frontend
/backend
/docker-compose.yml
```

README.md must contain:
- Short project description
- Tech stack used
- Setup & run instructions
- Explanation of architecture
- Brief explanation of inner workings

### 4.2 Short written explanation (separate, required document)
Must explain:
- App architecture (frontend–backend interaction)
- Key code components and their purpose
- How the API works internally
- Docker setup explanation

### 4.3 Deliverables checklist from the PDF
- [ ] Source code in GitHub **with meaningful commits showing the development progress**
- [ ] README with setup + architecture + explanation
- [ ] Docker file(s)
- [ ] docker-compose.yml

> **Note on commits:** "meaningful commits showing the development progress" is
> graded. A single "initial commit" dump loses marks. We commit per logical step,
> and each step in this `docs/` folder should map to roughly one commit.

---

## 5. Gaps found in the current environment

Checked on 2026-09-24:

| Tool | Status |
|---|---|
| Node.js | v26.7.0 — OK |
| npm | 11.19.0 — OK |
| Docker | 29.7.2 — OK |
| Docker Compose | v5.4.0 — OK |
| **.NET SDK** | **NOT INSTALLED** — blocker for local dev |
| git | `/Users/turzo/Work` is the repo root; MISL is currently a subfolder, not its own repo |

Two things to fix before any code is written:
1. Install the .NET SDK (`brew install --cask dotnet-sdk`, or the official installer).
   Without it we can only build inside Docker, which makes the inner-loop painfully slow.
2. `git init` a dedicated repo inside `MISL/` so the submission history is clean and
   contains only this project.

---

## 6. Development environment: one machine, Rider

**Decided 2026-09-24: all development happens on the Mac, in JetBrains Rider.**

The two-machine split (develop on the Windows laptop in Visual Studio, sync by git, build
and dockerize on the Mac) was considered and dropped. Rider is already installed at
`/Applications/Rider.app`, it is a full .NET IDE on macOS, and keeping everything on one
machine removes an entire class of problems:

| Risk avoided | Why it mattered |
|---|---|
| CRLF/LF line-ending churn | Two OSes writing the same files needs a `.gitattributes` guard and still produces noisy diffs |
| "Works on Windows, breaks in Docker" | Docker runs **Linux** containers. A Windows-only build does not catch path casing or filesystem-case collisions until the last day |
| Sync friction | Every context switch becomes a commit + push + pull, even for a half-finished thought |
| Docker unavailable during dev | The Windows laptop lacks the storage for Docker — the containerized run could only ever be tested at the end |

Since dev, build, and Docker now all happen on the same machine that produces the
submission, the environment that gets graded is the environment the code was written in.

Two guards from the old plan are **kept anyway**, because they are good practice, not
workarounds:
- `.gitattributes` with `* text=auto` — normalises line endings in the repo regardless
- Connection strings and secrets from **environment variables**, never hardcoded — the
  same code must run against `localhost` in Rider and `Host=db` under Compose

Rider specifics worth knowing for the viva: it has first-class EF Core tooling (migrations
from the UI), a built-in database browser that will connect straight to the Postgres
container, and an HTTP-client scratch file (`.http`) that replaces Postman for testing
endpoints.

---

## 7. Decision log

Recording *rejected* options matters as much as chosen ones — "why did you pick this?"
is a guaranteed viva question.

| Decision | Chosen | Rejected, and why |
|---|---|---|
| Problem statement | **#1 Mini Transaction Ledger** | **#2 Employee Leave Tracker** — was the initial pick because the PDF mandates JWT for it. Switched because MISL builds core banking and microfinance software: a ledger *is* their domain, and it lets me demonstrate real accounting invariants rather than generic CRUD. **#3 Payment Router** — closest to MISL's switch products but the largest scope for a 4-day window. |
| Ledger model | **Double-entry** | Single-entry — satisfies the PDF's literal wording, but at a banking company "why isn't this double-entry?" is an unanswerable question. |
| Database | **PostgreSQL in Docker** | SQLite — simpler, but reduces `docker-compose.yml` to two services and forfeits the networking/volume/healthcheck material that the Dockerization criterion rewards. In-memory — signals avoiding the hard part. |
| Auth | **JWT + role-based authz** | No auth — the PDF does not require it for the ledger, but an open financial API looks naive. Refresh tokens — deliberate scope cut. |
| IDE / machine | **JetBrains Rider on the Mac — single machine** | *Visual Studio on the Windows laptop* — richest .NET IDE, but it forces a two-machine git-sync workflow and the Windows laptop cannot run Docker (no storage). *VS Code + C# Dev Kit* — free, but weaker EF Core tooling and no integrated database browser. Rider is already installed and does the whole job on one machine. See §6. |

Full reasoning for each lives in `01-feature-spec.md` and
`02-tech-stack-and-architecture.md`.
