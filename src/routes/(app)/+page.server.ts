import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { randomBytes } from 'crypto';
import path from 'node:path';
import { saveUploadedFiles } from '$lib/server/sessions';
import { createBatch, getItem, getBatchItems, markQueued } from '$lib/server/batch';
import { enqueueExtraction } from '$lib/server/queue';
import { enqueueBatchExtraction } from '$lib/server/extract-batch';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { trackEvent } from '$lib/server/events';
import { db, forTenant } from '$lib/server/db';
import { invoices } from '$lib/server/schema';
import { and, isNull, sql } from 'drizzle-orm';

async function remainingMonthlyQuota(rid: string, limit: number | null): Promise<number | null> {
	if (limit === null) return null;
	try {
		const tdb = forTenant(rid);

		const [usedRow] = await db
			.select({ cnt: sql<number>`COUNT(*)::int` })
			.from(invoices)
			.where(and(
				tdb.scope(invoices.restaurantId),
				isNull(invoices.deletedAt),
				sql`TO_CHAR(${invoices.createdAt}, 'YYYY-MM') = TO_CHAR(NOW(), 'YYYY-MM')`,
			));
		return Math.max(0, limit - (usedRow?.cnt ?? 0));
	} catch (err) {
		console.error('[upload] quota check failed (allowing upload):', err);
		return null;
	}
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function rejectInvalidFiles(files: File[]) {
	if (files.length === 0) {
		return fail(400, { error: 'upload.err.noValidFiles' });
	}
	const oversized = files.filter(f => f.size > MAX_UPLOAD_BYTES);
	if (oversized.length > 0) {
		return fail(400, {
			error: 'upload.err.tooLarge',
			errorVars: { names: oversized.map(f => f.name).join(', ') },
		});
	}
	return null;
}

function rejectSavedNothing(errors: Awaited<ReturnType<typeof saveUploadedFiles>>['errors']) {
	const first = errors[0];
	if (!first) return fail(400, { error: 'upload.err.noValidFiles' });
	return fail(400, {
		error: `upload.reject.${first.reason}`,
		errorVars: { name: first.name, ext: first.ext ?? '' },
	});
}

export const load: PageServerLoad = async ({ url }) => {
	const remaining = Number(url.searchParams.get('remaining'));
	return {
		title: 'upload.title',
		error: url.searchParams.get('error') ?? null,
		errorVars: Number.isFinite(remaining) && remaining > 0 ? { n: remaining } : undefined,
		saved: url.searchParams.get('saved') === '1',
		duplicate: url.searchParams.get('duplicate_inv') === '1',
		upgradeUrl: url.searchParams.get('upgrade') === '1' ? '/billing' : null,
	};
};

export const actions: Actions = {
	upload: async ({ request, locals }) => {
		const rid = locals.restaurantId;
		if (!rid) return fail(403, { error: 'upload.err.noRestaurant' });

		const entitlements = await locals.entitlements();
		const access = entitlements?.access;
		if (access && !access.allowed) {
			redirect(303, `/billing?upgrade=${access.trialExpired ? 'trial' : 'inactive'}`);
		}

		let formData: FormData;
		try {
			formData = await request.formData();
		} catch {
			return fail(400, { error: 'upload.err.formParse' });
		}

		const rawFiles = formData.getAll('files');
		const files = rawFiles.filter((f): f is File => typeof f !== 'string' && (f as Blob).size > 0);

		const invalidFiles = rejectInvalidFiles(files);
		if (invalidFiles) return invalidFiles;

		if (!(await rateLimitScoped({ scope: 'tenant', name: 'upload', max: 10 }, { restaurantId: rid }))) {
			return fail(429, { error: 'upload.err.rateLimited' });
		}

		const remaining = await remainingMonthlyQuota(rid, entitlements?.monthlyQuota ?? null);
		if (remaining !== null && files.length > remaining) {
			redirect(303, remaining === 0
				? '/?error=upload.err.quotaExhausted&upgrade=1'
				: `/?error=upload.err.quotaRemaining&remaining=${remaining}&upgrade=1`);
		}

		const namespace = randomBytes(16).toString('hex');

		let saved: string[];
		let keys: string[];
		let errors: Awaited<ReturnType<typeof saveUploadedFiles>>['errors'];
		try {
			({ saved, keys, errors } = await saveUploadedFiles(files, namespace));
		} catch (err) {
			console.error('[upload] file save failed:', err);
			return fail(500, { error: 'upload.err.saveFailed' });
		}

		if (saved.length === 0) return rejectSavedNothing(errors);

		const { batchId, itemIds } = await createBatch(rid, saved.map((name, i) => ({ key: keys[i], name })));

		await enqueueBatchExtraction(itemIds[0], rid, {
			getItem,
			getBatchItems,
			markQueued,
			enqueue: enqueueExtraction,
		});

		const exts = [...new Set(saved.map(f => path.extname(f).toLowerCase()))];
		trackEvent('file_uploaded', rid, { count: saved.length, exts });

		redirect(303, `/batch/${batchId}`);
	},
};
