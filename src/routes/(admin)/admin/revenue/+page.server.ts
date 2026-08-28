import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { handleLoad } from '$lib/server/load-guard';
import {
	COST_CATEGORIES,
	addAcquisitionCost,
	backfillMrrSnapshots,
	captureMrrSnapshot,
	deleteAcquisitionCost,
	isAssumptionKey,
	revenueOverview,
	saveAssumptions,
	type AssumptionValues,
	type CostCategory,
} from '$lib/server/revenue-metrics';
import { parseAmountCents } from '$lib/revenue-math';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_NOTE_LENGTH = 200;

export const load: PageServerLoad = async () => {
	return handleLoad('admin/revenue', async () => ({
		title: 'admin.rev.title',
		overview: await revenueOverview(),
		categories: COST_CATEGORIES,
	}));
};

export const actions: Actions = {
	addCost: async ({ request, locals }) => {
		const form = await request.formData();
		const month = String(form.get('month') ?? '').trim();
		const category = String(form.get('category') ?? '').trim();
		const amount = String(form.get('amount') ?? '');
		const note = String(form.get('note') ?? '').trim().slice(0, MAX_NOTE_LENGTH);

		if (!MONTH_PATTERN.test(month)) return fail(400, { error: 'admin.rev.err.month' });
		if (!(COST_CATEGORIES as readonly string[]).includes(category)) {
			return fail(400, { error: 'admin.rev.err.category' });
		}
		const amountCents = parseAmountCents(amount);
		if (amountCents === null) return fail(400, { error: 'admin.rev.err.amount' });

		await addAcquisitionCost({
			month,
			category: category as CostCategory,
			amountCents,
			note: note || null,
			createdBy: locals.user?.email ?? null,
		});
		return { saved: true };
	},

	deleteCost: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!Number.isInteger(id) || id <= 0) return fail(400, { error: 'admin.rev.err.notFound' });
		await deleteAcquisitionCost(id);
		return { deleted: true };
	},

	saveAssumptions: async ({ request, locals }) => {
		const form = await request.formData();
		const input: Partial<Record<keyof AssumptionValues, number>> = {};
		for (const [key, raw] of form.entries()) {
			if (!isAssumptionKey(key)) continue;
			const value = Number(String(raw).replace(',', '.'));
			if (!Number.isFinite(value)) return fail(400, { error: 'admin.rev.err.assumption' });
			input[key] = value;
		}
		await saveAssumptions(input, locals.user?.email ?? null);
		return { saved: true };
	},

	snapshot: async () => {
		const result = await captureMrrSnapshot();
		return { snapshot: result.tenants };
	},

	backfill: async () => {
		const result = await backfillMrrSnapshots();
		return { backfilled: result.rows };
	},
};
