/**
 * /chat locked preview (issue #546).
 *
 * The page used to call `requireFeature('aiAssistant', locals)` in its load,
 * which throws a bare 403 before anything renders — a trial user got a
 * generic error page instead of a discoverable, composer-disabled preview.
 * `/api/chat` still answers 402 (see tests/entitlement-verbs.test.ts and
 * tests/chat-endpoint.test.ts) — this only pins what the page load returns.
 *
 * `locked` is derived from `resolveEntitlement` against the exact same
 * `ROUTE_POLICY['/(app)/api/chat']` the endpoint gates on, not just the
 * `aiAssistant` feature flag — a past-due Pro tenant still has the feature
 * but fails the policy's `access` check, and would otherwise see an
 * unlocked composer that 402s on submit just like the trial case did.
 *
 * DB-backed. Skipped without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../src/lib/server/db', async () => {
	const { testDb } = await import('./helpers/test-db');
	const { forTenant } = await import('../src/lib/server/tenant');
	return { db: testDb, forTenant };
});

import {
	testSql, closeDb,
	createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { memoizeEntitlements } from '../src/lib/server/billing';
import { load } from '../src/routes/(app)/chat/+page.server';
import { isRedirect } from '@sveltejs/kit';

let rid = '';

function locals(restaurantId: string | null) {
	return {
		restaurantId,
		entitlements: memoizeEntitlements(restaurantId),
	};
}

async function runLoad(restaurantId: string | null, sessionParam?: string) {
	const url = new URL('https://app.test/chat' + (sessionParam ? `?session=${sessionParam}` : ''));
	return (await (load as (e: unknown) => Promise<Record<string, unknown>>)({
		url,
		locals: locals(restaurantId),
	}));
}

beforeAll(async () => {
	if (!hasDbEnv) return;
	const r = await createTestRestaurant('chat-load');
	rid = r.id;
});

afterAll(async () => {
	if (!hasDbEnv) return;
	await cleanupTestRestaurant(rid);
	await closeDb();
});

describe.skipIf(!hasDbEnv)('/chat load — locked preview instead of a 403 (#546)', () => {
	it('renders locked with no sessions or messages for a trial (no-feature) tenant', async () => {
		const data = await runLoad(rid);
		expect(data.locked).toBe(true);
		expect(data.sessions).toEqual([]);
		expect(data.activeSessionId).toBeNull();
		expect(data.messages).toEqual([]);
		expect(data.title).toBe('nav.chat');
	});

	it('redirects to onboarding when there is no active restaurant, same as before', async () => {
		const outcome = await runLoad(null).catch((e: unknown) => e);
		expect(outcome).toSatisfy(isRedirect);
		expect((outcome as { location: string }).location).toBe('/onboarding');
	});

	it('unlocks and returns real sessions/messages once aiAssistant is on the plan', async () => {
		await testSql`
			INSERT INTO subscriptions (restaurant_id, plan_tier, status)
			VALUES (${rid}, 'pro', 'active')
		`;
		try {
			const [session] = await testSql`
				INSERT INTO chat_sessions (restaurant_id, title) VALUES (${rid}, 'Test chat') RETURNING id
			`;
			await testSql`
				INSERT INTO chat_messages (restaurant_id, session_id, role, text)
				VALUES (${rid}, ${session.id}, 'user', 'How much did I spend?')
			`;

			const data = await runLoad(rid, String(session.id));
			expect(data.locked).toBe(false);
			expect(data.activeSessionId).toBe(session.id);
			const sessions = data.sessions as Array<{ id: number }>;
			expect(sessions.map((s) => s.id)).toContain(session.id);
			const messages = data.messages as Array<{ text: string }>;
			expect(messages.map((m) => m.text)).toContain('How much did I spend?');
		} finally {
			await testSql`DELETE FROM chat_messages WHERE restaurant_id = ${rid}`;
			await testSql`DELETE FROM chat_sessions WHERE restaurant_id = ${rid}`;
			await testSql`DELETE FROM subscriptions WHERE restaurant_id = ${rid}`;
		}
	});

	it('stays locked for a past-due Pro tenant — the feature is on the tier but access is not allowed', async () => {
		await testSql`
			INSERT INTO subscriptions (restaurant_id, plan_tier, status)
			VALUES (${rid}, 'pro', 'past_due')
		`;
		try {
			const data = await runLoad(rid);
			expect(data.locked).toBe(true);
			expect(data.sessions).toEqual([]);
		} finally {
			await testSql`DELETE FROM subscriptions WHERE restaurant_id = ${rid}`;
		}
	});
});
