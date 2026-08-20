try {
	const l = localStorage.getItem('mep-locale');
	document.documentElement.lang = l === 'es' || l === 'en' ? l : 'es';
} catch (e) {}

try {
	let t = localStorage.getItem('mep-theme');
	if (t !== 'dark' && t !== 'light') {
		t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	}
	document.documentElement.dataset.theme = t;
} catch (e) {
	document.documentElement.dataset.theme = 'light';
}
