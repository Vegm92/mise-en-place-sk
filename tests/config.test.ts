import { describe, it, expect } from 'vitest';
import { assertProductionEnv, addressHeaderWarning } from '../src/lib/server/config';

const complete = {
	NODE_ENV: 'production',
	AUTH_SECRET: 'a',
	DATABASE_URL: 'b',
	STRIPE_SECRET_KEY: 'c',
	STRIPE_WEBHOOK_SECRET: 'd',
	GEMINI_API_KEY: 'e',
};

describe('assertProductionEnv', () => {
	it('passes with every required variable set', () => {
		expect(() => assertProductionEnv(complete)).not.toThrow();
	});

	it('does nothing outside production', () => {
		expect(() => assertProductionEnv({ NODE_ENV: 'development' })).not.toThrow();
	});

	it('rejects an incomplete production env, naming the missing variable', () => {
		const { STRIPE_SECRET_KEY, ...incomplete } = complete;
		expect(() => assertProductionEnv(incomplete)).toThrow('STRIPE_SECRET_KEY');
	});

	it('requires WHATSAPP_APP_SECRET only when WhatsApp is enabled', () => {
		expect(() => assertProductionEnv({ ...complete, WHATSAPP_ACCESS_TOKEN: 'x' }))
			.toThrow('WHATSAPP_APP_SECRET');
		expect(() => assertProductionEnv({ ...complete, WHATSAPP_ACCESS_TOKEN: 'x', WHATSAPP_APP_SECRET: 'y' }))
			.not.toThrow();
	});
});

describe('addressHeaderWarning', () => {
	it('is silent outside production regardless of ADDRESS_HEADER', () => {
		expect(addressHeaderWarning({ NODE_ENV: 'development' })).toBeNull();
		expect(addressHeaderWarning({ NODE_ENV: 'development', ADDRESS_HEADER: 'x-forwarded-for' })).toBeNull();
	});

	it('warns in production when ADDRESS_HEADER is unset', () => {
		const warning = addressHeaderWarning({ NODE_ENV: 'production' });
		expect(warning).toContain('ADDRESS_HEADER is not set');
	});

	it('warns in production when ADDRESS_HEADER is set but no known proxy platform is detected', () => {
		const warning = addressHeaderWarning({ NODE_ENV: 'production', ADDRESS_HEADER: 'x-forwarded-for' });
		expect(warning).toContain('no known managed-proxy platform');
	});

	it('is silent when ADDRESS_HEADER is set on a known proxy platform', () => {
		expect(addressHeaderWarning({
			NODE_ENV: 'production',
			ADDRESS_HEADER: 'x-forwarded-for',
			RAILWAY_PROJECT_ID: 'proj_123',
		})).toBeNull();
		expect(addressHeaderWarning({
			NODE_ENV: 'production',
			ADDRESS_HEADER: 'x-forwarded-for',
			RENDER: 'true',
		})).toBeNull();
		expect(addressHeaderWarning({
			NODE_ENV: 'production',
			ADDRESS_HEADER: 'x-forwarded-for',
			FLY_APP_NAME: 'mise-en-place',
		})).toBeNull();
	});
});
