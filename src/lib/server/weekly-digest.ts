import { GoogleGenAI } from '@google/genai';
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { settings } from './schema';
import { buildChatContext } from './chat-context';
import { GEMINI_API_KEY, GEMINI_MODEL } from './env';

export function isoWeek(date: Date): string {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
	const week1 = new Date(d.getFullYear(), 0, 4);
	const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
	return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

async function getSetting(restaurantId: string, key: string): Promise<string | null> {
	const rows = await db.select({ value: settings.value })
		.from(settings)
		.where(and(eq(settings.restaurantId, restaurantId), eq(settings.key, key)));
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

async function callGeminiText(prompt: string): Promise<string> {
	if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
	const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
	const response = await ai.models.generateContent({ model: GEMINI_MODEL, contents: prompt });
	return response.text ?? '';
}

export async function getOrGenerateWeeklyDigest(restaurantId: string, currentWeek: string): Promise<{
	text: string;
	dismissed: boolean;
} | null> {
	try {
		const storedWeek = await getSetting(restaurantId, 'weekly_digest_week');
		const storedText = await getSetting(restaurantId, 'weekly_digest_text');
		const storedDismissed = await getSetting(restaurantId, 'weekly_digest_dismissed');

		if (storedWeek === currentWeek && storedText) {
			return {
				text: storedText,
				dismissed: storedDismissed === 'true',
			};
		}

		const context = await buildChatContext(restaurantId);
		const prompt = `You are a procurement assistant for a restaurant. Based on this week's data, write a brief weekly spend digest (max 150 words) covering:
1. Total spend vs last week (% change if available)
2. Top price changes (up to 3 items with the biggest unit price change, with supplier and % change)
3. Overdue invoices (count and total amount, call out the oldest one if any)
4. Budget status (any category at ≥80% of monthly budget, with days left in the month)
5. Inactive suppliers (any supplier who hasn't sent an invoice longer than their normal cadence)
6. One recommended action in a single sentence starting with "Recommended:"

Be specific with numbers. Use a professional but direct tone. Do not use markdown headers or bullet points — write it as flowing short paragraphs.

Data:
${context}`;

		const text = await callGeminiText(prompt);

		await upsertSetting(restaurantId, 'weekly_digest_week', currentWeek);
		await upsertSetting(restaurantId, 'weekly_digest_text', text);
		await upsertSetting(restaurantId, 'weekly_digest_dismissed', 'false');

		return { text, dismissed: false };
	} catch (err) {
		console.error('[weekly-digest] generation failed', err);
		return null;
	}
}

export async function dismissWeeklyDigest(restaurantId: string): Promise<void> {
	await upsertSetting(restaurantId, 'weekly_digest_dismissed', 'true');
}
