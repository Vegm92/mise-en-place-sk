import { eq } from 'drizzle-orm';
import { normalizeTaxId } from '$lib/tax-id';
import { db, runAsSystem } from './db';
import { restaurants } from './schema';
import { isSameSupplierName } from './normalize';
import type { ExtractedInvoice } from './extract';

export interface OwnPartyIdentity {
	taxId?: string | null;
	names?: Array<string | null | undefined>;
}

export type PartySwapReason = 'tax_id' | 'name';

export interface PartyResolution {
	invoice: ExtractedInvoice;
	swapped: boolean;
	reason: PartySwapReason | null;
}

function matchesName(candidate: string | null | undefined, names: Array<string | null | undefined>): boolean {
	const value = candidate?.trim();
	if (!value) return false;
	return names.some((name) => {
		const own = name?.trim();
		return Boolean(own) && isSameSupplierName(own!, value);
	});
}

function swapParties(invoice: ExtractedInvoice): ExtractedInvoice {
	const confidences = invoice.field_confidences;
	return {
		...invoice,
		supplier_name: invoice.receiver_name ?? null,
		supplier_nif: invoice.receiver_nif ?? null,
		supplier_address: invoice.receiver_address ?? null,
		supplier_email: null,
		supplier_phone: null,
		supplier_category: null,
		receiver_name: invoice.supplier_name ?? null,
		receiver_nif: invoice.supplier_nif ?? null,
		receiver_address: invoice.supplier_address ?? null,
		iban: null,
		payment_method: null,
		payment_terms: null,
		field_confidences: confidences && {
			...confidences,
			supplier_name: confidences.receiver_name,
			supplier_nif: confidences.receiver_nif,
			supplier_category: undefined,
			receiver_name: confidences.supplier_name,
			receiver_nif: confidences.supplier_nif,
			iban: undefined,
		},
	};
}

export function resolveInvoiceParties(invoice: ExtractedInvoice, own: OwnPartyIdentity): PartyResolution {
	const unchanged: PartyResolution = { invoice, swapped: false, reason: null };
	if (!invoice.receiver_name?.trim()) return unchanged;

	const ownTaxId = normalizeTaxId(own.taxId);
	if (ownTaxId) {
		const supplierTaxId = normalizeTaxId(invoice.supplier_nif);
		const receiverTaxId = normalizeTaxId(invoice.receiver_nif);
		if (supplierTaxId === ownTaxId && receiverTaxId !== ownTaxId) {
			return { invoice: swapParties(invoice), swapped: true, reason: 'tax_id' };
		}
		if (supplierTaxId || receiverTaxId) return unchanged;
	}

	const names = own.names ?? [];
	if (names.length === 0) return unchanged;
	if (matchesName(invoice.supplier_name, names) && !matchesName(invoice.receiver_name, names)) {
		return { invoice: swapParties(invoice), swapped: true, reason: 'name' };
	}
	return unchanged;
}

export async function ownPartyIdentity(restaurantId: string): Promise<OwnPartyIdentity> {
	const [row] = await runAsSystem(() => db.select({
		name: restaurants.name,
		legalName: restaurants.legalName,
		cifNif: restaurants.cifNif,
	})
		.from(restaurants)
		.where(eq(restaurants.id, restaurantId))
		.limit(1));

	return { taxId: row?.cifNif ?? null, names: [row?.name, row?.legalName] };
}
