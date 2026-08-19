import { config } from './env';

export function isAdminUser(user: App.Locals['user']): boolean {
	if (!user?.email) return false;
	const adminEmails = config.auth.adminEmail.split(',').map(s => s.trim()).filter(Boolean);
	return adminEmails.includes(user.email);
}
