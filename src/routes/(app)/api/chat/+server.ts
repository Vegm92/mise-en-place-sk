import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY, GEMINI_MODEL, CHAT_RATE_LIMIT_RPM } from '$lib/server/env';
import { buildChatContext } from '$lib/server/chat-context';
import { checkRateLimit } from '$lib/server/rate-limiter';

const SYSTEM_PROMPT = `You are a helpful assistant for a procurement management app called Mise en Place.
The user manages supplier invoices, budgets, stock levels, and spending for a restaurant or pharmacy.
Answer questions about their invoices, suppliers, spending, budgets, stock, and alerts using the data snapshot below.
Be concise and specific. Format currency values with 2 decimal places. If the answer is not in the data, say so — do not guess.`;

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const body = await request.json().catch(() => null);
	if (!body?.message || typeof body.message !== 'string') {
		throw error(400, 'message is required');
	}
	const message = (body.message as string).slice(0, 2000);
	if (!GEMINI_API_KEY) throw error(503, 'AI service is not configured — please contact support');

	const key = getClientAddress();
	if (!checkRateLimit(key, CHAT_RATE_LIMIT_RPM)) {
		throw error(429, 'Too many requests — please wait a moment before trying again');
	}

	const context = buildChatContext();
	const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

	try {
		const response = await ai.models.generateContent({
			model: GEMINI_MODEL,
			config: { systemInstruction: `${SYSTEM_PROMPT}\n\nDATA SNAPSHOT:\n${context}` },
			contents: message,
		});
		return json({ reply: response.text ?? 'No response generated.' });
	} catch (err) {
		console.error('[chat] Gemini error', err);
		const status = (err as { status?: number }).status;
		if (status === 429) throw error(429, 'AI service is rate limited — please try again in a moment');
		throw error(503, 'AI service is temporarily unavailable — please try again shortly');
	}
};
