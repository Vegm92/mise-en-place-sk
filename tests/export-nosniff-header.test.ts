import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Export and download endpoints attach X-Content-Type-Options: nosniff', () => {
	const exportRoutes = [
		'src/routes/(app)/reports/[type]/csv/+server.ts',
		'src/routes/(app)/recipes/[id]/csv/+server.ts',
	];

	for (const relFile of exportRoutes) {
		it(`${relFile} includes X-Content-Type-Options: nosniff header`, () => {
			const src = fs.readFileSync(path.join(process.cwd(), relFile), 'utf8');
			expect(src).toMatch(/X-Content-Type-Options/i);
			expect(src).toMatch(/nosniff/i);
		});
	}
});
