import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY, GEMINI_MODEL, CHAT_RATE_LIMIT_RPM } from '$lib/server/env';
import { buildChatContext } from '$lib/server/chat-context';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { db } from '$lib/server/db';
import { chatSessions, chatMessages } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export type ChatAction = { label: string; href: string; variant: 'primary' | 'secondary' };

const SYSTEM_PROMPT = `You are a helpful assistant for a procurement management app called Mise en Place.
The user manages supplier invoices, budgets, stock levels, and spending for a restaurant or pharmacy.
Answer questions about their invoices, suppliers, spending, budgets, stock, and alerts using the data snapshot below.
Be concise and specific. Format currency values with 2 decimal places. If the answer is not in the data, say so — do not guess.

When your answer refers to a specific supplier, invoice, or analytics view that the user might want to explore,
append at the very end of your response an ACTIONS block in this exact single-line format:
ACTIONS:[{"label":"Button text","href":"/route","variant":"primary"},{"label":"Button 2","href":"/route2","variant":"secondary"}]

Only include actions when they are directly relevant. Max 2 actions per response. Omit the ACTIONS block entirely if not relevant.
Valid routes:
- /invoices (invoice list)
- /invoices?supplier=[supplier-name-slug] (filtered by supplier)
- /suppliers (supplier list)
- /analytics/spend (spend analytics)
- /analytics/prices (price trend analytics)
- /reminders (reminders)
- /budgets (budget overview)`;

function parseActionsBlock(raw: string): { text: string; actions: ChatAction[] } {
	const match = raw.match(/\nACTIONS:(\[.*\])\s*$/s);
	if (!match) return { text: raw.trim(), actions: [] };
	const text = raw.slice(0, raw.lastIndexOf('\nACTIONS:')).trim();
	try {
		const actions = JSON.parse(match[1]) as ChatAction[];
		return { text, actions: Array.isArray(actions) ? actions.slice(0, 2) : [] };
	} catch {
		return { text, actions: [] };
	}
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const body = await request.json().catch(() => null);
	if (!body?.message || typeof body.message !== 'string') {
		throw error(400, 'message is required');
	}
	const message = (body.message as string).slice(0, 2000);
	const sessionId: number | null = typeof body.sessionId === 'number' ? body.sessionId : null;

	if (!GEMINI_API_KEY) throw error(503, 'AI service is not configured — please contact support');

	const key = getClientAddress();
	if (!checkRateLimit(key, CHAT_RATE_LIMIT_RPM)) {
		throw error(429, 'Too many requests — please wait a moment before trying again');
	}

	// Resolve or create session
	let resolvedSessionId = sessionId;
	if (!resolvedSessionId) {
		const titleWords = message.slice(0, 60).replace(/\n/g, ' ');
		const [newSession] = db.insert(chatSessions)
			.values({ title: titleWords })
			.returning({ id: chatSessions.id })
			.all();
		resolvedSessionId = newSession.id;
	} else {
		// Touch updatedAt
		db.update(chatSessions)
			.set({ updatedAt: new Date().toISOString() })
			.where(eq(chatSessions.id, resolvedSessionId))
			.run();
	}

	// Persist user message
	db.insert(chatMessages).values({ sessionId: resolvedSessionId, role: 'user', text: message }).run();

	const context = buildChatContext();
	const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

	try {
		const response = await ai.models.generateContent({
			model: GEMINI_MODEL,
			config: { systemInstruction: `${SYSTEM_PROMPT}\n\nDATA SNAPSHOT:\n${context}` },
			contents: message,
		});

		const raw = response.text ?? 'No response generated.';
		const { text: reply, actions } = parseActionsBlock(raw);

		// Persist assistant message
		db.insert(chatMessages).values({
			sessionId: resolvedSessionId,
			role: 'assistant',
			text: reply,
			actions: actions.length ? JSON.stringify(actions) : null,
		}).run();

		return json({ reply, actions: actions.length ? actions : undefined, sessionId: resolvedSessionId });
	} catch (err) {
		console.error('[chat] Gemini error', err);
		const status = (err as { status?: number }).status;
		if (status === 429) throw error(429, 'AI service is rate limited — please try again in a moment');
		throw error(503, 'AI service is temporarily unavailable — please try again shortly');
	}
};
