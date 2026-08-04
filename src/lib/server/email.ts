import { Resend } from 'resend';
import * as Sentry from '@sentry/sveltekit';
import { env } from '$env/dynamic/private';

const apiKey = env.RESEND_API_KEY ?? '';
const FROM_ADDRESS = env.EMAIL_FROM ?? 'Mise en Place <noreply@miseenplace.app>';

const resend = apiKey ? new Resend(apiKey) : null;

export type EmailKind =
	| 'welcome' | 'waitlist_invite' | 'weekly_digest' | 'overdue_invoice'
	| 'trial_expiry' | 'trial_expired' | 'subscription_confirmation' | 'quota_warning'
	| 'verify_email' | 'password_reset';

export interface EmailPayload {
	to: string;
	subject: string;
	html: string;
	kind?: EmailKind;
}

function maskEmail(to: string): string {
	const at = to.indexOf('@');
	if (at <= 0) return '***';
	return `${to[0]}***${to.slice(at)}`;
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
	if (!resend) {
		console.log(`[email] no-op (RESEND_API_KEY not set): ${payload.subject} → ${maskEmail(payload.to)}`);
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
		Sentry.captureException(error, { tags: { emailKind: payload.kind ?? 'unknown' } });
	}
}

export function welcomeEmail(email: string, restaurantName?: string): EmailPayload {
	const name = restaurantName ?? 'tu restaurante';
	return {
		to: email,
		kind: 'welcome',
		subject: '¡Bienvenido a Mise en Place! 🎉',
		html: `
<p>Hola:</p>
<p>¡Bienvenido a <strong>Mise en Place</strong>! Tu cuenta para <em>${name}</em> ya está activa.</p>
<p>Para empezar, sube tu primera factura de proveedor y extraeremos todos los datos automáticamente.</p>
<p><a href="https://miseenplace.app">Abrir la aplicación →</a></p>
<p>Tus primeros 30 días son gratis — sin tarjeta.</p>
<hr />
<p style="color:#888;font-size:12px;">Mise en Place · Inteligencia de facturas de proveedores para restaurantes</p>
`,
	};
}

export function waitlistInviteEmail(email: string, couponCode?: string): EmailPayload {
	const couponLine = couponCode
		? `<p>Como prometimos, usa el código <strong>${couponCode}</strong> al pagar y tu primer mes es gratis.</p>`
		: '';
	return {
		to: email,
		kind: 'waitlist_invite',
		subject: 'Tu invitación a Mise en Place',
		html: `
<p>Hola:</p>
<p>Estabas en nuestra lista de espera — y ya estamos listos para ti.</p>
<p><strong>Mise en Place</strong> ya está disponible: inteligencia de facturas de proveedores con IA para restaurantes independientes.</p>
${couponLine}
<p><a href="https://miseenplace.app/signup">Crear tu cuenta →</a></p>
<hr />
<p style="color:#888;font-size:12px;">Recibes este correo porque te apuntaste en miseenplace.app/waitlist.</p>
`,
	};
}

export function weeklyDigestEmail(email: string, restaurantName: string, digestHtml: string): EmailPayload {
	return {
		to: email,
		kind: 'weekly_digest',
		subject: `Tu resumen semanal — ${restaurantName}`,
		html: `
<p>Hola:</p>
<p>Este es el resumen semanal de gastos de <strong>${restaurantName}</strong>:</p>
${digestHtml}
<p><a href="https://miseenplace.app/digest">Ver el resumen completo →</a></p>
<hr />
<p style="color:#888;font-size:12px;">
  Resumen semanal de Mise en Place ·
  <a href="https://miseenplace.app/settings">Gestionar preferencias de correo</a>
</p>
`,
	};
}

export function overdueInvoiceEmail(email: string, restaurantName: string, overdueCount: number, totalOwed: string): EmailPayload {
	const invoicesWord = overdueCount === 1 ? 'factura vencida' : 'facturas vencidas';
	return {
		to: email,
		kind: 'overdue_invoice',
		subject: `${overdueCount} ${invoicesWord} — ${restaurantName}`,
		html: `
<p>Hola:</p>
<p>Tienes <strong>${overdueCount} ${invoicesWord}</strong> por un total de <strong>${totalOwed}</strong> en ${restaurantName}.</p>
<p><a href="https://miseenplace.app/reminders">Revisar y marcar como pagadas →</a></p>
<hr />
<p style="color:#888;font-size:12px;">
  Mise en Place ·
  <a href="https://miseenplace.app/settings">Gestionar preferencias de correo</a>
</p>
`,
	};
}

