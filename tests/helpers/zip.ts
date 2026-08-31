import yazl from 'yazl';

export interface ZipEntryInput {
	name: string;
	bytes: number[] | Buffer;
}

export function buildZip(entries: ZipEntryInput[]): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const zip = new yazl.ZipFile();
		for (const entry of entries) {
			zip.addBuffer(Buffer.isBuffer(entry.bytes) ? entry.bytes : Buffer.from(entry.bytes), entry.name);
		}
		zip.end();

		const chunks: Buffer[] = [];
		zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
		zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
		zip.outputStream.on('error', reject);
	});
}
