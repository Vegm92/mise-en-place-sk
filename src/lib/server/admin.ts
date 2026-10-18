const AUTH_ADMIN_EMAIL = process.env.AUTH_ADMIN_EMAIL ?? '';
const ADMIN_EMAILS = new Set(
	AUTH_ADMIN_EMAIL.split(',')
		.map(s => s.trim())
		.filter(Boolean)
);

export function isAdminEmail(email: string): boolean {
	return ADMIN_EMAILS.has(email);
}

export function isAdminUser(user: App.Locals['user']): boolean {
	if (!user?.email) return false;
	return isAdminEmail(user.email);
}
