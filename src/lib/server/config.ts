const REQUIRED_IN_PRODUCTION = [
	'AUTH_SECRET',
	'DATABASE_URL',
	'STRIPE_SECRET_KEY',
	'STRIPE_WEBHOOK_SECRET',
	'GEMINI_API_KEY',
] as const;

export function assertProductionEnv(env: NodeJS.ProcessEnv = process.env): void {
	if (env.NODE_ENV !== 'production') return;

	const missing: string[] = REQUIRED_IN_PRODUCTION.filter(key => !env[key]);

	if (env.WHATSAPP_ACCESS_TOKEN && !env.WHATSAPP_APP_SECRET) {
		missing.push('WHATSAPP_APP_SECRET');
	}

	if (missing.length > 0) {
		throw new Error(`Missing required environment variable(s) in production: ${missing.join(', ')}`);
	}
}

export function validateAdminSeedConfig(env: NodeJS.ProcessEnv = process.env): void {
	if (env.NODE_ENV !== 'production') return;

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

const KNOWN_PROXY_PLATFORM_ENV_VARS = ['RAILWAY_PROJECT_ID', 'RAILWAY_SERVICE_ID', 'RENDER', 'FLY_APP_NAME'] as const;

export function addressHeaderWarning(env: NodeJS.ProcessEnv = process.env): string | null {
	if (env.NODE_ENV !== 'production') return null;

	if (!env.ADDRESS_HEADER) {
		return (
			'[hooks] ADDRESS_HEADER is not set — getClientAddress() returns the socket peer address. ' +
			'If a reverse proxy terminates TLS, set ADDRESS_HEADER=x-forwarded-for and XFF_DEPTH to the number of trusted proxies, ' +
			'or the IP-keyed rate limits on login/signup/waitlist share a single bucket.'
		);
	}

	const onKnownProxyPlatform = KNOWN_PROXY_PLATFORM_ENV_VARS.some(key => Boolean(env[key]));
	if (!onKnownProxyPlatform) {
		return (
			'[hooks] ADDRESS_HEADER is set but no known managed-proxy platform (Railway/Render/Fly) was detected via env vars. ' +
			'getClientAddress() trusts whatever the client sends in that header unless something in front of this process actually ' +
			'terminates TLS and overwrites it on every request. If nothing does — e.g. the stock docker-compose.yml topology, which ' +
			'publishes the port directly — unset ADDRESS_HEADER/XFF_DEPTH, or any client can spoof its IP and bypass the ' +
			'login/signup/waitlist rate limits. If you have your own reverse proxy (nginx/Caddy) in front that does rewrite the ' +
			'header, this warning is a false positive and can be ignored.'
		);
	}

	return null;
}
