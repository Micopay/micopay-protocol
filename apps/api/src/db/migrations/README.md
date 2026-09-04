# Database Migrations

This directory contains SQL migration files for the micopay backend.

## Migration Pattern

Migrations follow a versioned up/down pattern:

- **Up migrations** (`XXX_description.up.sql`): Apply schema changes
- **Down migrations** (`XXX_description.down.sql`): Rollback schema changes

## Naming Convention

```
<version>_<description>.up.sql
<version>_<description>.down.sql
```

Example:
```
001_initial_schema.up.sql
001_initial_schema.down.sql
002_add_flow_and_provider.up.sql
002_add_flow_and_provider.down.sql
```

## Running Migrations

Migrations run automatically on server startup via `runMigrations()` in `migrator.ts`.

Manual migration execution:
```typescript
import { runMigrations, rollbackLastMigration } from './db/migrator.js';

// Run all pending migrations
await runMigrations();

// Rollback the last migration
await rollbackLastMigration();
```

## Migration Safety

### Guards
Migrations should include guards to prevent data loss:

```sql
DO $$
DECLARE
  ambiguous_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO ambiguous_count
  FROM trades
  WHERE <condition that would make migration ambiguous>;

  IF ambiguous_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: Found % ambiguous rows', ambiguous_count;
  END IF;
END $$;
```

### Symmetry
Up and down migrations must be symmetric:
- After running up → down, the schema should be identical to the pre-migration state
- `init.sql` should always reflect the schema after applying all migrations

## Migration List

### 001_initial_schema
- Creates core tables: users, wallets, merchants, trades, etc.
- Sets up initial indexes and constraints

### 002_add_flow_and_provider (CASH-1)
- Adds `flow` column to trades (deposit | cash_out)
- Adds `provider_id` column to trades (references users.id)
- Adds check constraints for flow/provider consistency
- Adds migration guard to abort if ambiguous rows exist

**Constraint Logic:**
- `flow = 'deposit'` → `provider_id = seller_id` (merchant provides deposit service)
- `flow = 'cash_out'` → `provider_id = buyer_id` (user withdrawing cash)

## Testing Migrations

Test migrations on a copy of production data:

1. Backup database: `pg_dump -d micopay_prod > backup.sql`
2. Restore to test DB: `psql -d micopay_test < backup.sql`
3. Run migration: `node --import tsx src/db/migrator.ts`
4. Verify data integrity
5. Test rollback: Call `rollbackLastMigration()`
6. Verify rollback leaves schema unchanged

## Migration Metadata

The `migrations_meta` table tracks executed migrations:

```sql
CREATE TABLE migrations_meta (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Only the base name (without `.up.sql` or `.down.sql`) is stored.
