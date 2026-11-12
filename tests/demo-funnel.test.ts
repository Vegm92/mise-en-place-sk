import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { insertMock, sendEmailMock, turnstileMock } = vi.hoisted(() => ({
	insertMock: vi.fn().mockResolvedValue(true),
	sendEmailMock: vi.fn().mockResolvedValue(undefined),
	turnstileMock: vi.fn().mockResolvedValue('passed'),
}));

vi.mock('$lib/server/rate-limiter', () => ({ checkRateLimit: vi.fn().mockResolvedValue(true) }));
vi.mock('$lib/server/auth-events', () => ({ logAuthEvent: vi.fn(), hashIp: () => 'iphash' }));
vi.mock('$lib/server/turnstile', () => ({ verifyTurnstileToken: turnstileMock }));
vi.mock('$lib/server/waitlist-db', () => ({
	insertWaitlistEmail: insertMock,
	resolveReferralOwnerEmail: vi.fn().mockResolvedValue(null),
}));
vi.mock('$lib/server/email', () => ({ sendEmail: sendEmailMock }));

import {
	DEMO_LOCATIONS,
	DEMO_ROLES,
	DEMO_SPEND,
	DEMO_TOOLS,
	demoBookingUrl,
	demoFit,
	demoStepFor,
	demoSteps,
	demoVideoPath,
	isIcpPriority,
	type DemoAnswers,
} from '../src/lib/demo-funnel';
import { demoCopy } from '../src/lib/content/demo-funnel';
import { demoNotifyRecipient, requestDemoAction } from '../src/lib/server/demo-request';
import { formDataEvent } from './helpers/form-data';

const ANSWERS: DemoAnswers = { role: 'owner', locations: 'one', monthlySpend: '10k_to_20k', currentTool: 'spreadsheet' };

const FIELDS = {
	name: 'Ana Chef',
	email: ' Ana@Example.com ',
	phone: '',
	restaurant: 'Casa Ana',
	role: 'owner',
	locations: 'two_to_five',
	monthlySpend: '20k_to_50k',
	currentTool: 'spreadsheet',
};

function submit(fields: Record<string, string>) {
	const data = new FormData();
	for (const [k, value] of Object.entries(fields)) data.append(k, value);
	return requestDemoAction(
		formDataEvent(data, {
			url: new URL('https://app.example.test/demo'),
			getClientAddress: () => '203.0.113.7',
			cookies: { get: () => undefined },
		}) as never,
	);
}

