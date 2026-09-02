import path from 'path';
import yazl from 'yazl';

export interface InvoiceExportZipEntry {
	name: string;
	data: Buffer;
}

export function buildInvoiceExportZip(entries: InvoiceExportZipEntry[]): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const zip = new yazl.ZipFile();
		for (const entry of entries) zip.addBuffer(entry.data, entry.name);
		zip.end();

		const chunks: Buffer[] = [];
		zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
		zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
		zip.outputStream.on('error', reject);
	});
}

const ZIP_NAME_MAX_LEN = 80;

function sanitizeForZipEntry(value: string): string {
	const collapsed = value.replace(/[^A-Za-z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
	return collapsed.slice(0, ZIP_NAME_MAX_LEN).replace(/^_+|_+$/g, '');
}

export function zipEntryName(id: number, invoiceNumber: string | null | undefined, sourceFile: string): string {
	const ext = path.extname(sourceFile);
	const sanitized = sanitizeForZipEntry(invoiceNumber ?? '');
	return sanitized ? `${id}-${sanitized}${ext}` : `${id}${ext}`;
}
