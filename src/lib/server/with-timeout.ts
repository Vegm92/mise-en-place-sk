export class TimeoutError extends Error {
	constructor(label: string, ms: number) {
		super(`${label} timed out after ${ms}ms`);
		this.name = 'TimeoutError';
	}
}

export function withTimeout<T>(label: string, ms: number, fn: () => Promise<T>): Promise<T> {
	let timer: ReturnType<typeof setTimeout>;
	return Promise.race([
		fn(),
		new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
		}),
	]).finally(() => clearTimeout(timer)) as Promise<T>;
}
