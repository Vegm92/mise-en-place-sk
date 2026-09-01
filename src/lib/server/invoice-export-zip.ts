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
