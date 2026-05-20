import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'sqlite',
	schema: './src/lib/server/schema.ts',
	out: './drizzle',
	dbCredentials: { url: process.env.DATABASE_URL ?? 'mise_en_place.db' },
	verbose: true,
	strict: true,
});
