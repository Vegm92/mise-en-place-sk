try {
	const l = localStorage.getItem('mep-locale');
	document.documentElement.lang = l === 'es' || l === 'en' ? l : 'es';
} catch (e) {}

try {
	let t = localStorage.getItem('mep-theme');
	if (t !== 'dark' && t !== 'light') {
		t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	}
	setTheme(t);
} catch (e) {
	setTheme('light');
}

/* Mirrors applyTheme() in src/lib/theme.ts, minus the write-back to storage —
   this only ever reflects what is already stored. CHROME must match --mep-bg. */
function setTheme(t) {
	document.documentElement.dataset.theme = t;
	var meta = document.querySelector('meta[name="theme-color"]');
	if (meta) meta.setAttribute('content', t === 'dark' ? '#131314' : '#f1f0ee');
}
