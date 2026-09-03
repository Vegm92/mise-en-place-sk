import { sql, and, eq, isNull, or } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db, forTenant } from './db';
import type { BatchDb } from './batch';
import * as schema from './schema';
import { unitConversions, systemNotifications, invoiceLineItems, productAliases } from './schema';
import { normalizeProductKey, canonicalizeUnit } from './normalize';
import { categoryGuideBlock } from './category-guide';
import { parseJsonResponse } from './llm-json';
import { UNCATEGORIZED_CATEGORY, resolveCategory } from '$lib/constants';
import { resolveCategoryFor } from './categories';
import { GEMINI_API_KEY } from './env';
import { createGeminiProvider, Type, type Schema } from './llm-provider';
import { recordLlmUsage } from './llm-quota';
import { recordDeadLetter } from './dead-letter';
import { CATEGORIZE_QUEUE, NORMALIZE_QUEUE } from './queue';
import { renderTemplate } from '$lib/i18n-messages';
import { toAllergenList } from '$lib/recipes';
import { moneyToNullableNumber } from './money';
import { yoyChangeForYear, type YearlyPriceInput } from '$lib/price-yoy';

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

function parseNotificationPayload(raw: unknown): Record<string, unknown> | null {
	return raw && typeof raw === 'object' ? raw as Record<string, unknown> : null;
}

