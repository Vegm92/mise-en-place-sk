export const EXTRACTION_QUEUE = 'extract-invoice';
export const EXTRACTION_DEAD_LETTER_QUEUE = `${EXTRACTION_QUEUE}-dead-letter`;

export interface ExtractionJobData {
	itemId: string;
	restaurantId: string;
	requestId?: string;
}

export const EXTRACTION_OPTIONS = (itemId: string) => ({
	retryLimit: 2,
	retryDelay: 30,
	retryBackoff: true,
	retryDelayMax: 300,
	expireInSeconds: 600,
	singletonKey: itemId,
	deadLetter: EXTRACTION_DEAD_LETTER_QUEUE,
});

export interface DocumentReferenceFields {
	purchaseOrder: string | null;
	sellerName: string | null;
	deliveryDate: string | null;
	deliveryAddress: string | null;
	printedNotes: string | null;
}

export interface ExtractedInvoice {
	supplier_name: string | null;
	supplier_category?: string | null;
	supplier_nif?: string | null;
	supplier_address?: string | null;
	supplier_email?: string | null;
	supplier_phone?: string | null;
	receiver_name?: string | null;
	receiver_nif?: string | null;
	receiver_address?: string | null;
	receiver_email?: string | null;
	receiver_phone?: string | null;
	payment_method?: string | null;
	iban?: string | null;
	payment_terms?: string | null;
	invoice_number: string | null;
	purchase_order?: string | null;
	seller_name?: string | null;
	document_type?: 'factura' | 'albaran' | null;
	invoice_date: string | null;
	due_date: string | null;
	delivery_date?: string | null;
	delivery_address?: string | null;
	printed_notes?: string | null;
	total_amount: number | null;
	currency: string | null;
	tax_base: number | null;
	gross_amount?: number | null;
	discount_amount?: number | null;
	retention_rate?: number | null;
	retention_amount?: number | null;
	tax_breakdown: Array<{ rate: number; base: number; tax_amount: number; type?: 'iva' | 'rec' }> | null;
	confidence: number;
	field_confidences?: {
		supplier_name?: number | undefined;
		supplier_nif?: number | undefined;
		supplier_category?: number | undefined;
		receiver_name?: number | undefined;
		receiver_nif?: number | undefined;
		invoice_number?: number | undefined;
		document_type?: number | undefined;
		invoice_date?: number | undefined;
		due_date?: number | undefined;
		total_amount?: number | undefined;
		iban?: number | undefined;
	};
	line_items: Array<{
		description: string;
		product_code?: string | null;
		quantity: number | null;
		unit: string | null;
		unit_price: number | null;
		total_price: number | null;
		tax_rate?: number | null;
		allergens?: string[] | null;
		confidence?: number;
	}>;
	outstanding_balance?: number | null;
	qr_url?: string | null;
	qr_mismatch?: boolean;
	e_invoice_format?: 'facturae_322' | 'ubl_21' | null;
}
