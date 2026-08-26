import { sql, and, eq, isNull, or } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db, forTenant } from './db';
import type { BatchDb } from './batch';
import * as schema from './schema';
import { unitConversions, systemNotifications } from './schema';
import { normalizeProductKey, canonicalizeUnit } from './normalize';
import { GEMINI_API_KEY } from './env';
import { createGeminiProvider } from './llm-provider';
import { recordLlmUsage } from './llm-quota';
import { recordDeadLetter } from './dead-letter';
import { NORMALIZE_QUEUE } from './queue';
import { toAllergenList } from '$lib/recipes';

type Database = PostgresJsDatabase<typeof schema>;

export type BaseUnit = 'kg' | 'L' | 'ud';

export interface PackInfo {
	unitsPerPack: number;
	unitSize: number;
	sizeUnit: string;
	baseQuantity: number;
	baseUnit: BaseUnit;
}

const SIZE_TO_BASE: Record<string, { base: BaseUnit; factor: number }> = {
	kg:     { base: 'kg', factor: 1 },
	g:      { base: 'kg', factor: 0.001 },
	mg:     { base: 'kg', factor: 0.000001 },
	L:      { base: 'L',  factor: 1 },
	ml:     { base: 'L',  factor: 0.001 },
	cl:     { base: 'L',  factor: 0.01 },
	ud:     { base: 'ud', factor: 1 },
	docena: { base: 'ud', factor: 12 },
};

function sizeToken(raw: string): string | null {
	const canonical = canonicalizeUnit(raw);
	if (canonical && SIZE_TO_BASE[canonical]) return canonical;
	return null;
}

function num(raw: string): number {
	return parseFloat(raw.replace(',', '.'));
}

function buildPackInfo(unitsPerPack: number, unitSize: number, token: string): PackInfo | null {
	const base = SIZE_TO_BASE[token];
	if (!base || unitsPerPack <= 0 || unitSize <= 0) return null;
	return {
		unitsPerPack,
		unitSize,
		sizeUnit: token,
		baseUnit: base.base,
		baseQuantity: unitsPerPack * unitSize * base.factor,
	};
}

const MULTIPACK = /(?<!\d)(\d+)\s*[xX×*]\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Zµ]+)\b/;
const SINGLE = /(?<!\d)(\d+(?:[.,]\d+)?)\s*([a-zA-Zµ]+)\b/g;
const COUNT = /(?:caja|cajas|pack|packs|paquete|paquetes|estuche|estuches|blister|bandeja|display|lote|caja de|pack de)\s*(?:de\s*)?(\d+)\b/;

function packFromMultipack(s: string): PackInfo | null {
	const multi = MULTIPACK.exec(s);
	if (!multi) return null;
	const token = sizeToken(multi[3]);
	if (!token) return null;
	return buildPackInfo(num(multi[1]), num(multi[2]), token);
}

function packFromSingle(s: string): PackInfo | null {
	SINGLE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = SINGLE.exec(s)) !== null) {
		const token = sizeToken(m[2]);
		if (token) {
			const info = buildPackInfo(1, num(m[1]), token);
			if (info) return info;
		}
	}
	return null;
}

function packFromCount(s: string): PackInfo | null {
	const count = COUNT.exec(s);
	if (!count) return null;
	return buildPackInfo(num(count[1]), 1, 'ud');
}

export function parsePack(description: string | null | undefined, unit?: string | null): PackInfo | null {
	for (const source of [description ?? '', unit ?? '']) {
		const s = source.trim();
		if (!s) continue;
		const info = packFromMultipack(s) ?? packFromSingle(s) ?? packFromCount(s);
		if (info) return info;
	}
	return null;
}

export function normalizedUnitPrice(unitPrice: number | null | undefined, pack: PackInfo | null): number | null {
	if (unitPrice == null || pack == null || pack.baseQuantity <= 0) return null;
	return Math.round((unitPrice / pack.baseQuantity) * 10000) / 10000;
}

