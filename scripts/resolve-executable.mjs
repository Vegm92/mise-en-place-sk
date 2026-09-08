import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolves `name` to an absolute path by walking PATH ourselves, once, so
 * every later execFileSync call passes an absolute path instead of a bare
 * command name (SonarCloud S4036 — a bare name re-resolves against PATH on
 * every call, which a writable/tampered PATH entry earlier in the list
 * could hijack; resolving once up front and reusing the absolute path closes
 * that window for the rest of this process).
 *
 * Shared rather than copied: `check-duplication.mjs` had the only copy, and
 * `lint-invariants.mjs` shells out to git for the same reasons. Two copies
 * would trip the duplication gate the first script exists to approximate.
 *
 * @param {string} name
 * @returns {string}
 */
export function resolveExecutable(name) {
	const exts = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : [''];
	for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
		if (!dir) continue;
		for (const ext of exts) {
			const candidate = path.join(dir, name + ext);
			try {
				fs.accessSync(candidate, fs.constants.X_OK);
				return candidate;
			} catch {
				continue;
			}
		}
	}
	throw new Error(`resolve-executable: "${name}" not found on PATH.`);
}