export async function loadConversionPrompts(
	database: Database,
	restaurantId: string,
): Promise<ConversionPrompt[]> {
	const [alertRows, ruleRows] = await Promise.all([
		database.execute<{ id: number; payload: unknown }>(sql`
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

type YearlyPriceDbRow = {
	year: number;
	unit_price: string | number | null;
	normalized_unit_price: string | number | null;
	unit: string | null;
};

function toYearlyPriceInput(row: YearlyPriceDbRow): YearlyPriceInput {
	return {
		year: Number(row.year),
		unitPrice: moneyToNullableNumber(row.unit_price),
		normalizedUnitPrice: moneyToNullableNumber(row.normalized_unit_price),
		unit: row.unit,
	};
}

export async function loadProductYearlyPrices(
	database: Database,
	restaurantId: string,
	productId: number,
): Promise<YearlyPriceInput[]> {
	const rows = await database.execute<YearlyPriceDbRow>(sql`
		SELECT DISTINCT ON (EXTRACT(YEAR FROM i.invoice_date))
			EXTRACT(YEAR FROM i.invoice_date)::int AS year,
			ili.unit_price,
			ili.normalized_unit_price,
			ili.unit
		FROM invoice_line_items ili
		JOIN invoices i ON i.id = ili.invoice_id
		WHERE ili.restaurant_id = ${restaurantId}
		  AND ili.product_id = ${productId}
		  AND i.invoice_date IS NOT NULL
		  AND i.deleted_at IS NULL
		ORDER BY EXTRACT(YEAR FROM i.invoice_date), i.invoice_date DESC, i.id DESC
	`);

	return rows.map(toYearlyPriceInput);
}

export async function loadCatalogYoyChangeMap(
	database: Database,
	restaurantId: string,
	currentYear: number,
): Promise<Map<number, number | null>> {
	const rows = await database.execute<YearlyPriceDbRow & { product_id: number }>(sql`
		SELECT product_id, year, unit_price, normalized_unit_price, unit FROM (
			SELECT
				ili.product_id AS product_id,
				EXTRACT(YEAR FROM i.invoice_date)::int AS year,
				ili.unit_price,
				ili.normalized_unit_price,
				ili.unit,
				ROW_NUMBER() OVER (
					PARTITION BY ili.product_id, EXTRACT(YEAR FROM i.invoice_date)
					ORDER BY i.invoice_date DESC, i.id DESC
				) AS rn
			FROM invoice_line_items ili
			JOIN invoices i ON i.id = ili.invoice_id
			WHERE ili.restaurant_id = ${restaurantId}
			  AND ili.product_id IS NOT NULL
			  AND i.invoice_date IS NOT NULL
			  AND i.deleted_at IS NULL
			  AND EXTRACT(YEAR FROM i.invoice_date) IN (${currentYear}, ${currentYear - 1})
		) yearly
		WHERE rn = 1
	`);

	const byProduct = new Map<number, YearlyPriceInput[]>();
	for (const row of rows) {
		const productId = Number(row.product_id);
		const list = byProduct.get(productId) ?? [];
		list.push(toYearlyPriceInput(row));
		byProduct.set(productId, list);
	}

	const result = new Map<number, number | null>();
	for (const [productId, list] of byProduct) {
		result.set(productId, yoyChangeForYear(list, currentYear));
	}
	return result;
}

export interface CatalogExportRow {
	id:             number;
	canonicalName:  string;
	category:       string | null;
	canonicalUnit:  string | null;
	unitPrice:      number | null;
}

type CatalogExportDbRow = {
	id:                     number;
	canonical_name:         string;
	category:               string | null;
	canonical_unit:         string | null;
	unit_price:             string | number | null;
	normalized_unit_price:  string | number | null;
};

export async function listCatalogForExport(
	database: Database,
	restaurantId: string,
): Promise<CatalogExportRow[]> {
	const rows = await database.execute<CatalogExportDbRow>(sql`
		SELECT
			p.id, p.canonical_name, p.category, p.canonical_unit,
			latest.unit_price, latest.normalized_unit_price
		FROM products p
		LEFT JOIN LATERAL (
			SELECT ili.unit_price, ili.normalized_unit_price
			FROM invoice_line_items ili
			JOIN invoices i ON i.id = ili.invoice_id
			WHERE ili.restaurant_id = ${restaurantId}
			  AND ili.product_id = p.id
			  AND i.invoice_date IS NOT NULL
			  AND i.deleted_at IS NULL
			ORDER BY i.invoice_date DESC, i.id DESC
			LIMIT 1
		) latest ON true
		WHERE p.restaurant_id = ${restaurantId}
		ORDER BY p.category NULLS LAST, p.canonical_name
	`);

	return rows.map((row) => ({
		id:            row.id,
		canonicalName: row.canonical_name,
		category:      row.category,
		canonicalUnit: row.canonical_unit,
		unitPrice:     moneyToNullableNumber(row.normalized_unit_price) ?? moneyToNullableNumber(row.unit_price),
	}));
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
		SET requires_unit_conversion = false,
		    canonical_unit = ${canonicalUnit}
		WHERE restaurant_id = ${restaurantId}
		  AND requires_unit_conversion = true
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
		  AND mep_norm_key(payload->>'ingredient') = ${ingredientKey}
		  AND mep_norm_key(payload->>'purchaseUnit') = ${purchaseUnitKey}
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
	taxRate?: number | null;
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

	const lineEntries = lines.map((l) => {
		const raw = (l.description ?? '').trim();
		const key = normalizeProductKey(raw);
		return { desc: l.description ?? '', raw, key };
	});

	const byKey = new Map<string, {
		raw: string; key: string; unit: string | null; category: string | null;
		unitsPerPack: number | null; baseUnit: string | null; supplierSku: string | null;
	}>();
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const { raw, key } = lineEntries[i];
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
		for (const entry of lineEntries) {
			if (entry.key === key) {
				out.set(entry.desc, resolved);
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
		INSERT INTO product_aliases (restaurant_id, product_id, supplier_id, raw_key, raw_text, supplier_sku, source, original_source, confirmed_at)
		VALUES (${restaurantId}, ${productId}, ${supplierId}, ${rawKey}, ${rawText}, ${supplierSku}, ${source}, ${source}, ${confirmedExpr})
		ON CONFLICT (restaurant_id, raw_key) DO NOTHING
	`);
}

export type ProductMatchStatus = 'exact' | 'fuzzy' | 'new';

export interface ProductMatch {
	description: string;
	productId: number | null;
	productName: string;
	status: ProductMatchStatus;
	score: number | null;
}

export interface ProductMatchInput {
	description: string;
	supplierSku?: string | null;
}

export async function previewLineProducts(
	database: Database,
	restaurantId: string,
	supplierId: number | null,
	lines: ProductMatchInput[],
): Promise<ProductMatch[]> {
	const out: ProductMatch[] = [];
	const seen = new Map<string, ProductMatch>();

	for (const line of lines) {
		const raw = (line.description ?? '').trim();
		const key = normalizeProductKey(raw);
		if (!key) {
			out.push({ description: raw, productId: null, productName: raw, status: 'new', score: null });
			continue;
		}
		const cached = seen.get(key);
		if (cached) {
			out.push({ ...cached, description: raw });
			continue;
		}
		const match = await previewOne(database, restaurantId, supplierId, raw, key, line.supplierSku ?? null);
		seen.set(key, match);
		out.push(match);
	}
	return out;
}

async function previewOne(
	database: Database,
	restaurantId: string,
	supplierId: number | null,
	raw: string,
	key: string,
	supplierSku: string | null,
): Promise<ProductMatch> {
	const aliasRows = await database.execute<{ product_id: number; canonical_name: string }>(sql`
		SELECT a.product_id, p.canonical_name
		FROM product_aliases a
		JOIN products p ON p.id = a.product_id AND p.restaurant_id = a.restaurant_id
		WHERE a.restaurant_id = ${restaurantId}
		  AND (
		    a.raw_key = ${key}
		    OR (${supplierSku}::text IS NOT NULL AND ${supplierId}::int IS NOT NULL
		        AND a.supplier_id = ${supplierId} AND a.supplier_sku = ${supplierSku})
		  )
		ORDER BY (a.raw_key = ${key}) DESC
		LIMIT 1
	`);
	if (aliasRows.length > 0) {
		return {
			description: raw,
			productId: aliasRows[0].product_id,
			productName: aliasRows[0].canonical_name,
			status: 'exact',
			score: null,
		};
	}

	const expandedKey = normalizeProductKey(expandAbbreviations(raw));
	const altKey = expandedKey && expandedKey !== key ? expandedKey : key;
	const fuzzyRows = await database.execute<{ id: number; canonical_name: string; score: number }>(sql`
		SELECT id, canonical_name,
		       GREATEST(similarity(name_key, ${key}), similarity(name_key, ${altKey})) AS score
		FROM products
		WHERE restaurant_id = ${restaurantId}
		  AND GREATEST(similarity(name_key, ${key}), similarity(name_key, ${altKey})) >= ${FUZZY_THRESHOLD}
		ORDER BY score DESC
		LIMIT 1
	`);
	if (fuzzyRows.length > 0) {
		return {
			description: raw,
			productId: fuzzyRows[0].id,
			productName: fuzzyRows[0].canonical_name,
			status: 'fuzzy',
			score: Number(fuzzyRows[0].score),
		};
	}

	return { description: raw, productId: null, productName: raw, status: 'new', score: null };
}

export async function getProductName(
	database: BatchDb,
	restaurantId: string,
	productId: number,
): Promise<string | null> {
	const rows = await database.execute<{ canonical_name: string }>(sql`
		SELECT canonical_name FROM products
		WHERE id = ${productId} AND restaurant_id = ${restaurantId}
		LIMIT 1
	`);
	return rows[0]?.canonical_name ?? null;
}

export interface ProductOption {
	id: number;
	name: string;
}

export async function listProductOptions(
	database: Database,
	restaurantId: string,
	limit = 500,
): Promise<ProductOption[]> {
	const rows = await database.execute<{ id: number; canonical_name: string }>(sql`
		SELECT id, canonical_name FROM products
		WHERE restaurant_id = ${restaurantId}
		ORDER BY canonical_name
		LIMIT ${limit}
	`);
	return rows.map((r) => ({ id: r.id, name: r.canonical_name }));
}

export async function assignLineProduct(
	database: BatchDb,
	restaurantId: string,
	supplierId: number | null,
	description: string,
	productId: number,
): Promise<{ productId: number; productName: string } | null> {
	const raw = (description ?? '').trim();
	const key = normalizeProductKey(raw);
	if (!key) return null;

	const owned = await database.execute<{ id: number; canonical_name: string }>(sql`
		SELECT id, canonical_name FROM products
		WHERE id = ${productId} AND restaurant_id = ${restaurantId}
		LIMIT 1
	`);
	if (owned.length === 0) return null;

	await database.execute(sql`
		INSERT INTO product_aliases (restaurant_id, product_id, supplier_id, raw_key, raw_text, source, original_source, confirmed_at)
		VALUES (${restaurantId}, ${productId}, ${supplierId}, ${key}, ${raw}, 'user', 'user', now())
		ON CONFLICT (restaurant_id, raw_key)
		DO UPDATE SET
			product_id = ${productId}, source = 'user', confirmed_at = now(),
			review_outcome = CASE
				WHEN product_aliases.original_source = 'fuzzy' AND product_aliases.review_outcome IS NULL
					THEN (CASE WHEN product_aliases.product_id = ${productId} THEN 'confirmed' ELSE 'rejected' END)
				ELSE product_aliases.review_outcome
			END
	`);

	return { productId, productName: owned[0].canonical_name };
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

	const tdb = forTenant(restaurantId);
	const linkedLineItems = await database.$count(invoiceLineItems, tdb.scope(
		invoiceLineItems.restaurantId,
		eq(invoiceLineItems.productId, productId),
	));
	const linkedAliases = await database.$count(productAliases, tdb.scope(
		productAliases.restaurantId,
		eq(productAliases.productId, productId),
	));
	if (linkedLineItems > 0 || linkedAliases > 0) {
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
		  AND mep_norm_key(payload->>'ingredient') IN (
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
		SET source = 'user', confirmed_at = COALESCE(confirmed_at, now()),
			review_outcome = CASE
				WHEN original_source = 'fuzzy' AND review_outcome IS NULL THEN 'confirmed'
				ELSE review_outcome
			END
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
			SET product_id = ${newProductId}, source = 'user', confirmed_at = now(),
				review_outcome = CASE
					WHEN original_source = 'fuzzy' AND review_outcome IS NULL THEN 'rejected'
					ELSE review_outcome
				END
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
				SET product_id = ${targetProductId}, source = 'user', confirmed_at = now(),
					review_outcome = CASE
						WHEN original_source = 'fuzzy' AND review_outcome IS NULL THEN 'rejected'
						ELSE review_outcome
					END
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
				UPDATE product_aliases
				SET source = 'user', confirmed_at = COALESCE(confirmed_at, now()),
					review_outcome = CASE
						WHEN original_source = 'fuzzy' AND review_outcome IS NULL THEN 'confirmed'
						ELSE review_outcome
					END
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

const NORMALIZE_VERDICT_SCHEMA: Schema = {
	type: Type.OBJECT,
	properties: {
		match_id: { type: Type.INTEGER, nullable: true },
		confidence: { type: Type.NUMBER },
	},
	required: ['match_id', 'confidence'],
};

function isRawNormalizeVerdict(value: unknown): value is { match_id?: unknown; confidence?: unknown } {
	return typeof value === 'object' && value !== null;
}

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
	let obj: { match_id?: unknown; confidence?: unknown };
	try {
		obj = parseJsonResponse(text, isRawNormalizeVerdict, 'Normalize');
	} catch {
		return { matchId: null, confidence: 0 };
	}
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

		const resp = await provider.generate(buildNormalizePrompt(rawText, candidates), undefined, undefined, NORMALIZE_VERDICT_SCHEMA);
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
			  AND mep_norm_key(payload->>'description') = ${rawKey}
			LIMIT 1
		`);
		if (existing.length > 0) return;

		const productSuggestionAiVars = { description: rawText, candidateName: candidate.name };
		await db.insert(systemNotifications).values({
			restaurantId,
			notificationType: 'product_suggestion',
			message: renderTemplate('es', 'notif.msg.productSuggestionAi', productSuggestionAiVars),
			payload: {
				description: rawText,
				productId,
				candidateName: candidate.name,
				candidateProductId: candidate.id,
				score: Math.round(verdict.confidence * 100) / 100,
				source: 'llm',
				messageKey: 'notif.msg.productSuggestionAi',
				messageVars: productSuggestionAiVars,
			},
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

export interface CategorizeJobData {
	restaurantId: string;
	productId: number;
	canonicalName: string;
}

export function buildCategorizePrompt(canonicalName: string): string {
	return [
		'Eres un asistente de compras para restaurantes en España.',
		'Clasifica este producto de albarán en UNA categoría de compra:',
		`"${canonicalName}"`,
		'',
		'Las ÚNICAS categorías permitidas son las listadas entre los marcadores:',
		'<<<CATEGORY_VALUES>>>',
		categoryGuideBlock(),
		'<<<END_CATEGORY_VALUES>>>',
		'',
		'Reglas:',
		'- Copia el nombre EXACTAMENTE como aparece arriba (solo el nombre antes del guion), con acentos y mayúsculas.',
		'- Juzga qué es el producto, no quién lo vende: un distribuidor generalista sirve de todo.',
		'- Ten en cuenta abreviaturas y jerga del sector alimentario español',
		'  (p.ej. "MERL." = merluza, "TERN." = ternera, "S/H" = sin hueso).',
		'- Si la descripción es demasiado ambigua para decidir, responde category null.',
		'- Nunca inventes una categoría nueva ni devuelvas una traducción.',
		'',
		'Responde SOLO con JSON: {"category": <nombre o null>, "confidence": <0..1>}.',
	].join('\n');
}

const CATEGORIZE_VERDICT_SCHEMA: Schema = {
	type: Type.OBJECT,
	properties: {
		category: { type: Type.STRING, nullable: true },
		confidence: { type: Type.NUMBER },
	},
	required: ['category', 'confidence'],
};

function isRawCategorizeVerdict(value: unknown): value is { category?: unknown; confidence?: unknown } {
	return typeof value === 'object' && value !== null;
}

export function parseCategorizeResponse(text: string): string | null {
	let obj: { category?: unknown; confidence?: unknown };
	try {
		obj = parseJsonResponse(text, isRawCategorizeVerdict, 'Categorize');
	} catch {
		return null;
	}
	const confidence = typeof obj.confidence === 'number' ? obj.confidence : undefined;
	const resolved = resolveCategory(obj.category, confidence);
	return resolved === UNCATEGORIZED_CATEGORY ? null : resolved;
}

export interface CategorizeDeps {
	provider?: ReturnType<typeof createGeminiProvider>;
	recordUsage?: typeof recordLlmUsage;
	recordFailure?: typeof recordDeadLetter;
	database?: Database;
}

export async function processCategorizeJob(
	data: CategorizeJobData,
	deps: CategorizeDeps = {},
): Promise<void> {
	const { restaurantId, productId, canonicalName } = data;
	const database = deps.database ?? db;
	try {
		const pending = await database.execute<{ id: number }>(sql`
			SELECT id FROM products
			WHERE id = ${productId} AND restaurant_id = ${restaurantId} AND category IS NULL
			LIMIT 1
		`);
		if (pending.length === 0) return;

		const provider = deps.provider ?? (GEMINI_API_KEY ? createGeminiProvider() : null);
		if (!provider) return;

		const resp = await provider.generate(buildCategorizePrompt(canonicalName), undefined, undefined, CATEGORIZE_VERDICT_SCHEMA);
		const recordUsage = deps.recordUsage ?? recordLlmUsage;
		await recordUsage(restaurantId, resp.usage, 'categorize');

		const category = parseCategorizeResponse(resp.text);
		if (!category) return;

		const visibleCategory = await resolveCategoryFor(restaurantId, category, undefined, database);
		if (visibleCategory === UNCATEGORIZED_CATEGORY) return;

		await database.execute(sql`
			UPDATE products SET category = ${visibleCategory}
			WHERE id = ${productId} AND restaurant_id = ${restaurantId} AND category IS NULL
		`);
	} catch (err) {
		console.error('[categorize] product categorization job failed (non-fatal):', err);
		await (deps.recordFailure ?? recordDeadLetter)({
			queue: CATEGORIZE_QUEUE,
			error: err,
			restaurantId,
			sourceId: `${restaurantId}:${productId}`,
			payload: { restaurantId, productId, canonicalName },
		});
	}
}
