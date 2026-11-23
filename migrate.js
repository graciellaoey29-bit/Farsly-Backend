/**
 * Farsly Database Migration Script
 * Safe and idempotent: creates required tables and indexes if they do not exist.
 * Can be run via: npm run migrate
 * Or imported and run programmatically.
 */

import { db, getDatabasePath } from './database.js';

export function runMigrations(database = db) {
  const dbPath = getDatabasePath();
  console.log(`\n📦 Running database migrations on: ${dbPath}`);

  try {
    // Enable WAL mode and foreign keys
    database.pragma('journal_mode = WAL');
    database.pragma('foreign_keys = ON');

    // 1. Users table
    database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        email       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
        password    TEXT    NOT NULL,
        role        TEXT    NOT NULL DEFAULT 'customer' CHECK(role IN ('customer', 'restaurant'))
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);
    console.log('  ✓ Table "users" verified');

    // 2. Menu items table
    database.exec(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id          TEXT    PRIMARY KEY,
        name        TEXT    NOT NULL,
        category    TEXT    NOT NULL,
        description TEXT    NOT NULL DEFAULT '',
        price       REAL    NOT NULL DEFAULT 0,
        calories    TEXT    DEFAULT '0',
        protein     TEXT    DEFAULT '0g',
        rating      REAL    DEFAULT 0,
        review_count INTEGER DEFAULT 0,
        badge       TEXT,
        ingredients TEXT    DEFAULT '[]',
        image       TEXT,
        available   INTEGER DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category);
    `);
    console.log('  ✓ Table "menu_items" verified');

    // 3. Orders table
    database.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id          TEXT    PRIMARY KEY,
        customer_id INTEGER NOT NULL,
        customer_name TEXT  NOT NULL DEFAULT '',
        order_type  TEXT    DEFAULT 'Takeaway',
        items       TEXT    NOT NULL DEFAULT '[]',
        total_price REAL    NOT NULL DEFAULT 0,
        status      TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed')),
        notes       TEXT    DEFAULT '',
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (customer_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    `);
    console.log('  ✓ Table "orders" verified');

    console.log('✓ All database migrations applied successfully.\n');
    return { success: true, dbPath };
  } catch (err) {
    console.error('❌ Migration failed:', err);
    throw err;
  }
}

// Auto-run if executed directly via node migrate.js
const isDirectExecution = process.argv[1] && process.argv[1].endsWith('migrate.js');
if (isDirectExecution) {
  try {
    runMigrations();
    process.exit(0);
  } catch (err) {
    console.error('Fatal migration error:', err);
    process.exit(1);
  }
}
