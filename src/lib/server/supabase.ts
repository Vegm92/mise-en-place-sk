import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';

// Supabase project paused (Cloudflare 521) returns an HTML body. The SDK
// treats any non-JSON response as AuthRetryableFetchError and retries 3×,
// flooding the console. Converting 521 → 503 with a proper JSON error body
// makes the SDK throw AuthApiError (non-retryable) and stop immediately.
const resilientFetch: typeof globalThis.fetch = async (input, init) => {
	const response = await globalThis.fetch(input, init);
	if (response.status === 521) {
		return new Response(JSON.stringify({ error: 'service_unavailable' }), {
			status: 503,
			headers: { 'content-type': 'application/json' },
		});
	}
	return response;
};

export function createSupabaseServerClient(cookies: Cookies) {
	return createServerClient(
		env.SUPABASE_URL!,
		env.SUPABASE_ANON_KEY!,
		{
			auth: {
				// Server-side clients are per-request and short-lived; no background
				// refresh timer needed — the client side handles token refresh.
				autoRefreshToken: false,
				detectSessionInUrl: false,
			},
			global: { fetch: resilientFetch },
			cookies: {
				getAll:  () => cookies.getAll(),
				setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
					cookiesToSet.forEach(({ name, value, options }) =>
						cookies.set(name, value, { ...(options as Parameters<typeof cookies.set>[2]), path: '/' })
					);
				},
			},
		}
	);
}

/** Service-role client — bypasses RLS. Only for server-side admin operations. */
export function createSupabaseAdminClient() {
	return createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
		global: { fetch: resilientFetch },
	});
}
