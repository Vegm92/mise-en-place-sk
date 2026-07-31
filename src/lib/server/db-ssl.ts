import { readFileSync } from 'node:fs';

export interface PgSslConfig {
	rejectUnauthorized: boolean;
	ca?: string;
}

function readCa(value: string): string {
	return value.includes('-----BEGIN') ? value : readFileSync(value, 'utf-8');
}

export function pgSslConfig(env: NodeJS.ProcessEnv = process.env): PgSslConfig | false {
	const url = env.DATABASE_POOL_URL ?? env.DATABASE_URL ?? '';
	if (/localhost|127\.0\.0\.1/.test(url)) return false;

	const mode = env.DATABASE_SSL_MODE ?? 'require';
	const caSource = env.DATABASE_CA_CERT ?? '';

	if (mode === 'verify-full') {
		const config: PgSslConfig = { rejectUnauthorized: true };
		if (caSource) config.ca = readCa(caSource);
		return config;
	}

	if (mode !== 'require') {
		console.warn(`[db] unknown DATABASE_SSL_MODE "${mode}" — falling back to "require"`);
	}
	if (env.NODE_ENV === 'production') {
		console.warn(
			'[db] DATABASE_SSL_MODE=require — the database connection is encrypted but the server certificate is NOT verified. ' +
			'Set DATABASE_SSL_MODE=verify-full (and DATABASE_CA_CERT for Supabase) to close the MITM window.',
		);
	}
	return { rejectUnauthorized: false };
}
