import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => value;

export const variables = defineEnvVars({
	PUBLIC_TURNSTILE_SITE_KEY: { public: true, schema: optional },
	AUTH_URL: { schema: optional },
	NEXTAUTH_URL: { schema: optional },
	AUTH_REDIRECT_PROXY_URL: { schema: optional },
});
