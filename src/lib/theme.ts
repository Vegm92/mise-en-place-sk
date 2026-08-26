const CHROME = { light: '#f1f0ee', dark: '#131314' } as const;

export type Theme = 'light' | 'dark';

export const STORAGE_KEY = 'mep-theme';

export function currentTheme(): Theme {
	if (typeof document === 'undefined') return 'light';
	return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): Theme {
	if (typeof document === 'undefined') return theme;

	document.documentElement.dataset.theme = theme;

	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) meta.setAttribute('content', CHROME[theme]);

	try {
		localStorage.setItem(STORAGE_KEY, theme);
	} catch {
	}
	return theme;
}

export function toggleTheme(): Theme {
	return applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}
