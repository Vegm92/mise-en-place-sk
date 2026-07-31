export type InvoiceStatus = 'pending' | 'confirmed' | 'exported' | 'overdue' | 'paid';

export function badgeClass(s: string): string {
	if (s === 'overdue') return 'badge badge-overdue';
	if (s === 'pending') return 'badge badge-pending';
	if (s === 'exported') return 'badge badge-exported';
	if (s === 'paid') return 'badge badge-confirmed';
	return 'badge badge-confirmed';
}

export function statusKey(s: string): string {
	const map: Record<string, string> = {
		pending: 'status.pending',
		confirmed: 'status.confirmed',
		exported: 'status.exported',
		overdue: 'status.overdue',
		paid: 'status.paid',
	};
	return map[s] ?? s;
}

export function confColor(c: number | undefined | null): string {
	if (c == null) return 'transparent';
	if (c >= 0.85) return 'var(--mep-pos)';
	if (c >= 0.6) return 'var(--mep-warn)';
	return 'var(--mep-neg)';
}
