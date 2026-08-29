export type AccessDecision = 'allow' | 'redirect-pending' | 'deny-api';

export const PENDING_PATH = '/pending';

export function isPendingAllowedPath(path: string): boolean {
	return (
		path === PENDING_PATH                   ||
		path === '/logout'                      ||
		path === '/privacy'                     ||
		path === '/terms'                       ||
		path === '/robots.txt'                  ||
		path === '/sitemap.xml'                 ||
		path === '/api/health'                  ||
		path.startsWith('/auth/')               ||
		path.startsWith('/waitlist')            ||
		path.startsWith('/l/')
	);
}

export function resolveAccess(input: {
	path: string;
	isAdmin: boolean;
	approved: boolean;
	accessOpen: boolean;
}): AccessDecision {
	const { path, isAdmin, approved, accessOpen } = input;

	if (isAdmin || accessOpen || approved) return 'allow';
	if (isPendingAllowedPath(path)) return 'allow';
	if (path.startsWith('/api/')) return 'deny-api';

	return 'redirect-pending';
}
