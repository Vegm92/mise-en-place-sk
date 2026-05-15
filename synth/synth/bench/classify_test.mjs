/**
 * Quick test: run classifyFile() + text extraction against every PDF in a directory.
 * Does NOT call Gemini — validates the synthetic PDFs are well-formed and correctly routed.
 *
 * Usage: npx tsx synth/synth/bench/classify_test.mjs <output_dir>
 *
 * Note: inlines the classify logic from src/lib/server/extract.ts because that module
 * transitively imports $env/dynamic/private (SvelteKit-only), which tsx can't resolve
 * outside the SvelteKit build context. The logic is intentionally identical.
 */

import { readdir, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve, join, extname } from "node:path";
import pdfParse from "pdf-parse";

const PDF_PARSE_TIMEOUT_MS = 15_000;

async function classifyPdf(filePath) {
  const buf = readFileSync(filePath);
  try {
    const timeout = new Promise((_, rej) =>
      setTimeout(() => rej(new Error("pdf-parse timeout")), PDF_PARSE_TIMEOUT_MS)
    );
    const result = await Promise.race([pdfParse(buf), timeout]);
    const text = result.text.trim();
    return text.length >= 50 ? { type: "text_pdf", text } : { type: "scanned_pdf" };
  } catch {
    return { type: "scanned_pdf" };
  }
}

function classifyFile(filePath) {
  const ext = extname(filePath).toLowerCase().replace(".", "");
  if (ext === "pdf") return classifyPdf(filePath);
  if (ext === "jpg" || ext === "jpeg" || ext === "png") return Promise.resolve({ type: "image" });
  throw new Error(`Unsupported file type: .${ext}`);
}

const outputDir = resolve(process.argv[2] || "./synth/output/test_mixed");

const files = (await readdir(outputDir))
  .filter((f) => f.endsWith(".pdf"))
  .sort();

if (!files.length) {
  console.error("No PDF files found in", outputDir);
  process.exit(1);
}

// Load manifest for ground truth meta
const manifestPath = join(outputDir, "_manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
const metaByBasename = Object.fromEntries(
  manifest.map((e) => [e.basename, e])
);

const results = { text_pdf: 0, scanned_pdf: 0, errors: 0 };
const rows = [];

for (const file of files) {
  const filePath = join(outputDir, file);
  const basename = file.replace(".pdf", "");
  const meta = metaByBasename[basename] || {};

  try {
    const classified = await classifyFile(filePath);
    results[classified.type] = (results[classified.type] || 0) + 1;

    const textSnippet =
      classified.type === "text_pdf"
        ? classified.text.slice(0, 80).replace(/\n/g, " ").trim()
        : "(binary/image)";

    rows.push({
      file,
      type: classified.type,
      template: meta.template || "?",
      difficulty: meta.difficulty || "?",
      degradations: (meta.degradations || []).slice(0, 2).join(",") || "-",
      textSnippet,
    });
  } catch (err) {
    results.errors++;
    rows.push({
      file,
      type: "ERROR",
      template: meta.template || "?",
      difficulty: meta.difficulty || "?",
      degradations: "-",
      textSnippet: String(err).slice(0, 80),
    });
  }
}

// Print table
const COL = [30, 12, 26, 8, 30, 82];
const header = ["File", "Classified", "Template", "Diff", "Degradations", "Text snippet"];
const line = header.map((h, i) => h.padEnd(COL[i])).join(" | ");
console.log("\n" + line);
console.log("-".repeat(line.length));

for (const r of rows) {
  const typeColor = r.type === "text_pdf" ? "\x1b[32m" : r.type === "ERROR" ? "\x1b[31m" : "\x1b[33m";
  const row = [
    r.file.padEnd(COL[0]),
    (typeColor + r.type + "\x1b[0m").padEnd(COL[1] + 12),
    r.template.padEnd(COL[2]),
    r.difficulty.padEnd(COL[3]),
    r.degradations.padEnd(COL[4]),
    r.textSnippet,
  ].join(" | ");
  console.log(row);
}

console.log("\n─── Summary ─────────────────────────────────────────");
console.log(`  text_pdf:    ${results.text_pdf}  (will use pdf-parse → Gemini text path)`);
console.log(`  scanned_pdf: ${results.scanned_pdf}  (will use Gemini vision path)`);
console.log(`  errors:      ${results.errors}`);
console.log(`  total:       ${files.length}`);
console.log();
