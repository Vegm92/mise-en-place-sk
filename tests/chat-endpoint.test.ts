/**
 * #426 — chat (`/api/chat`) bypassed the LLM provider seam: it built its own
 * `GoogleGenAI` client, read `GEMINI_MODEL` directly, and discarded
 * `response.usageMetadata`, so chat tokens never reached `llm_usage_log`.
 *
 * These pin the fix: the route now calls `createGeminiProvider().generate()`
 * (systemInstruction carried through the seam's 3rd param) and records usage
 * with `recordLlmUsage(rid, usage, 'chat')` before replying. DB-backed against
 * local Postgres — only the Gemini call itself is faked. Skipped without
 * DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';

const { generateMock, rateLimitMock } = vi.hoisted(() => ({
	generateMock: vi.fn(),
	rateLimitMock: vi.fn().mockResolvedValue(true),
}));

vi.mock('$lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant };
});

vi.mock('$lib/server/env', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/server/env')>();
	return { ...actual, GEMINI_API_KEY: 'test-gemini-key', CHAT_RATE_LIMIT_RPM: 1000 };
});

vi.mock('$lib/server/rate-limiter', () => ({
	checkRateLimit: rateLimitMock,
}));

vi.mock('$lib/server/llm-provider', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/lib/server/llm-provider')>();
	return {
		...actual,
		createGeminiProvider: () => ({ model: 'test-model', generate: generateMock }),
	};
});

import { POST } from '../src/routes/(app)/api/chat/+server';
import {
	testSql, closeDb, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';

let rid = '';

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('chat-endpoint');
	rid = r.id;
});

afterEach(async () => {
	generateMock.mockReset();
	rateLimitMock.mockReset().mockResolvedValue(true);
	if (!hasDbEnv) return;
	await testSql`DELETE FROM llm_usage_log WHERE restaurant_id = ${rid}`;
	await testSql`DELETE FROM chat_messages WHERE restaurant_id = ${rid}`;
	await testSql`DELETE FROM chat_sessions WHERE restaurant_id = ${rid}`;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

function chatEvent(message: string, userId = 'test-user') {
	return {
		request: new Request('http://localhost/api/chat', {
			method: 'POST',
			body: JSON.stringify({ message }),
		}),
		locals: { restaurantId: rid, user: { id: userId, email: 'chef@example.com', name: null, image: null } },
	} as unknown as Parameters<typeof POST>[0];
}

describe.skipIf(!hasDbEnv)('#426 — POST /api/chat routes through the LLM provider seam', () => {
	it('calls the seam with the message and a systemInstruction, and replies with its text', async () => {
		generateMock.mockResolvedValue({
			text: 'You spent 120.50 this week.',
			usage: { inputTokens: 42, outputTokens: 8, model: 'gemini-test' },
		});

		const res = await POST(chatEvent('How much did I spend this week?'));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.reply).toBe('You spent 120.50 this week.');

		expect(generateMock).toHaveBeenCalledTimes(1);
		const [content, signal, systemInstruction] = generateMock.mock.calls[0];
		expect(content).toBe('How much did I spend this week?');
		expect(signal).toBeUndefined();
		expect(typeof systemInstruction).toBe('string');
		expect(systemInstruction).toContain('<restaurant_data>');
	});

	it('records usage against the tenant with source "chat" and the real token counts', async () => {
		generateMock.mockResolvedValue({
			text: 'Reply text.',
			usage: { inputTokens: 111, outputTokens: 22, model: 'gemini-test' },
		});

		await POST(chatEvent('Any overdue invoices?'));

		const rows = await testSql`
			SELECT restaurant_id, model, input_tokens, output_tokens, caller_context
			FROM llm_usage_log WHERE restaurant_id = ${rid}`;
		expect(rows).toHaveLength(1);
		expect(rows[0].restaurant_id).toBe(rid);
		expect(rows[0].model).toBe('gemini-test');
		expect(rows[0].input_tokens).toBe(111);
		expect(rows[0].output_tokens).toBe(22);
		expect(rows[0].caller_context).toBe('chat');
	});

	it('parses an ACTIONS block off the seam reply exactly as before', async () => {
		generateMock.mockResolvedValue({
			text: 'Here you go.\nACTIONS:[{"label":"See invoices","href":"/invoices","variant":"primary"}]',
			usage: { inputTokens: 5, outputTokens: 5, model: 'gemini-test' },
		});

		const res = await POST(chatEvent('Show me invoices'));
		const body = await res.json();
		expect(body.reply).toBe('Here you go.');
		expect(body.actions).toEqual([{ label: 'See invoices', href: '/invoices', variant: 'primary' }]);
	});

	it('a seam error still yields a 503 without ever hitting recordLlmUsage', async () => {
		generateMock.mockRejectedValue(new Error('upstream boom'));

		await expect(POST(chatEvent('This will fail'))).rejects.toMatchObject({ status: 503 });

		const rows = await testSql`SELECT id FROM llm_usage_log WHERE restaurant_id = ${rid}`;
		expect(rows).toHaveLength(0);
	});
});

describe.skipIf(!hasDbEnv)('#467 — ACTIONS hrefs are validated against the route allowlist', () => {
	it('drops an off-allowlist href but keeps the other action in the same block', async () => {
		generateMock.mockResolvedValue({
			text: 'Here you go.\nACTIONS:[{"label":"See invoices","href":"/invoices","variant":"primary"},{"label":"Admin panel","href":"/admin/users","variant":"secondary"}]',
			usage: { inputTokens: 5, outputTokens: 5, model: 'gemini-test' },
		});

		const res = await POST(chatEvent('Show me invoices'));
		const body = await res.json();
		expect(body.reply).toBe('Here you go.');
		expect(body.actions).toEqual([{ label: 'See invoices', href: '/invoices', variant: 'primary' }]);
	});

	it('drops an absolute/external URL href', async () => {
		generateMock.mockResolvedValue({
			text: 'Careful with that link.\nACTIONS:[{"label":"Click me","href":"https://evil.example/phish","variant":"primary"}]',
			usage: { inputTokens: 5, outputTokens: 5, model: 'gemini-test' },
		});

		const res = await POST(chatEvent('Show me a link'));
		const body = await res.json();
		expect(body.reply).toBe('Careful with that link.');
		expect(body.actions).toBeUndefined();
	});

	it('drops a protocol-relative href', async () => {
		generateMock.mockResolvedValue({
			text: 'Careful.\nACTIONS:[{"label":"Click me","href":"//evil.example/phish","variant":"primary"}]',
			usage: { inputTokens: 5, outputTokens: 5, model: 'gemini-test' },
		});

		const res = await POST(chatEvent('Show me a link'));
		const body = await res.json();
		expect(body.actions).toBeUndefined();
	});

	it('drops a javascript: href', async () => {
		generateMock.mockResolvedValue({
			text: 'Careful.\nACTIONS:[{"label":"Click me","href":"javascript:alert(1)","variant":"primary"}]',
			usage: { inputTokens: 5, outputTokens: 5, model: 'gemini-test' },
		});

		const res = await POST(chatEvent('Show me a link'));
		const body = await res.json();
		expect(body.actions).toBeUndefined();
	});

	it('drops a backslash-based host-hijack href', async () => {
		const actionsJson = JSON.stringify([{ label: 'Click me', href: '/\\evil.example/phish', variant: 'primary' }]);
		generateMock.mockResolvedValue({
			text: `Careful.\nACTIONS:${actionsJson}`,
			usage: { inputTokens: 5, outputTokens: 5, model: 'gemini-test' },
		});

		const res = await POST(chatEvent('Show me a link'));
		const body = await res.json();
		expect(body.actions).toBeUndefined();
	});

	it('lets all documented valid routes through, including the supplier query-string filter', async () => {
		generateMock.mockResolvedValue({
			text: 'Here are your options.\nACTIONS:[{"label":"Invoices for Acme","href":"/invoices?supplier=acme-foods","variant":"primary"},{"label":"Spend","href":"/analytics/spend","variant":"secondary"}]',
			usage: { inputTokens: 5, outputTokens: 5, model: 'gemini-test' },
		});

		const res = await POST(chatEvent('Show me Acme invoices and spend'));
		const body = await res.json();
		expect(body.actions).toEqual([
			{ label: 'Invoices for Acme', href: '/invoices?supplier=acme-foods', variant: 'primary' },
			{ label: 'Spend', href: '/analytics/spend', variant: 'secondary' },
		]);
	});

	it('does not crash on malformed ACTIONS entries and drops the invalid ones', async () => {
		generateMock.mockResolvedValue({
			text: 'Mixed bag.\nACTIONS:[null,"not an object",{"label":"","href":"/invoices","variant":"primary"},{"href":"/invoices","variant":"primary"},{"label":"OK","href":"/invoices","variant":"weird"},{"label":"OK","href":"/invoices","variant":"primary"}]',
			usage: { inputTokens: 5, outputTokens: 5, model: 'gemini-test' },
		});

		const res = await POST(chatEvent('Show me invoices'));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.reply).toBe('Mixed bag.');
		expect(body.actions).toEqual([{ label: 'OK', href: '/invoices', variant: 'primary' }]);
	});
});

describe.skipIf(!hasDbEnv)('#440 — chat rate limit is tenant-scoped, not user-scoped', () => {
	it('keys the rate-limit check by restaurant id, not by the requesting user id', async () => {
		generateMock.mockResolvedValue({
			text: 'Reply.',
			usage: { inputTokens: 1, outputTokens: 1, model: 'gemini-test' },
		});

		await POST(chatEvent('How much did I spend?', 'staff-a'));

		expect(rateLimitMock).toHaveBeenCalledTimes(1);
		const [key] = rateLimitMock.mock.calls[0]!;
		expect(key).toBe(`chat:${rid}`);
		expect(key).not.toContain('staff-a');
	});

	it('two different staff members of the same restaurant are checked against the same budget', async () => {
		generateMock.mockResolvedValue({
			text: 'Reply.',
			usage: { inputTokens: 1, outputTokens: 1, model: 'gemini-test' },
		});

		await POST(chatEvent('Question from staff A', 'staff-a'));
		await POST(chatEvent('Question from staff B', 'staff-b'));

		expect(rateLimitMock).toHaveBeenCalledTimes(2);
		const keys = rateLimitMock.mock.calls.map((c) => c[0]);
		expect(keys).toEqual([`chat:${rid}`, `chat:${rid}`]);
	});

	it('a shared budget exhausted by one staff member 429s the next, on paid Gemini capacity that would otherwise be multiplied per seat', async () => {
		rateLimitMock.mockResolvedValueOnce(false);

		await expect(POST(chatEvent('One too many', 'staff-a'))).rejects.toMatchObject({ status: 429 });
		expect(generateMock).not.toHaveBeenCalled();
	});
});
