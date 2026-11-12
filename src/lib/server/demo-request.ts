import * as v from 'valibot';
import { publicFormAction } from './public-form-action';
import { insertWaitlistEmail, resolveReferralOwnerEmail } from './waitlist-db';
import { sendEmail, type EmailPayload } from './email';
import { ATTRIBUTION_COOKIE, parseAttributionCookie, type Attribution } from '$lib/attribution';
import {
	DEMO_LOCATIONS,
	DEMO_ROLES,
	DEMO_SPEND,
	DEMO_TOOLS,
	demoBookingUrl,
	demoFit,
	isIcpPriority,
	type DemoAnswers,
	type DemoFit,
} from '$lib/demo-funnel';

const requiredText = (max: number) => v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));

const DemoRequestForm = v.object({
	name: requiredText(120),
	email: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email(), v.maxLength(254)),
	phone: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(40))),
	restaurant: requiredText(160),
	role: v.picklist(DEMO_ROLES),
	locations: v.picklist(DEMO_LOCATIONS),
	monthlySpend: v.picklist(DEMO_SPEND),
	currentTool: v.picklist(DEMO_TOOLS),
});

export interface DemoLead extends DemoAnswers {
	name: string;
	email: string;
	phone: string;
	restaurant: string;
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function singleLine(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

export function demoNotifyRecipient(env: NodeJS.ProcessEnv = process.env): string | null {
	const explicit = env.DEMO_NOTIFY_EMAIL?.trim();
	if (explicit) return explicit;
	const admin = (env.AUTH_ADMIN_EMAIL ?? '').split(',')[0]?.trim();
	return admin || null;
}

export function demoRequestNotification(
	to: string,
	lead: DemoLead,
	fit: DemoFit,
	attribution: Attribution,
): EmailPayload {
	const priority = isIcpPriority(lead);
	const rows: Array<[string, string]> = [
		['Outcome', fit === 'demo' ? 'Sent to booking' : 'Sent to self-serve signup'],
		['ICP priority', priority ? 'yes' : 'no'],
		['Name', lead.name],
		['Email', lead.email],
		['Phone', lead.phone || '-'],
		['Restaurant', lead.restaurant],
		['Role', lead.role],
		['Locations', lead.locations],
		['Monthly supplier spend', lead.monthlySpend],
		['Current tool', lead.currentTool],
		['Source', attribution.source ?? '-'],
		['Campaign', attribution.campaign ?? '-'],
		['Landing variant', attribution.variant ?? '-'],
		['Landing path', attribution.landingPath ?? '-'],
	];
	const body = rows
		.map(([label, value]) => `<tr><td><strong>${escapeHtml(label)}</strong></td><td>${escapeHtml(value)}</td></tr>`)
		.join('');
	const tag = fit === 'demo' ? (priority ? 'ICP' : 'demo') : 'self-serve';

	return {
		to,
		subject: singleLine(`Demo request [${tag}]: ${lead.restaurant}`),
		html: `<table cellpadding="6" cellspacing="0">${body}</table>`,
	};
}

export const requestDemoAction = publicFormAction(
	{ limits: ({ ip }) => [{ key: `demo:${ip}`, max: 5 }], turnstile: true, schema: DemoRequestForm },
	async ({ data, event }) => {
		const lead: DemoLead = { ...data, phone: data.phone ?? '' };
		const fit = demoFit(lead);

		const attribution = parseAttributionCookie(event.cookies.get(ATTRIBUTION_COOKIE));
		const referrerEmail = attribution.referredBy ? await resolveReferralOwnerEmail(attribution.referredBy) : null;
		const selfReferred = referrerEmail !== null && referrerEmail.toLowerCase() === lead.email;
		await insertWaitlistEmail(lead.email, selfReferred ? { ...attribution, referredBy: null } : attribution);

		const recipient = demoNotifyRecipient();
		if (recipient) await sendEmail(demoRequestNotification(recipient, lead, fit, attribution));

		return {
			success: true,
			fit,
			bookingUrl: fit === 'demo' ? demoBookingUrl(process.env.DEMO_BOOKING_URL, lead) : null,
		};
	},
);
