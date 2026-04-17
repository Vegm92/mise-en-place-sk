import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { invoices } from '$lib/server/schema';
import { count } from 'drizzle-orm';

export async function GET() {
	const [{ value }] = await db.select({ value: count() }).from(invoices);
	return json({ status: 'ok', invoice_count: value });
}
