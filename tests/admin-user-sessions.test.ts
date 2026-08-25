import { describe, it, expect } from 'vitest';
import { groupIntoSessions } from '../src/routes/(admin)/admin/users/[id]/+page.server';

function ev(id: number, iso: string) {
	return {
		id,
		notification_type: 'file_uploaded',
		message: 'file_uploaded',
		payload: null,
		status: 'logged',
		created_at: iso,
		restaurant_name: null,
	};
}

describe('groupIntoSessions', () => {
	it('keeps events less than 30 minutes apart in one session', () => {
		const sessions = groupIntoSessions([
			ev(2, '2026-08-25T10:20:00.000Z'),
			ev(1, '2026-08-25T10:00:00.000Z'),
		]);

		expect(sessions).toHaveLength(1);
		expect(sessions[0]?.events.map(e => e.id)).toEqual([1, 2]);
		expect(sessions[0]?.startedAt).toBe('2026-08-25T10:00:00.000Z');
		expect(sessions[0]?.endedAt).toBe('2026-08-25T10:20:00.000Z');
	});

	it('splits on a gap longer than 30 minutes and returns newest session first', () => {
		const sessions = groupIntoSessions([
			ev(1, '2026-08-25T09:00:00.000Z'),
			ev(2, '2026-08-25T09:45:00.000Z'),
			ev(3, '2026-08-25T09:50:00.000Z'),
		]);

		expect(sessions.map(s => s.events.map(e => e.id))).toEqual([[2, 3], [1]]);
	});

	it('treats an exactly-30-minute gap as the same session', () => {
		const sessions = groupIntoSessions([
			ev(1, '2026-08-25T09:00:00.000Z'),
			ev(2, '2026-08-25T09:30:00.000Z'),
		]);

		expect(sessions).toHaveLength(1);
	});

	it('returns nothing for no events', () => {
		expect(groupIntoSessions([])).toEqual([]);
	});
});
