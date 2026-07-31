import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';

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

export function createSupabaseAdminClient() {
	return createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
		global: { fetch: resilientFetch },
	});
}
