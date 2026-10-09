/**
 * Export Endpoint Rate Limit Invariant Linter (issue #1153)
 *
 * Dynamically scans `src/routes/` for server endpoint handlers (+server.ts)
 * that handle file downloads or data exports (CSV, XLSX, ZIP, JSON attachments).
 *
 * Verifies that:
 * 1. Every export endpoint incorporates rate-limiting (via `rateLimitScoped` or `checkRateLimit`).
 * 2. Every export endpoint specifies a unique, isolated bucket name so export
 *    rate limits do not cross-throttle independent export features.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function walkDir(dir: string): string[] {
	let results: string[] = [];
	const list = fs.readdirSync(dir);
	for (const file of list) {
		const fullPath = path.join(dir, file);
		const stat = fs.statSync(fullPath);
		if (stat && stat.isDirectory()) {
			results = results.concat(walkDir(fullPath));
		} else {
			results.push(fullPath);
		}
	}
	return results;
}

describe('Export Endpoint Rate Limit Enforcement (issue #1153)', () => {
	const routesDir = path.join(process.cwd(), 'src/routes');
	const allServerFiles = walkDir(routesDir).filter((f) => f.endsWith('+server.ts'));

	const isExportEndpoint = (filePath: string, content: string): boolean => {
		const relPath = path.relative(process.cwd(), filePath);
		if (
			relPath.includes('/export') ||
			relPath.includes('/csv') ||
			relPath.includes('/download') ||
			relPath.includes('inventory-template')
		) {
			return true;
		}
		if (
			content.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') ||
			content.includes('text/csv') ||
			content.includes('application/zip') ||
			(content.includes('contentDispositionHeader') && content.includes('attachment'))
		) {
			return true;
		}
		return false;
	};

	const exportFiles = allServerFiles.filter((f) => {
		const content = fs.readFileSync(f, 'utf8');
		return isExportEndpoint(f, content);
	});

	it('discovers export endpoints dynamically under src/routes/', () => {
		expect(exportFiles.length).toBeGreaterThan(0);
	});

	it('enforces that every export endpoint incorporates rateLimitScoped or checkRateLimit', () => {
		for (const file of exportFiles) {
			const relPath = path.relative(process.cwd(), file);
			const content = fs.readFileSync(file, 'utf8');
			expect(
				content.includes('rateLimitScoped') || content.includes('checkRateLimit'),
				`Expected export endpoint ${relPath} to call rateLimitScoped or checkRateLimit`
			).toBe(true);
		}
	});

	it('enforces distinct, isolated rate limit bucket names across export endpoints', () => {
		const bucketToRoute = new Map<string, string>();

		for (const file of exportFiles) {
			const relPath = path.relative(process.cwd(), file);
			const content = fs.readFileSync(file, 'utf8');

			const bucketNames: string[] = [];
			const rateLimitScopedRegex = /rateLimitScoped\s*\(\s*\{[\s\S]*?name:\s*['"]([^'"]+)['"]/g;
			for (const match of content.matchAll(rateLimitScopedRegex)) {
				if (match[1]) bucketNames.push(match[1]);
			}
			const checkRateLimitRegex = /checkRateLimit\s*\(\s*[`'"]([^:`'"]+)/g;
			for (const match of content.matchAll(checkRateLimitRegex)) {
				if (match[1]) bucketNames.push(match[1]);
			}

			expect(
				bucketNames.length,
				`Expected export route ${relPath} to specify a named rate limit bucket in rateLimitScoped or checkRateLimit`
			).toBeGreaterThan(0);

			for (const bucketName of bucketNames) {
				const existing = bucketToRoute.get(bucketName);
				if (existing && existing !== relPath) {
					throw new Error(
						`Rate limit bucket collision: '${bucketName}' is shared between ${existing} and ${relPath}. Export endpoints must use isolated bucket names.`
					);
				}
				bucketToRoute.set(bucketName, relPath);
			}
		}
	});
});
