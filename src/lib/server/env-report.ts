export type EnvService = 'web' | 'worker';
export type EnvSeverity = 'required' | 'recommended';

export interface EnvRequirement {
	name: string;
	services: EnvService[];
	severity: EnvSeverity;
	productionOnly?: boolean;
	when?: (env: NodeJS.ProcessEnv) => boolean;
	reason: string;
}

const onRailwayBucket = (env: NodeJS.ProcessEnv) => env.STORAGE_DRIVER === 'railway';
const onRailway = (env: NodeJS.ProcessEnv) => Boolean(env.RAILWAY_PROJECT_ID || env.RAILWAY_SERVICE_ID);

export const ENV_REQUIREMENTS: EnvRequirement[] = [
	{ name: 'DATABASE_URL', services: ['web', 'worker'], severity: 'required', reason: 'runtime database connection' },
	{ name: 'DATABASE_MIGRATION_URL', services: ['web'], severity: 'required', productionOnly: true, reason: 'owner role for the pre-deploy migration (#464)' },
	{ name: 'AUTH_SECRET', services: ['web'], severity: 'required', reason: 'session signing' },
	{ name: 'AUTH_ADMIN_EMAIL', services: ['web'], severity: 'required', reason: 'gates /admin' },
	{ name: 'GEMINI_API_KEY', services: ['web', 'worker'], severity: 'required', reason: 'extraction, chat, digest' },
	{ name: 'STRIPE_SECRET_KEY', services: ['web', 'worker'], severity: 'required', productionOnly: true, reason: 'checkout on web; orphan-subscription reconciliation job on the worker' },
	{ name: 'STRIPE_WEBHOOK_SECRET', services: ['web'], severity: 'required', productionOnly: true, reason: 'webhook signature verification' },
	{ name: 'STRIPE_PRICE_ID_STARTER', services: ['web'], severity: 'required', productionOnly: true, reason: 'Starter checkout' },
	{ name: 'STRIPE_PRICE_ID_PRO', services: ['web'], severity: 'required', productionOnly: true, reason: 'Pro checkout' },
	{ name: 'STRIPE_PRICE_ID_BUSINESS', services: ['web'], severity: 'required', productionOnly: true, reason: 'Business checkout' },
	{ name: 'RESEND_API_KEY', services: ['web', 'worker'], severity: 'required', productionOnly: true, reason: 'verification/reset mail on web; digest, reminders and trial notices from the worker' },
	{ name: 'APP_BASE_URL', services: ['web', 'worker'], severity: 'required', productionOnly: true, reason: 'absolute links in emails, WhatsApp replies and canonicals' },
	{ name: 'SENTRY_DSN', services: ['web', 'worker'], severity: 'required', productionOnly: true, reason: 'server-side error capture' },
	{ name: 'AWS_ENDPOINT_URL', services: ['web', 'worker'], severity: 'required', when: onRailwayBucket, reason: 'STORAGE_DRIVER=railway' },
	{ name: 'AWS_ACCESS_KEY_ID', services: ['web', 'worker'], severity: 'required', when: onRailwayBucket, reason: 'STORAGE_DRIVER=railway' },
	{ name: 'AWS_SECRET_ACCESS_KEY', services: ['web', 'worker'], severity: 'required', when: onRailwayBucket, reason: 'STORAGE_DRIVER=railway' },
	{ name: 'AWS_S3_BUCKET_NAME', services: ['web', 'worker'], severity: 'required', when: onRailwayBucket, reason: 'STORAGE_DRIVER=railway' },
	{ name: 'STORAGE_DRIVER', services: ['web', 'worker'], severity: 'recommended', productionOnly: true, when: (env) => onRailway(env) && env.STORAGE_DRIVER !== 'railway', reason: 'web and worker have separate disks on Railway — must be `railway`' },
	{ name: 'ADDRESS_HEADER', services: ['web'], severity: 'recommended', productionOnly: true, when: onRailway, reason: 'IP-keyed rate limits share one bucket behind the Railway edge without it' },
	{ name: 'HEALTH_CHECK_TOKEN', services: ['web'], severity: 'recommended', productionOnly: true, reason: 'external worker-liveness monitor on /api/health (#781)' },
	{ name: 'SENTRY_RELEASE', services: ['web', 'worker'], severity: 'recommended', productionOnly: true, reason: 'bisect Sentry issues to a deploy' },
	{ name: 'VITE_SENTRY_DSN', services: ['web'], severity: 'recommended', productionOnly: true, reason: 'client-side error capture (build arg)' },
];

export interface EnvGaps {
	missing: string[];
	recommended: string[];
}

function applies(req: EnvRequirement, service: EnvService, env: NodeJS.ProcessEnv, production: boolean): boolean {
	if (!req.services.includes(service)) return false;
	if (req.productionOnly && !production) return false;
	if (req.when && !req.when(env)) return false;
	return true;
}

function isMissing(req: EnvRequirement, env: NodeJS.ProcessEnv): boolean {
	if (req.name === 'STORAGE_DRIVER') return true;
	return !(env[req.name] ?? '').trim();
}

export function envGaps(
	service: EnvService,
	env: NodeJS.ProcessEnv = process.env,
	production: boolean = env.NODE_ENV === 'production',
): EnvGaps {
	const gaps: EnvGaps = { missing: [], recommended: [] };
	for (const req of ENV_REQUIREMENTS) {
		if (!applies(req, service, env, production) || !isMissing(req, env)) continue;
		(req.severity === 'required' ? gaps.missing : gaps.recommended).push(req.name);
	}
	return gaps;
}

export function envRequirementReason(name: string): string {
	return ENV_REQUIREMENTS.find((r) => r.name === name)?.reason ?? '';
}
