const AUTH_ADMIN_EMAIL = process.env.AUTH_ADMIN_EMAIL ?? '';

export function isAdminUser(user: App.Locals['user']): boolean {
	if (!user?.email) return false;
	const adminEmails = AUTH_ADMIN_EMAIL.split(',').map(s => s.trim()).filter(Boolean);
	return adminEmails.includes(user.email);
}
