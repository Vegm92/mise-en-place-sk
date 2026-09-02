import { asc, count, eq } from 'drizzle-orm';
import { db, forTenant } from './db';
import type { BatchDb } from './batch';
import { categories, categoryBudgets, products, suppliers } from './schema';
import {
	MIN_CATEGORY_CONFIDENCE, UNCATEGORIZED_CATEGORY, VALID_CATEGORIES,
	categoryKey, categorySlug, resolveCategory,
} from '$lib/constants';

export type CategoryRow = typeof categories.$inferSelect;

export type CreateCategoryResult =
	| { ok: true; category: CategoryRow }
	| { ok: false; reason: 'duplicate' | 'invalid' | 'reserved' };

const MAX_NAME_LENGTH = 60;
const RESERVED_KEY = categoryKey(UNCATEGORIZED_CATEGORY);
const DEFAULT_SEED = VALID_CATEGORIES.filter((name) => name !== UNCATEGORIZED_CATEGORY);

function isUniqueViolation(err: unknown): boolean {
	return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

function validateName(raw: string):
	| { ok: true; name: string; key: string }
	| { ok: false; reason: 'invalid' | 'reserved' } {
	const name = raw.trim();
	if (!name || name.length > MAX_NAME_LENGTH) return { ok: false, reason: 'invalid' };
	const key = categoryKey(name);
	if (key === RESERVED_KEY) return { ok: false, reason: 'reserved' };
	return { ok: true, name, key };
}

async function nextSortOrder(rid: string, exec: BatchDb): Promise<number> {
	const tenant = forTenant(rid);
	const [row] = await exec.select({ total: count() }).from(categories)
		.where(tenant.scope(categories.restaurantId));
	return Number(row.total);
}

export async function seedDefaultCategories(rid: string, exec: BatchDb = db): Promise<void> {
	if (DEFAULT_SEED.length === 0) return;
	await exec.insert(categories)
		.values(DEFAULT_SEED.map((name, index) => ({
			restaurantId: rid,
			name,
			nameKey: categoryKey(name),
			slug: categorySlug(name),
			sortOrder: index,
			isDefault: true,
		})))
		.onConflictDoNothing({ target: [categories.restaurantId, categories.nameKey] });
}

export async function listCategories(
	rid: string,
	opts: { includeHidden?: boolean } = {},
	exec: BatchDb = db,
): Promise<CategoryRow[]> {
	const tenant = forTenant(rid);
	const extra = opts.includeHidden ? undefined : eq(categories.hidden, false);
	return exec.select().from(categories)
		.where(tenant.scope(categories.restaurantId, extra))
		.orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function createCategory(rid: string, name: string, exec: BatchDb = db): Promise<CreateCategoryResult> {
	const validated = validateName(name);
	if (!validated.ok) return validated;
	const tenant = forTenant(rid);

	const [existing] = await exec.select({ id: categories.id }).from(categories)
		.where(tenant.scope(categories.restaurantId, eq(categories.nameKey, validated.key)))
		.limit(1);
	if (existing) return { ok: false, reason: 'duplicate' };

	try {
		const [created] = await exec.insert(categories)
			.values({
				restaurantId: rid,
				name: validated.name,
				nameKey: validated.key,
				slug: categorySlug(validated.name),
				sortOrder: await nextSortOrder(rid, exec),
				isDefault: false,
			})
			.returning();
		return { ok: true, category: created };
	} catch (err) {
		if (isUniqueViolation(err)) return { ok: false, reason: 'duplicate' };
		throw err;
	}
}

export async function renameCategory(
	rid: string,
	id: number,
	name: string,
	exec: BatchDb = db,
): Promise<CreateCategoryResult> {
	const validated = validateName(name);
	if (!validated.ok) return validated;
	const tenant = forTenant(rid);

	return exec.transaction(async (tx) => {
		const [current] = await tx.select().from(categories)
			.where(tenant.scope(categories.restaurantId, eq(categories.id, id)))
			.limit(1);
		if (!current) return { ok: false, reason: 'invalid' };

		if (current.nameKey !== validated.key) {
			const [existing] = await tx.select({ id: categories.id }).from(categories)
				.where(tenant.scope(categories.restaurantId, eq(categories.nameKey, validated.key)))
				.limit(1);
			if (existing) return { ok: false, reason: 'duplicate' };
		}

		const oldName = current.name;
		let updated: CategoryRow;
		try {
			[updated] = await tx.update(categories)
				.set({ name: validated.name, nameKey: validated.key, slug: categorySlug(validated.name) })
				.where(tenant.scope(categories.restaurantId, eq(categories.id, id)))
				.returning();
		} catch (err) {
			if (isUniqueViolation(err)) return { ok: false, reason: 'duplicate' };
			throw err;
		}

		if (oldName !== validated.name) {
			await tx.update(suppliers).set({ category: validated.name })
				.where(tenant.scope(suppliers.restaurantId, eq(suppliers.category, oldName)));
			await tx.update(products).set({ category: validated.name })
				.where(tenant.scope(products.restaurantId, eq(products.category, oldName)));
			await tx.update(categoryBudgets).set({ category: validated.name })
				.where(tenant.scope(categoryBudgets.restaurantId, eq(categoryBudgets.category, oldName)));
		}

		return { ok: true, category: updated };
	});
}

export async function setCategoryHidden(rid: string, id: number, hidden: boolean, exec: BatchDb = db): Promise<void> {
	const tenant = forTenant(rid);
	await exec.update(categories).set({ hidden })
		.where(tenant.scope(categories.restaurantId, eq(categories.id, id)));
}

export async function resolveCategoryFor(
	rid: string,
	proposed: unknown,
	confidence?: number | null,
	exec: BatchDb = db,
): Promise<string> {
	const visible = await listCategories(rid, { includeHidden: false }, exec);
	const visibleByKey = new Map(visible.map((c) => [c.nameKey, c.name]));

	const confident = !(typeof confidence === 'number' && !Number.isNaN(confidence) && confidence < MIN_CATEGORY_CONFIDENCE);
	if (typeof proposed === 'string' && confident) {
		const match = visibleByKey.get(categoryKey(proposed));
		if (match) return match;
	}

	const fallback = resolveCategory(proposed, confidence);
	if (fallback === UNCATEGORIZED_CATEGORY) return UNCATEGORIZED_CATEGORY;
	return visibleByKey.has(categoryKey(fallback)) ? fallback : UNCATEGORIZED_CATEGORY;
}
