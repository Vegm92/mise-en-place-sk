#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const knipBin = fileURLToPath(new URL("../node_modules/knip/bin/knip.js", import.meta.url));
const knipConfig = JSON.parse(readFileSync(new URL("../knip.json", import.meta.url), "utf8"));

let stdout;
try {
	stdout = execFileSync(process.execPath, [knipBin, "--include", "files", "--reporter", "json"], {
		cwd: root,
		encoding: "utf8"
	});
} catch (err) {
	stdout = err.stdout ?? "";
}

const jsonStart = stdout.indexOf('{"issues"');
const { issues } = JSON.parse(stdout.slice(jsonStart));
const orphans = issues.map((i) => i.file).sort();

mkdirSync("graph-out", { recursive: true });

const lines = [
	"# Route-Aware Dependency Graph Report",
	"",
	`Generated: ${new Date().toISOString()}`,
	"",
	"## What this is",
	"`knip` (SvelteKit plugin auto-detected via `@sveltejs/kit` in package.json) parses",
	"`.svelte` component scripts and SvelteKit route conventions, unlike the Madge report",
	"(`madge-out/MADGE_REPORT.md`), which only sees `.ts`/`.js` static imports. This report",
	"answers the question Madge can't: is a file reachable from a page/component, not just",
	"from another module?",
	"",
	"## Runtime roots (classified, not dead code)",
	"SvelteKit route files (`+page`, `+layout`, `+server`, `+page.server`, `+layout.server`),",
	"`src/hooks.server.ts`, `src/hooks.client.ts` and config files are treated as entry points",
	"automatically by knip's SvelteKit plugin. The following are declared explicitly in",
	"`knip.json` because they are invoked by the worker process, Railway deploy config, or a",
	"human running a CLI script, never by a static `import`:",
	"",
	knipConfig.entry.map((e) => `- ${e}`).join("\n"),
	"",
	"## Confidence and limitations",
	"- A file NOT listed as an orphan below is proven reachable from a runtime root, including",
	"  through a `.svelte` component's `<script>` block — this is the guarantee Madge cannot give.",
	"- A file listed below is unreferenced by every classified root above. Verify with a grep",
	"  before deleting: dynamic `import()`, string-built paths, and files loaded outside this",
	"  repo (e.g. by an external cron) are invisible to any static analyzer, knip included.",
	"- This report only runs knip's `files` check (unused-file detection). It does not run",
	"  knip's unused-dependency or unused-export checks, which are noisier on this codebase",
	"  and out of scope for this graph.",
	"",
	`## Orphans (${orphans.length})`,
	orphans.length ? orphans.map((f) => `- ${f}`).join("\n") : "None.",
	""
];

writeFileSync("graph-out/GRAPH_REPORT.md", lines.join("\n"));
console.log("graph-out/GRAPH_REPORT.md written");
console.log(`orphans: ${orphans.length}`);
