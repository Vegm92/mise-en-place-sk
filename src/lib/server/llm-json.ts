export function stripJsonFence(raw: string | null | undefined): string {
	const trimmed = (raw ?? '').trim();
	if (!trimmed.startsWith('```')) return trimmed;
	const lines = trimmed.split('\n');
	const end = lines.at(-1)?.trim() === '```' ? lines.length - 1 : lines.length;
	return lines.slice(1, end).join('\n').trim();
}

export class JsonShapeMismatchError extends Error {}

export function parseJsonResponse<T>(
	raw: string | null | undefined,
	isValid: (value: unknown) => value is T,
	label: string,
): T {
	const text = (raw ?? '').trim();
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		const fenceStripped = stripJsonFence(raw);
		try {
			parsed = JSON.parse(fenceStripped);
		} catch {
			throw new Error(`${label} returned invalid JSON (${text.length} chars)`);
		}
	}
	if (!isValid(parsed)) {
		throw new JsonShapeMismatchError(`${label} response parsed as JSON but does not match the expected shape`);
	}
	return parsed;
}
