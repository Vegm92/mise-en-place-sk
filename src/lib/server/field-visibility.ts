import { loadPrefixedBooleans, savePrefixedBooleans } from './alert-preferences';

export const OPTIONAL_FIELDS = ['due_date', 'notes'] as const;

export type OptionalField = (typeof OPTIONAL_FIELDS)[number];

export type FieldVisibility = Record<OptionalField, boolean>;

const FIELD_VISIBILITY_KEY_PREFIX = 'field_visible_';

export function defaultFieldVisibility(): FieldVisibility {
	return Object.fromEntries(OPTIONAL_FIELDS.map((field) => [field, true])) as FieldVisibility;
}

export async function loadFieldVisibility(restaurantId: string): Promise<FieldVisibility> {
	return loadPrefixedBooleans(restaurantId, FIELD_VISIBILITY_KEY_PREFIX, OPTIONAL_FIELDS, true);
}

export async function saveFieldVisibility(
	restaurantId: string,
	prefs: Partial<FieldVisibility>,
): Promise<void> {
	return savePrefixedBooleans(restaurantId, FIELD_VISIBILITY_KEY_PREFIX, OPTIONAL_FIELDS, prefs);
}
