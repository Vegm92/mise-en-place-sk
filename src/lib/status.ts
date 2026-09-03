export const REVIEW_STATES = ['por_revisar', 'revisado', 'incidencia'] as const;

export type ReviewState = (typeof REVIEW_STATES)[number];

const REVIEW_BADGE_CLASS: Record<ReviewState, string> = {
	por_revisar: 'badge badge-pending',
	revisado:    'badge badge-confirmed',
	incidencia:  'badge badge-overdue',
};

const REVIEW_STATE_KEY: Record<ReviewState, string> = {
	por_revisar: 'inv.review.por_revisar',
	revisado:    'inv.review.revisado',
	incidencia:  'inv.review.incidencia',
};

export function isReviewState(s: string): s is ReviewState {
	return s in REVIEW_BADGE_CLASS;
}

export const INCIDENCE_KINDS = ['lectura', 'documento'] as const;

export type IncidenceKind = (typeof INCIDENCE_KINDS)[number];

const INCIDENCE_KIND_BADGE_CLASS: Record<IncidenceKind, string> = {
	lectura:   'badge badge-pending',
	documento: 'badge badge-overdue',
};

const INCIDENCE_KIND_KEY: Record<IncidenceKind, string> = {
	lectura:   'inv.review.kind.lectura',
	documento: 'inv.review.kind.documento',
};

export function isIncidenceKind(s: string): s is IncidenceKind {
	return s in INCIDENCE_KIND_BADGE_CLASS;
}

export function incidenceKindBadgeClass(s: string): string {
	return isIncidenceKind(s) ? INCIDENCE_KIND_BADGE_CLASS[s] : 'badge badge-neutral';
}

export function incidenceKindKey(s: string): string {
	return isIncidenceKind(s) ? INCIDENCE_KIND_KEY[s] : s;
}

export function incidenceKindHintKey(s: string): string {
	return isIncidenceKind(s) ? `${INCIDENCE_KIND_KEY[s]}.hint` : s;
}

export const INCIDENCE_REASONS = [
	'low_confidence',
	'total_mismatch',
	'unit_conversion',
	'qr_mismatch',
	'duplicate_purchase',
	'line_item_mismatch',
] as const;

export type IncidenceReason = (typeof INCIDENCE_REASONS)[number];

export function isIncidenceReason(s: string): s is IncidenceReason {
	return (INCIDENCE_REASONS as readonly string[]).includes(s);
}

export function incidenceReasonKey(s: string): string {
	return isIncidenceReason(s) ? `inv.review.reason.${s}` : s;
}

export function incidenceReasons(reasons: readonly string[] | null | undefined): IncidenceReason[] {
	return (reasons ?? []).filter(isIncidenceReason);
}

export const STORED_INVOICE_STATUSES = ['pending', 'accepted', 'rejected', 'paid'] as const;

export const DERIVED_INVOICE_STATUSES = ['overdue'] as const;

export const DISPLAY_INVOICE_STATUSES = [
	...STORED_INVOICE_STATUSES,
	...DERIVED_INVOICE_STATUSES,
] as const;

export type InvoiceStatus = (typeof STORED_INVOICE_STATUSES)[number];

export type DisplayInvoiceStatus = (typeof DISPLAY_INVOICE_STATUSES)[number];

const BADGE_CLASS: Record<DisplayInvoiceStatus, string> = {
	pending:  'badge badge-pending',
	accepted: 'badge badge-confirmed',
	rejected: 'badge badge-rejected',
	paid:     'badge badge-confirmed',
	overdue:  'badge badge-overdue',
};

const STATUS_KEY: Record<DisplayInvoiceStatus, string> = {
	pending:  'status.pending',
	accepted: 'status.accepted',
	rejected: 'status.rejected',
	paid:     'status.paid',
	overdue:  'status.overdue',
};

export function isDisplayInvoiceStatus(s: string): s is DisplayInvoiceStatus {
	return s in BADGE_CLASS;
}

export function isStoredInvoiceStatus(s: string): s is InvoiceStatus {
	return (STORED_INVOICE_STATUSES as readonly string[]).includes(s);
}

export function badgeClass(s: string): string {
	if (isReviewState(s)) return REVIEW_BADGE_CLASS[s];
	return isDisplayInvoiceStatus(s) ? BADGE_CLASS[s] : 'badge badge-neutral';
}

export function statusKey(s: string): string {
	if (isReviewState(s)) return REVIEW_STATE_KEY[s];
	return isDisplayInvoiceStatus(s) ? STATUS_KEY[s] : s;
}

export function confColor(c: number | undefined | null): string {
	if (c == null) return 'transparent';
	if (c >= 0.85) return 'var(--mep-pos)';
	if (c >= 0.6) return 'var(--mep-warn)';
	return 'var(--mep-neg)';
}

export function getScoreColor(score: number): string {
	if (score >= 70) return 'var(--mep-pos)';
	if (score >= 40) return 'var(--mep-warn)';
	return 'var(--mep-neg)';
}
