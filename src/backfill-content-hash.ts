import 'dotenv/config';
import { db } from './lib/server/db.js';
import { restaurants } from './lib/server/schema.js';
import { rehashRestaurant } from './lib/server/rehash.js';

const all = await db.select({ id: restaurants.id, name: restaurants.name }).from(restaurants);
console.info(`[rehash] ${all.length} restaurant(s)`);

let scanned = 0;
let updated = 0;
let collided = 0;
for (const r of all) {
	const result = await rehashRestaurant(db, r.id);
	scanned += result.scanned;
	updated += result.updated;
	collided += result.collided;
	if (result.scanned > 0) {
		console.info(`[rehash] ${r.name}: scanned=${result.scanned} updated=${result.updated} collided=${result.collided}`);
	}
}

console.info(`[rehash] done — ${updated} of ${scanned} invoice(s) rehashed, ${collided} left on the old hash to avoid a unique-index clash`);
process.exit(0);
