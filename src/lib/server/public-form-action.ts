import { fail, type RequestEvent } from '@sveltejs/kit';
import * as v from 'valibot';
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

export interface PublicFormOptions<TSchema extends v.GenericSchema | undefined = undefined> {
	limits?: (ctx: PublicFormContext) => RateLimitRule[];
	rateLimitEvent?: AuthEventKind;
	failData?: (ctx: PublicFormContext) => Record<string, unknown>;
	turnstile?: boolean;
	schema?: TSchema;
}

type PublicFormHandlerCtx<TSchema extends v.GenericSchema | undefined> = TSchema extends v.GenericSchema
	? PublicFormContext & { data: v.InferOutput<TSchema> }
	: PublicFormContext;

function byIpScopeFirst(a: RateLimitRule, b: RateLimitRule): number {
	return (a.scope === 'ip' ? 0 : 1) - (b.scope === 'ip' ? 0 : 1);
}

export function formToRecord(form: FormData): Record<string, string | File> {
	const seen = new Set<string>();
	const out: Record<string, string | File> = {};
	for (const key of form.keys()) {
		if (seen.has(key)) continue;
		seen.add(key);
		const value = form.get(key);
		if (value !== null) out[key] = value;
	}
	return out;
}

export function parseForm<TSchema extends v.GenericSchema>(
	schema: TSchema,
	form: FormData,
): v.SafeParseResult<TSchema> {
	return v.safeParse(schema, formToRecord(form));
}

export function publicFormAction<TSchema extends v.GenericSchema | undefined, T>(
	options: PublicFormOptions<TSchema>,
	handler: (ctx: PublicFormHandlerCtx<TSchema>) => Promise<T>,
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

		const rules = (options.limits?.(ctx) ?? []).slice().sort(byIpScopeFirst);
		for (const rule of rules) {
			if (await checkRateLimit(rule.key, rule.max)) continue;

			if (options.rateLimitEvent) {
				logAuthEvent(options.rateLimitEvent, {
					ipHash: ctx.ipHash,
					...(rule.scope ? { scope: rule.scope } : {}),
				});
			}
			return fail(429, { error: 'rate_limited', ...extra() });
		}

		if (options.schema) {
			const parsed = parseForm(options.schema, form);
			if (!parsed.success) return fail(422, { error: 'invalid', ...extra() });
			return handler({ ...ctx, data: parsed.output } as PublicFormHandlerCtx<TSchema>);
		}

		return handler(ctx as PublicFormHandlerCtx<TSchema>);
	};
}
