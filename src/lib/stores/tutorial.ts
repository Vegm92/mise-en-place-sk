import { writable } from 'svelte/store';

export type TutorialStep =
	| '1' | '2' | 'done'
	| '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11'
	| 'dismissed';

export const tutorialStep = writable<TutorialStep | null>(null);

let pending: TutorialStep | null = null;

export async function setTutorialStep(step: TutorialStep) {
	pending = step;
	tutorialStep.set(step);
	try {
		await fetch('/api/tutorial', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ step }),
		});
	} catch {
	} finally {
		if (pending === step) pending = null;
	}
}

export function seedTutorialStep(step: TutorialStep | null) {
	if (pending !== null) return;
	tutorialStep.set(step);
}
