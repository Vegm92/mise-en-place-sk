/**
 * Issue #331 — pushing the weekly digest over WhatsApp to opted-in contacts.
 *
 * The number is shared across every tenant, so consent must be strict: only
 * contacts with an explicitly recorded opt-in receive anything, and the flag
 * is re-checked immediately before each send rather than trusted from an
 * earlier query. One contact's send failure must not swallow the rest.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { sendMock, contactsMock, optedInMock, shareMock } = vi.hoisted(() => ({
	sendMock: vi.fn().mockResolvedValue(undefined),
	contactsMock: vi.fn(),
	optedInMock: vi.fn(),
	shareMock: vi.fn().mockResolvedValue({ token: 'share-token-1', week: '2026-W38' }),
}));

vi.mock('../src/lib/server/whatsapp', () => ({ sendWhatsAppMessage: sendMock }));
vi.mock('../src/lib/server/whatsapp-contacts', () => ({
	digestOptedInContacts: contactsMock,
	isDigestOptedIn: optedInMock,
}));
vi.mock('../src/lib/server/digest-share', () => ({ getOrCreateActiveShare: shareMock }));
vi.mock('../src/lib/server/env', () => ({ APP_BASE_URL: 'https://app.example.com' }));

import { condensedDigestMessage, pushWeeklyDigestOverWhatsApp } from '../src/lib/server/whatsapp-digest-push';

const RID = 'rest-1';
const WEEK = '2026-W38';

beforeEach(() => {
	vi.clearAllMocks();
	sendMock.mockResolvedValue(undefined);
	shareMock.mockResolvedValue({ token: 'share-token-1', week: WEEK });
	optedInMock.mockResolvedValue(true);
});

describe('condensedDigestMessage', () => {
	it('renders the Spanish body with the name and deep link filled in', () => {
		const body = condensedDigestMessage('es', 'La Taberna', 'https://app.example.com/s/tok');
		expect(body).toContain('La Taberna');
		expect(body).toContain('https://app.example.com/s/tok');
		expect(body).not.toContain('wa.digest.push');
	});

	it('renders the English body too, so the template is not Spanish-only', () => {
		const body = condensedDigestMessage('en', 'La Taberna', 'https://app.example.com/s/tok');
		expect(body).toContain('La Taberna');
		expect(body).toContain('https://app.example.com/s/tok');
		expect(body).not.toContain('wa.digest.push');
		expect(body).not.toBe(condensedDigestMessage('es', 'La Taberna', 'https://app.example.com/s/tok'));
	});
});

describe('pushWeeklyDigestOverWhatsApp', () => {
	it('sends nothing when there is no digest for the week', async () => {
		await pushWeeklyDigestOverWhatsApp(RID, 'La Taberna', WEEK, null);
		expect(contactsMock).not.toHaveBeenCalled();
		expect(sendMock).not.toHaveBeenCalled();
	});

	it('sends nothing when no contact has opted in', async () => {
		contactsMock.mockResolvedValue([]);
		await pushWeeklyDigestOverWhatsApp(RID, 'La Taberna', WEEK, 'digest text');
		expect(shareMock).not.toHaveBeenCalled();
		expect(sendMock).not.toHaveBeenCalled();
	});

	it('sends the condensed message with a deep link to every opted-in contact', async () => {
		contactsMock.mockResolvedValue([
			{ id: 1, phoneNumber: '34600111222' },
			{ id: 2, phoneNumber: '34600333444' },
		]);

		await pushWeeklyDigestOverWhatsApp(RID, 'La Taberna', WEEK, 'digest text');

		expect(sendMock).toHaveBeenCalledTimes(2);
		expect(sendMock).toHaveBeenCalledWith('34600111222', expect.stringContaining('https://app.example.com/s/share-token-1'));
		expect(sendMock).toHaveBeenCalledWith('34600333444', expect.stringContaining('https://app.example.com/s/share-token-1'));
	});

	it('re-verifies opt-in immediately before sending and skips a contact who opted out in the meantime', async () => {
		contactsMock.mockResolvedValue([
			{ id: 1, phoneNumber: '34600111222' },
			{ id: 2, phoneNumber: '34600333444' },
		]);
		optedInMock.mockImplementation(async (_rid: string, id: number) => id !== 2);

		await pushWeeklyDigestOverWhatsApp(RID, 'La Taberna', WEEK, 'digest text');

		expect(sendMock).toHaveBeenCalledTimes(1);
		expect(sendMock).toHaveBeenCalledWith('34600111222', expect.any(String));
	});

	it('keeps sending to other contacts when one send fails', async () => {
		contactsMock.mockResolvedValue([
			{ id: 1, phoneNumber: '34600111222' },
			{ id: 2, phoneNumber: '34600333444' },
		]);
		sendMock.mockImplementationOnce(async () => { throw new Error('boom'); });

		await expect(pushWeeklyDigestOverWhatsApp(RID, 'La Taberna', WEEK, 'digest text')).resolves.toBeUndefined();

		expect(sendMock).toHaveBeenCalledTimes(2);
	});

	it('never throws even when the whole push fails, so the tenant job can still send email', async () => {
		contactsMock.mockRejectedValue(new Error('db down'));

		await expect(pushWeeklyDigestOverWhatsApp(RID, 'La Taberna', WEEK, 'digest text')).resolves.toBeUndefined();
	});
});
