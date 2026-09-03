import { getContext, setContext } from 'svelte';
import type { Locale } from './i18n-messages';

const LOCALE_CONTEXT = Symbol('mep.locale');
const MESSAGES_CONTEXT = Symbol('mep.messages');

export type Translator = (key: string) => string;
export type Interpolator = (key: string, vars: Record<string, string | number>) => string;
export type LocaleRef = { readonly current: Locale };
export type MessagesRef = { readonly current: Record<string, string> };

export function setLocaleContext(ref: LocaleRef): void {
	setContext(LOCALE_CONTEXT, ref);
}

export function setMessagesContext(ref: MessagesRef): void {
	setContext(MESSAGES_CONTEXT, ref);
}

export function getLocale(): LocaleRef {
	const ref = getContext<LocaleRef | undefined>(LOCALE_CONTEXT);
	if (!ref) throw new Error('getLocale(): no locale context — a parent layout must call setLocaleContext()');
	return ref;
}

function getMessages(): MessagesRef {
	const ref = getContext<MessagesRef | undefined>(MESSAGES_CONTEXT);
	if (!ref) throw new Error('getT(): no messages context — a parent layout must call setMessagesContext()');
	return ref;
}

export function getT(): Translator {
	const messages = getMessages();
	return (key: string): string => messages.current[key] ?? key;
}

export function getTi(): Interpolator {
	const t = getT();
	return (key: string, vars: Record<string, string | number>): string =>
		Object.entries(vars).reduce(
			(s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
			t(key),
		);
}
