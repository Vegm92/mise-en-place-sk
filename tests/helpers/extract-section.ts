import { expect } from 'vitest';

export function assertSectionUsesTokens(pageSrc: string, marker: string, tokenClasses: string[]): void {
	const markerIdx = pageSrc.indexOf(marker);
	expect(markerIdx, `marker not found: ${marker}`).toBeGreaterThan(-1);
	const sectionStart = pageSrc.lastIndexOf('<section', markerIdx);
	const sectionEnd = pageSrc.indexOf('</section>', markerIdx);
	expect(sectionStart, `<section> not found before ${marker}`).toBeGreaterThan(-1);
	expect(sectionEnd, `</section> not found after ${marker}`).toBeGreaterThan(-1);
	const section = pageSrc.slice(sectionStart, sectionEnd);
	for (const token of tokenClasses) expect(section, `expected "${token}" in section for ${marker}`).toContain(token);
	expect(section, `hex color literal in section for ${marker}`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
	expect(section, `leftover inline var(--mep-*) in section for ${marker}`).not.toContain('var(--mep-');
}
