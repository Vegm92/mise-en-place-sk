/**
 * The preamble every source-grep test over the component tree was repeating:
 * repo root, src/, and a depth-first list of .svelte files.
 */
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(__dirname, '..', '..');
export const SRC = path.join(ROOT, 'src');

export function svelteFiles(dir: string = SRC, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) svelteFiles(full, out);
		else if (entry.endsWith('.svelte')) out.push(full);
	}
	return out;
}
