# EstimateNepal — Master Document Index

> Start here. Read only what the current task requires.

| Document | What it answers |
|---|---|
| [CLAUDE.md](../CLAUDE.md) | AI session rules, guardrails, schema change procedure, end-of-session checklist |
| [02_DATABASE.md](02_DATABASE.md) | Schema change rule, raw SQL procedure, shared Docker DB, production DB access |
| [03_UNITS.md](03_UNITS.md) | Complete unit system spec — feet vs meters, canonical storage, scale presets, unit flow |
| [10_SECURITY.md](10_SECURITY.md) | Security rules — tenant guard, rate limits, file security, exports, Socket.io |
| [14_BUILD_ROADMAP.md](14_BUILD_ROADMAP.md) | All phases E-0 through E-6 with Definition of Done bullets |
| [PROGRESS.md](PROGRESS.md) | Current phase, session log, audit log, schema changes applied |
| [BACKLOG.md](BACKLOG.md) | Known bugs and improvements discovered mid-phase |
| [SPEC.md](SPEC.md) | Original product specification v4.0 — historical reference, not the active build guide |

## Quick orientation

**Platform:** NepaliEstimate is a two-app product suite — Estimation (this app, live at estimatenepal.com) and Bidding (local, not yet deployed). They share auth, database, storage, and email. Estimation is the auth authority.

**Current phase:** See [PROGRESS.md](PROGRESS.md)

**Before building any feature:** Read CLAUDE.md → read the relevant doc above → show plan → wait for approval.

**Schema changes:** Never `prisma migrate dev` or `prisma db push`. See [02_DATABASE.md](02_DATABASE.md).

**Unit questions:** See [03_UNITS.md](03_UNITS.md) — project unit setting drives everything downstream.

**Security questions:** See [10_SECURITY.md](10_SECURITY.md) — non-negotiable rules.
