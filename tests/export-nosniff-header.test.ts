import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function findServerRoutes(dir: string): string[] {
	let results: string[] = [];
	const list = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of list) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results = results.concat(findServerRoutes(fullPath));
		} else if (entry.isFile() && entry.name === '+server.ts') {
			results.push(fullPath);
		}
	}
	return results;
}

describe('Export and download endpoints attach X-Content-Type-Options: nosniff', () => {
	const routesDir = path.join(process.cwd(), 'src/routes');
	const allServerFiles = findServerRoutes(routesDir);
	const contentDispositionRoutes = allServerFiles.filter((filePath) => {
		const content = fs.readFileSync(filePath, 'utf8');
		return /Content-Disposition/i.test(content);
	});

	it('finds all routes setting Content-Disposition', () => {
		expect(contentDispositionRoutes.length).toBeGreaterThan(0);
	});

	for (const filePath of contentDispositionRoutes) {
		const relPath = path.relative(process.cwd(), filePath);
		it(`${relPath} includes X-Content-Type-Options: nosniff header`, () => {
			const src = fs.readFileSync(filePath, 'utf8');
			expect(src).toMatch(/X-Content-Type-Options/i);
			expect(src).toMatch(/nosniff/i);
		});
	}
});
