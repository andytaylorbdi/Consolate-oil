import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { newDb } from 'pg-mem';
import * as schema from './schema.ts';

const { Pool } = pg;

export type DatabaseInstance = ReturnType<typeof drizzle<typeof schema>>;

let cachedDb: DatabaseInstance | null = null;
let cachedPool: any = null;

/**
 * Initializes the database connection.
 * If DATABASE_URL is set, connects to external PostgreSQL.
 * Otherwise, spins up an embedded in-memory PostgreSQL instance (pg-mem)
 * with the Drizzle schema pre-applied.
 */
export async function getDatabase(): Promise<{ db: DatabaseInstance; pool: any }> {
  if (cachedDb && cachedPool) {
    return { db: cachedDb, pool: cachedPool };
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    console.log('[DB] Connecting to external PostgreSQL at:', databaseUrl.split('@')[1] || 'custom');
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
    });
    const db = drizzle(pool, { schema });
    cachedDb = db;
    cachedPool = pool;
    return { db, pool };
  }

  // Embedded PostgreSQL engine (pg-mem)
  console.log('[DB] Initializing embedded PostgreSQL engine (pg-mem)...');
  const memDb = newDb({
    autoCreateForeignKeyIndices: true,
  });

  // Polyfill common postgres functions if needed
  memDb.public.registerFunction({
    name: 'version',
    args: [],
    returns: (memDb.public as any).getType('text'),
    implementation: () => 'PostgreSQL 16.0 (pg-mem in-memory emulator)',
  });

  // Create tables in memory
  const pgAdapter = memDb.adapters.createPg();

  // Drizzle compatibility adapter shim:
  // Drizzle node-postgres passes query.rowMode = 'array' and query.types, which pg-mem by default throws on.
  // Intercepting and converting row objects to arrays enables full Drizzle relational ORM features seamlessly.
  const origQuery = pgAdapter.Client.prototype.query;
  pgAdapter.Client.prototype.query = function (query: any, ...args: any[]) {
    let isRowModeArray = false;
    if (query && typeof query === 'object') {
      if (query.rowMode === 'array') {
        isRowModeArray = true;
        delete query.rowMode;
      }
      if (query.types) {
        delete query.types;
      }
    }

    const result = origQuery.call(this, query, ...args);
    if (isRowModeArray && result && typeof result.then === 'function') {
      return result.then((res: any) => {
        if (res && Array.isArray(res.rows)) {
          res.rows = res.rows.map((row: any) => (row && typeof row === 'object' ? Object.values(row) : row));
        }
        return res;
      });
    }
    return result;
  };

  const pool = new pgAdapter.Pool();

  // Create schema tables manually in pg-mem
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      admin_pin_hash TEXT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      city TEXT NOT NULL DEFAULT 'Bujumbura',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS work_assignments (
      id TEXT PRIMARY KEY,
      worker_id TEXT NOT NULL REFERENCES users(id),
      location_id TEXT NOT NULL REFERENCES locations(id),
      start_at TIMESTAMP NOT NULL DEFAULT NOW(),
      end_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      customer_type TEXT NOT NULL DEFAULT 'ORGANIZATION',
      location TEXT NOT NULL,
      contact_person TEXT NOT NULL,
      phone TEXT NOT NULL,
      actual_prepaid_money INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      registration TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      driver_name TEXT NOT NULL DEFAULT 'Non assigné',
      total_received_liters INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      customer_type TEXT NOT NULL,
      start_date TIMESTAMP NOT NULL,
      contracted_liters INTEGER NOT NULL,
      amount_paid_fbu INTEGER NOT NULL,
      contract_price_per_liter INTEGER NOT NULL,
      consumed_liters INTEGER NOT NULL DEFAULT 0,
      consumed_amount_fbu INTEGER NOT NULL DEFAULT 0,
      remaining_liters INTEGER NOT NULL,
      remaining_amount_fbu INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fuel_sessions (
      id TEXT PRIMARY KEY,
      number TEXT NOT NULL UNIQUE,
      fuel_in INTEGER NOT NULL,
      fuel_out INTEGER NOT NULL DEFAULT 0,
      price_per_liter INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fuel_prices (
      id TEXT PRIMARY KEY,
      price_per_liter INTEGER NOT NULL,
      effective_from TIMESTAMP NOT NULL DEFAULT NOW(),
      effective_to TIMESTAMP,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fuel_allocations (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      requested_liters INTEGER NOT NULL,
      received_liters INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS distribution_orders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      scheduled_date TEXT NOT NULL DEFAULT '2026-10-05',
      session_id TEXT NOT NULL REFERENCES fuel_sessions(id),
      location_id TEXT NOT NULL REFERENCES locations(id),
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS distribution_order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES distribution_orders(id) ON DELETE CASCADE,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
      sequence_order INTEGER NOT NULL,
      suggested_liters INTEGER NOT NULL DEFAULT 100,
      status TEXT NOT NULL DEFAULT 'WAITING',
      is_served BOOLEAN NOT NULL DEFAULT false,
      served_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS fuel_distributions (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT UNIQUE,
      contract_id TEXT REFERENCES contracts(id),
      session_id TEXT NOT NULL REFERENCES fuel_sessions(id),
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
      location_id TEXT NOT NULL REFERENCES locations(id),
      recorded_by TEXT NOT NULL REFERENCES users(id),
      quantity_liters INTEGER NOT NULL,
      price_per_liter INTEGER NOT NULL,
      total_cost_fbu INTEGER NOT NULL,
      vehicle_registration_snapshot TEXT NOT NULL,
      organization_name_snapshot TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS correction_requests (
      id TEXT PRIMARY KEY,
      distribution_id TEXT NOT NULL REFERENCES fuel_distributions(id),
      requested_by TEXT NOT NULL REFERENCES users(id),
      reason TEXT NOT NULL,
      proposed_liters INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      reviewed_by TEXT REFERENCES users(id),
      reviewed_at TIMESTAMP,
      rejection_reason TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  const db = drizzle(pool, { schema });
  cachedDb = db;
  cachedPool = pool;
  return { db, pool };
}
