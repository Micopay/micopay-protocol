# Backend Tests

This directory contains backend test scripts for the micopay API.

## Running Tests

### Prerequisites

Tests require a running PostgreSQL database with migrations applied.

**Setup:**
```bash
# 1. Ensure PostgreSQL is running
# 2. Set DATABASE_URL environment variable (or use default: postgresql://localhost:5432/micopay_dev)
# 3. Run migrations
npm run db:migrate  # or manually apply migrations from src/db/migrations/
```

**Run Tests:**
```bash
# Set required environment variables
export MOCK_STELLAR=true
export SECRET_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000

# Run specific test
npx tsx src/tests/<test-file>.ts
```

### Docker Option (Recommended for CI/CD)

Use a temporary PostgreSQL container:

```bash
# Start PostgreSQL container
docker run --name micopay-test-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=micopay_test -p 5433:5432 -d postgres:15

# Run tests with test database
export DATABASE_URL=postgresql://postgres:postgres@localhost:5433/micopay_test
export MOCK_STELLAR=true
export SECRET_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000

# Apply migrations (if not using existing migrator)
# ... then run tests

npx tsx src/tests/test-trade-flow-schema.ts

# Cleanup
docker stop micopay-test-db
docker rm micopay-test-db
```

## Test Files

### test-trade-flow-schema.ts
**CASH-1: Trade Flow and Provider Schema Tests**

Tests the new `flow` and `provider_id` columns added to the trades table:
- Trade creation requires explicit 'flow' parameter ('deposit' or 'cash_out')
- Server derives 'provider_id' based on flow (deposit → seller, cash_out → buyer)
- Client-supplied 'provider_id' is ignored (security rule)
- Database constraints enforce flow/provider consistency
- Trade reads include 'flow' and 'provider_id' fields
- Invalid flow values are rejected

Run:
```bash
MOCK_STELLAR=true SECRET_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 npx tsx src/tests/test-trade-flow-schema.ts
```

## Test Pattern

Tests follow this structure:

1. **Setup**: Create test users and merchants with unique identifiers
2. **Action**: Execute the functionality being tested
3. **Assertions**: Verify expected behavior using Node's `assert` module
4. **Cleanup**: Remove test data after completion

Each test function is independent and can be run in isolation.

## CI/CD Integration

For automated testing in CI/CD pipelines:

1. Use Docker Compose to spin up a PostgreSQL test database
2. Apply migrations before running tests
3. Run all test files
4. Teardown test database

Example GitHub Actions workflow:

```yaml
name: API Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: micopay_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - run: npm install
      - run: npm run db:migrate
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/micopay_test
      
      - run: npx tsx src/tests/test-trade-flow-schema.ts
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/micopay_test
          MOCK_STELLAR: true
          SECRET_ENCRYPTION_KEY: 0000000000000000000000000000000000000000000000000000000000000000
```

