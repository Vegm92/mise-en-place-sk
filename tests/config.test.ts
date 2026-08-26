import { describe, it, expect } from 'vitest';
import { assertProductionEnv } from '../src/lib/server/config';

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
