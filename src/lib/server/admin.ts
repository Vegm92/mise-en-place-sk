const AUTH_ADMIN_EMAIL = process.env.AUTH_ADMIN_EMAIL ?? '';
const ADMIN_EMAILS = new Set(
	AUTH_ADMIN_EMAIL.split(',')
		.map(s => s.trim().toLowerCase())
		.filter(Boolean)
);

export function isAdminEmail(email: string): boolean {
	return ADMIN_EMAILS.has(email.toLowerCase());
}

export function isAdminUser(user: App.Locals['user']): boolean {
	if (!user?.email) return false;
	return isAdminEmail(user.email);
}
