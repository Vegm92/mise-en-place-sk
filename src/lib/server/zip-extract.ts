import yauzl from 'yauzl';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_TOTAL_BYTES, MAX_ZIP_ENTRIES } from '$lib/upload-formats';

export interface ExtractedZipFile {
	name: string;
	buffer: Buffer;
}

export interface ZipExtractError {
	name: string;
	reason: 'tooLarge' | 'corrupt' | 'tooManyEntries';
}

export interface ZipExtractResult {
	files: ExtractedZipFile[];
	errors: ZipExtractError[];
}

function flattenEntryName(entryPath: string): string {
	const parts = entryPath.split('/').filter(Boolean);
	return parts[parts.length - 1] ?? entryPath;
}

export function extractZip(buf: Buffer): Promise<ZipExtractResult> {
	return new Promise((resolve) => {
		const files: ExtractedZipFile[] = [];
		const errors: ZipExtractError[] = [];
		let entryCount = 0;
		let totalBytes = 0;
		let settled = false;

		function settle(result: ZipExtractResult) {
			if (settled) return;
			settled = true;
			resolve(result);
		}

		yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zipfile) => {
			if (err || !zipfile) {
				settle({ files: [], errors: [{ name: '', reason: 'corrupt' }] });
				return;
			}

			zipfile.on('error', () => {
				settle({ files, errors: [...errors, { name: '', reason: 'corrupt' }] });
			});

			zipfile.on('end', () => settle({ files, errors }));

			zipfile.on('entry', (entry) => {
				if (settled) return;

				entryCount++;
				if (entryCount > MAX_ZIP_ENTRIES) {
					settle({ files, errors: [...errors, { name: '', reason: 'tooManyEntries' }] });
					return;
				}

				if (/\/$/.test(entry.fileName)) {
					zipfile.readEntry();
					return;
				}

				const name = flattenEntryName(entry.fileName);

				if (entry.uncompressedSize > MAX_UPLOAD_BYTES || totalBytes + entry.uncompressedSize > MAX_UPLOAD_TOTAL_BYTES) {
					errors.push({ name, reason: 'tooLarge' });
					zipfile.readEntry();
					return;
				}

				zipfile.openReadStream(entry, (streamErr, stream) => {
					if (streamErr || !stream) {
						errors.push({ name, reason: 'corrupt' });
						zipfile.readEntry();
						return;
					}

					const chunks: Buffer[] = [];
					let size = 0;
					let entryTooLarge = false;

					stream.on('data', (chunk: Buffer) => {
						size += chunk.length;
						if (size > MAX_UPLOAD_BYTES || totalBytes + size > MAX_UPLOAD_TOTAL_BYTES) {
							entryTooLarge = true;
							stream.unpipe();
							stream.destroy();
						} else {
							chunks.push(chunk);
						}
					});
					stream.on('close', () => {
						if (settled) return;
						if (entryTooLarge) {
							errors.push({ name, reason: 'tooLarge' });
						} else {
							totalBytes += size;
							files.push({ name, buffer: Buffer.concat(chunks) });
						}
						zipfile.readEntry();
					});
					stream.on('error', () => {
						errors.push({ name, reason: 'corrupt' });
						zipfile.readEntry();
					});
				});
			});

			zipfile.readEntry();
		});
	});
}
