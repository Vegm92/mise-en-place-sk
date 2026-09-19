/**
 * Issue #1121 — `scripts/check-duplication.mjs` used to miss SonarCloud's
 * "Duplication on New Code" gate two ways: it never scanned `tests/`, and it
 * matched string literals exactly, so two blocks that differ only in their
 * string literals (SonarJS's CPD tokenizer treats those as the same
 * sequence) were invisible to it. Both are exercised here against a real,
 * throwaway git repo — the script shells out to git and needs an actual
 * history to diff against.
 *
 * PR #1126 added the third case: a run of consecutive identical lines is
 * collapsed to its first and last before any block is built, as SonarQube's
 * `PmdBlockChunker` does, so two locale tables that are token-identical once
 * literals are anonymised are not a clone — which is what SonarCloud reports
 * for this project's own `src/lib/messages/{en,es}.ts`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/check-duplication.mjs');

const ROLE_CONTRACT_CASE = (tenant: string) => `
	it('accepts owner for ${tenant}', () => {
		const role = resolveRole('${tenant}', 'owner')
		expect(role.tenant).toBe('${tenant}')
		expect(role.level).toBe('owner')
		expect(role.scope).toBe('full')
		expect(role.region).toBe('eu-west')
		expect(role.tier).toBe('enterprise')
		expect(role.plan).toBe('annual')
		expect(role.status).toBe('active')
		expect(role.channel).toBe('web')
	})
`;

function initRepo(): string {
	const dir = mkdtempSync(path.join(tmpdir(), 'check-duplication-'));
	execFileSync('git', ['init', '-q'], { cwd: dir });
	execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
	execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir });
	mkdirSync(path.join(dir, 'tests'), { recursive: true });
	writeFileSync(path.join(dir, 'tests', 'placeholder.ts'), 'export const placeholder = 1;\n');
	execFileSync('git', ['add', '-A'], { cwd: dir });
	execFileSync('git', ['commit', '-q', '-m', 'base'], { cwd: dir });
	return dir;
}

function commitAll(dir: string, files: Record<string, string>): void {
	for (const [file, contents] of Object.entries(files)) {
		mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
		writeFileSync(path.join(dir, file), contents);
	}
	execFileSync('git', ['add', '-A'], { cwd: dir });
	execFileSync('git', ['commit', '-q', '-m', 'add fixture'], { cwd: dir });
}

function commit(dir: string, file: string, contents: string): void {
	commitAll(dir, { [file]: contents });
}

function localeTable(value: (n: number) => string): string {
	const keys = Array.from({ length: 30 }, (_, n) => `\t'section.key${n}': '${value(n)}',`);
	return ['export default {', ...keys, '};', ''].join('\n');
}

function run(dir: string, base: string): { status: number; stdout: string } {
	try {
		const stdout = execFileSync(process.execPath, [SCRIPT, '--base', base], { cwd: dir, encoding: 'utf8' });
		return { status: 0, stdout };
	} catch (err) {
		const e = err as { stdout?: string; status?: number };
		return { status: e.status ?? 1, stdout: e.stdout ?? '' };
	}
}

describe('check-duplication.mjs (issue #1121)', () => {
	let dir: string;

	afterEach(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
	});

	it('reports a test that differs from its neighbour only in string literals as a clone', () => {
		dir = initRepo();
		const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
		const fixture = `import { describe, expect, it } from 'vitest'

function resolveRole(tenant: string, level: string) {
	return { tenant, level, scope: 'full', region: 'eu-west', tier: 'enterprise', plan: 'annual', status: 'active', channel: 'web' }
}

describe('role contract', () => {
${ROLE_CONTRACT_CASE('restaurant-a')}
${ROLE_CONTRACT_CASE('restaurant-b')}
})
`;
		commit(dir, 'tests/role-contract.test.ts', fixture);

		const { status, stdout } = run(dir, base);

		expect(status).toBe(1);
		expect(stdout).toContain('tests/role-contract.test.ts');
		expect(stdout).toMatch(/\d+\/\d+ new lines duplicated \((\d+(?:\.\d+)?)%/);
	});

	it('does not report parallel locale-table additions as duplicated (PR #1126)', () => {
		dir = initRepo();
		const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
		commitAll(dir, {
			'src/lib/messages/en.ts': localeTable((n) => `English copy ${n}`),
			'src/lib/messages/es.ts': localeTable((n) => `Texto en castellano ${n}`),
		});

		const { status, stdout } = run(dir, base);

		expect(stdout).not.toContain('src/lib/messages');
		expect(stdout).toContain('0/');
		expect(status).toBe(0);
	});

	it('still reports a real clone that happens to sit in a locale file (PR #1126)', () => {
		dir = initRepo();
		const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
		const shared = Array.from(
			{ length: 30 },
			(_, n) => `\tstep${n}: 'Paso ${n}',`,
		).join('\n');
		commitAll(dir, {
			'src/lib/wizard.ts': ['export const wizard = {', shared, '};', ''].join('\n'),
			'src/lib/messages/es.ts': [localeTable((n) => `Texto ${n}`), 'export const pasted = {', shared, '};', ''].join('\n'),
		});

		const { status, stdout } = run(dir, base);

		expect(stdout).toMatch(/src\/lib\/messages\/es\.ts — \d+ new line/);
		expect(status).toBe(1);
	});

	it('passes a branch whose added lines are not duplicated', () => {
		dir = initRepo();
		const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
		commit(dir, 'tests/unique.test.ts', "export const uniqueOnce = 42;\n");

		const { status, stdout } = run(dir, base);

		expect(status).toBe(0);
		expect(stdout).toContain('check-duplication: OK');
	});
});