const SKU_PREFIX = /^\s*(?:ref|art|cod|c[oó]d(?:igo)?)\b[.:#\s-]*[a-z]*\d[a-z0-9./-]*\s+/i;
const BARE_CODE = /^\s*\d{4,}[.\s-]+/;

const ABBREVIATIONS: Record<string, string> = {
	'tern': 'ternera',
	'ternj': 'ternera',
	'merl': 'merluza',
	'cong': 'congelado',
	'congelad': 'congelado',
	'refrig': 'refrigerado',
	'nat': 'natural',
	'ext': 'extra',
	'esp': 'especial',
	'pza': 'pieza',
	's/h': 'sin hueso',
	'c/h': 'con hueso',
	's/p': 'sin piel',
	'c/p': 'con piel',
	'ud': 'ud',
};

function expandToken(token: string): string {
	const key = token.includes('/') ? token.toLowerCase() : token.replace(/(?<!\.)\.+$/, '').toLowerCase();
	return ABBREVIATIONS[key] ?? token;
}

export function expandAbbreviations(raw: string): string {
	let s = (raw ?? '').trim();
	if (!s) return '';

	s = s.replace(SKU_PREFIX, '').replace(BARE_CODE, '').trim();
	if (!s) return raw.trim();

	return s
		.split(/\s+/)
		.map(expandToken)
		.join(' ')
		.trim();
}

export function conversionKey(ingredient: string, purchaseUnit: string): string {
	return `${normalizeProductKey(ingredient)}::${normalizeProductKey(purchaseUnit)}`;
}

export function resolveUnitFromMap(
	conversionMap: Map<string, { canonicalUnit: string; conversionFactor: number }>,
	description: string,
	unit: string,
): { canonicalUnit: string; conversionFactor: number } | null {
	const rule = conversionMap.get(conversionKey(description, unit));
	if (rule) return rule;
	const canonical = canonicalizeUnit(unit);
	if (canonical) return { canonicalUnit: canonical, conversionFactor: 1 };
	return null;
}

export interface ConversionPrompt {
	notificationId: number;
	supplierId: number | null;
	supplierName: string;
	ingredient: string;
	purchaseUnit: string;
	quantity: number | null;
}

export interface UnitConversionInput {
	supplierId: number | null;
	supplierName: string;
	ingredient: string;
	purchaseUnit: string;
	canonicalUnit: string;
	conversionFactor: number;
}

export type UnitConversionResult =
	| { ok: true; resolvedPrompts: number }
	| { ok: false; reason: 'invalid' };

function supplierConversionKey(supplierName: string, ingredient: string, purchaseUnit: string): string {
	return `${normalizeProductKey(supplierName)}::${conversionKey(ingredient, purchaseUnit)}`;
}

function parseNotificationPayload(raw: string | null): Record<string, unknown> | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
	} catch {
		return null;
	}
}

export async function loadConversionPrompts(
	database: Database,
	restaurantId: string,
): Promise<ConversionPrompt[]> {
	const [alertRows, ruleRows] = await Promise.all([
		database.execute<{ id: number; payload: string | null }>(sql`
			SELECT id, payload FROM system_notifications
			WHERE restaurant_id = ${restaurantId}
			  AND notification_type = 'unit_conversion_needed'
			  AND status = 'pending'
			ORDER BY created_at DESC, id DESC
		`),
		database.execute<{ supplier_name: string; ingredient: string; purchase_unit: string }>(sql`
			SELECT supplier_name, ingredient, purchase_unit FROM unit_conversions
			WHERE restaurant_id = ${restaurantId}
		`),
	]);

	const alreadyDefined = new Set(
		ruleRows.map((r) => supplierConversionKey(r.supplier_name, r.ingredient, r.purchase_unit)),
	);

	const prompts: ConversionPrompt[] = [];
	const seen = new Set<string>();

	for (const row of alertRows) {
		const payload = parseNotificationPayload(row.payload);
		if (!payload) continue;

		const ingredient   = String(payload.ingredient ?? '').trim();
		const purchaseUnit = String(payload.purchaseUnit ?? '').trim();
		const supplierName = String(payload.supplierName ?? '').trim();
		if (!ingredient || !purchaseUnit) continue;

		const key = supplierConversionKey(supplierName, ingredient, purchaseUnit);
		if (alreadyDefined.has(key) || seen.has(key)) continue;
		seen.add(key);

		const supplierId = typeof payload.supplierId === 'number' ? payload.supplierId : null;
		const quantity   = typeof payload.quantity === 'number' ? payload.quantity : null;

		prompts.push({ notificationId: row.id, supplierId, supplierName, ingredient, purchaseUnit, quantity });
	}

	return prompts;
}

