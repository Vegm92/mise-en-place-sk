import { describe, it, expect } from 'vitest';
import { assertProductionEnv, addressHeaderWarning, validateAdminSeedConfig, isProduction } from '../src/lib/server/config';

const complete = {
	NODE_ENV: 'production',
	AUTH_SECRET: 'a',
	DATABASE_URL: 'b',
	STRIPE_SECRET_KEY: 'c',
	STRIPE_WEBHOOK_SECRET: 'd',
	GEMINI_API_KEY: 'e',
	APP_BASE_URL: 'https://app.example.com',
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

describe('assertProductionEnv — trusted proxy (issue #1072, was a warning under #500)', () => {
	it('refuses to boot in production when ADDRESS_HEADER is set with no trusted proxy in front, naming the remedy', () => {
		expect(() => assertProductionEnv({ ...complete, ADDRESS_HEADER: 'x-forwarded-for' }))
			.toThrow(/ADDRESS_HEADER.*refusing to start in production.*spoofable.*TRUSTED_PROXY=1/s);
	});

	it.each([
		['RAILWAY_PROJECT_ID', 'proj_123'],
		['RAILWAY_SERVICE_ID', 'svc_123'],
		['RENDER', 'true'],
		['FLY_APP_NAME', 'mise-en-place'],
		['TRUSTED_PROXY', '1'],
	])('boots with ADDRESS_HEADER when %s attests a proxy that rewrites the header', (key, value) => {
		expect(() => assertProductionEnv({ ...complete, ADDRESS_HEADER: 'x-forwarded-for', [key]: value })).not.toThrow();
	});

	it('does not accept a TRUSTED_PROXY value other than 1', () => {
		expect(() => assertProductionEnv({ ...complete, ADDRESS_HEADER: 'x-forwarded-for', TRUSTED_PROXY: 'yes' })).toThrow('TRUSTED_PROXY');
	});

	it('still boots in production with ADDRESS_HEADER unset (the collapsed-bucket case stays a warning)', () => {
		expect(() => assertProductionEnv(complete)).not.toThrow();
		expect(addressHeaderWarning(complete)).toContain('ADDRESS_HEADER is not set');
	});

	it('does nothing outside production', () => {
		expect(() => assertProductionEnv({ NODE_ENV: 'development', ADDRESS_HEADER: 'x-forwarded-for' })).not.toThrow();
		expect(() => assertProductionEnv({ NODE_ENV: 'test', ADDRESS_HEADER: 'x-forwarded-for' })).not.toThrow();
	});
});

describe('isProduction', () => {
	it('is true only for NODE_ENV=production', () => {
		expect(isProduction({ NODE_ENV: 'production' })).toBe(true);
		expect(isProduction({ NODE_ENV: 'development' })).toBe(false);
		expect(isProduction({ NODE_ENV: 'test' })).toBe(false);
		expect(isProduction({})).toBe(false);
	});
});

describe('validateAdminSeedConfig', () => {
	it('rejects the placeholder password in production, naming the variable and remedy', () => {
		expect(() => validateAdminSeedConfig({
			NODE_ENV: 'production',
			AUTH_ADMIN_EMAIL: 'admin@real-restaurant.example.io',
			AUTH_ADMIN_PASSWORD: 'changeme',
		})).toThrow(/AUTH_ADMIN_PASSWORD.*changeme.*refusing to start in production.*strong password/is);
	});

	it('rejects a placeholder admin email in production, naming the variable and remedy', () => {
		expect(() => validateAdminSeedConfig({
			NODE_ENV: 'production',
			AUTH_ADMIN_EMAIL: 'admin@example.com',
			AUTH_ADMIN_PASSWORD: 'a-strong-password',
		})).toThrow(/AUTH_ADMIN_EMAIL.*admin@example\.com.*refusing to start in production.*real, routable/is);
	});

	it('does nothing outside production even with placeholder credentials', () => {
		expect(() => validateAdminSeedConfig({
			NODE_ENV: 'development',
			AUTH_ADMIN_EMAIL: 'admin@example.com',
			AUTH_ADMIN_PASSWORD: 'changeme',
		})).not.toThrow();
		expect(() => validateAdminSeedConfig({
			AUTH_ADMIN_EMAIL: 'admin@example.com',
			AUTH_ADMIN_PASSWORD: 'changeme',
		})).not.toThrow();
	});

	it('does nothing in production when the admin seed vars are unset (seedAdminUser no-ops too)', () => {
		expect(() => validateAdminSeedConfig({ NODE_ENV: 'production' })).not.toThrow();
	});

	it('passes in production with real credentials', () => {
		expect(() => validateAdminSeedConfig({
			NODE_ENV: 'production',
			AUTH_ADMIN_EMAIL: 'ops@real-restaurant.io',
			AUTH_ADMIN_PASSWORD: 'a-strong-password',
		})).not.toThrow();
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

	it('no longer warns when ADDRESS_HEADER is set without a proxy — assertProductionEnv refuses to boot instead (issue #1072)', () => {
		expect(addressHeaderWarning({ NODE_ENV: 'production', ADDRESS_HEADER: 'x-forwarded-for' })).toBeNull();
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
