/**
 * parseJsonResponse (issue #842) — the shared parse-then-validate step every
 * LLM JSON call site (invoice extraction, product normalize/categorize) now
 * goes through instead of an unchecked `JSON.parse(...) as T` cast.
 *
 * Direct parse first (what a schema-constrained reply should already be);
 * stripJsonFence only runs as a fallback when that fails; a syntactically
 * valid reply of the wrong shape is rejected exactly like unparsable JSON.
 */
import { describe, it, expect } from 'vitest';
import { parseJsonResponse, stripJsonFence } from '../src/lib/server/llm-json';

interface Verdict { ok: boolean; count: number }
const isVerdict = (v: unknown): v is Verdict =>
  typeof v === 'object' && v !== null
  && typeof (v as Record<string, unknown>).ok === 'boolean'
  && typeof (v as Record<string, unknown>).count === 'number';

describe('parseJsonResponse', () => {
  it('parses and validates a well-formed reply', () => {
    expect(parseJsonResponse('{"ok": true, "count": 3}', isVerdict, 'Test')).toEqual({ ok: true, count: 3 });
  });

  it('falls back to stripJsonFence only when the direct parse fails', () => {
    const fenced = '```json\n{"ok": true, "count": 1}\n```';
    expect(parseJsonResponse(fenced, isVerdict, 'Test')).toEqual({ ok: true, count: 1 });
  });

  it('throws with "invalid JSON" on unparsable text', () => {
    expect(() => parseJsonResponse('not json at all', isVerdict, 'Test')).toThrow(/invalid JSON/);
  });

  it('throws with "invalid JSON" on well-formed JSON of the wrong shape', () => {
    expect(() => parseJsonResponse('[1, 2, 3]', isVerdict, 'Test')).toThrow(/invalid JSON/);
    expect(() => parseJsonResponse('{"ok": "yes", "count": 3}', isVerdict, 'Test')).toThrow(/invalid JSON/);
    expect(() => parseJsonResponse('{"ok": true}', isVerdict, 'Test')).toThrow(/invalid JSON/);
  });

  it('includes the caller-supplied label in the error message', () => {
    expect(() => parseJsonResponse('nope', isVerdict, 'Gemini')).toThrow(/^Gemini returned invalid JSON/);
  });
});

describe('stripJsonFence', () => {
  it('removes a ```json fence', () => {
    expect(stripJsonFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('leaves unfenced text unchanged', () => {
    expect(stripJsonFence('{"a":1}')).toBe('{"a":1}');
  });

  it('treats null/undefined as empty', () => {
    expect(stripJsonFence(null)).toBe('');
    expect(stripJsonFence(undefined)).toBe('');
  });
});
