import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';

export function createSupabaseServerClient(cookies: Cookies) {
	return createServerClient(
		env.SUPABASE_URL!,
		env.SUPABASE_ANON_KEY!,
		{
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
	return createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
}
