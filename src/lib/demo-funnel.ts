export const DEMO_ROLES = ['owner', 'chef', 'operations', 'purchasing', 'other'] as const;
export const DEMO_LOCATIONS = ['one', 'two_to_five', 'six_to_ten', 'over_ten'] as const;
export const DEMO_SPEND = ['under_10k', '10k_to_20k', '20k_to_50k', 'over_50k'] as const;
export const DEMO_TOOLS = ['spreadsheet', 'software', 'gestoria', 'none'] as const;

export type DemoRole = (typeof DEMO_ROLES)[number];
export type DemoLocations = (typeof DEMO_LOCATIONS)[number];
export type DemoSpend = (typeof DEMO_SPEND)[number];
export type DemoTool = (typeof DEMO_TOOLS)[number];

export interface DemoAnswers {
	role: DemoRole;
	locations: DemoLocations;
	monthlySpend: DemoSpend;
	currentTool: DemoTool;
}

export type DemoFit = 'demo' | 'self_serve';
export type DemoStep = 'video' | 'questions' | 'booking';

export function demoFit(answers: DemoAnswers): DemoFit {
	return answers.monthlySpend === 'under_10k' ? 'self_serve' : 'demo';
}

export function isIcpPriority(answers: DemoAnswers): boolean {
	if (demoFit(answers) !== 'demo') return false;
	const spendFits = answers.monthlySpend === '20k_to_50k' || answers.monthlySpend === 'over_50k';
	const groupFits = answers.locations === 'two_to_five' || answers.locations === 'six_to_ten';
	return spendFits || groupFits;
}

export function demoSteps(hasVideo: boolean): DemoStep[] {
	return hasVideo ? ['video', 'questions', 'booking'] : ['questions', 'booking'];
}

export function demoStepFor(input: { hasVideo: boolean; requested: string | null; submitted: boolean }): DemoStep {
	if (input.submitted) return 'booking';
	if (input.hasVideo && input.requested !== 'questions') return 'video';
	return 'questions';
}

export function demoVideoPath(raw: string | null | undefined): string | null {
	const value = raw?.trim() ?? '';
	if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
	return value;
}

export function demoBookingUrl(
	raw: string | null | undefined,
	lead: { name: string; email: string },
): string | null {
	const value = raw?.trim() ?? '';
	if (!value) return null;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:') return null;
	url.searchParams.set('name', lead.name);
	url.searchParams.set('email', lead.email);
	return url.toString();
}
