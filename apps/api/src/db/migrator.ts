import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, execute } from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  console.log('🔄 Running migrations...');

  await execute(`
    CREATE TABLE IF NOT EXISTS migrations_meta (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = await fs.readdir(migrationsDir);
  // Only look for .up.sql files for forward migrations
  const sqlFiles = files
    .filter(f => f.endsWith('.up.sql'))
    .sort()
    .map(f => f.replace('.up.sql', '')); // Base name without extension

  const executedMigrations = await query('SELECT name FROM migrations_meta');
  const executedNames = new Set(executedMigrations.rows.map(r => r.name));

  for (const baseName of sqlFiles) {
    if (!executedNames.has(baseName)) {
      const upFile = `${baseName}.up.sql`;
      console.log(`  🚀 Executing migration: ${upFile}`);
      const filePath = path.join(migrationsDir, upFile);
      const sql = await fs.readFile(filePath, 'utf-8');

      try {
        await execute(sql);
        await execute('INSERT INTO migrations_meta (name) VALUES ($1)', [baseName]);
        console.log(`  ✅ Migration ${baseName} successful`);
      } catch (err) {
        console.error(`  ❌ Migration ${baseName} failed:`, err);
        throw err;
      }
    }
  }

  console.log('✅ All migrations complete');
}

export async function rollbackLastMigration() {
  console.log('🔄 Rolling back last migration...');

  const lastMigration = await query(
    'SELECT name FROM migrations_meta ORDER BY executed_at DESC LIMIT 1'
  );

  if (lastMigration.rows.length === 0) {
    console.log('  ℹ️  No migrations to rollback');
    return;
  }

  const baseName = lastMigration.rows[0].name;
  const downFile = `${baseName}.down.sql`;
  const migrationsDir = path.join(__dirname, 'migrations');
  const filePath = path.join(migrationsDir, downFile);

  console.log(`  🔙 Rolling back migration: ${baseName}`);

  try {
    const sql = await fs.readFile(filePath, 'utf-8');
    await execute(sql);
    await execute('DELETE FROM migrations_meta WHERE name = $1', [baseName]);
    console.log(`  ✅ Rollback of ${baseName} successful`);
  } catch (err) {
    console.error(`  ❌ Rollback of ${baseName} failed:`, err);
    throw err;
  }
}
