/**
 * The one place the active theme is written.
 *
 * Three layouts each had their own `toggleTheme()` doing the same two steps.
 * There is now a third step — keeping the PWA `theme-color` in sync so the
 * browser and OS chrome around the page match the theme — and a fourth copy of
 * that is exactly how the first two drifted apart. `static/theme-init.js` does
 * the same work inline before first paint; it cannot import this, so the two
 * must agree, and the colours below are the reason they are named here rather
 * than repeated at each call site.
 */

/** Must match --mep-bg in src/app.css for each theme. */
const CHROME = { light: '#f5f4f0', dark: '#16151a' } as const;

export type Theme = 'light' | 'dark';

export const STORAGE_KEY = 'mep-theme';

/** Read the theme currently applied to the document. */
export function currentTheme(): Theme {
	if (typeof document === 'undefined') return 'light';
	return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/**
 * Apply a theme: stamp the attribute every `--mep-*` override keys off, tint
 * the browser chrome to match, and remember the choice.
 */
export function applyTheme(theme: Theme): Theme {
	if (typeof document === 'undefined') return theme;

	document.documentElement.dataset.theme = theme;

	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) meta.setAttribute('content', CHROME[theme]);

	try {
		localStorage.setItem(STORAGE_KEY, theme);
	} catch {
		// Private mode, or storage disabled. The theme still applies for this
		// page; it just will not survive a reload.
	}
	return theme;
}

/** Flip to the other theme and apply it. Returns the theme now in effect. */
export function toggleTheme(): Theme {
	return applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}
