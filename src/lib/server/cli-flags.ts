export function flag(name: string): string | null {
	const idx = process.argv.indexOf(`--${name}`);
	if (idx === -1) return null;
	const value = process.argv[idx + 1];
	return value && !value.startsWith('--') ? value : '';
}

export function hasFlag(name: string): boolean {
	return process.argv.includes(`--${name}`);
}
