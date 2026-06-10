/**
 * Transactional email via Resend.
 * Set RESEND_API_KEY in the environment; if absent, emails are no-ops (dev mode).
 */
import { Resend } from 'resend';
import { env } from '$env/dynamic/private';

const apiKey = env.RESEND_API_KEY ?? '';
const FROM_ADDRESS = env.EMAIL_FROM ?? 'Mise en Place <noreply@miseenplace.app>';

const resend = apiKey ? new Resend(apiKey) : null;

export interface EmailPayload {
	to: string;
	subject: string;
	html: string;
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
	if (!resend) {
		console.log(`[email] no-op (RESEND_API_KEY not set): ${payload.subject} → ${payload.to}`);
		return;
	}
	const { error } = await resend.emails.send({
		from: FROM_ADDRESS,
		to:   payload.to,
		subject: payload.subject,
		html: payload.html,
	});
	if (error) {
		console.error('[email] send failed:', error);
	}
}

// ── Email templates ────────────────────────────────────────────────────────────

export function welcomeEmail(email: string, restaurantName?: string): EmailPayload {
	const name = restaurantName ?? 'your restaurant';
	return {
		to: email,
		subject: 'Welcome to Mise en Place 🎉',
		html: `
<p>Hi,</p>
<p>Welcome to <strong>Mise en Place</strong>! Your account for <em>${name}</em> is now active.</p>
<p>To get started, upload your first supplier invoice and we'll extract everything automatically.</p>
<p><a href="https://miseenplace.app">Open the app →</a></p>
<p>Your first 30 days are free — no card required.</p>
<hr />
<p style="color:#888;font-size:12px;">Mise en Place · Supplier invoice intelligence for restaurants</p>
`,
	};
}

export function waitlistInviteEmail(email: string, couponCode?: string): EmailPayload {
	const couponLine = couponCode
		? `<p>As promised, use code <strong>${couponCode}</strong> at checkout for your first month free.</p>`
		: '';
	return {
		to: email,
		subject: 'You\'re invited to Mise en Place',
		html: `
<p>Hi,</p>
<p>You're on our waitlist — and we're ready for you.</p>
<p><strong>Mise en Place</strong> is now live: AI-powered supplier invoice intelligence for independent restaurants.</p>
${couponLine}
<p><a href="https://miseenplace.app/signup">Create your account →</a></p>
<hr />
<p style="color:#888;font-size:12px;">You're receiving this because you signed up at miseenplace.app/waitlist.</p>
`,
	};
}

export function weeklyDigestEmail(email: string, restaurantName: string, digestHtml: string): EmailPayload {
	return {
		to: email,
		subject: `Your weekly digest — ${restaurantName}`,
		html: `
<p>Hi,</p>
<p>Here's your weekly spending summary for <strong>${restaurantName}</strong>:</p>
${digestHtml}
<p><a href="https://miseenplace.app/digest">View full digest →</a></p>
<hr />
<p style="color:#888;font-size:12px;">
  Mise en Place weekly digest ·
  <a href="https://miseenplace.app/settings">Manage email preferences</a>
</p>
`,
	};
}

export function overdueInvoiceEmail(email: string, restaurantName: string, overdueCount: number, totalOwed: string): EmailPayload {
	return {
		to: email,
		subject: `${overdueCount} overdue invoice${overdueCount !== 1 ? 's' : ''} — ${restaurantName}`,
		html: `
<p>Hi,</p>
<p>You have <strong>${overdueCount} overdue invoice${overdueCount !== 1 ? 's' : ''}</strong> totalling <strong>${totalOwed}</strong> for ${restaurantName}.</p>
<p><a href="https://miseenplace.app/reminders">Review and mark as paid →</a></p>
<hr />
<p style="color:#888;font-size:12px;">
  Mise en Place ·
  <a href="https://miseenplace.app/settings">Manage email preferences</a>
</p>
`,
	};
}

export function trialExpiryEmail(email: string, restaurantName: string, daysLeft: number): EmailPayload {
	return {
		to: email,
		subject: `Your free trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} — ${restaurantName}`,
		html: `
<p>Hi,</p>
<p>Your Mise en Place free trial for <strong>${restaurantName}</strong> ends in <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>.</p>
<p>Subscribe now to keep full access to your invoices, analytics, and alerts.</p>
<p><a href="https://miseenplace.app/billing">Activate subscription →</a></p>
<hr />
<p style="color:#888;font-size:12px;">Mise en Place · €49/month per restaurant</p>
`,
	};
}
