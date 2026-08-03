#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

const drizzleStatus = () =>
	execFileSync('git', ['status', '--porcelain', '--', 'drizzle/'], {
		cwd: ROOT,
		encoding: 'utf8'
	});

// The cleanup below is `git checkout` + `git clean` scoped to drizzle/, which
// cannot tell a file drizzle-kit just generated from one a human is still
// editing — it would discard both. Refuse to run rather than destroy a
// hand-written migration in progress. CI always checks out clean, so this
// never fires there.
if (drizzleStatus().trim().length > 0) {
	console.error('\ndrizzle/ has uncommitted changes; refusing to run.');
	console.error('This check discards anything drizzle-kit generates, and cannot');
	console.error('distinguish that from your own edits. Commit or stash drizzle/ first.\n');
	process.exit(1);
}

execFileSync('pnpm', ['exec', 'drizzle-kit', 'generate'], { cwd: ROOT, stdio: 'inherit' });

// Anything dirty now is necessarily drizzle-kit's own output: the tree was
// verified clean above.
if (drizzleStatus().trim().length > 0) {
	execFileSync('git', ['checkout', '--', 'drizzle/'], { cwd: ROOT, stdio: 'inherit' });
	execFileSync('git', ['clean', '-fd', '--', 'drizzle/'], { cwd: ROOT, stdio: 'inherit' });
	console.error('\nschema.ts has changes not captured by a committed migration.');
	console.error('Run `pnpm db:generate` locally and commit the resulting drizzle/*.sql file.\n');
	process.exit(1);
}

console.log('drizzle/ is in sync with schema.ts.');
