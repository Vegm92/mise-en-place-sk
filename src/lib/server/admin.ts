import { env } from '$env/dynamic/private';
import type { User } from '@supabase/supabase-js';

export function isAdminUser(user: User | null): boolean {
	if (!user?.email) return false;
	const adminEmails = (env.AUTH_ADMIN_EMAIL ?? '').split(',').map(s => s.trim()).filter(Boolean);
	return adminEmails.includes(user.email);
}
