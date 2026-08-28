import { error } from '@sveltejs/kit';

export function requirePositiveIntId(raw: string, label: string): number {
	const id = Number(raw);
	if (!Number.isInteger(id) || id <= 0) error(400, `Invalid ${label} id`);
	return id;
}
