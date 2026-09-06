/**
 * Fix noUncheckedIndexedAccess errors in test files.
 * Reads pre-captured errors from /tmp/test-errors.txt
 */

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const ERRORS_FILE = process.env.TEMP
  ? `${process.env.TEMP}/test-errors.txt`
  : '/tmp/test-errors.txt';
const errorsRaw = readFileSync(ERRORS_FILE, 'utf8');

const errors = [];
for (const line of errorsRaw.split('\n')) {
  const m = line.match(/ERROR "([^"]+)" (\d+):(\d+) "(.+)"/s);
  if (!m) continue;
  const [, file, lineStr, colStr, msg] = m;
  errors.push({
    file: file.replace(/\\/g, '/'),
    line: parseInt(lineStr),
    col: parseInt(colStr),
    msg: msg.replace(/\\n.*/s, '').trim(),
  });
}

const byFile = new Map();
for (const e of errors) {
  if (!byFile.has(e.file)) byFile.set(e.file, []);
  byFile.get(e.file).push(e);
}

/**
 * Given a line and a starting column (0-indexed), find the end of the
 * array/property access expression `identifier[...]` and return the position
 * right after the closing `]`.
 */
function findClosingBracket(line, startCol) {
  // Skip the identifier to find `[`
  let i = startCol;
  while (i < line.length && /[a-zA-Z0-9_$.]/.test(line[i])) i++;
  if (i >= line.length || line[i] !== '[') return -1;
  // Find matching `]`
  let depth = 0;
  while (i < line.length) {
    if (line[i] === '[') depth++;
    else if (line[i] === ']') {
      depth--;
      if (depth === 0) return i + 1; // position right after `]`
    }
    i++;
  }
  return -1;
}

/**
 * Insert `!` at position `pos` in the string.
 */
function insertAt(str, pos, char = '!') {
  return str.slice(0, pos) + char + str.slice(pos);
}

let fixCount = 0;
let skipCount = 0;

for (const [relPath, fileErrors] of byFile) {
  const absPath = path.join(ROOT, relPath);
  let content;
  try {
    content = readFileSync(absPath, 'utf8');
  } catch {
    console.error(`Cannot read: ${absPath}`);
    continue;
  }

  const lines = content.split('\n');
  let changed = false;

  // Sort by line descending, then col descending so we can insert without
  // shifting earlier positions in the same line.
  fileErrors.sort((a, b) => b.line - a.line || b.col - a.col);

  for (const err of fileErrors) {
    const lineIdx = err.line - 1;
    let lineText = lines[lineIdx];
    if (lineText === undefined) { skipCount++; continue; }

    const colIdx = err.col - 1; // 0-indexed
    let fixed = lineText;

    if (err.msg.startsWith("Cannot invoke an object which is possibly 'undefined'")) {
      // Find `.identifier(` or `identifier(` near the error — the method being invoked
      // is a property of a Record and TS can't know it exists.
      // Pattern: foo.bar( → foo.bar!(
      // We look for the `(` at or near colIdx
      // Find the call: look for `).actions.xxx(` pattern or just `.identifier(`
      // The simplest approach: find the last `.identifier(` before end of line
      // and add `!` before `(`
      const m = lineText.match(/\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(\()/);
      if (m && m.index !== undefined) {
        // Add `!` before the `(`
        const parenPos = m.index + m[0].lastIndexOf('(');
        fixed = insertAt(lineText, parenPos, '!');
      } else {
        // Fallback: add `!` before the `(` at/near colIdx
        const parenIdx = lineText.indexOf('(', colIdx);
        if (parenIdx >= 0) {
          fixed = insertAt(lineText, parenIdx, '!');
        }
      }
    } else if (/^'[^']+' is possibly 'undefined'/.test(err.msg)) {
      // Extract the variable name
      const nameMatch = err.msg.match(/^'([^']+)' is possibly/);
      if (nameMatch) {
        const varName = nameMatch[1];
        // At colIdx, find `varName` and add `!` right after it
        const varPos = lineText.indexOf(varName, colIdx);
        if (varPos >= 0) {
          const after = varPos + varName.length;
          // Add `!` before `.` or `[`
          if (lineText[after] === '.' || lineText[after] === '[') {
            fixed = insertAt(lineText, after, '!');
          }
        }
      }
    } else if (err.msg.startsWith("Object is possibly 'undefined'")) {
      // `identifier[N]` at colIdx — add `!` after the `]`
      const afterBracket = findClosingBracket(lineText, colIdx);
      if (afterBracket > 0) {
        fixed = insertAt(lineText, afterBracket, '!');
      }
    } else if (err.msg.includes("is not assignable to parameter of type 'string'") ||
               err.msg.includes("is not assignable to type 'string'") ||
               err.msg.includes("is not assignable to type 'string | null'")) {
      // `string | undefined` where `string` or `string | null` needed.
      // Most common: `arr[idx]` or `record[key]` → add `??` or `!`
      // Find last `]` before or at col and add `!`
      const before = lineText.slice(0, colIdx + 1);
      const bracketIdx = before.lastIndexOf(']');
      if (bracketIdx >= 0) {
        fixed = insertAt(lineText, bracketIdx + 1, '!');
      } else {
        // Maybe an identifier access that returns string|undefined
        // Try adding `!` at colIdx to the end of the identifier
        const identEnd = lineText.slice(colIdx).match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
        if (identEnd) {
          fixed = insertAt(lineText, colIdx + identEnd[0].length, '!');
        }
      }
    }

    if (fixed !== lineText) {
      lines[lineIdx] = fixed;
      changed = true;
      fixCount++;
      console.log(`Fixed ${relPath}:${err.line} - ${err.msg.slice(0, 70)}`);
    } else {
      skipCount++;
      console.warn(`SKIPPED ${relPath}:${err.line}:${err.col} - ${err.msg.slice(0, 70)}`);
    }
  }

  if (changed) {
    writeFileSync(absPath, lines.join('\n'), 'utf8');
  }
}

console.log(`\nFixed: ${fixCount}, Skipped: ${skipCount}`);
