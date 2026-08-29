import { error, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import { db } from '$lib/server/db';
import { restaurants } from '$lib/server/schema';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { recipeSheetEmail, sendEmail } from '$lib/server/email';
import { trackEvent } from '$lib/server/events';
import { buildRecipeSheet } from '$lib/server/recipes-sheet';
import { translations } from '$lib/i18n';

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

function recipeId(params: { id: string }): number {
	const id = Number(params.id);
	if (!Number.isInteger(id)) error(404, 'Not found');
	return id;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const rid = locals.restaurantId!;
	const id = recipeId(params);

	return handleLoad('recipe-sheet', async () => {
		const doc = await buildRecipeSheet(rid, id, new Date());
		if (!doc) error(404, 'Not found');
		return {
			title: 'rec.sheet.title',
			doc,
			recipeId: id,
			defaultEmail: locals.user?.email ?? '',
		};
	});
};

export const actions: Actions = {
	sendSheet: async ({ params, request, locals }) => {
		const rid = locals.restaurantId!;
		const id = recipeId(params);

		const to = String((await request.formData()).get('to') ?? '').trim();
		if (!EMAIL_RE.test(to) || to.length > 254) {
			return fail(422, { error: 'rec.sheet.emailBad' });
		}
		if (!(await rateLimitScoped({ scope: 'tenant', name: 'recipe-email', max: 10, windowSeconds: 3600 }, { restaurantId: rid }))) {
			return fail(429, { error: 'rec.err.rateLimited' });
		}

		const doc = await buildRecipeSheet(rid, id, new Date());
		if (!doc) error(404, 'Not found');

		const [restaurant] = await db.select({ name: restaurants.name })
			.from(restaurants).where(eq(restaurants.id, rid)).limit(1);

		const es = translations.es;
		const label = (key: string) => (es as Record<string, string>)[key] ?? key;

		try {
			await sendEmail(recipeSheetEmail(to, restaurant?.name ?? '', {
				id,
				name: doc.name,
				subtitle: `${doc.portions} raciones`,
				kpis: [...doc.kpis, ...doc.secondaryKpis].map((k) => ({
					label: label(k.labelKey),
					value: k.value,
				})),
				lines: doc.lines.map((l) => ({
					name: l.name,
					qty: `${l.netQty} ${l.unit}`.trim(),
					amount: l.amount,
				})),
				total: doc.totalAmount,
				allergens: doc.allergens.map((a) => label(`rec.allergen.${a}`)),
			}));
		} catch {
			return fail(502, { error: 'rec.sheet.emailFailed' });
		}

		trackEvent('recipe_sheet_emailed', rid, { recipeId: id });
		return { sentTo: to };
	},
};
