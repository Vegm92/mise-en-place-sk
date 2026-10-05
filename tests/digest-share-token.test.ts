import { describe, it, expect } from 'vitest';
import { resolveShareToken } from '../src/lib/server/digest-share';

describe('resolveShareToken — input validation', () => {
	it('rejects empty or non-string tokens immediately without DB lookup', async () => {
		expect(await resolveShareToken('')).toBeNull();
		expect(await resolveShareToken('   ')).toBeNull();
		expect(await resolveShareToken(null as unknown as string)).toBeNull();
	});

	it('rejects malformed or unsafe tokens immediately', async () => {
		expect(await resolveShareToken('short')).toBeNull();
		expect(await resolveShareToken('invalid!token@123')).toBeNull();
		expect(await resolveShareToken('<script>alert(1)</script>')).toBeNull();
		expect(await resolveShareToken('a'.repeat(200))).toBeNull();
	});
});
