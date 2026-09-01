import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadAllMessages } from '../../src/lib/i18n';

await loadAllMessages();

export const ROOT = path.resolve(__dirname, '../..');
export const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');
