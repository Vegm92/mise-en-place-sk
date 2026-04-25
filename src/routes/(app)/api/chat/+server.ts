import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from '$lib/server/env';
import { buildChatContext } from '$lib/server/chat-context';

const MODEL = 'gemini-2.5-flash';

const SYSTEM_PROMPT = `You are a helpful assistant for a procurement management app called Mise en Place.
The user manages supplier invoices, budgets, stock levels, and spending for a restaurant or pharmacy.
Answer questions about their invoices, suppliers, spending, budgets, stock, and alerts using the data snapshot below.
Be concise and specific. Format currency values with 2 decimal places. If the answer is not in the data, say so — do not guess.`;

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	if (!body?.message || typeof body.message !== 'string') {
		throw error(400, 'message is required');
	}
	if (!GEMINI_API_KEY) throw error(500, 'GEMINI_API_KEY not configured');

	const context = buildChatContext();
	const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

	const response = await ai.models.generateContent({
		model: MODEL,
		config: { systemInstruction: `${SYSTEM_PROMPT}\n\nDATA SNAPSHOT:\n${context}` },
		contents: body.message as string,
	});

	return json({ reply: response.text ?? 'No response generated.' });
};
