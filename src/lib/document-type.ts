export function documentTypeLabelKey(value: string | null | undefined): string {
	return value === 'factura' || value === 'albaran'
		? `field.documentType.${value}`
		: 'field.documentType.unknown';
}
