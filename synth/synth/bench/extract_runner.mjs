#!/usr/bin/env node
/**
 * Node shim: runs extractInvoice() from the production extract.ts and prints JSON to stdout.
 * Usage: npx tsx synth/synth/bench/extract_runner.mjs <file_path>
 */

import { extractInvoice } from "../../../src/lib/server/extract.js";
import { resolve } from "path";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: extract_runner.mjs <file_path>");
  process.exit(1);
}

try {
  const result = await extractInvoice(resolve(filePath));
  process.stdout.write(JSON.stringify(result, null, 2));
} catch (err) {
  process.stderr.write(String(err) + "\n");
  process.exit(1);
}
