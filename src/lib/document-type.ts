export type DocumentKind = 'factura' | 'albaran';

export function documentKind(raw: unknown): DocumentKind | null {
	return raw === 'factura' || raw === 'albaran' ? raw : null;
}

export function docKey(base: string, raw: unknown): string {
	const kind = documentKind(raw);
	return kind ? `${base}.${kind}` : base;
}
