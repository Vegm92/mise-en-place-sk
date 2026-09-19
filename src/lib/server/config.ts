import { envGaps, type EnvService } from './env-report.js';

const REQUIRED_IN_PRODUCTION = [
	'AUTH_SECRET',
	'DATABASE_URL',
	'STRIPE_SECRET_KEY',
	'STRIPE_WEBHOOK_SECRET',
	'GEMINI_API_KEY',
	'APP_BASE_URL',
] as const;

const KNOWN_PROXY_PLATFORM_ENV_VARS = ['RAILWAY_PROJECT_ID', 'RAILWAY_SERVICE_ID', 'RENDER', 'FLY_APP_NAME'] as const;

const ROLE_CONTRACT_VARS = ['DATABASE_URL', 'GEMINI_API_KEY', 'AWS_ENDPOINT_URL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_NAME'] as const;

function roleConfigGaps(role: EnvService, env: NodeJS.ProcessEnv): string[] {
	return envGaps(role, env).missing.filter(name => (ROLE_CONTRACT_VARS as readonly string[]).includes(name));
}

export function isProduction(env: NodeJS.ProcessEnv = process.env): boolean {
	return env.NODE_ENV === 'production';
}

function hasTrustedProxy(env: NodeJS.ProcessEnv): boolean {
	return env.TRUSTED_PROXY === '1' || KNOWN_PROXY_PLATFORM_ENV_VARS.some(key => Boolean(env[key]));
}

export function assertRoleConfig(role: EnvService, env: NodeJS.ProcessEnv = process.env): void {
	if (!isProduction(env)) return;

	const missing = roleConfigGaps(role, env);

	if (missing.length > 0) {
		throw new Error(`Missing required ${role} environment variable(s) in production: ${missing.join(', ')}`);
	}
}

export function assertProductionEnv(env: NodeJS.ProcessEnv = process.env): void {
	if (!isProduction(env)) return;

	const missing: string[] = REQUIRED_IN_PRODUCTION.filter(key => !env[key]);

	if (env.WHATSAPP_ACCESS_TOKEN && !env.WHATSAPP_APP_SECRET) {
		missing.push('WHATSAPP_APP_SECRET');
	}

	for (const name of roleConfigGaps('web', env)) {
		if (!missing.includes(name)) missing.push(name);
	}

	if (missing.length > 0) {
		throw new Error(`Missing required environment variable(s) in production: ${missing.join(', ')}`);
	}

	if (env.ADDRESS_HEADER && !hasTrustedProxy(env)) {
		throw new Error(
			'[boot] ADDRESS_HEADER is set but no trusted proxy was detected (no Railway/Render/Fly env vars and TRUSTED_PROXY is not 1) — ' +
			'refusing to start in production. In this state getClientAddress() trusts whatever the client sends in that header, so every ' +
			'IP-keyed rate limit (login/signup/recover/waitlist) is spoofable. Unset ADDRESS_HEADER and XFF_DEPTH if nothing in front of ' +
			'this process rewrites the header (e.g. the stock docker-compose.yml topology), or set TRUSTED_PROXY=1 if your own reverse ' +
			'proxy (nginx/Caddy) terminates TLS and overwrites it on every request.',
		);
	}
}

export function validateAdminSeedConfig(env: NodeJS.ProcessEnv = process.env): void {
	if (!isProduction(env)) return;

	const email = env.AUTH_ADMIN_EMAIL ?? '';
	const password = env.AUTH_ADMIN_PASSWORD ?? '';

	if (!email || !password) return;

	if (password === 'changeme') {
		throw new Error('[boot] AUTH_ADMIN_PASSWORD is still the default "changeme" — refusing to start in production. Set a strong password in your environment.');
	}

	if (/@example\.(com|org|net)$/i.test(email)) {
		throw new Error(`[boot] AUTH_ADMIN_EMAIL is still a placeholder address (${email}) — refusing to start in production. Set a real, routable admin address.`);
	}
}

export function addressHeaderWarning(env: NodeJS.ProcessEnv = process.env): string | null {
	if (!isProduction(env)) return null;

	if (!env.ADDRESS_HEADER) {
		return (
			'[hooks] ADDRESS_HEADER is not set — getClientAddress() returns the socket peer address. ' +
			'If a reverse proxy terminates TLS, set ADDRESS_HEADER=x-forwarded-for and XFF_DEPTH to the number of trusted proxies, ' +
			'or the IP-keyed rate limits on login/signup/waitlist share a single bucket.'
		);
	}

	return null;
}