export async function defineUnitConversion(
	database: Database,
	restaurantId: string,
	input: UnitConversionInput,
): Promise<UnitConversionResult> {
	const supplierName  = (input.supplierName ?? '').trim();
	const ingredient    = (input.ingredient ?? '').trim();
	const purchaseUnit  = (input.purchaseUnit ?? '').trim();
	const canonicalUnit = (input.canonicalUnit ?? '').trim();
	const factor        = Number(input.conversionFactor);
	const supplierId    = input.supplierId ?? null;

	if (!supplierName || !ingredient || !purchaseUnit || !canonicalUnit) return { ok: false, reason: 'invalid' };
	if (!Number.isFinite(factor) || factor <= 0) return { ok: false, reason: 'invalid' };

	const ingredientKey   = normalizeProductKey(ingredient);
	const purchaseUnitKey = normalizeProductKey(purchaseUnit);
	const supplierKey     = normalizeProductKey(supplierName);

	await database.insert(unitConversions)
		.values({
			restaurantId,
			supplierId,
			supplierName,
			ingredient,
			purchaseUnit,
			canonicalUnit,
			conversionFactor: factor,
		})
		.onConflictDoUpdate({
			target: [unitConversions.restaurantId, unitConversions.supplierName, unitConversions.ingredient, unitConversions.purchaseUnit],
			set: { canonicalUnit, conversionFactor: factor, supplierId },
		});

	await database.execute(sql`
		UPDATE invoice_line_items
		SET requires_unit_conversion = 0,
		    canonical_unit = ${canonicalUnit}
		WHERE restaurant_id = ${restaurantId}
		  AND requires_unit_conversion = 1
		  AND mep_norm_key(description) = ${ingredientKey}
		  AND mep_norm_key(unit) = ${purchaseUnitKey}
		  AND invoice_id IN (
		      SELECT i.id FROM invoices i
		      LEFT JOIN suppliers s ON s.id = i.supplier_id
		      WHERE i.restaurant_id = ${restaurantId}
		        AND CASE WHEN ${supplierId}::int IS NULL
		                 THEN mep_norm_key(s.name) = ${supplierKey}
		                 ELSE i.supplier_id = ${supplierId}::int
		            END
		  )
	`);

	const resolved = await database.execute<{ id: number }>(sql`
		UPDATE system_notifications
		SET status = 'sent'
		WHERE restaurant_id = ${restaurantId}
		  AND notification_type = 'unit_conversion_needed'
		  AND status = 'pending'
		  AND mep_norm_key(payload::json->>'ingredient') = ${ingredientKey}
		  AND mep_norm_key(payload::json->>'purchaseUnit') = ${purchaseUnitKey}
		RETURNING id
	`);

	return { ok: true, resolvedPrompts: resolved.length };
}

export interface LineItem {
	description: string;
	quantity: number | null;
	unit: string | null;
	unitPrice: number | null;
	totalPrice: number | null;
	[key: string]: unknown;
}

export interface EnrichedLineItem extends LineItem {
	canonicalUnit: string | null;
	requiresUnitConversion: boolean;
	convertedQuantity?: number | null;
	convertedUnitPrice?: number | null;
}

export async function loadConversionMap(
	supplierName: string,
	restaurantId: string,
	supplierId?: number | null,
	database: Database = db,
): Promise<Map<string, { canonicalUnit: string; conversionFactor: number }>> {
	const tdb = forTenant(restaurantId);
	const supplierNameMatches = sql`mep_norm_key(${unitConversions.supplierName}) = ${normalizeProductKey(supplierName)}`;

	const supplierFilter = supplierId != null
		? or(
			eq(unitConversions.supplierId, supplierId),
			and(isNull(unitConversions.supplierId), supplierNameMatches)
		  )
		: supplierNameMatches;

	const rows = await database
		.select()
		.from(unitConversions)
		.where(and(tdb.scope(unitConversions.restaurantId), supplierFilter));

	const map = new Map<string, { canonicalUnit: string; conversionFactor: number }>();
	for (const row of rows) {
		map.set(conversionKey(row.ingredient, row.purchaseUnit), {
			canonicalUnit: row.canonicalUnit,
			conversionFactor: row.conversionFactor,
		});
	}
	return map;
}

