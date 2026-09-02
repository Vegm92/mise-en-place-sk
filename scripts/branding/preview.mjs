import { readFileSync, writeFileSync } from 'node:fs';
const f = process.argv[2];
const src = readFileSync(f, 'utf8');
const body = src.split('<x-dc>')[1].split('</x-dc>')[0];
const helmet = body.split('<helmet>')[1].split('</helmet>')[0];
const rest = body.split('</helmet>')[1];
writeFileSync(process.argv[3], `<!doctype html><html><head><meta charset="utf-8">${helmet}<style>html,body{margin:0;background:#888;}</style></head><body>${rest}</body></html>`);
