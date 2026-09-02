import { renderTemplate, type Locale } from '$lib/i18n-messages';
import { toIntlLocale } from '$lib/formatters';

export const CLAIM_AUDIT_ACTION = 'claim_email_sent';
export const CLAIM_SUBJECT_MAX_LENGTH = 200;
export const CLAIM_BODY_MAX_LENGTH = 4000;

export interface ClaimableInvoice {
	reviewState: string | null;
	incidenceKind: string | null;
}

export interface ClaimableSupplier {
	contactEmail: string | null;
}

export function claimEligibility(
	invoice: ClaimableInvoice,
	supplier: ClaimableSupplier | null,
	alreadySentAt: Date | string | null,
): boolean {
	if (alreadySentAt) return false;
	if (invoice.reviewState !== 'incidencia') return false;
	if (invoice.incidenceKind !== 'documento') return false;
	return Boolean(supplier?.contactEmail);
}

export interface MissingLineIssue {
	description: string;
	quantity?: number | string | null;
	unit?: string | null;
}

export interface QuantityMismatchIssue {
	description: string;
	deliveryQty: number | string;
	invoiceQty: number | string;
	unit?: string | null;
}

export interface ClaimLine {
	description: string;
	detail: string;
}

function formatQty(qty: number | string | null | undefined, unit?: string | null): string {
	if (qty == null || qty === '') return unit ?? '';
	return unit ? `${qty} ${unit}` : String(qty);
}

export function buildClaimLines(
	locale: Locale,
	missingInInvoice: MissingLineIssue[] = [],
	quantityMismatches: QuantityMismatchIssue[] = [],
): ClaimLine[] {
	const missing = missingInInvoice.map((m) => {
		const qty = formatQty(m.quantity, m.unit);
		return {
			description: m.description,
			detail: qty
				? renderTemplate(locale, 'inv.claim.template.lineMissing', { qty })
				: renderTemplate(locale, 'inv.claim.template.lineMissingNoQty', {}),
		};
	});
	const mismatches = quantityMismatches.map((m) => ({
		description: m.description,
		detail: renderTemplate(locale, 'inv.claim.template.lineMismatch', {
			deliveryQty: formatQty(m.deliveryQty, m.unit),
			invoiceQty: formatQty(m.invoiceQty, m.unit),
		}),
	}));
	return [...missing, ...mismatches];
}

export function formatClaimLinesText(locale: Locale, lines: ClaimLine[]): string {
	if (lines.length === 0) return renderTemplate(locale, 'inv.claim.template.noLines', {});
	return lines.map((l) => `- ${l.description}: ${l.detail}`).join('\n');
}

export function formatClaimDate(iso: string | null | undefined, locale: Locale): string {
	if (!iso) return '';
	const d = new Date(`${iso}T00:00:00`);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString(toIntlLocale(locale), {
		day: '2-digit', month: '2-digit', year: 'numeric',
	});
}

export interface DefaultClaimDraftInput {
	locale: Locale;
	supplierName: string;
	restaurantName: string;
	documentLabel: string;
	documentDate: string;
	lines: ClaimLine[];
}

export interface ClaimDraft {
	subject: string;
	body: string;
}

export function defaultClaimDraft(input: DefaultClaimDraftInput): ClaimDraft {
	const vars = {
		supplier: input.supplierName,
		restaurant: input.restaurantName,
		document: input.documentLabel,
		date: input.documentDate,
		lines: formatClaimLinesText(input.locale, input.lines),
	};
	return {
		subject: renderTemplate(input.locale, 'inv.claim.template.subject', vars),
		body: renderTemplate(input.locale, 'inv.claim.template.body', vars),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isMissingLineIssue(value: unknown): value is MissingLineIssue {
	return isRecord(value) && typeof value.description === 'string';
}

function isQuantityMismatchIssue(value: unknown): value is QuantityMismatchIssue {
	return isRecord(value) && typeof value.description === 'string'
		&& (typeof value.deliveryQty === 'number' || typeof value.deliveryQty === 'string')
		&& (typeof value.invoiceQty === 'number' || typeof value.invoiceQty === 'string');
}

export function parseMismatchPayload(payload: unknown): {
	missingInInvoice: MissingLineIssue[];
	quantityMismatches: QuantityMismatchIssue[];
} {
	if (!isRecord(payload)) return { missingInInvoice: [], quantityMismatches: [] };
	const missingInInvoice = Array.isArray(payload.missingInInvoice)
		? payload.missingInInvoice.filter(isMissingLineIssue)
		: [];
	const quantityMismatches = Array.isArray(payload.quantityMismatches)
		? payload.quantityMismatches.filter(isQuantityMismatchIssue)
		: [];
	return { missingInInvoice, quantityMismatches };
}
