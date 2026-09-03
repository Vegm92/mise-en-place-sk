import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadAllMessages, setLocale, t } from '../../src/lib/i18n';

await loadAllMessages();

export const ROOT = path.resolve(__dirname, '../..');
export const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

export function untranslated(keys: readonly string[]): string[] {
	const missing: string[] = [];
	for (const lc of ['es', 'en'] as const) {
		setLocale(lc);
		for (const key of keys) if (t(key) === key) missing.push(`${lc}:${key}`);
	}
	setLocale('es');
	return missing;
}
