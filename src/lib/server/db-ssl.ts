import { readFileSync } from 'node:fs';
import { config } from './env';

export interface PgSslConfig {
	rejectUnauthorized: boolean;
	ca?: string;
}

function readCa(value: string): string {
	return value.includes('-----BEGIN') ? value : readFileSync(value, 'utf-8');
}

export function pgSslConfig(): PgSslConfig | false {
	const url = config.database.poolUrl || config.database.url;
	if (/localhost|127\.0\.0\.1/.test(url)) return false;

	const mode = config.database.sslMode;
	const caSource = config.database.caCert;

	if (mode === 'verify-full') {
		const sslConfig: PgSslConfig = { rejectUnauthorized: true };
		if (caSource) sslConfig.ca = readCa(caSource);
		return sslConfig;
	}

	if (mode !== 'require') {
		console.warn(`[db] unknown DATABASE_SSL_MODE "${mode}" — falling back to "require"`);
	}
	if (config.app.nodeEnv === 'production') {
		console.warn(
			'[db] DATABASE_SSL_MODE=require — the database connection is encrypted but the server certificate is NOT verified. ' +
			'Set DATABASE_SSL_MODE=verify-full (and DATABASE_CA_CERT, since Railway\'s cert is self-issued) to close the MITM window.',
		);
	}
	return { rejectUnauthorized: false };
}
