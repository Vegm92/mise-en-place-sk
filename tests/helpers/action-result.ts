/**
 * Classifies what a SvelteKit form action did — redirected, failed, or
 * returned an ordinary result — without each test file re-deriving the
 * try/catch-and-shape-check by hand.
 */
export type ActionResult<T = unknown> =
	| { kind: 'redirect'; status: number; location: string }
	| { kind: 'fail'; status: number; data: { section?: string; error?: string } }
	| { kind: 'ok'; value: T };

export async function runFormAction<T = unknown>(
	action: (event: unknown) => Promise<unknown>,
	event: unknown,
): Promise<ActionResult<T>> {
	try {
		const value = await action(event);
		if (value && typeof value === 'object' && 'status' in value && 'data' in value) {
			const v = value as { status: number; data: { section?: string; error?: string } };
			return { kind: 'fail', status: v.status, data: v.data };
		}
		return { kind: 'ok', value: value as T };
	} catch (thrown) {
		const t = thrown as { status?: number; location?: string };
		if (typeof t.status === 'number' && typeof t.location === 'string') {
			return { kind: 'redirect', status: t.status, location: t.location };
		}
		throw thrown;
	}
}
