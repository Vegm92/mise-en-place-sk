import './lib/server/env-file.js';
import { db } from './lib/server/db.js';
import { restaurants } from './lib/server/schema.js';
import { backfillProductCategories } from './lib/server/category-backfill.js';

const args = process.argv.slice(2);
const includeOther = args.includes('--include-other');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 1000;
if (!Number.isFinite(limit) || limit <= 0) {
	console.error('[category-backfill] --limit must be a positive number');
	process.exit(1);
}

const all = await db.select({ id: restaurants.id, name: restaurants.name }).from(restaurants);
console.info(`[category-backfill] ${all.length} restaurant(s), limit ${limit} per restaurant`);

let totalCleared = 0;
let totalEnqueued = 0;
for (const r of all) {
	const { cleared, enqueued } = await backfillProductCategories(db, r.id, { includeOther, limit });
	totalCleared += cleared;
	totalEnqueued += enqueued;
	if (cleared > 0 || enqueued > 0) {
		console.info(`[category-backfill] ${r.name}: cleared=${cleared} enqueued=${enqueued}`);
	}
}

console.info(
	`[category-backfill] done — ${totalCleared} product(s) reset to uncategorised, ` +
	`${totalEnqueued} categorisation job(s) queued. The worker process does the work.`,
);
process.exit(0);
