/**
 * Debounce helper backing the instant-apply filter inputs (issue #579).
 *
 * A text filter that re-fetches on every keystroke is worse than an Apply
 * button, so the typed inputs coalesce into one trailing call. These tests pin
 * the timing contract the filter bar depends on.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../src/lib/debounce';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('debounce', () => {
	it('does not call through before the delay has elapsed', () => {
		const spy = vi.fn();
		debounce(spy, 300)('a');
		vi.advanceTimersByTime(299);
		expect(spy).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy).toHaveBeenCalledWith('a');
	});

	it('coalesces a burst of calls into a single trailing call with the last arguments', () => {
		const spy = vi.fn();
		const run = debounce(spy, 300);
		for (const q of ['t', 'to', 'tom', 'toma', 'tomate']) {
			run(q);
			vi.advanceTimersByTime(100);
		}
		expect(spy).not.toHaveBeenCalled();
		vi.advanceTimersByTime(300);
		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy).toHaveBeenCalledWith('tomate');
	});

	it('fires again once the caller pauses longer than the delay', () => {
		const spy = vi.fn();
		const run = debounce(spy, 300);
		run('uno');
		vi.advanceTimersByTime(300);
		run('dos');
		vi.advanceTimersByTime(300);
		expect(spy).toHaveBeenCalledTimes(2);
		expect(spy).toHaveBeenNthCalledWith(1, 'uno');
		expect(spy).toHaveBeenNthCalledWith(2, 'dos');
	});

	it('cancel() drops a pending call', () => {
		const spy = vi.fn();
		const run = debounce(spy, 300);
		run('a');
		run.cancel();
		vi.advanceTimersByTime(1000);
		expect(spy).not.toHaveBeenCalled();
	});

	it('flush() applies a pending call immediately', () => {
		const spy = vi.fn();
		const run = debounce(spy, 300);
		run('a');
		run.flush();
		expect(spy).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(1000);
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('flush() is a no-op when nothing is pending', () => {
		const spy = vi.fn();
		const run = debounce(spy, 300);
		run.flush();
		expect(spy).not.toHaveBeenCalled();
	});
});