export function trialExpiryEmail(email: string, restaurantName: string, daysLeft: number): EmailPayload {
	const daysWord = daysLeft === 1 ? 'día' : 'días';
	return {
		to: email,
		kind: 'trial_expiry',
		subject: `Tu prueba gratuita termina en ${daysLeft} ${daysWord} — ${restaurantName}`,
		html: `
<p>Hola:</p>
<p>Tu prueba gratuita de Mise en Place para <strong>${restaurantName}</strong> termina en <strong>${daysLeft} ${daysWord}</strong>.</p>
<p>Suscríbete ahora para mantener el acceso completo a tus facturas, analíticas y alertas.</p>
<p><a href="https://miseenplace.app/billing">Activar suscripción →</a></p>
<hr />
<p style="color:#888;font-size:12px;">Mise en Place · Desde 49 €/mes por restaurante</p>
`,
	};
}

export function trialExpiredEmail(email: string, restaurantName: string): EmailPayload {
	return {
		to: email,
		kind: 'trial_expired',
		subject: `Tu prueba gratuita ha terminado — ${restaurantName}`,
		html: `
<p>Hola:</p>
<p>La prueba gratuita de Mise en Place para <strong>${restaurantName}</strong> ha terminado.</p>
<p>Tus datos siguen intactos y puedes consultarlos, exportarlos o descargarlos cuando quieras.
   Para volver a subir facturas y usar las funciones con IA, activa una suscripción.</p>
<p><a href="https://miseenplace.app/billing">Activar suscripción →</a></p>
<hr />
<p style="color:#888;font-size:12px;">Mise en Place · Desde 49 €/mes por restaurante</p>
`,
	};
}

export function subscriptionConfirmationEmail(email: string, restaurantName: string, planName: string): EmailPayload {
	return {
		to: email,
		kind: 'subscription_confirmation',
		subject: `Suscripción activada: plan ${planName} — ${restaurantName}`,
		html: `
<p>Hola:</p>
<p>¡Gracias! Tu suscripción al plan <strong>${planName}</strong> para <strong>${restaurantName}</strong> ya está activa.</p>
<p>Puedes consultar tu factura y gestionar la suscripción en cualquier momento desde la sección de facturación.</p>
<p><a href="https://miseenplace.app/billing">Gestionar suscripción →</a></p>
<hr />
<p style="color:#888;font-size:12px;">Mise en Place · Inteligencia de facturas de proveedores para restaurantes</p>
`,
	};
}

export function verifyEmailAddress(email: string, verifyUrl: string): EmailPayload {
	return {
		to: email,
		kind: 'verify_email',
		subject: 'Confirma tu correo — Mise en Place',
		html: `
<p>Hola:</p>
<p>Confirma tu correo para activar tu cuenta de <strong>Mise en Place</strong>:</p>
<p><a href="${verifyUrl}">Confirmar correo →</a></p>
<p style="color:#888;font-size:12px;">Este enlace caduca en 1 hora. Si no creaste esta cuenta, ignora este correo.</p>
`,
	};
}

export function resetPasswordEmail(email: string, resetUrl: string): EmailPayload {
	return {
		to: email,
		kind: 'password_reset',
		subject: 'Restablecer tu contraseña — Mise en Place',
		html: `
<p>Hola:</p>
<p>Pediste restablecer tu contraseña de <strong>Mise en Place</strong>:</p>
<p><a href="${resetUrl}">Restablecer contraseña →</a></p>
<p style="color:#888;font-size:12px;">Este enlace caduca en 1 hora. Si no pediste esto, ignora este correo — tu contraseña no cambiará.</p>
`,
	};
}

export function changeEmailAddress(newEmail: string, confirmUrl: string): EmailPayload {
	return {
		to: newEmail,
		kind: 'verify_email',
		subject: 'Confirma tu nuevo correo — Mise en Place',
		html: `
<p>Hola:</p>
<p>Pediste cambiar el correo de tu cuenta de <strong>Mise en Place</strong> a esta dirección. Confírmalo aquí:</p>
<p><a href="${confirmUrl}">Confirmar nuevo correo →</a></p>
<p style="color:#888;font-size:12px;">Este enlace caduca en 1 hora. Si no pediste este cambio, ignora este correo.</p>
`,
	};
}

export function quotaWarningEmail(email: string, restaurantName: string, used: number, limit: number): EmailPayload {
	const pct = Math.round((used / limit) * 100);
	return {
		to: email,
		kind: 'quota_warning',
		subject: `Tu cuota de facturas está al ${pct} % — ${restaurantName}`,
		html: `
<p>Hola:</p>
<p>Este mes has procesado <strong>${used} de ${limit} facturas</strong> incluidas en tu plan para <strong>${restaurantName}</strong> (${pct} %).</p>
<p>Si superas el límite no podrás procesar más facturas hasta el mes siguiente. Puedes ampliar tu plan en cualquier momento:</p>
<p><a href="https://miseenplace.app/billing">Ver planes →</a></p>
<hr />
<p style="color:#888;font-size:12px;">
  Mise en Place ·
  <a href="https://miseenplace.app/settings">Gestionar preferencias de correo</a>
</p>
`,
	};
}
