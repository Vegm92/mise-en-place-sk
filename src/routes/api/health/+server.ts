import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';

export async function GET() {
	let dbOk = false;
	let dbError: string | undefined;

	try {
		await db.execute(sql`SELECT 1`);
		dbOk = true;
	} catch (e) {
		dbError = e instanceof Error ? e.message : String(e);
	}

	const status = dbOk ? 'ok' : 'degraded';
	const body = {
		status,
		checks: {
			db: dbOk ? 'ok' : 'error',
			...(dbError ? { dbError } : {}),
		},
		timestamp: new Date().toISOString(),
	};

	return json(body, { status: dbOk ? 200 : 503 });
}
