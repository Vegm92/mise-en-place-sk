import { getItem } from '../../batch';
import { batchLink, setReviewStatus } from './jobs';
import type { WhatsAppMessageContext } from './transport';

export interface WhatsAppNotifyJobData {
	itemId: string;
	restaurantId: string;
}

function money(value: unknown): string {
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n)) return '—';
	return `${n.toFixed(2).replace('.', ',')} €`;
}

function field(value: unknown): string {
	return typeof value === 'string' && value.trim() ? value.trim() : '—';
}

export function formatSummary(
	data: Record<string, unknown> | null,
	jobCode: string | null,
): string {
	const d = data ?? {};
	const tag = jobCode ? `  [${jobCode}]` : '';
	const answer = jobCode ? `OK ${jobCode}   /   NO ${jobCode}` : 'OK   /   NO';
	return [
		`📋 Factura procesada${tag}`,
		'',
		`Proveedor: ${field(d.supplier_name)}`,
		`Nº factura: ${field(d.invoice_number)}`,
		`Fecha: ${field(d.invoice_date)}`,
		`Base: ${money(d.tax_base)}`,
		`IVA: ${money(d.tax_amount)}`,
		`Total: ${money(d.total_amount)}`,
		'',
		'¿Los datos son correctos?',
		`Responde:  ${answer}`,
	].join('\n');
}

export async function notifyWhatsAppSender(
	{ itemId }: WhatsAppNotifyJobData,
	ctx: WhatsAppMessageContext,
): Promise<void> {
	const item = await getItem(itemId);
	if (!item || item.source !== 'whatsapp' || !item.sourceRef) return;

	if (item.status === 'failed') {
		await setReviewStatus(itemId, 'to_review', [null, 'pending']);
		await ctx.sendText(
			item.sourceRef,
			`❌ No he podido leer esta factura. Súbela desde el panel web:\n${batchLink(item.batchId)}`,
		);
		return;
	}

	if (item.status !== 'done') return;

	await setReviewStatus(itemId, 'pending', [null]);
	await ctx.sendText(item.sourceRef, formatSummary(item.extractedData, item.jobCode));
}
