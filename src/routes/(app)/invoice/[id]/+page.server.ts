import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { handleLoad } from '$lib/server/load-guard';
import type { PageServerLoad, Actions } from './$types';
import { db, forTenant } from '$lib/server/db';
import { invoices, invoiceLineItems, invoiceAuditLog, suppliers, restaurants, systemNotifications } from '$lib/server/schema';
import { asc, desc, eq, and, isNull, sql } from 'drizzle-orm';
import { moneyToNullableNumber } from '$lib/server/money';
import { linkProductsToInvoice } from '$lib/server/invoice-save';
import { orphanInvoiceAlerts, reevaluateBudgetAlertsForInvoice } from '$lib/server/alerts';
import { parsePack } from '$lib/server/products';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { requirePositiveIntId } from '$lib/server/route-params';
import { parseForm } from '$lib/server/public-form-action';
import { sendEmail, supplierClaimEmail } from '$lib/server/email';
import {
	claimEligibility, defaultClaimDraft, buildClaimLines, formatClaimDate, parseMismatchPayload,
	CLAIM_AUDIT_ACTION, CLAIM_SUBJECT_MAX_LENGTH, CLAIM_BODY_MAX_LENGTH,
} from '$lib/server/supplier-claim';

function invoiceScope(tdb: ReturnType<typeof forTenant>, id: number) {
	return and(tdb.scope(invoices.restaurantId), eq(invoices.id, id), isNull(invoices.deletedAt));
}

async function pendingMismatchPayload(tdb: ReturnType<typeof forTenant>, invoiceId: number) {
	const [row] = await db.select({ payload: systemNotifications.payload })
		.from(systemNotifications)
		.where(and(
			tdb.scope(systemNotifications.restaurantId),
			eq(systemNotifications.invoiceId, invoiceId),
			eq(systemNotifications.notificationType, 'line_item_mismatch'),
			eq(systemNotifications.status, 'pending'),
		))
		.orderBy(desc(systemNotifications.createdAt))
		.limit(1);
	return parseMismatchPayload(row?.payload ?? null);
}

async function latestClaimSentAt(tdb: ReturnType<typeof forTenant>, invoiceId: number): Promise<Date | null> {
	const [row] = await db.select({ createdAt: invoiceAuditLog.createdAt })
		.from(invoiceAuditLog)
		.where(and(
			tdb.scope(invoiceAuditLog.restaurantId),
			eq(invoiceAuditLog.invoiceId, invoiceId),
			eq(invoiceAuditLog.action, CLAIM_AUDIT_ACTION),
		))
		.orderBy(desc(invoiceAuditLog.createdAt))
		.limit(1);
	return row?.createdAt ?? null;
}

const ClaimForm = v.object({
	subject: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(CLAIM_SUBJECT_MAX_LENGTH)),
	body:    v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(CLAIM_BODY_MAX_LENGTH)),
});

