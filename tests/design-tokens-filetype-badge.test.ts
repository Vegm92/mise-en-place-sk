import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

const CALL_SITES = [
  'src/routes/(app)/batch/[id]/+page.svelte',
  'src/lib/components/UploadPanel.svelte'
];

const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('file-type badge design tokens', () => {
  it('none of the call sites hardcode the badge hex colors', () => {
    for (const rel of CALL_SITES) {
      const src = read(rel);
      expect(src.toLowerCase()).not.toContain('#c14a4a');
      expect(src.toLowerCase()).not.toContain('#6a8a6a');
    }
  });

  it('every call site uses the shared FileTypeBadge component', () => {
    for (const rel of CALL_SITES) {
      const src = read(rel);
      expect(src).toMatch(/import\s+FileTypeBadge\s+from\s+['"][^'"]*FileTypeBadge\.svelte['"]/);
      expect(src).toMatch(/<FileTypeBadge\b/);
    }
  });

  it('src/app.css defines the badge-color custom properties', () => {
    const css = read('src/app.css');
    expect(css).toMatch(/--mep-badge-pdf\s*:/);
    expect(css).toMatch(/--mep-badge-other\s*:/);
  });

  it('the badge-color tokens are defined per-theme, following the --mep-* pattern', () => {
    const css = read('src/app.css');
    const rootBlock = css.match(/:root\s*{[\s\S]*?\n}/);
    const lightBlock = css.match(/:root\[data-theme=["']light["']\]\s*{[\s\S]*?\n}/);
    const darkBlock = css.match(/:root\[data-theme=["']dark["']\]\s*{[\s\S]*?\n}/);

    expect(rootBlock).not.toBeNull();
    expect(lightBlock).not.toBeNull();
    expect(darkBlock).not.toBeNull();

    expect(rootBlock![0]).toMatch(/--mep-badge-pdf\s*:/);
    expect(rootBlock![0]).toMatch(/--mep-badge-other\s*:/);
    expect(lightBlock![0]).toMatch(/--mep-badge-pdf\s*:/);
    expect(lightBlock![0]).toMatch(/--mep-badge-other\s*:/);
    expect(darkBlock![0]).toMatch(/--mep-badge-pdf\s*:/);
    expect(darkBlock![0]).toMatch(/--mep-badge-other\s*:/);
  });
});
