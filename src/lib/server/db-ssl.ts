import { readFileSync } from 'node:fs';

export interface PgSslConfig {
	rejectUnauthorized: boolean;
	ca?: string;
	checkServerIdentity?: () => undefined;
}

const SSL_MODES = ['require', 'verify-full'];

function describeCaSource(value: string): string {
	return /:\/\/|@/.test(value) ? '<redacted>' : JSON.stringify(value);
}

function readCa(value: string): string {
	if (value.includes('-----BEGIN')) return value;
	const file = value.trim();
	try {
		return readFileSync(file, 'utf-8');
	} catch (cause) {
		const swapped = SSL_MODES.includes(file.toLowerCase())
			? ` "${file}" is a DATABASE_SSL_MODE value — did you mean DATABASE_SSL_MODE=${file.toLowerCase()}?`
			: '';
		throw new Error(
			`[db] DATABASE_CA_CERT=${describeCaSource(file)} is neither an inline PEM certificate ` +
			'nor a readable file path. Set it to the CA certificate contents (starting with ' +
			'"-----BEGIN CERTIFICATE-----") or to a path to a .crt file, or unset it to use the ' +
			`system trust store.${swapped}`,
			{ cause },
		);
	}
}

export function pgSslConfig(env: NodeJS.ProcessEnv = process.env): PgSslConfig | false {
	const url = env.DATABASE_POOL_URL ?? env.DATABASE_URL ?? '';
	if (/localhost|127\.0\.0\.1/.test(url)) return false;

	const mode = (env.DATABASE_SSL_MODE ?? 'require').trim().toLowerCase();
	const caSource = env.DATABASE_CA_CERT ?? '';

	if (mode === 'verify-full') {
		const config: PgSslConfig = { rejectUnauthorized: true };
		if (caSource.trim()) config.ca = readCa(caSource);
		return config;
	}

	if (mode !== 'require') {
		console.warn(`[db] unknown DATABASE_SSL_MODE "${mode}" — falling back to "require"`);
	}
	if (caSource.trim()) {
		return { rejectUnauthorized: true, ca: readCa(caSource), checkServerIdentity: () => undefined };
	}
	if (env.NODE_ENV === 'production') {
		console.warn(
			'[db] DATABASE_SSL_MODE=require — the database connection is encrypted but the server certificate is NOT verified. ' +
			'Set DATABASE_CA_CERT to the pinned root CA to verify the chain (no hostname check), ' +
			'or DATABASE_SSL_MODE=verify-full for full verification, to close the MITM window.',
		);
	}
	return { rejectUnauthorized: false };
}
