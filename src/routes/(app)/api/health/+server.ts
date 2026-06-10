import { redirect } from '@sveltejs/kit';

// Redirect authenticated callers to the public health endpoint.
export function GET() {
	redirect(307, '/api/health');
}
