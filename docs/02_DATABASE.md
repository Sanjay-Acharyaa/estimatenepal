# Database — Rules and Procedures

## The shared database situation

| Environment | Who uses it | Risk |
|---|---|---|
| Local dev (`nepali-estimate-mysql-1` Docker container) | Estimation + Bidding both connect to this | Running `prisma db push` or `prisma migrate dev` on Estimation can attempt to drop Bidding's `bid_*` tables |
| Production (DigitalOcean MySQL) | Estimation only (Bidding not yet deployed) | When Bidding deploys, it will join this same database |

**Table ownership:**
- Estimation owns all tables without a prefix (e.g. `User`, `Project`, `DrawingPage`, `TakeoffItem`, etc.)
- Bidding owns all tables prefixed with `bid_` (e.g. `bid_User`, `bid_Tender`, etc.)
- Prisma on the Estimation side only manages Estimation models. It has no knowledge of `bid_*` tables.
- Prisma on the Bidding side only manages `bid_*` models. It has no knowledge of Estimation tables.

---

## The rule: never use Prisma migration commands

```
prisma migrate dev   ← BANNED
prisma db push       ← BANNED
```

Both commands compare the Prisma schema against the live database. If the live database has tables not in the schema (like Bidding's `bid_*` tables), Prisma may prompt or attempt to drop them. Even with safeguards, this is never safe to run on the shared local database.

---

## How to apply schema changes

### Local dev
```bash
docker exec nepali-estimate-mysql-1 mysql -u root -proot nepaliestimate -e "ALTER TABLE TableName ..."
```

For multi-statement changes, write a `.sql` file and pipe it:
```bash
docker exec -i nepali-estimate-mysql-1 mysql -u root -proot nepaliestimate < migration.sql
```

### Production (DigitalOcean)
Connect to the server via SSH and apply directly:
```bash
mysql -u <user> -p<password> <database> -e "ALTER TABLE TableName ..."
```
Or use a MySQL client connected to the DigitalOcean server.

### After applying SQL
1. Update `prisma/schema.prisma` to reflect the new state — Prisma Client is generated from this file, so it must stay accurate.
2. Log the change in `docs/PROGRESS.md` under "Schema Changes Applied" with the date and exact SQL run.

---

## When Bidding deploys to production

When the Bidding platform is ready to deploy, it will be added to the same DigitalOcean MySQL database. At that point:
- Estimation's `prisma db push` becomes dangerous in production as well
- The ban on migration commands applies permanently in both environments
- All schema changes for both platforms go through raw SQL only

---

## Prisma Client generation (safe)

Generating the Prisma Client from an updated schema is always safe — it never touches the database:
```bash
npx prisma generate
```

Run this after updating `prisma/schema.prisma` to pick up type changes in the app.
