import type { Notif } from '$lib/notification-display';

async function postJson(url: string, body: unknown): Promise<Response | null> {
	try {
		return await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		});
	} catch {
		return null;
	}
}

export async function dismissNotification(
	items: Notif[],
	id: number,
	apply: (next: Notif[]) => void,
): Promise<void> {
	const index = items.findIndex((n) => n.id === id);
	if (index < 0) return;
	const removed = items[index]!;
	const next = items.filter((n) => n.id !== id);
	apply(next);
	const resp = await postJson('/api/notifications', { id });
	if (resp?.ok) return;
	const restored = [...next];
	restored.splice(index, 0, removed);
	apply(restored);
}

export async function acceptSupplierCategory(n: Notif): Promise<boolean> {
	const p = n.payload as { supplierId?: number; suggestedCategory?: string } | null;
	if (typeof p?.supplierId !== 'number') return false;
	const resp = await postJson('/api/supplier-category', {
		supplierId: p.supplierId,
		action: 'accept',
		category: p.suggestedCategory,
	});
	return resp ? resp.ok || resp.status === 404 : false;
}

export async function decideProductSuggestion(n: Notif, accept: boolean): Promise<boolean> {
	const p = n.payload as { description?: string; source?: string; candidateProductId?: number } | null;
	const description = p?.description;
	if (!description) return false;
	const isLlm = p?.source === 'llm';
	const body: Record<string, unknown> = { description };
	if (accept) {
		body.action = 'confirm';
		if (isLlm && typeof p?.candidateProductId === 'number') body.targetProductId = p.candidateProductId;
	} else {
		body.action = isLlm ? 'dismiss' : 'reject';
	}
	const resp = await postJson('/api/product-aliases', body);
	return resp?.ok === true;
}
