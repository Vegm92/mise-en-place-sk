#!/usr/bin/env node
import madge from "madge";
import { mkdirSync, writeFileSync } from "node:fs";

// ponytail: .svelte files skipped — madge has no Svelte AST detector, only .ts/.js.
// Server logic (where the real coupling/bottlenecks live) is all .ts anyway.
// madge's resolver needs an explicit `baseUrl` to use tsconfig `paths` — the
// generated .svelte-kit/tsconfig.json uses TS's newer `pathsBasePath` instead,
// which madge doesn't understand, silently dropping every `$lib/...` import.
// scripts/madge.tsconfig.json is a minimal standalone config with baseUrl set.
const res = await madge("src", {
	tsConfig: "scripts/madge.tsconfig.json",
	fileExtensions: ["ts", "js"],
	excludeRegExp: [/\.test\.ts$/, /\.spec\.ts$/]
});

const graph = res.obj();
const circular = res.circular();
// SvelteKit route convention files (+page.server.ts etc.) are invoked by the
// router, never `import`ed — madge always sees them as orphans. Filter those
// false positives out; a real orphan candidate is anything else on this list.
const isRouteFile = (f) => /^routes\/.*\+(page|layout)(\.server)?\.ts$|\+server\.ts$/.test(f);
const orphans = res.orphans().filter((f) => !isRouteFile(f));

const fanIn = {}; // how many files import this one (hub / hard to change)
for (const [, deps] of Object.entries(graph)) {
	for (const dep of deps) fanIn[dep] = (fanIn[dep] || 0) + 1;
}
const topHubs = Object.entries(fanIn)
	.sort((a, b) => b[1] - a[1])
	.slice(0, 15);

const topFanOut = Object.entries(graph)
	.map(([file, deps]) => [file, deps.length])
	.sort((a, b) => b[1] - a[1])
	.slice(0, 15);

mkdirSync("madge-out", { recursive: true });
writeFileSync("madge-out/graph.json", JSON.stringify(graph, null, 2));

const lines = [
	"# Madge Report",
	"",
	`Generated: ${new Date().toISOString()}`,
	`Files graphed: ${Object.keys(graph).length}`,
	"",
	"## Circular imports",
	circular.length
		? circular.map((c) => `- ${c.join(" -> ")}`).join("\n")
		: "None.",
	"",
	"## Orphans (no incoming edges from other .ts/.js files)",
	"Caveat: this graph doesn't parse `.svelte` files, so anything only imported",
	"from a `.svelte` component's `<script>` block shows up here too. Grep the",
	"filename before assuming it's dead code.",
	"",
	orphans.length ? orphans.map((f) => `- ${f}`).join("\n") : "None.",
	"",
	"## Most depended-on files (fan-in — touch these carefully)",
	topHubs.map(([f, n]) => `- ${f} — imported by ${n} files`).join("\n"),
	"",
	"## Files that import the most (fan-out — highest coupling)",
	topFanOut.map(([f, n]) => `- ${f} — imports ${n} files`).join("\n"),
	""
];

writeFileSync("madge-out/MADGE_REPORT.md", lines.join("\n"));
console.log("madge-out/MADGE_REPORT.md written");
console.log(`circular: ${circular.length}, orphans: ${orphans.length}, files: ${Object.keys(graph).length}`);
