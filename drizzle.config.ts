import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

config({ path: '.env' });

const url = process.env.DATABASE_URL ?? '';
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
