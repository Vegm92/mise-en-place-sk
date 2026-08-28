import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

config({ path: '.env' });

const DATABASE_MIGRATION_URL = process.env.DATABASE_MIGRATION_URL ?? '';
const DATABASE_URL = process.env.DATABASE_URL ?? '';

if (!DATABASE_MIGRATION_URL && DATABASE_URL) {
	console.warn(
		'[drizzle.config] DATABASE_MIGRATION_URL is not set — falling back to DATABASE_URL for ' +
		'drizzle-kit (migrate/push/studio/generate). That is fine for local dev with a single ' +
		'owner-role Postgres, but production must set DATABASE_MIGRATION_URL to the owner/superuser ' +
		'role once DATABASE_URL points at the scoped runtime role (issue #464) — migrations run DDL ' +
		'that role no longer has.'
	);
}

const url = DATABASE_MIGRATION_URL || DATABASE_URL;
const isLocal = /localhost|127\.0\.0\.1/.test(url);

export default defineConfig({
	dialect: 'postgresql',
	schema:  './src/lib/server/schema.ts',
	out:     './drizzle',
	dbCredentials: {
		url,
		ssl: isLocal ? false : 'require',
	},
});
