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
	return isDisplayInvoiceStatus(s) ? BADGE_CLASS[s] : 'badge badge-neutral';
}

export function statusKey(s: string): string {
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
