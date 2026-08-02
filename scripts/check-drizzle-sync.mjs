#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

execFileSync('pnpm', ['exec', 'drizzle-kit', 'generate'], { cwd: ROOT, stdio: 'inherit' });

const status = execFileSync('git', ['status', '--porcelain', '--', 'drizzle/'], {
	cwd: ROOT,
	encoding: 'utf8'
});

if (status.trim().length > 0) {
	execFileSync('git', ['checkout', '--', 'drizzle/'], { cwd: ROOT, stdio: 'inherit' });
	execFileSync('git', ['clean', '-fd', '--', 'drizzle/'], { cwd: ROOT, stdio: 'inherit' });
	console.error('\nschema.ts has changes not captured by a committed migration.');
	console.error('Run `pnpm db:generate` locally and commit the resulting drizzle/*.sql file.\n');
	process.exit(1);
}

console.log('drizzle/ is in sync with schema.ts.');
