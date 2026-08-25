export interface HelpStep {
	key: string;
	href?: string;
	actionKey?: string;
}

export const HELP_STEPS: readonly HelpStep[] = [
	{ key: 'upload',   href: '/',          actionKey: 'help.start.upload.action' },
	{ key: 'review' },
	{ key: 'confirm' },
	{ key: 'insights', href: '/dashboard', actionKey: 'help.start.insights.action' },
];

export interface HelpTip {
	key: string;
	href: string;
}

export const HELP_TIPS: readonly HelpTip[] = [
	{ key: 'analytics', href: '/analytics/spend' },
	{ key: 'budgets',   href: '/budgets' },
	{ key: 'reminders', href: '/reminders' },
	{ key: 'suppliers', href: '/suppliers' },
	{ key: 'chat',      href: '/chat' },
];

export const HELP_FAQ: readonly string[] = [
	'formats',
	'accuracy',
	'duplicates',
	'channels',
	'export',
	'data',
];

export function helpContentKeys(): string[] {
	return [
		...HELP_STEPS.flatMap((s) => [
			`help.start.${s.key}.title`,
			`help.start.${s.key}.body`,
			...(s.actionKey ? [s.actionKey] : []),
		]),
		...HELP_TIPS.flatMap((tip) => [
			`help.tip.${tip.key}.title`,
			`help.tip.${tip.key}.body`,
			`help.tip.${tip.key}.action`,
		]),
		...HELP_FAQ.flatMap((f) => [`help.faq.${f}.q`, `help.faq.${f}.a`]),
	];
}
