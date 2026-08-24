export interface Debounced<A extends unknown[]> {
	(...args: A): void;
	cancel(): void;
	flush(): void;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, delayMs: number): Debounced<A> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pending: A | undefined;

	const clear = () => {
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
		pending = undefined;
	};

	const run = (...args: A) => {
		pending = args;
		if (timer !== undefined) clearTimeout(timer);
		timer = setTimeout(() => {
			const args2 = pending as A;
			clear();
			fn(...args2);
		}, delayMs);
	};

	run.cancel = clear;
	run.flush = () => {
		if (timer === undefined) return;
		const args = pending as A;
		clear();
		fn(...args);
	};

	return run;
}
