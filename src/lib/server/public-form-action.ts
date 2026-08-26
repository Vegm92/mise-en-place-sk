import { fail, type RequestEvent } from '@sveltejs/kit';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { logAuthEvent, hashIp, type AuthEventKind } from '$lib/server/auth-events';
import { verifyTurnstileToken } from '$lib/server/turnstile';

export interface PublicFormContext {
	event: RequestEvent;
	form: FormData;
	ip: string;
	ipHash: string;
}

export interface RateLimitRule {
	key: string;
	max: number;
	scope?: string;
}

export interface PublicFormOptions {
	limits?: (ctx: PublicFormContext) => RateLimitRule[];
	rateLimitEvent?: AuthEventKind;
	failData?: (ctx: PublicFormContext) => Record<string, unknown>;
	turnstile?: boolean;
}

export function publicFormAction<T>(
	options: PublicFormOptions,
	handler: (ctx: PublicFormContext) => Promise<T>,
) {
	return async (event: RequestEvent) => {
		const form = await event.request.formData();
		const ip = event.getClientAddress();
		const ctx: PublicFormContext = { event, form, ip, ipHash: hashIp(ip) };
		const extra = () => options.failData?.(ctx) ?? {};

		if (form.get('_hp')) return fail(422, { error: 'invalid', ...extra() });

		if (options.turnstile) {
			const token = String(form.get('cf-turnstile-response') ?? '');
			if (!(await verifyTurnstileToken(token, ip))) {
				return fail(422, { error: 'bot_suspected', ...extra() });
			}
		}

		const rules = options.limits?.(ctx) ?? [];
		const results = [] as boolean[];
		for (const rule of rules) results.push(await checkRateLimit(rule.key, rule.max));

		const blocked = rules[results.indexOf(false)];
		if (blocked) {
			if (options.rateLimitEvent) {
				logAuthEvent(options.rateLimitEvent, {
					ipHash: ctx.ipHash,
					...(blocked.scope ? { scope: blocked.scope } : {}),
				});
			}
			return fail(429, { error: 'rate_limited', ...extra() });
		}

		return handler(ctx);
	};
}
