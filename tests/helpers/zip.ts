import { buildInvoiceExportZip } from '../../src/lib/server/invoice-export-zip';

export interface ZipEntryInput {
	name: string;
	bytes: number[] | Buffer;
}

export function buildZip(entries: ZipEntryInput[]): Promise<Buffer> {
	return buildInvoiceExportZip(
		entries.map((e) => ({ name: e.name, data: Buffer.isBuffer(e.bytes) ? e.bytes : Buffer.from(e.bytes) })),
	);
}
