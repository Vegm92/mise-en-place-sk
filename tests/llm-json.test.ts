/**
 * parseJsonResponse (issue #842) — the shared parse-then-validate step every
 * LLM JSON call site (invoice extraction, product normalize/categorize) now
 * goes through instead of an unchecked `JSON.parse(...) as T` cast.
 *
 * Direct parse first (what a schema-constrained reply should already be);
 * stripJsonFence only runs as a fallback when that fails. Unparsable text and
 * a syntactically valid reply of the wrong shape both fail, but as distinct
 * error types: a genuine parse failure (junk upload) stays a plain Error with
 * "invalid JSON" in the message, while a shape mismatch (a real reply the
 * guard rejected) throws JsonShapeMismatchError with no such substring — that
 * split is what lets extraction-worker.ts's classifyExtractionError file the
 * two under different keys instead of both reading as "not an invoice".
 */
import { describe, it, expect } from 'vitest';
import { parseJsonResponse, stripJsonFence, JsonShapeMismatchError } from '../src/lib/server/llm-json';

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

  it('throws a plain Error with "invalid JSON" on unparsable text — not JsonShapeMismatchError', () => {
    expect(() => parseJsonResponse('not json at all', isVerdict, 'Test')).toThrow(/invalid JSON/);
    let caught: unknown;
    try {
      parseJsonResponse('not json at all', isVerdict, 'Test');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(JsonShapeMismatchError);
  });

  it('throws JsonShapeMismatchError — not a generic "invalid JSON" Error — on well-formed JSON of the wrong shape', () => {
    for (const badReply of ['[1, 2, 3]', '{"ok": "yes", "count": 3}', '{"ok": true}']) {
      expect(() => parseJsonResponse(badReply, isVerdict, 'Test')).toThrow(JsonShapeMismatchError);
      let caught: unknown;
      try {
        parseJsonResponse(badReply, isVerdict, 'Test');
      } catch (err) {
        caught = err;
      }
      expect((caught as Error).message, badReply).not.toMatch(/invalid JSON/);
    }
  });

  it('includes the caller-supplied label in both error messages', () => {
    expect(() => parseJsonResponse('nope', isVerdict, 'Gemini')).toThrow(/^Gemini returned invalid JSON/);
    expect(() => parseJsonResponse('{"ok": true}', isVerdict, 'Gemini')).toThrow(/^Gemini response parsed as JSON/);
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
