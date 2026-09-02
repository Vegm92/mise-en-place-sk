import { vi } from 'vitest';

export const captureException = vi.fn();
export const captureMessage = vi.fn();
export const addBreadcrumb = vi.fn();
export const init = vi.fn();
export const flush = vi.fn(async () => true);
export const replayIntegration = vi.fn(() => ({}));
export const getCurrentScope = vi.fn(() => ({ setUser: vi.fn(), setTag: vi.fn() }));
export const sentryHandle = () => ({ event, resolve }: { event: unknown; resolve: (e: unknown) => unknown }) => resolve(event);
export const handleErrorWithSentry =
	(handler?: (input: unknown) => unknown) =>
	(input: unknown) =>
		handler?.(input);
