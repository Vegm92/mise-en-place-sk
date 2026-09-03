import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { handleLoad } from '$lib/server/load-guard';
import type { PageServerLoad, Actions } from './$types';
import { db, forTenant } from '$lib/server/db';
import { invoices, invoiceLineItems, invoiceAuditLog, suppliers, restaurants, systemNotifications } from '$lib/server/schema';
import { asc, desc, eq, and, isNull, sql } from 'drizzle-orm';
import { moneyToNullableNumber } from '$lib/server/money';
import { linkProductsToInvoice, documentReferenceColumns } from '$lib/server/invoice-save';
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

async function invoiceDetailRow(tdb: ReturnType<typeof forTenant>, id: number) {
	const [row] = await db.select({
		id:               invoices.id,
		supplier_id:      invoices.supplierId,
		supplier_name:    suppliers.name,
		contact_email:    suppliers.contactEmail,
		invoice_number:   invoices.invoiceNumber,
		document_type:    invoices.documentType,
		invoice_date:     invoices.invoiceDate,
		due_date:         invoices.dueDate,
		total_amount:     invoices.totalAmount,
		gross_amount:     invoices.grossAmount,
		discount_amount:  invoices.discountAmount,
		retention_rate:   invoices.retentionRate,
		retention_amount: invoices.retentionAmount,
		payment_method:   invoices.paymentMethod,
		payment_terms:    invoices.paymentTerms,
		iban:             suppliers.iban,
		source_file:      invoices.sourceFile,
		review_state:     invoices.reviewState,
		incidence_kind:   invoices.incidenceKind,
		incidence_reasons: invoices.incidenceReasons,
		notes:            invoices.notes,
		created_at:       invoices.createdAt,
		linked_invoice_id: invoices.linkedInvoiceId,
		...documentReferenceColumns,
	})
		.from(invoices)
		.leftJoin(suppliers, eq(suppliers.id, invoices.supplierId))
		.where(and(tdb.scope(invoices.restaurantId), eq(invoices.id, id), isNull(invoices.deletedAt)))
		.limit(1);
	return row ?? null;
}

async function pendingMismatchPayload(tdb: ReturnType<typeof forTenant>, invoiceId: number) {
	const [row] = await db.select({ payload: systemNotifications.payload })
		.from(systemNotifications)
		.where(tdb.scope(systemNotifications.restaurantId, and(
			eq(systemNotifications.invoiceId, invoiceId),
			eq(systemNotifications.notificationType, 'line_item_mismatch'),
			eq(systemNotifications.status, 'pending'),
		)!))
		.orderBy(desc(systemNotifications.createdAt))
		.limit(1);
	return parseMismatchPayload(row?.payload ?? null);
}

async function latestClaimSentAt(tdb: ReturnType<typeof forTenant>, invoiceId: number): Promise<Date | null> {
	const [row] = await db.select({ createdAt: invoiceAuditLog.createdAt })
		.from(invoiceAuditLog)
		.where(tdb.scope(invoiceAuditLog.restaurantId, and(
			eq(invoiceAuditLog.invoiceId, invoiceId),
			eq(invoiceAuditLog.action, CLAIM_AUDIT_ACTION),
		)!))
		.orderBy(desc(invoiceAuditLog.createdAt))
		.limit(1);
	return row?.createdAt ?? null;
}

async function restaurantName(rid: string): Promise<string> {
	const [row] = await db.select({ name: restaurants.name }).from(restaurants)
		.where(eq(restaurants.id, rid)).limit(1);
	return row?.name ?? '';
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

		const [row, lineItems, rName] = await Promise.all([
			invoiceDetailRow(tdb, id),

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

			restaurantName(rid),
		]);

		if (!row) redirect(303, '/invoices');

		const linkedInvoice = row.linked_invoice_id
			? (await db.select({
				id:             invoices.id,
				invoice_number: invoices.invoiceNumber,
				document_type:  invoices.documentType,
			})
				.from(invoices)
				.where(and(tdb.scope(invoices.restaurantId), eq(invoices.id, row.linked_invoice_id), isNull(invoices.deletedAt)))
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
			restaurantName: rName,
			documentLabel:  row.invoice_number ?? `#${row.id}`,
			documentDate:   formatClaimDate(row.invoice_date, locale),
			lines:          claimLines,
		});

		return {
			title: 'inv.detail.pageTitle',
			titleParams: { number: row.invoice_number ?? row.id },
			invoice: {
				...row,
				total_amount: moneyToNullableNumber(row.total_amount),
				gross_amount: moneyToNullableNumber(row.gross_amount),
				discount_amount: moneyToNullableNumber(row.discount_amount),
				retention_amount: moneyToNullableNumber(row.retention_amount),
				linked_invoice: linkedInvoice,
			},
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
		const locale = locals.locale ?? 'es';
		const uid = locals.user!.id;
		const tdb = forTenant(rid);

		const claimRateLimitOk = await rateLimitScoped({ scope: 'tenant', name: 'invoice-claim', max: 20 }, { restaurantId: rid });
		if (!claimRateLimitOk) {
			return fail(429, { error: 'Too many requests' });
		}

		const formData = await request.formData();
		const parsed = parseForm(ClaimForm, formData);
		if (!parsed.success) return fail(422, { claim: 'invalid' });
		const { subject, body } = parsed.output;

		const row = await invoiceDetailRow(tdb, id);
		if (!row) redirect(303, '/invoices');

		if (!claimEligibility(
			{ reviewState: row.review_state, incidenceKind: row.incidence_kind },
			{ contactEmail: row.contact_email },
			null,
		)) {
			return fail(422, { claim: 'notEligible' });
		}

		const to = row.contact_email!;
		const rName = await restaurantName(rid);
		const mismatch = await pendingMismatchPayload(tdb, id);
		const lines = buildClaimLines(locale, mismatch.missingInInvoice, mismatch.quantityMismatches);
		const documentLabel = row.invoice_number ?? `#${id}`;
		const documentDate = formatClaimDate(row.invoice_date, locale);
		const payload = supplierClaimEmail({
			to, subject, bodyText: body,
			restaurantName: rName,
			supplierName:   row.supplier_name ?? '',
			documentNumber: documentLabel,
			documentDate,
			lines,
		});

		let alreadySent = false;
		try {
			await db.transaction(async (tx) => {
				await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`claim:${rid}:${id}`}))`);
				const [existing] = await tx.select({ id: invoiceAuditLog.id })
					.from(invoiceAuditLog)
					.where(tdb.scope(invoiceAuditLog.restaurantId, and(
						eq(invoiceAuditLog.invoiceId, id),
						eq(invoiceAuditLog.action, CLAIM_AUDIT_ACTION),
					)!))
					.limit(1);
				if (existing) {
					alreadySent = true;
					return;
				}
				await sendEmail(payload);
				await tx.insert(invoiceAuditLog).values({
					restaurantId: rid,
					invoiceId:    id,
					action:       CLAIM_AUDIT_ACTION,
					userId:       uid,
					reason:       subject,
					snapshot:     JSON.stringify({ to, subject, body }),
				});
			});
		} catch {
			return fail(502, { claim: 'sendFailed' });
		}
		if (alreadySent) return fail(409, { claim: 'alreadySent' });

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
