/**
 * src/lib/server/env-report.ts — the per-service environment matrix behind the
 * `Env:` rows on /admin/health (web) and the `Worker env` row (worker, reported
 * through worker_heartbeats.details). Boot-time enforcement is thin on purpose
 * (assertProductionEnv checks five variables on the web, the worker checks only
 * DATABASE_URL), so this table is what actually says whether a service can take
 * traffic — and it has to agree with DEPLOYMENT.md's inventory.
 */
import { describe, it, expect } from 'vitest';
import { ENV_REQUIREMENTS, envGaps, envRequirementReason } from '../src/lib/server/env-report';

const FULL: NodeJS.ProcessEnv = {
	NODE_ENV: 'production',
	DATABASE_URL: 'postgres://x', DATABASE_MIGRATION_URL: 'postgres://owner',
	AUTH_SECRET: 's', AUTH_ADMIN_EMAIL: 'a@b.c', GEMINI_API_KEY: 'g',
	STRIPE_SECRET_KEY: 'sk', STRIPE_WEBHOOK_SECRET: 'whsec',
	STRIPE_PRICE_ID_STARTER: 'p1', STRIPE_PRICE_ID_PRO: 'p2', STRIPE_PRICE_ID_BUSINESS: 'p3',
	RESEND_API_KEY: 're', APP_BASE_URL: 'https://x', SENTRY_DSN: 'dsn', SENTRY_RELEASE: 'abc',
	VITE_SENTRY_DSN: 'dsn', HEALTH_CHECK_TOKEN: 't', ADDRESS_HEADER: 'x-forwarded-for',
	STORAGE_DRIVER: 'railway', AWS_ENDPOINT_URL: 'e', AWS_ACCESS_KEY_ID: 'k', AWS_SECRET_ACCESS_KEY: 's', AWS_S3_BUCKET_NAME: 'b',
	RAILWAY_PROJECT_ID: 'proj',
};

describe('envGaps', () => {
	it('reports nothing missing for a fully configured production web service', () => {
		expect(envGaps('web', FULL)).toEqual({ missing: [], recommended: [] });
	});

	it('reports nothing missing for a fully configured production worker', () => {
		expect(envGaps('worker', FULL)).toEqual({ missing: [], recommended: [] });
	});

	it('names the worker gaps found on the live service (Sentry, Resend, base URL, Stripe)', () => {
		const env = { ...FULL };
		delete env.SENTRY_DSN; delete env.RESEND_API_KEY; delete env.APP_BASE_URL; delete env.STRIPE_SECRET_KEY; delete env.SENTRY_RELEASE;
		const gaps = envGaps('worker', env);
		expect(gaps.missing).toEqual(['STRIPE_SECRET_KEY', 'RESEND_API_KEY', 'APP_BASE_URL', 'SENTRY_DSN']);
		expect(gaps.recommended).toEqual(['SENTRY_RELEASE']);
	});

	it('does not ask the worker for web-only variables', () => {
		const env = { ...FULL };
		delete env.DATABASE_MIGRATION_URL; delete env.STRIPE_WEBHOOK_SECRET; delete env.AUTH_SECRET; delete env.HEALTH_CHECK_TOKEN;
		expect(envGaps('worker', env)).toEqual({ missing: [], recommended: [] });
		expect(envGaps('web', env).missing).toEqual(['DATABASE_MIGRATION_URL', 'AUTH_SECRET', 'STRIPE_WEBHOOK_SECRET']);
		expect(envGaps('web', env).recommended).toEqual(['HEALTH_CHECK_TOKEN']);
	});

	it('only requires the AWS variables when STORAGE_DRIVER=railway', () => {
		const env: NodeJS.ProcessEnv = { ...FULL, STORAGE_DRIVER: 'local' };
		delete env.AWS_ENDPOINT_URL; delete env.AWS_ACCESS_KEY_ID; delete env.AWS_SECRET_ACCESS_KEY; delete env.AWS_S3_BUCKET_NAME;
		const gaps = envGaps('worker', env);
		expect(gaps.missing).toEqual([]);
		expect(gaps.recommended).toEqual(['STORAGE_DRIVER']);
	});

	it('does not flag STORAGE_DRIVER=local off Railway', () => {
		const env: NodeJS.ProcessEnv = { ...FULL, STORAGE_DRIVER: 'local' };
		delete env.RAILWAY_PROJECT_ID; delete env.ADDRESS_HEADER;
		delete env.AWS_ENDPOINT_URL; delete env.AWS_ACCESS_KEY_ID; delete env.AWS_SECRET_ACCESS_KEY; delete env.AWS_S3_BUCKET_NAME;
		expect(envGaps('web', env)).toEqual({ missing: [], recommended: [] });
	});

	it('skips production-only requirements outside production', () => {
		const env: NodeJS.ProcessEnv = { NODE_ENV: 'development', DATABASE_URL: 'x', AUTH_SECRET: 's', AUTH_ADMIN_EMAIL: 'a', GEMINI_API_KEY: 'g', STORAGE_DRIVER: 'local' };
		expect(envGaps('web', env)).toEqual({ missing: [], recommended: [] });
		expect(envGaps('web', { ...env, GEMINI_API_KEY: ' ' }).missing).toEqual(['GEMINI_API_KEY']);
	});

	it('carries a reason for every requirement', () => {
		for (const req of ENV_REQUIREMENTS) {
			expect(envRequirementReason(req.name), req.name).not.toBe('');
		}
		expect(envRequirementReason('NOPE')).toBe('');
	});
});
