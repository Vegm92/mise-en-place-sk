/**
 * Waitlist action tests — exercises the join action logic against
 * an in-memory SQLite DB. Never touches waitlist.db.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

// Replicate the action logic directly so tests don't depend on SvelteKit's
// request/response plumbing. The logic under test is the validation +
// INSERT OR IGNORE behaviour.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function joinAction(db: InstanceType<typeof Database>, rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return { error: 'required' };
  if (!EMAIL_RE.test(email)) return { error: 'invalid' };
  db.prepare('INSERT OR IGNORE INTO waitlist (email) VALUES (?)').run(email);
  return { success: true };
}

let db: InstanceType<typeof Database>;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE waitlist (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      email      TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

function rowCount(): number {
  return (db.prepare('SELECT COUNT(*) as n FROM waitlist').get() as { n: number }).n;
}

describe('waitlist join action', () => {
  it('inserts a valid email', () => {
    const result = joinAction(db, 'chef@restaurant.com');
    expect(result).toEqual({ success: true });
    expect(rowCount()).toBe(1);
  });

  it('returns success on duplicate without inserting again', () => {
    joinAction(db, 'chef@restaurant.com');
    const result = joinAction(db, 'chef@restaurant.com');
    expect(result).toEqual({ success: true });
    expect(rowCount()).toBe(1);
  });

  it('returns required error for empty string', () => {
    const result = joinAction(db, '');
    expect(result).toEqual({ error: 'required' });
    expect(rowCount()).toBe(0);
  });

  it('returns required error for whitespace-only input', () => {
    const result = joinAction(db, '   ');
    expect(result).toEqual({ error: 'required' });
    expect(rowCount()).toBe(0);
  });

  it('returns invalid error for malformed email', () => {
    const result = joinAction(db, 'not-an-email');
    expect(result).toEqual({ error: 'invalid' });
    expect(rowCount()).toBe(0);
  });

  it('returns invalid error for email missing domain', () => {
    const result = joinAction(db, 'user@');
    expect(result).toEqual({ error: 'invalid' });
    expect(rowCount()).toBe(0);
  });

  it('lowercases email before storing', () => {
    joinAction(db, 'Chef@Restaurant.COM');
    const row = db.prepare('SELECT email FROM waitlist').get() as { email: string };
    expect(row.email).toBe('chef@restaurant.com');
  });

  it('trims whitespace before validating', () => {
    const result = joinAction(db, '  chef@restaurant.com  ');
    expect(result).toEqual({ success: true });
    expect(rowCount()).toBe(1);
  });
});
