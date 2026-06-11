import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sql, gt } from 'drizzle-orm';
import { uploadSessions } from '$lib/server/schema';
import { STORAGE_DRIVER, UPLOADS_DIR } from '$lib/server/env';
import fs from 'node:fs';
import path from 'node:path';
import { version } from '$app/environment';

const START_TIME = Date.now();

export async function GET() {
	// DB check
	let dbReachable = false;
	let dbSizeMb = 0;
	try {
		const [, sizeRows] = await Promise.all([
			db.execute(sql`SELECT 1`),
			db.execute(sql`SELECT pg_database_size(current_database()) AS size`),
		]);
		dbReachable = true;
		const raw = (sizeRows as unknown as Array<{ size: string | number }>)[0]?.size;
		dbSizeMb = Math.round(Number(raw ?? 0) / (1024 * 1024));
	} catch { /* dbReachable stays false */ }

	// Active upload sessions (updated in last 24 h)
	let activeCount = 0;
	try {
		const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
		const rows = await db
			.select({ cnt: sql<number>`COUNT(*)` })
			.from(uploadSessions)
			.where(gt(uploadSessions.updatedAt, cutoff));
		activeCount = Number(rows[0]?.cnt ?? 0);
	} catch { /* ignore — analytics only */ }

	// Uploads directory check (local driver only)
	let uploadsDir: { writable: boolean; free_mb: number } | null = null;
	if (STORAGE_DRIVER === 'local') {
		const dir = path.resolve(process.cwd(), UPLOADS_DIR);
		let writable = false;
		let freeMb = 0;
		try {
			fs.accessSync(dir, fs.constants.W_OK);
			writable = true;
		} catch { /* not writable */ }
		try {
			// fs.statfsSync available Node ≥ 18.8
			const stat = (fs as unknown as { statfsSync?: (p: string) => { bfree: number; bsize: number } })
				.statfsSync?.(dir);
			if (stat) freeMb = Math.round((stat.bfree * stat.bsize) / (1024 * 1024));
		} catch { /* ignore */ }
		uploadsDir = { writable, free_mb: freeMb };
	}

	const degraded = !dbReachable || uploadsDir?.writable === false;

	return json({
		status: degraded ? 'degraded' : 'ok',
		db: { reachable: dbReachable, size_mb: dbSizeMb },
		uploads_dir: uploadsDir,
		sessions: { active_count: activeCount },
		uptime_seconds: Math.floor((Date.now() - START_TIME) / 1000),
		version,
	});
}
