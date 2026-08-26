export function stripJsonFence(raw: string | null | undefined): string {
	const trimmed = (raw ?? '').trim();
	if (!trimmed.startsWith('```')) return trimmed;
	const lines = trimmed.split('\n');
	const end = lines.at(-1)?.trim() === '```' ? lines.length - 1 : lines.length;
	return lines.slice(1, end).join('\n').trim();
}
