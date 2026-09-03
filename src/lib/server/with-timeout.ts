export class TimeoutError extends Error {
	constructor(label: string, ms: number) {
		super(`${label} timed out after ${ms}ms`);
		this.name = 'TimeoutError';
	}
}

export function withTimeout<T>(
	label: string,
	ms: number,
	fn: (signal: AbortSignal) => Promise<T>,
	outer?: AbortSignal,
): Promise<T> {
	const controller = new AbortController();
	const signal = outer ? AbortSignal.any([outer, controller.signal]) : controller.signal;
	let timer: ReturnType<typeof setTimeout>;
	const expiry = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			const err = new TimeoutError(label, ms);
			controller.abort(err);
			reject(err);
		}, ms);
	});
	return Promise.race([fn(signal), expiry]).finally(() => clearTimeout(timer));
}
