#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

const GATES = {
	'no-sql-raw': {
		roots: ['src'],
		extensions: ['.ts', '.svelte'],
		pattern: /sql\.raw\(/,
		message: 'sql.raw() is banned — use parameterized sql`...` templates instead'
	},
	'tenant-scope': {
		roots: ['src/routes', 'src/lib/server'],
		extensions: ['.ts'],
		pattern: /eq\([a-zA-Z]*\.restaurantId,/,
		exclude: (filePath) => filePath.includes(`${path.sep}admin${path.sep}`) || path.basename(filePath) === 'tenant.ts',
		message: 'raw eq(*.restaurantId,...) found — use forTenant().scope() instead (ADR-001 / issue #138)'
	}
};

function walk(dir, extensions) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...walk(full, extensions));
		} else if (extensions.includes(path.extname(entry.name))) {
			files.push(full);
		}
	}
	return files;
}

function runGate(name, gate) {
	const violations = [];
	for (const root of gate.roots) {
		const absRoot = path.join(ROOT, root);
		if (!fs.existsSync(absRoot)) continue;
		for (const file of walk(absRoot, gate.extensions)) {
			if (gate.exclude?.(file)) continue;
			const lines = fs.readFileSync(file, 'utf8').split('\n');
			lines.forEach((line, i) => {
				if (gate.pattern.test(line)) {
					violations.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
				}
			});
		}
	}
	if (violations.length > 0) {
		console.error(`Error: ${gate.message}`);
		for (const v of violations) console.error(`  ${v}`);
		return false;
	}
	return true;
}

const requested = process.argv[2];
const names = requested ? [requested] : Object.keys(GATES);

let ok = true;
for (const name of names) {
	const gate = GATES[name];
	if (!gate) {
		console.error(`Unknown lint gate: ${name}`);
		process.exit(1);
	}
	if (!runGate(name, gate)) ok = false;
}

process.exit(ok ? 0 : 1);
