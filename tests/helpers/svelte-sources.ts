/**
 * The preamble every source-grep test over the component tree was repeating:
 * repo root, src/, and a depth-first list of .svelte files.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(__dirname, '..', '..');
export const SRC = path.join(ROOT, 'src');

export function svelteFiles(dir: string = SRC): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) found.push(...svelteFiles(full));
		else if (entry.name.endsWith('.svelte')) found.push(full);
	}
	return found;
}