export async function resolveUnit(
	supplierName: string,
	description: string,
	unit: string,
	restaurantId: string,
	supplierId?: number | null,
	database: Database = db,
): Promise<{ canonicalUnit: string; conversionFactor: number } | null> {
	const map = await loadConversionMap(supplierName, restaurantId, supplierId, database);
	return resolveUnitFromMap(map, description, unit);
}

export async function annotateLineItems(
	supplierName: string,
	items: LineItem[],
	restaurantId: string,
	supplierId?: number | null,
	database: Database = db,
): Promise<{ enriched: EnrichedLineItem[]; conversionNotes: string[] }> {
	const conversionNotes: string[] = [];

	const conversionMap = await loadConversionMap(supplierName, restaurantId, supplierId, database);

	const enriched: EnrichedLineItem[] = items.map((item) => {
		const unit = (item.unit ?? '').trim();
		const description = (item.description ?? '').trim();

		if (!unit || !description) {
			return { ...item, canonicalUnit: null, requiresUnitConversion: false };
		}

		const rule = resolveUnitFromMap(conversionMap, description, unit);

		if (rule && rule.conversionFactor > 0) {
			const factor = rule.conversionFactor;
			return {
				...item,
				canonicalUnit: rule.canonicalUnit,
				requiresUnitConversion: false,
				convertedQuantity: item.quantity == null ? null : Math.round(item.quantity * factor * 10000) / 10000,
				convertedUnitPrice: item.unitPrice == null ? null : Math.round((item.unitPrice / factor) * 10000) / 10000,
			};
		}

		conversionNotes.push(
			`Unit '${unit}' is unknown for '${description}' (supplier: ${supplierName}). Awaiting conversion rule.`
		);
		return { ...item, canonicalUnit: null, requiresUnitConversion: true };
	});

	return { enriched, conversionNotes };
}

export const FUZZY_THRESHOLD = 0.42;

export interface ResolvedLine {
	productId: number;
	status: 'exact' | 'fuzzy' | 'created';
	suggestion?: { candidateName: string; score: number };
}

interface LineInput {
	description: string;
	unit?: string | null;
	category?: string | null;
	unitsPerPack?: number | null;
	baseUnit?: string | null;
	supplierSku?: string | null;
}

export async function resolveLineProducts(
	tx: BatchDb,
	restaurantId: string,
	supplierId: number | null,
	lines: LineInput[],
): Promise<Map<string, ResolvedLine>> {
	const out = new Map<string, ResolvedLine>();

	const byKey = new Map<string, {
		raw: string; key: string; unit: string | null; category: string | null;
		unitsPerPack: number | null; baseUnit: string | null; supplierSku: string | null;
	}>();
	for (const line of lines) {
		const raw = (line.description ?? '').trim();
		const key = normalizeProductKey(raw);
		if (!key) continue;
		if (!byKey.has(key)) {
			byKey.set(key, {
				raw,
				key,
				unit: canonicalizeUnit(line.unit) ?? (line.unit?.trim() || null),
				category: line.category ?? null,
				unitsPerPack: line.unitsPerPack ?? null,
				baseUnit: line.baseUnit ?? null,
				supplierSku: line.supplierSku ?? null,
			});
		}
	}
	if (byKey.size === 0) return out;

	for (const { raw, key, unit, category, unitsPerPack, baseUnit, supplierSku } of byKey.values()) {
		const resolved = await resolveOne(tx, restaurantId, supplierId, raw, key, unit, category, unitsPerPack, baseUnit, supplierSku);
		for (const line of lines) {
			if (normalizeProductKey((line.description ?? '').trim()) === key) {
				out.set(line.description ?? '', resolved);
			}
		}
	}
	return out;
}