export const load: PageServerLoad = async ({ params, locals }) => {
	return handleLoad('invoice/detail', async () => {
		const id  = requirePositiveIntId(params.id, 'invoice');
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);
		const locale = locals.locale ?? 'es';

		const [rows, lineItems, restaurantRows] = await Promise.all([
			db.select({
				id:               invoices.id,
				supplier_id:      invoices.supplierId,
				supplier_name:    suppliers.name,
				contact_email:    suppliers.contactEmail,
				invoice_number:   invoices.invoiceNumber,
				document_type:    invoices.documentType,
				invoice_date:     invoices.invoiceDate,
				due_date:         invoices.dueDate,
				total_amount:     invoices.totalAmount,
				review_state:     invoices.reviewState,
				incidence_kind:   invoices.incidenceKind,
				source_file:      invoices.sourceFile,
				notes:            invoices.notes,
				created_at:       invoices.createdAt,
				linked_invoice_id: invoices.linkedInvoiceId,
			})
				.from(invoices)
				.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
				.where(invoiceScope(tdb, id))
				.limit(1),

			db.select({
				id:          invoiceLineItems.id,
				description: invoiceLineItems.description,
				quantity:    invoiceLineItems.quantity,
				unit:        invoiceLineItems.unit,
				unit_price:  invoiceLineItems.unitPrice,
				total_price: invoiceLineItems.totalPrice,
				product_id:  invoiceLineItems.productId,
			})
				.from(invoiceLineItems)
				.where(tdb.scope(invoiceLineItems.restaurantId, eq(invoiceLineItems.invoiceId, id)))
				.orderBy(asc(invoiceLineItems.id)),

			db.select({ name: restaurants.name }).from(restaurants).where(eq(restaurants.id, rid)).limit(1),
		]);

		const row = rows[0];
		if (!row) redirect(303, '/invoices');

		const linkedInvoice = row.linked_invoice_id
			? (await db.select({
				id:             invoices.id,
				invoice_number: invoices.invoiceNumber,
				document_type:  invoices.documentType,
			})
				.from(invoices)
				.where(invoiceScope(tdb, row.linked_invoice_id))
				.limit(1))[0] ?? null
			: null;

		const [mismatch, claimSentAt] = await Promise.all([
			pendingMismatchPayload(tdb, id),
			latestClaimSentAt(tdb, id),
		]);
		const claimLines = buildClaimLines(locale, mismatch.missingInInvoice, mismatch.quantityMismatches);
		const claimDraft = defaultClaimDraft({
			locale,
			supplierName:   row.supplier_name ?? '',
			restaurantName: restaurantRows[0]?.name ?? '',
			documentLabel:  row.invoice_number ?? `#${row.id}`,
			documentDate:   formatClaimDate(row.invoice_date, locale),
			lines:          claimLines,
		});

		return {
			title: 'inv.detail.pageTitle',
			titleParams: { number: row.invoice_number ?? row.id },
			invoice: { ...row, total_amount: moneyToNullableNumber(row.total_amount), linked_invoice: linkedInvoice },
			unlinkedLineCount: lineItems.filter(li => li.product_id == null && (li.description ?? '').trim() !== '').length,
			lineItems: lineItems.map(li => ({
				...li,
				unit_price: moneyToNullableNumber(li.unit_price),
				total_price: moneyToNullableNumber(li.total_price),
			})),
			claim: {
				eligible: claimEligibility(
					{ reviewState: row.review_state, incidenceKind: row.incidence_kind },
					{ contactEmail: row.contact_email },
					claimSentAt,
				),
				to:      row.contact_email ?? null,
				sentAt:  claimSentAt ? claimSentAt.toISOString() : null,
				subject: claimDraft.subject,
				body:    claimDraft.body,
			},
		};
	});
};

