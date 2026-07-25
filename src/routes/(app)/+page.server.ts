import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { randomBytes } from 'crypto';
import path from 'node:path';
import { saveUploadedFiles } from '$lib/server/sessions';
import { createBatch, getItem, getBatchItems, markQueued } from '$lib/server/batch';
import { enqueueExtraction } from '$lib/server/queue';
import { enqueueBatchExtraction } from '$lib/server/extract-batch';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { trackEvent } from '$lib/server/events';
import { db, forTenant } from '$lib/server/db';
import { invoices } from '$lib/server/schema';
import { and, isNull, sql } from 'drizzle-orm';
import { getAccessState, getMonthlyQuota } from '$lib/server/billing';

/**
 * Returns the number of invoices the tenant can still add this calendar month,
 * or null when no plan quota is configured (treated as unlimited). Best-effort:
 * never blocks the upload path on a DB error.
 */
async function remainingMonthlyQuota(rid: string): Promise<number | null> {
	try {
		const tdb = forTenant(rid);
		// Shared quota convention (issue #295) — null means unlimited.
		const limit = await getMonthlyQuota(rid);
		if (limit === null) return null;

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

export const load: PageServerLoad = async ({ url }) => {
	const remaining = Number(url.searchParams.get('remaining'));
	return {
		title: 'upload.title',
		// An i18n key (issue #294) — the panel translates it. `errorVars` carries
		// the interpolation values that survive a redirect.
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

		// A lapsed trial (or a cancelled/past-due subscription) may keep reading
		// its data, but must not start new paid work (issue #287). First thing in
		// the action: an expired tenant gets sent to /billing without uploading a
		// 20 MB file first, and never reaches the rate limiter or quota gate.
		const access = await getAccessState(rid);
		if (!access.allowed) {
			redirect(303, `/billing?upgrade=${access.trialExpired ? 'trial' : 'inactive'}`);
		}

		let formData: FormData;
		try {
			formData = await request.formData();
		} catch {
			return fail(400, { error: 'upload.err.formParse' });
		}

		const rawFiles = formData.getAll('files');
		// Use typeof check instead of instanceof — SvelteKit's internal File class may differ
		// from globalThis.File across Node.js versions, causing instanceof to silently drop files.
		const files = rawFiles.filter((f): f is File => typeof f !== 'string' && (f as Blob).size > 0);

		if (files.length === 0) {
			return fail(400, { error: 'upload.err.noValidFiles' });
		}

		const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
		const oversized = files.filter(f => f.size > MAX_UPLOAD_BYTES);
		if (oversized.length > 0) {
			return fail(400, {
				error: 'upload.err.tooLarge',
				errorVars: { names: oversized.map(f => f.name).join(', ') },
			});
		}

		// Each upload consumes a paid Gemini extraction — cap batch submissions
		// per tenant regardless of plan quota (quota is unlimited when unset).
		if (!(await checkRateLimit(`upload:${rid}`, 10))) {
			return fail(429, { error: 'upload.err.rateLimited' });
		}

		// Plan quota gate — block before consuming any Gemini extraction and send
		// the user to /billing to upgrade. Skipped when no quota is configured.
		// Uses a redirect (not fail) so the message + upgrade CTA render reliably
		// for both the XHR and no-JS submit paths via the page's error banner.
		const remaining = await remainingMonthlyQuota(rid);
		if (remaining !== null && files.length > remaining) {
			// Redirect (not fail) so the banner renders on both the XHR and no-JS
			// paths; the key and its interpolation value travel as query params.
			redirect(303, remaining === 0
				? '/?error=upload.err.quotaExhausted&upgrade=1'
				: `/?error=upload.err.quotaRemaining&remaining=${remaining}&upgrade=1`);
		}

		// Random storage namespace — generated before the batch exists so files
		// can be saved first; it does not need to match the batch id.
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

		if (saved.length === 0) {
			// Every file was rejected by validation — report the first reason with
			// the offending filename (issue #294); reasons are i18n keys.
			const first = errors[0];
			return first
				? fail(400, { error: `upload.reject.${first.reason}`, errorVars: { name: first.name, ext: first.ext ?? '' } })
				: fail(400, { error: 'upload.err.noValidFiles' });
		}

		// One batch, one item per invoice — no chained sessions.
		const { batchId, itemIds } = await createBatch(rid, saved.map((name, i) => ({ key: keys[i], name })));

		// Start extraction right away — the upload CTA promises "extract data",
		// so landing on the batch page must not require a second click.
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