async function resolveOne(
	tx: BatchDb,
	restaurantId: string,
	supplierId: number | null,
	raw: string,
	key: string,
	unit: string | null,
	category: string | null,
	unitsPerPack: number | null,
	baseUnit: string | null,
	supplierSku: string | null = null,
): Promise<ResolvedLine> {
	if (supplierSku && supplierId != null) {
		const skuRows = await tx.execute<{ product_id: number }>(sql`
			SELECT product_id FROM product_aliases
			WHERE restaurant_id = ${restaurantId} AND supplier_id = ${supplierId} AND supplier_sku = ${supplierSku}
			LIMIT 1
		`);
		if (skuRows.length > 0) {
			return { productId: skuRows[0].product_id, status: 'exact' };
		}
	}

	const aliasRows = await tx.execute<{ product_id: number }>(sql`
		SELECT product_id FROM product_aliases
		WHERE restaurant_id = ${restaurantId} AND raw_key = ${key}
		LIMIT 1
	`);
	if (aliasRows.length > 0) {
		return { productId: aliasRows[0].product_id, status: 'exact' };
	}

	const expandedKey = normalizeProductKey(expandAbbreviations(raw));
	const altKey = expandedKey && expandedKey !== key ? expandedKey : key;
	const fuzzyRows = await tx.execute<{ id: number; canonical_name: string; score: number }>(sql`
		SELECT id, canonical_name,
		       GREATEST(similarity(name_key, ${key}), similarity(name_key, ${altKey})) AS score
		FROM products
		WHERE restaurant_id = ${restaurantId}
		  AND GREATEST(similarity(name_key, ${key}), similarity(name_key, ${altKey})) >= ${FUZZY_THRESHOLD}
		ORDER BY score DESC
		LIMIT 1
	`);
	if (fuzzyRows.length > 0) {
		const candidate = fuzzyRows[0];
		await insertAlias(tx, restaurantId, candidate.id, supplierId, key, raw, 'fuzzy', null, supplierSku);
		return {
			productId: candidate.id,
			status: 'fuzzy',
			suggestion: { candidateName: candidate.canonical_name, score: Number(candidate.score) },
		};
	}

	const productRows = await tx.execute<{ id: number }>(sql`
		INSERT INTO products (restaurant_id, canonical_name, name_key, category, canonical_unit, units_per_pack, base_unit)
		VALUES (${restaurantId}, ${raw}, ${key}, ${category}, ${unit}, ${unitsPerPack}, ${baseUnit})
		ON CONFLICT (restaurant_id, name_key) DO UPDATE SET name_key = products.name_key
		RETURNING id
	`);
	const productId = productRows[0].id;
	await insertAlias(tx, restaurantId, productId, supplierId, key, raw, 'exact', 'now()', supplierSku);
	return { productId, status: 'created' };
}

async function insertAlias(
	tx: BatchDb,
	restaurantId: string,
	productId: number,
	supplierId: number | null,
	rawKey: string,
	rawText: string,
	source: 'exact' | 'fuzzy',
	confirmedAt: 'now()' | null,
	supplierSku: string | null = null,
): Promise<void> {
	const confirmedExpr = confirmedAt === 'now()' ? sql`now()` : sql`NULL`;
	await tx.execute(sql`
		INSERT INTO product_aliases (restaurant_id, product_id, supplier_id, raw_key, raw_text, supplier_sku, source, confirmed_at)
		VALUES (${restaurantId}, ${productId}, ${supplierId}, ${rawKey}, ${rawText}, ${supplierSku}, ${source}, ${confirmedExpr})
		ON CONFLICT (restaurant_id, raw_key) DO NOTHING
	`);
}

export type AliasDecision =
	| { ok: true; productId: number }
	| { ok: false; reason: 'not_found' };

export interface LinkedSupplier {
	supplierId: number;
	supplierName: string;
}

export async function getLinkedSuppliers(
	database: Database,
	restaurantId: string,
	productId: number,
): Promise<LinkedSupplier[]> {
	const rows = await database.execute<{ supplier_id: number; supplier_name: string }>(sql`
		SELECT DISTINCT s.id AS supplier_id, s.name AS supplier_name
		FROM product_aliases a
		JOIN suppliers s ON s.id = a.supplier_id
		WHERE a.restaurant_id = ${restaurantId} AND a.product_id = ${productId} AND a.supplier_id IS NOT NULL
		ORDER BY s.name
	`);
	return rows.map((r) => ({ supplierId: r.supplier_id, supplierName: r.supplier_name }));
}

export async function unlinkSupplier(
	database: Database,
	restaurantId: string,
	productId: number,
	supplierId: number,
): Promise<void> {
	await database.transaction(async (tx) => {
		await tx.execute(sql`
			UPDATE invoice_line_items
			SET product_id = NULL
			WHERE restaurant_id = ${restaurantId}
			  AND product_id = ${productId}
			  AND invoice_id IN (
			    SELECT id FROM invoices WHERE restaurant_id = ${restaurantId} AND supplier_id = ${supplierId}
			  )
		`);
		await tx.execute(sql`
			DELETE FROM product_aliases
			WHERE restaurant_id = ${restaurantId} AND product_id = ${productId} AND supplier_id = ${supplierId}
		`);
	});
}