beforeEach(() => {
	insertMock.mockClear();
	sendEmailMock.mockClear();
	vi.stubEnv('AUTH_ADMIN_EMAIL', 'founder@example.com, second@example.com');
	vi.stubEnv('DEMO_NOTIFY_EMAIL', '');
	vi.stubEnv('DEMO_BOOKING_URL', 'https://cal.example.com/mise/demo');
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('demo funnel qualification', () => {
	it('routes under 10k of monthly spend to self-serve and everything else to a demo', () => {
		expect(demoFit({ ...ANSWERS, monthlySpend: 'under_10k' })).toBe('self_serve');
		expect(demoFit(ANSWERS)).toBe('demo');
		expect(demoFit({ ...ANSWERS, monthlySpend: 'over_50k' })).toBe('demo');
	});

	it('flags ICP priority on 20k+ spend or a 2-10 location group, never on self-serve leads', () => {
		expect(isIcpPriority(ANSWERS)).toBe(false);
		expect(isIcpPriority({ ...ANSWERS, monthlySpend: '20k_to_50k' })).toBe(true);
		expect(isIcpPriority({ ...ANSWERS, locations: 'six_to_ten' })).toBe(true);
		expect(isIcpPriority({ ...ANSWERS, locations: 'over_ten' })).toBe(false);
		expect(isIcpPriority({ ...ANSWERS, locations: 'two_to_five', monthlySpend: 'under_10k' })).toBe(false);
	});
});

describe('demo funnel steps', () => {
	it('drops the video stage when no video is configured', () => {
		expect(demoSteps(true)).toEqual(['video', 'questions', 'booking']);
		expect(demoSteps(false)).toEqual(['questions', 'booking']);
		expect(demoStepFor({ hasVideo: false, requested: null, submitted: false })).toBe('questions');
	});

	it('opens on the video, moves to questions on request, and ends on booking', () => {
		expect(demoStepFor({ hasVideo: true, requested: null, submitted: false })).toBe('video');
		expect(demoStepFor({ hasVideo: true, requested: 'questions', submitted: false })).toBe('questions');
		expect(demoStepFor({ hasVideo: true, requested: null, submitted: true })).toBe('booking');
	});
});

describe('demo funnel configuration', () => {
	it('accepts only same-origin video paths, which is all the CSP allows', () => {
		expect(demoVideoPath('/video/demo.mp4')).toBe('/video/demo.mp4');
		expect(demoVideoPath('https://cdn.example.com/demo.mp4')).toBeNull();
		expect(demoVideoPath('//cdn.example.com/demo.mp4')).toBeNull();
		expect(demoVideoPath('')).toBeNull();
		expect(demoVideoPath(undefined)).toBeNull();
	});

	it('prefills the https booking link and rejects anything else', () => {
		const lead = { name: 'Ana Chef', email: 'ana@example.com' };
		expect(demoBookingUrl('https://cal.example.com/mise/demo', lead)).toBe(
			'https://cal.example.com/mise/demo?name=Ana+Chef&email=ana%40example.com',
		);
		expect(demoBookingUrl('http://cal.example.com/mise', lead)).toBeNull();
		expect(demoBookingUrl('javascript:alert(1)', lead)).toBeNull();
		expect(demoBookingUrl('', lead)).toBeNull();
	});

	it('notifies DEMO_NOTIFY_EMAIL, else the first admin address', () => {
		expect(demoNotifyRecipient({ AUTH_ADMIN_EMAIL: 'a@x.com, b@x.com' } as never)).toBe('a@x.com');
		expect(demoNotifyRecipient({ AUTH_ADMIN_EMAIL: 'a@x.com', DEMO_NOTIFY_EMAIL: 'sales@x.com' } as never)).toBe('sales@x.com');
		expect(demoNotifyRecipient({} as never)).toBeNull();
	});

	it('resolves every copy leaf to a string in both locales, and covers every option', () => {
		const leaves = (value: unknown): unknown[] =>
			value !== null && typeof value === 'object' ? Object.values(value).flatMap(leaves) : [value];
		for (const locale of ['es', 'en'] as const) {
			expect(leaves(demoCopy[locale]).every((leaf) => typeof leaf === 'string' && leaf.length > 0)).toBe(true);
		}
		expect(demoCopy.es.headline).not.toBe(demoCopy.en.headline);
		expect(Object.keys(demoCopy.es.roles)).toEqual([...DEMO_ROLES]);
		expect(Object.keys(demoCopy.es.locations)).toEqual([...DEMO_LOCATIONS]);
		expect(Object.keys(demoCopy.es.spend)).toEqual([...DEMO_SPEND]);
		expect(Object.keys(demoCopy.es.tools)).toEqual([...DEMO_TOOLS]);
	});
});

describe('requestDemoAction', () => {
	it('stores the lead, emails the founder and returns the prefilled booking link', async () => {
		const result = await submit(FIELDS);

		expect(result).toEqual({
			success: true,
			fit: 'demo',
			bookingUrl: 'https://cal.example.com/mise/demo?name=Ana+Chef&email=ana%40example.com',
		});
		expect(insertMock).toHaveBeenCalledWith('ana@example.com', expect.objectContaining({ referredBy: null }));
		const sent = sendEmailMock.mock.calls[0]![0] as { to: string; subject: string; html: string };
		expect(sent.to).toBe('founder@example.com');
		expect(sent.subject).toBe('Demo request [ICP]: Casa Ana');
		expect(sent.html).toContain('20k_to_50k');
	});

	it('sends a small buyer to self-serve without a booking link, but still records the lead', async () => {
		const result = await submit({ ...FIELDS, locations: 'one', monthlySpend: 'under_10k' });

		expect(result).toEqual({ success: true, fit: 'self_serve', bookingUrl: null });
		expect(insertMock).toHaveBeenCalledTimes(1);
		expect(sendEmailMock.mock.calls[0]![0].subject).toBe('Demo request [self-serve]: Casa Ana');
	});

	it('escapes lead input in the notification email', async () => {
		await submit({ ...FIELDS, restaurant: '<img src=x onerror=alert(1)>' });
		expect(sendEmailMock.mock.calls[0]![0].html).not.toContain('<img');
	});

	it('rejects a missing answer, an unknown option and a bad email without storing anything', async () => {
		const { monthlySpend: _omitted, ...missing } = FIELDS;
		for (const fields of [missing, { ...FIELDS, role: 'ceo' }, { ...FIELDS, email: 'not-an-email' }]) {
			const result = (await submit(fields)) as { status: number; data: { error: string } };
			expect(result.status).toBe(422);
			expect(result.data.error).toBe('invalid');
		}
		expect(insertMock).not.toHaveBeenCalled();
		expect(sendEmailMock).not.toHaveBeenCalled();
	});
});
