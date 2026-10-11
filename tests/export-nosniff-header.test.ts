import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function findServerRoutes(dir: string, fileList: string[] = []): string[] {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			findServerRoutes(fullPath, fileList);
		} else if (entry.isFile() && entry.name === '+server.ts') {
			fileList.push(fullPath);
		}
	}
	return fileList;
}

describe('Export and download endpoints attach X-Content-Type-Options: nosniff', () => {
	const routesDir = path.join(process.cwd(), 'src/routes');
	const serverFiles = findServerRoutes(routesDir);

	const downloadRoutes = serverFiles.filter((filePath) => {
		const content = fs.readFileSync(filePath, 'utf8');
		return (
			content.includes('Content-Disposition') ||
			content.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') ||
			content.includes('text/csv') ||
			content.includes('application/zip')
		);
	});

	it('finds all export and file download routes', () => {
		expect(downloadRoutes.length).toBeGreaterThanOrEqual(6);
	});

	it.each(downloadRoutes.map((f) => [path.relative(process.cwd(), f), f]))(
		'%s includes X-Content-Type-Options: nosniff header',
		(_, fullPath) => {
			const src = fs.readFileSync(fullPath, 'utf8');
			const objectFormat = /['"]X-Content-Type-Options['"]:\s*['"]nosniff['"]/i.test(src);
			const headersSetFormat = /headers\.set\(\s*['"]X-Content-Type-Options['"]\s*,\s*['"]nosniff['"]\s*\)/i.test(src);
			expect(objectFormat || headersSetFormat).toBe(true);
		}
	);
});