export const actions: Actions = {
	relinkProducts: async ({ params, locals }) => {
		const id  = requirePositiveIntId(params.id, 'invoice');
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);

		if (!(await rateLimitScoped({ scope: 'tenant', name: 'invoice-relink', max: 20 }, { restaurantId: rid }))) {
			return fail(429, { error: 'Too many requests' });
		}

		const [inv] = await db.select({ supplierId: invoices.supplierId })
			.from(invoices)
			.where(and(tdb.scope(invoices.restaurantId), eq(invoices.id, id), isNull(invoices.deletedAt)))
			.limit(1);
		if (!inv?.supplierId) redirect(303, '/invoices');

		const lines = await db.select({
			description:  invoiceLineItems.description,
			unit:         invoiceLineItems.unit,
			supplierSku:  invoiceLineItems.supplierSku,
		})
			.from(invoiceLineItems)
			.where(and(
				tdb.scope(invoiceLineItems.restaurantId),
				eq(invoiceLineItems.invoiceId, id),
				isNull(invoiceLineItems.productId),
			));

		const lineInputs = lines
			.filter(li => (li.description ?? '').trim() !== '')
			.map(li => ({
				desc: li.description!,
				unitVal: li.unit,
				pack: parsePack(li.description, li.unit),
				supplierSku: li.supplierSku,
			}));
		if (lineInputs.length === 0) redirect(303, `/invoice/${id}`);

		await linkProductsToInvoice(id, inv.supplierId, rid, lineInputs);
		redirect(303, `/invoice/${id}`);
	},

	requestCorrection: async ({ params, request, locals }) => {
		const id  = requirePositiveIntId(params.id, 'invoice');
		const rid = locals.restaurantId!;
		const uid = locals.user!.id;
		const tdb = forTenant(rid);
		const locale = locals.locale ?? 'es';

		if (!(await rateLimitScoped({ scope: 'tenant', name: 'invoice-claim', max: 20 }, { restaurantId: rid }))) {
			return fail(429, { error: 'Too many requests' });
		}

		const formData = await request.formData();
		const parsed = parseForm(ClaimForm, formData);
		if (!parsed.success) return fail(422, { claim: 'invalid' });
		const { subject, body } = parsed.output;

		const [row] = await db.select({
			reviewState:   invoices.reviewState,
			incidenceKind: invoices.incidenceKind,
			invoiceNumber: invoices.invoiceNumber,
			invoiceDate:   invoices.invoiceDate,
			supplierName:  suppliers.name,
			contactEmail:  suppliers.contactEmail,
		})
			.from(invoices)
			.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
			.where(invoiceScope(tdb, id))
			.limit(1);
		if (!row) redirect(303, '/invoices');

		if (!claimEligibility(
			{ reviewState: row.reviewState, incidenceKind: row.incidenceKind },
			{ contactEmail: row.contactEmail },
			null,
		)) {
			return fail(422, { claim: 'notEligible' });
		}

		const to = row.contactEmail!;
		const [restaurantRow] = await db.select({ name: restaurants.name })
			.from(restaurants).where(eq(restaurants.id, rid)).limit(1);
		const mismatch = await pendingMismatchPayload(tdb, id);
		const lines = buildClaimLines(locale, mismatch.missingInInvoice, mismatch.quantityMismatches);
		const documentLabel = row.invoiceNumber ?? `#${id}`;
		const documentDate = formatClaimDate(row.invoiceDate, locale);

		let alreadySent = false;
		await db.transaction(async (tx) => {
			await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`claim:${rid}:${id}`}))`);
			const [existing] = await tx.select({ id: invoiceAuditLog.id })
				.from(invoiceAuditLog)
				.where(and(
					tdb.scope(invoiceAuditLog.restaurantId),
					eq(invoiceAuditLog.invoiceId, id),
					eq(invoiceAuditLog.action, CLAIM_AUDIT_ACTION),
				))
				.limit(1);
			if (existing) {
				alreadySent = true;
				return;
			}
			await tx.insert(invoiceAuditLog).values({
				restaurantId: rid,
				invoiceId:    id,
				action:       CLAIM_AUDIT_ACTION,
				userId:       uid,
				reason:       subject,
				snapshot:     JSON.stringify({ to, subject, body }),
			});
		});
		if (alreadySent) return fail(409, { claim: 'alreadySent' });

		const payload = supplierClaimEmail({
			to, subject, bodyText: body,
			restaurantName: restaurantRow?.name ?? '',
			supplierName:   row.supplierName ?? '',
			documentNumber: documentLabel,
			documentDate,
			lines,
		});
		try {
			await sendEmail(payload);
		} catch {
			return fail(502, { claim: 'sendFailed' });
		}

		redirect(303, `/invoice/${id}`);
	},

	delete: async ({ params, locals }) => {
		const id  = requirePositiveIntId(params.id, 'invoice');
		const rid = locals.restaurantId!;
		const tdb = forTenant(rid);
		const uid = locals.user!.id;

		const [inv] = await db.select()
			.from(invoices)
			.where(and(tdb.scope(invoices.restaurantId), eq(invoices.id, id), isNull(invoices.deletedAt)));
		if (!inv) redirect(303, '/invoices');

		await db.update(invoices).set({ deletedAt: new Date() })
			.where(tdb.scope(invoices.restaurantId, eq(invoices.id, id)));
		await db.insert(invoiceAuditLog).values({
			restaurantId: rid,
			invoiceId:    id,
			action:       'soft_delete',
			userId:       uid,
			snapshot:     JSON.stringify(inv),
		});

		try {
			await orphanInvoiceAlerts(id, rid);
			if (inv.supplierId != null) {
				await reevaluateBudgetAlertsForInvoice(id, inv.supplierId, rid);
			}
		} catch (err) {
			console.error('[invoice/delete] alert cleanup failed (non-fatal):', err);
		}

		redirect(303, '/invoices');
	},
};
