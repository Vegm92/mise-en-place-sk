import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Export and download endpoints attach X-Content-Type-Options: nosniff', () => {
	const exportRoutes = [
		'reports/[type]/csv',
		'recipes/[id]/csv',
		'analytics/extraction/csv',
		'products/inventory-template',
		'invoices/export/download',
		'invoice/[id]/file',
		'api/upload/[id]/[file]',
		'api/user/export',
	];

	it.each(exportRoutes)('%s includes X-Content-Type-Options: nosniff header', (route) => {
		const relFile = route.startsWith('api/') ? `src/routes/${route}/+server.ts` : `src/routes/(app)/${route}/+server.ts`;
		const src = fs.readFileSync(path.join(process.cwd(), relFile), 'utf8');
		expect(src).toMatch(/X-Content-Type-Options/i);
		expect(src).toMatch(/nosniff/i);
	});
});
