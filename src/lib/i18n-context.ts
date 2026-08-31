import { getContext, setContext } from 'svelte';
import { derived, type Readable } from 'svelte/store';
import type { Locale } from './i18n-messages';

const LOCALE_CONTEXT = Symbol('mep.locale');
const MESSAGES_CONTEXT = Symbol('mep.messages');

export type Translator = (key: string) => string;
export type Interpolator = (key: string, vars: Record<string, string | number>) => string;

export function setLocaleContext(store: Readable<Locale>): void {
	setContext(LOCALE_CONTEXT, store);
}

export function setMessagesContext(store: Readable<Record<string, string>>): void {
	setContext(MESSAGES_CONTEXT, store);
}

export function getLocale(): Readable<Locale> {
	const store = getContext<Readable<Locale> | undefined>(LOCALE_CONTEXT);
	if (!store) throw new Error('getLocale(): no locale context — a parent layout must call setLocaleContext()');
	return store;
}

function getMessages(): Readable<Record<string, string>> {
	const store = getContext<Readable<Record<string, string>> | undefined>(MESSAGES_CONTEXT);
	if (!store) throw new Error('getT(): no messages context — a parent layout must call setMessagesContext()');
	return store;
}

export function getT(): Readable<Translator> {
	return derived(
		getMessages(),
		($messages) => (key: string): string => $messages[key] ?? key,
	);
}

export function getTi(): Readable<Interpolator> {
	return derived(
		getT(),
		($t) =>
			(key: string, vars: Record<string, string | number>): string =>
				Object.entries(vars).reduce(
					(s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
					$t(key),
				),
	);
}
