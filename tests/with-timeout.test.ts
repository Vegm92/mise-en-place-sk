import { describe, it, expect } from 'vitest';
import { withTimeout, TimeoutError } from '../src/lib/server/with-timeout';

describe('withTimeout', () => {
	it('resolves with the work result before the deadline', async () => {
		await expect(withTimeout('fast', 50, async () => 'ok')).resolves.toBe('ok');
	});

	it('rejects with a TimeoutError and aborts the signal once the deadline passes', async () => {
		let received: AbortSignal | undefined;
		const hang = (signal: AbortSignal) => {
			received = signal;
			return new Promise<never>(() => {});
		};
		const err = await withTimeout('slow', 10, hang).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(TimeoutError);
		expect((err as Error).message).toBe('slow timed out after 10ms');
		expect(received?.aborted).toBe(true);
		expect(received?.reason).toBe(err);
	});

	it('leaves the signal untouched when the work finishes in time', async () => {
		let received: AbortSignal | undefined;
		await withTimeout('fast', 50, async (signal) => { received = signal; });
		expect(received?.aborted).toBe(false);
	});

	it('aborts the derived signal when the outer signal aborts', async () => {
		const outer = new AbortController();
		let received: AbortSignal | undefined;
		const pending = withTimeout('outer', 1000, (signal) => {
			received = signal;
			return new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
		}, outer.signal);
		outer.abort(new Error('caller gave up'));
		await expect(pending).rejects.toThrow('caller gave up');
		expect(received?.aborted).toBe(true);
	});
});
