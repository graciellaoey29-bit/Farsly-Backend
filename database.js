import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join, isAbsolute } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolves the SQLite database file path from environment variables or defaults to local farsly.db.
 * Supported variables:
 * - DB_PATH (e.g. /app/data/farsly.db)
 * - DATABASE_PATH
 * - DATABASE_URL (supports sqlite:///path/to/db or sqlite:./farsly.db or /path/to/db)
 */
export function getDatabasePath() {
  const envPath = process.env.DB_PATH || process.env.DATABASE_PATH;
  if (envPath && envPath.trim()) {
    const trimmed = envPath.trim();
    return isAbsolute(trimmed) ? trimmed : join(process.cwd(), trimmed);
  }

  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim()) {
    const rawUrl = process.env.DATABASE_URL.trim();
    if (rawUrl.startsWith('sqlite://')) {
      const parsed = rawUrl.replace(/^sqlite:\/\//, '');
      return isAbsolute(parsed) ? parsed : join(process.cwd(), parsed);
    }
    if (rawUrl.startsWith('sqlite:')) {
      const parsed = rawUrl.replace(/^sqlite:/, '');
      return isAbsolute(parsed) ? parsed : join(process.cwd(), parsed);
    }
    if (!rawUrl.includes('://')) {
      return isAbsolute(rawUrl) ? rawUrl : join(process.cwd(), rawUrl);
    }
  }

  // Default fallback for development/local execution
  return join(__dirname, 'farsly.db');
}

const DB_PATH = getDatabasePath();

// Ensure the directory for the database file exists (crucial for Docker/Coolify persistent volume paths)
const dbDir = dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(DB_PATH);

// Enable WAL mode for high concurrency and foreign keys for relational integrity
try {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
} catch (err) {
  console.warn('Warning: Could not set pragmas on SQLite database:', err.message);
}

/**
 * Health check helper to verify database connectivity.
 */
export function checkDbHealth() {
  try {
    const row = db.prepare('SELECT 1 AS ok').get();
    return {
      healthy: Boolean(row && row.ok === 1),
      path: DB_PATH,
    };
  } catch (err) {
    return {
      healthy: false,
      error: err.message,
      path: DB_PATH,
    };
  }
}

/**
 * Close database connection safely (useful for tests or graceful shutdown).
 */
export function closeDb() {
  try {
    if (db.open) {
      db.close();
    }
  } catch (err) {
    console.error('Error closing database:', err.message);
  }
}

export default db;
