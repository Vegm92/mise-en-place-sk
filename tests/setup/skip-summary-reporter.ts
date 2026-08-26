/**
 * Vitest reporter that prints the end-of-run skip summary (issue #520).
 *
 * Registered after `default` in vite.config.ts, so it writes *below* the
 * "Test Files … skipped" line where a developer actually looks. Output goes to
 * stderr directly rather than through console.* — reporters run outside a test
 * context, where Vitest's console interception would swallow it.
 *
 * All of the decision-making lives in ./skip-summary.ts so it can be tested.
 */
import type { Reporter, TestModule } from 'vitest/node';
import { resolveDbGate } from '../helpers/db-gate';
import { skipSummary, type SkippedModule } from './skip-summary';

export default class SkipSummaryReporter implements Reporter {
	onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
		const skipped: SkippedModule[] = [];

		for (const mod of testModules) {
			const tests = [...mod.children.allTests()];
			if (tests.length === 0) continue;
			const skippedTests = tests.filter((t) => t.result().state === 'skipped');
			if (skippedTests.length === tests.length) {
				skipped.push({ moduleId: mod.moduleId, skipped: skippedTests.length, total: tests.length });
			}
		}

		const summary = skipSummary({
			skipped,
			totalModules: testModules.length,
			gate: resolveDbGate(process.env),
			cwd: process.cwd(),
		});

		if (summary) process.stderr.write(`${summary}\n`);
	}
}
