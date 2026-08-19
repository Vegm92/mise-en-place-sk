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
