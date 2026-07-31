import { sql } from 'drizzle-orm';
import { db } from './db';
import { systemNotifications } from './schema';
import { normalizeProductKey } from './normalize';
import { GEMINI_API_KEY } from './env';
import { createLLMProvider, type LLMProvider } from './llm-provider';
import { recordLlmUsage } from './llm-quota';

export const LLM_MATCH_THRESHOLD = 0.8;
const MAX_CANDIDATES = 50;

export interface NormalizeJobData {
	restaurantId: string;
	productId: number;
	rawText: string;
}

export interface Candidate { id: number; name: string }

export interface NormalizeVerdict { matchId: number | null; confidence: number }

export function buildNormalizePrompt(rawText: string, candidates: Candidate[]): string {
	const list = candidates.map((c) => `${c.id}: ${c.name}`).join('\n');
	return [
		'Eres un asistente de compras para restaurantes en España.',
		'Un producto de una factura tiene esta descripción cruda:',
		`"${rawText}"`,
		'',
		'¿Corresponde a alguno de estos productos ya existentes? Ten en cuenta',
		'abreviaturas, jerga y códigos de artículo del sector alimentario español',
		'(p.ej. "MERL." = merluza, "TERN." = ternera, "S/H" = sin hueso).',
		'',
		'Productos existentes (id: nombre):',
		list,
		'',
		'Responde SOLO con JSON: {"match_id": <id o null>, "confidence": <0..1>}.',
		'match_id null si no corresponde con claridad a ninguno.',
	].join('\n');
}

export function parseNormalizeResponse(text: string, validIds: Set<number>): NormalizeVerdict {
	const trimmed = (text ?? '').trim();
	const body = trimmed.startsWith('```')
		? trimmed.split('\n').slice(1, trimmed.trimEnd().endsWith('```') ? -1 : undefined).join('\n')
		: trimmed;
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		return { matchId: null, confidence: 0 };
	}
	const obj = (parsed ?? {}) as { match_id?: unknown; confidence?: unknown };
	const rawId = typeof obj.match_id === 'number' ? obj.match_id : null;
	const matchId = rawId != null && validIds.has(rawId) ? rawId : null;
	let confidence = typeof obj.confidence === 'number' ? obj.confidence : 0;
	if (!Number.isFinite(confidence)) confidence = 0;
	confidence = Math.max(0, Math.min(1, confidence));
	return { matchId, confidence };
}

export interface NormalizeDeps {
	provider?: LLMProvider;
	recordUsage?: typeof recordLlmUsage;
}

export async function processNormalizeJob(data: NormalizeJobData, deps: NormalizeDeps = {}): Promise<void> {
	const { restaurantId, productId, rawText } = data;
	try {
		const provider = deps.provider ?? (GEMINI_API_KEY ? createLLMProvider() : null);
		if (!provider) return;

		const candRows = await db.execute<{ id: number; canonical_name: string }>(sql`
			SELECT id, canonical_name FROM products
			WHERE restaurant_id = ${restaurantId} AND id <> ${productId}
			ORDER BY created_at DESC
			LIMIT ${MAX_CANDIDATES}
		`);
		if (candRows.length === 0) return;

		const candidates: Candidate[] = candRows.map((r) => ({ id: r.id, name: r.canonical_name }));
		const validIds = new Set(candidates.map((c) => c.id));

		const resp = await provider.generate(buildNormalizePrompt(rawText, candidates));
		const recordUsage = deps.recordUsage ?? recordLlmUsage;
		await recordUsage(restaurantId, resp.usage, 'normalize');

		const verdict = parseNormalizeResponse(resp.text, validIds);
		if (verdict.matchId == null || verdict.confidence < LLM_MATCH_THRESHOLD) return;

		const candidate = candidates.find((c) => c.id === verdict.matchId);
		if (!candidate) return;

		const rawKey = normalizeProductKey(rawText);
		const existing = await db.execute<{ id: number }>(sql`
			SELECT id FROM system_notifications
			WHERE restaurant_id = ${restaurantId}
			  AND notification_type = 'product_suggestion'
			  AND status = 'pending'
			  AND mep_norm_key(payload::json->>'description') = ${rawKey}
			LIMIT 1
		`);
		if (existing.length > 0) return;

		await db.insert(systemNotifications).values({
			restaurantId,
			notificationType: 'product_suggestion',
			message: `¿Es '${rawText}' el mismo producto que '${candidate.name}'? (sugerencia IA) Confírmalo para agrupar su historial de precios.`,
			payload: JSON.stringify({
				description: rawText,
				productId,
				candidateName: candidate.name,
				candidateProductId: candidate.id,
				score: Math.round(verdict.confidence * 100) / 100,
				source: 'llm',
			}),
			status: 'pending',
		});
	} catch (err) {
		console.error('[normalize] product normalization job failed (non-fatal):', err);
	}
}
