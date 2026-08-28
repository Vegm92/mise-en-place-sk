import { eq, sql } from 'drizzle-orm';
import { db, forTenant } from './db';
import { settings, restaurants } from './schema';
import { buildChatContext } from './chat-context';
import { createGeminiProvider } from './llm-provider';
import { recordLlmUsage } from './llm-quota';

const VENUE_TYPE_PROMPT_LABEL: Record<string, string> = {
	menu_del_dia: 'a fixed-price menú del día restaurant',
	carta:        'an à la carte restaurant',
	bar_tapas:    'a tapas bar',
	hotel:        'a hotel restaurant',
	grupo:        'a multi-location restaurant group',
};

async function getSegmentContext(restaurantId: string): Promise<{ venueType: string | null; topCategory: string | null }> {
	const [row] = await db.select({ venueType: restaurants.venueType, topCategory: restaurants.topCategory })
		.from(restaurants)
		.where(eq(restaurants.id, restaurantId))
		.limit(1);
	return { venueType: row?.venueType ?? null, topCategory: row?.topCategory ?? null };
}

function segmentSentence(venueType: string | null, topCategory: string | null): string {
	const venueLabel = venueType ? VENUE_TYPE_PROMPT_LABEL[venueType] : undefined;
	if (venueLabel && topCategory) return ` This is for ${venueLabel} whose largest spend category is ${topCategory}.`;
	if (venueLabel) return ` This is for ${venueLabel}.`;
	if (topCategory) return ` This restaurant's largest spend category is ${topCategory}.`;
	return '';
}

export function isoWeek(date: Date): string {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
	const week1 = new Date(d.getFullYear(), 0, 4);
	const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
	return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

async function getSetting(restaurantId: string, key: string): Promise<string | null> {
	const tdb = forTenant(restaurantId);
	const rows = await db.select({ value: settings.value })
		.from(settings)
		.where(tdb.scope(settings.restaurantId, eq(settings.key, key)));
	return rows[0]?.value ?? null;
}

async function upsertSetting(restaurantId: string, key: string, value: string): Promise<void> {
	await db.insert(settings)
		.values({ restaurantId, key, value })
		.onConflictDoUpdate({
			target: [settings.restaurantId, settings.key],
			set: { value },
		});
}

async function claimDigestWeek(restaurantId: string, week: string): Promise<boolean> {
	const rows = await db.insert(settings)
		.values({ restaurantId, key: 'weekly_digest_week', value: week })
		.onConflictDoUpdate({
			target: [settings.restaurantId, settings.key],
			set: { value: week },
			setWhere: sql`${settings.value} <> ${week}`,
		})
		.returning({ value: settings.value });
	return rows.length > 0;
}

export interface WeeklyDigestDeps {
	provider?: ReturnType<typeof createGeminiProvider>;
	recordUsage?: typeof recordLlmUsage;
}

async function callGeminiText(prompt: string, restaurantId: string, deps: WeeklyDigestDeps): Promise<string> {
	const provider = deps.provider ?? createGeminiProvider();
	const response = await provider.generate(prompt);
	const recordUsage = deps.recordUsage ?? recordLlmUsage;
	await recordUsage(restaurantId, response.usage, 'weekly-digest');
	return response.text;
}

export async function getOrGenerateWeeklyDigest(
	restaurantId: string,
	currentWeek: string,
	deps: WeeklyDigestDeps = {},
): Promise<string | null> {
	try {
		const storedWeek = await getSetting(restaurantId, 'weekly_digest_week');
		const storedText = await getSetting(restaurantId, 'weekly_digest_text');

		if (storedWeek === currentWeek && storedText) return storedText;

		if (!(await claimDigestWeek(restaurantId, currentWeek))) {
			return await getSetting(restaurantId, 'weekly_digest_text');
		}

		const context = await buildChatContext(restaurantId);
		const { venueType, topCategory } = await getSegmentContext(restaurantId);
		const segment = segmentSentence(venueType, topCategory);
		const prompt = `You are a procurement assistant for a restaurant.${segment} Based on this week's data, write a brief weekly spend digest (max 150 words) covering:
1. Total spend vs last week (% change if available)
2. Top price changes (up to 3 items with the biggest unit price change, with supplier and % change)
3. Overdue invoices (count and total amount, call out the oldest one if any)
4. Budget status (any category at ≥80% of monthly budget, with days left in the month)
5. Inactive suppliers (any supplier who hasn't sent an invoice longer than their normal cadence)
6. One recommended action in a single sentence starting with "Recommended:"

Be specific with numbers. Use a professional but direct tone. Do not use markdown headers or bullet points — write it as flowing short paragraphs.

Data:
${context}`;

		let text: string;
		try {
			text = await callGeminiText(prompt, restaurantId, deps);
		} catch (err) {
			await upsertSetting(restaurantId, 'weekly_digest_week', storedWeek ?? '');
			throw err;
		}

		await upsertSetting(restaurantId, 'weekly_digest_text', text);

		return text;
	} catch (err) {
		console.error('[weekly-digest] generation failed', err);
		return null;
	}
}
