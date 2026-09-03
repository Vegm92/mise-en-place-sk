import './lib/server/env-file.js';
import { db } from './lib/server/db.js';
import { restaurants } from './lib/server/schema.js';
import { backfillRestaurant } from './lib/server/backfill.js';

const all = await db.select({ id: restaurants.id, name: restaurants.name }).from(restaurants);
console.info(`[backfill] ${all.length} restaurant(s)`);

let totalPacked = 0;
let totalLinked = 0;
for (const r of all) {
	const { packed, linked } = await backfillRestaurant(db, r.id);
	totalPacked += packed;
	totalLinked += linked;
	console.info(`[backfill] ${r.name}: packed=${packed} linked=${linked}`);
}

console.info(`[backfill] done — pack fields on ${totalPacked}, product links on ${totalLinked} line items`);
process.exit(0);