export type DeleteProductResult =
	| { ok: true }
	| { ok: false; reason: 'linked'; suppliers: LinkedSupplier[] }
	| { ok: false; reason: 'not_found' };

export async function deleteProduct(
	database: Database,
	restaurantId: string,
	productId: number,
): Promise<DeleteProductResult> {
	const existing = await database.execute<{ id: number }>(sql`
		SELECT id FROM products WHERE id = ${productId} AND restaurant_id = ${restaurantId} LIMIT 1
	`);
	if (existing.length === 0) return { ok: false, reason: 'not_found' };

	const linkedLineItems = await database.execute<{ count: number }>(sql`
		SELECT count(*)::int AS count FROM invoice_line_items
		WHERE restaurant_id = ${restaurantId} AND product_id = ${productId}
	`);
	const linkedAliases = await database.execute<{ count: number }>(sql`
		SELECT count(*)::int AS count FROM product_aliases
		WHERE restaurant_id = ${restaurantId} AND product_id = ${productId}
	`);
	if (linkedLineItems[0].count > 0 || linkedAliases[0].count > 0) {
		return { ok: false, reason: 'linked', suppliers: await getLinkedSuppliers(database, restaurantId, productId) };
	}

	await database.execute(sql`
		DELETE FROM products WHERE id = ${productId} AND restaurant_id = ${restaurantId}
	`);
	return { ok: true };
}

export async function resolveUnitConversionAlerts(
	database: Database,
	restaurantId: string,
	productId: number,
): Promise<void> {
	await database.execute(sql`
		UPDATE system_notifications
		SET status = 'sent'
		WHERE restaurant_id = ${restaurantId}
		  AND notification_type = 'unit_conversion_needed'
		  AND status = 'pending'
		  AND mep_norm_key(payload::json->>'ingredient') IN (
		    SELECT raw_key FROM product_aliases WHERE restaurant_id = ${restaurantId} AND product_id = ${productId}
		    UNION
		    SELECT name_key FROM products WHERE id = ${productId} AND restaurant_id = ${restaurantId}
		  )
	`);
}

export async function confirmProductAlias(
	database: Database,
	restaurantId: string,
	description: string,
): Promise<AliasDecision> {
	const rawKey = normalizeProductKey(description);
	const rows = await database.execute<{ product_id: number }>(sql`
		UPDATE product_aliases
		SET source = 'user', confirmed_at = COALESCE(confirmed_at, now())
		WHERE restaurant_id = ${restaurantId} AND raw_key = ${rawKey}
		RETURNING product_id
	`);
	if (rows.length === 0) return { ok: false, reason: 'not_found' };
	return { ok: true, productId: rows[0].product_id };
}

export async function rejectProductAlias(
	database: Database,
	restaurantId: string,
	description: string,
): Promise<AliasDecision> {
	const rawKey = normalizeProductKey(description);
	return database.transaction(async (tx) => {
		const aliasRows = await tx.execute<{ id: number; product_id: number; raw_text: string | null }>(sql`
			SELECT id, product_id, raw_text FROM product_aliases
			WHERE restaurant_id = ${restaurantId} AND raw_key = ${rawKey}
			LIMIT 1
		`);
		if (aliasRows.length === 0) return { ok: false, reason: 'not_found' } as AliasDecision;
		const alias = aliasRows[0];

		const created = await tx.execute<{ id: number }>(sql`
			INSERT INTO products (restaurant_id, canonical_name, name_key)
			VALUES (${restaurantId}, ${alias.raw_text ?? description.trim()}, ${rawKey})
			ON CONFLICT (restaurant_id, name_key) DO UPDATE SET name_key = products.name_key
			RETURNING id
		`);
		const newProductId = created[0].id;

		await tx.execute(sql`
			UPDATE product_aliases
			SET product_id = ${newProductId}, source = 'user', confirmed_at = now()
			WHERE id = ${alias.id}
		`);

		await tx.execute(sql`
			UPDATE invoice_line_items
			SET product_id = ${newProductId}
			WHERE restaurant_id = ${restaurantId}
			  AND product_id = ${alias.product_id}
			  AND mep_norm_key(description) = ${rawKey}
		`);

		return { ok: true, productId: newProductId } as AliasDecision;
	});
}

