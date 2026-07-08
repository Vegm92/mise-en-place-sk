import { env } from '$env/dynamic/private';
import type { User } from '@supabase/supabase-js';

/**
 * Admin allowlist check — AUTH_ADMIN_EMAIL is a comma-separated list.
 * Used by both the server hook (request-level guard for /admin) and the
 * (admin) layout load, so the route group is protected even when layout
 * loads don't rerun.
 */
export function isAdminUser(user: User | null): boolean {
	if (!user?.email) return false;
	const adminEmails = (env.AUTH_ADMIN_EMAIL ?? '').split(',').map(s => s.trim()).filter(Boolean);
	return adminEmails.includes(user.email);
}
