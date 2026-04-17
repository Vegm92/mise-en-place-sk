/**
 * Dedicated SQLite connection for the waitlist — fully independent
 * from the main app database. Creates waitlist.db in the project root
 * on first access; no external setup required.
 */
import Database from 'better-sqlite3';
import { join } from 'node:path';

const dbPath = join(process.cwd(), 'waitlist.db');

const client = new Database(dbPath);
client.pragma('journal_mode = WAL');

client.exec(`
  CREATE TABLE IF NOT EXISTS waitlist (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

export const insertEmail = client.prepare<[string]>(
  'INSERT OR IGNORE INTO waitlist (email) VALUES (?)'
);