export async function mergeIntoProduct(
	database: Database,
	restaurantId: string,
	description: string,
	targetProductId: number,
): Promise<AliasDecision> {
	const rawKey = normalizeProductKey(description);
	return database.transaction(async (tx) => {
		const targetRows = await tx.execute<{ id: number }>(sql`
			SELECT id FROM products WHERE id = ${targetProductId} AND restaurant_id = ${restaurantId} LIMIT 1
		`);
		if (targetRows.length === 0) return { ok: false, reason: 'not_found' } as AliasDecision;

		const aliasRows = await tx.execute<{ id: number; product_id: number }>(sql`
			SELECT id, product_id FROM product_aliases
			WHERE restaurant_id = ${restaurantId} AND raw_key = ${rawKey}
			LIMIT 1
		`);
		if (aliasRows.length === 0) return { ok: false, reason: 'not_found' } as AliasDecision;
		const alias = aliasRows[0];
		const oldProductId = alias.product_id;

		if (oldProductId !== targetProductId) {
			await tx.execute(sql`
				UPDATE product_aliases
				SET product_id = ${targetProductId}, source = 'user', confirmed_at = now()
				WHERE id = ${alias.id}
			`);
			await tx.execute(sql`
				UPDATE invoice_line_items
				SET product_id = ${targetProductId}
				WHERE restaurant_id = ${restaurantId}
				  AND product_id = ${oldProductId}
				  AND mep_norm_key(description) = ${rawKey}
			`);
			await tx.execute(sql`
				DELETE FROM products p
				WHERE p.id = ${oldProductId} AND p.restaurant_id = ${restaurantId}
				  AND NOT EXISTS (SELECT 1 FROM product_aliases a WHERE a.product_id = p.id)
				  AND NOT EXISTS (SELECT 1 FROM invoice_line_items li WHERE li.product_id = p.id)
			`);
		} else {
			await tx.execute(sql`
				UPDATE product_aliases SET source = 'user', confirmed_at = COALESCE(confirmed_at, now())
				WHERE id = ${alias.id}
			`);
		}

		return { ok: true, productId: targetProductId } as AliasDecision;
	});
}

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
	const fenceEnd = trimmed.trimEnd().endsWith('```') ? -1 : undefined;
	const body = trimmed.startsWith('```')
		? trimmed.split('\n').slice(1, fenceEnd).join('\n')
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
	provider?: ReturnType<typeof createGeminiProvider>;
	recordUsage?: typeof recordLlmUsage;
	recordFailure?: typeof recordDeadLetter;
}

export async function applyExtractedAllergens(
	rid: string,
	productId: number,
	codes: string[]
): Promise<boolean> {
	const allergens = toAllergenList(codes);
	if (allergens.length === 0) return false;

	const rows = await db.execute<{ id: number; canonical_name: string }>(sql`
		UPDATE products
		SET allergens = ${JSON.stringify(allergens)}::jsonb, allergens_source = 'extracted'
		WHERE restaurant_id = ${rid}
			AND id = ${productId}
			AND allergens_source IS DISTINCT FROM 'manual'
			AND jsonb_array_length(allergens) = 0
		RETURNING id, canonical_name
	`);
	return rows.length > 0;
}

export async function processNormalizeJob(data: NormalizeJobData, deps: NormalizeDeps = {}): Promise<void> {
	const { restaurantId, productId, rawText } = data;
	try {
		const provider = deps.provider ?? (GEMINI_API_KEY ? createGeminiProvider() : null);
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
			message: `product_suggestion: ${rawText} ~ ${candidate.name} (llm)`,
			payload: JSON.stringify({
				description: rawText,
				productId,
				candidateName: candidate.name,
				candidateProductId: candidate.id,
				score: Math.round(verdict.confidence * 100) / 100,
				source: 'llm',
				messageKey: 'notif.msg.productSuggestionAi',
				messageVars: { description: rawText, candidateName: candidate.name },
			}),
			status: 'pending',
		});
	} catch (err) {
		console.error('[normalize] product normalization job failed (non-fatal):', err);
		await (deps.recordFailure ?? recordDeadLetter)({
			queue: NORMALIZE_QUEUE,
			error: err,
			restaurantId,
			sourceId: `${restaurantId}:${productId}`,
			payload: { restaurantId, productId, rawText },
		});
	}
}
