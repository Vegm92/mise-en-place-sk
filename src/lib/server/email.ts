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

const BRAND_COLOR = '#d97706';
const SETTINGS_FOOTER = 'Mise en Place · <a href="https://miseenplace.app/settings" style="color:#a1a1aa;">Gestionar preferencias de correo</a>';
const PLAIN_FOOTER = 'Mise en Place · Inteligencia de facturas de proveedores para restaurantes';

function renderEmailLayout(bodyHtml: string, footerHtml: string = PLAIN_FOOTER): string {
	return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
	<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
		<tr>
			<td align="center">
				<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;">
					<tr>
						<td style="padding:24px 32px;border-bottom:1px solid #e4e4e7;">
							<span style="font-size:18px;font-weight:700;color:#18181b;">Mise en Place</span>
						</td>
					</tr>
					<tr>
						<td style="padding:32px;color:#3f3f46;font-size:15px;line-height:1.6;">
							${bodyHtml}
						</td>
					</tr>
					<tr>
						<td style="padding:20px 32px;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;line-height:1.5;">
							${footerHtml}
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>`;
}

function emailButton(href: string, label: string): string {
	return `<p><a href="${href}" style="display:inline-block;background:${BRAND_COLOR};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px;">${label}</a></p>`;
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
		html: renderEmailLayout(`
<p>Hola:</p>
<p>¡Bienvenido a <strong>Mise en Place</strong>! Tu cuenta para <em>${name}</em> ya está activa.</p>
<p>Para empezar, sube tu primera factura de proveedor y extraeremos todos los datos automáticamente.</p>
${emailButton('https://miseenplace.app', 'Abrir la aplicación')}
<p>Tus primeros 30 días son gratis — sin tarjeta.</p>
`),
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
		html: renderEmailLayout(`
<p>Hola:</p>
<p>Estabas en nuestra lista de espera — y ya estamos listos para ti.</p>
<p><strong>Mise en Place</strong> ya está disponible: inteligencia de facturas de proveedores con IA para restaurantes independientes.</p>
${couponLine}
${emailButton('https://miseenplace.app/signup', 'Crear tu cuenta')}
`, 'Recibes este correo porque te apuntaste en miseenplace.app/waitlist.'),
	};
}

export function weeklyDigestEmail(email: string, restaurantName: string, digestHtml: string): EmailPayload {
	return {
		to: email,
		kind: 'weekly_digest',
		subject: `Tu resumen semanal — ${restaurantName}`,
		html: renderEmailLayout(`
<p>Hola:</p>
<p>Este es el resumen semanal de gastos de <strong>${restaurantName}</strong>:</p>
${digestHtml}
${emailButton('https://miseenplace.app/digest', 'Ver el resumen completo')}
`, SETTINGS_FOOTER),
	};
}

export function overdueInvoiceEmail(email: string, restaurantName: string, overdueCount: number, totalOwed: string): EmailPayload {
	const invoicesWord = overdueCount === 1 ? 'factura vencida' : 'facturas vencidas';
	return {
		to: email,
		kind: 'overdue_invoice',
		subject: `${overdueCount} ${invoicesWord} — ${restaurantName}`,
		html: renderEmailLayout(`
<p>Hola:</p>
<p>Tienes <strong>${overdueCount} ${invoicesWord}</strong> por un total de <strong>${totalOwed}</strong> en ${restaurantName}.</p>
${emailButton('https://miseenplace.app/reminders', 'Revisar y marcar como pagadas')}
`, SETTINGS_FOOTER),
	};
}

export function trialExpiryEmail(email: string, restaurantName: string, daysLeft: number): EmailPayload {
	const daysWord = daysLeft === 1 ? 'día' : 'días';
	return {
		to: email,
		kind: 'trial_expiry',
		subject: `Tu prueba gratuita termina en ${daysLeft} ${daysWord} — ${restaurantName}`,
		html: renderEmailLayout(`
<p>Hola:</p>
<p>Tu prueba gratuita de Mise en Place para <strong>${restaurantName}</strong> termina en <strong>${daysLeft} ${daysWord}</strong>.</p>
<p>Suscríbete ahora para mantener el acceso completo a tus facturas, analíticas y alertas.</p>
${emailButton('https://miseenplace.app/billing', 'Activar suscripción')}
`, 'Mise en Place · Desde 49 €/mes por restaurante'),
	};
}

export function trialExpiredEmail(email: string, restaurantName: string): EmailPayload {
	return {
		to: email,
		kind: 'trial_expired',
		subject: `Tu prueba gratuita ha terminado — ${restaurantName}`,
		html: renderEmailLayout(`
<p>Hola:</p>
<p>La prueba gratuita de Mise en Place para <strong>${restaurantName}</strong> ha terminado.</p>
<p>Tus datos siguen intactos y puedes consultarlos, exportarlos o descargarlos cuando quieras.
   Para volver a subir facturas y usar las funciones con IA, activa una suscripción.</p>
${emailButton('https://miseenplace.app/billing', 'Activar suscripción')}
`, 'Mise en Place · Desde 49 €/mes por restaurante'),
	};
}

export function subscriptionConfirmationEmail(email: string, restaurantName: string, planName: string): EmailPayload {
	return {
		to: email,
		kind: 'subscription_confirmation',
		subject: `Suscripción activada: plan ${planName} — ${restaurantName}`,
		html: renderEmailLayout(`
<p>Hola:</p>
<p>¡Gracias! Tu suscripción al plan <strong>${planName}</strong> para <strong>${restaurantName}</strong> ya está activa.</p>
<p>Puedes consultar tu factura y gestionar la suscripción en cualquier momento desde la sección de facturación.</p>
${emailButton('https://miseenplace.app/billing', 'Gestionar suscripción')}
`),
	};
}

export function verifyEmailAddress(email: string, verifyUrl: string): EmailPayload {
	return {
		to: email,
		kind: 'verify_email',
		subject: 'Confirma tu correo — Mise en Place',
		html: renderEmailLayout(`
<p>Hola:</p>
<p>Confirma tu correo para activar tu cuenta de <strong>Mise en Place</strong>:</p>
${emailButton(verifyUrl, 'Confirmar correo')}
<p style="color:#a1a1aa;font-size:12px;">Este enlace caduca en 1 hora. Si no creaste esta cuenta, ignora este correo.</p>
`),
	};
}

export function resetPasswordEmail(email: string, resetUrl: string): EmailPayload {
	return {
		to: email,
		kind: 'password_reset',
		subject: 'Restablecer tu contraseña — Mise en Place',
		html: renderEmailLayout(`
<p>Hola:</p>
<p>Pediste restablecer tu contraseña de <strong>Mise en Place</strong>:</p>
${emailButton(resetUrl, 'Restablecer contraseña')}
<p style="color:#a1a1aa;font-size:12px;">Este enlace caduca en 1 hora. Si no pediste esto, ignora este correo — tu contraseña no cambiará.</p>
`),
	};
}

export function changeEmailAddress(newEmail: string, confirmUrl: string): EmailPayload {
	return {
		to: newEmail,
		kind: 'verify_email',
		subject: 'Confirma tu nuevo correo — Mise en Place',
		html: renderEmailLayout(`
<p>Hola:</p>
<p>Pediste cambiar el correo de tu cuenta de <strong>Mise en Place</strong> a esta dirección. Confírmalo aquí:</p>
${emailButton(confirmUrl, 'Confirmar nuevo correo')}
<p style="color:#a1a1aa;font-size:12px;">Este enlace caduca en 1 hora. Si no pediste este cambio, ignora este correo.</p>
`),
	};
}

export function quotaWarningEmail(email: string, restaurantName: string, used: number, limit: number): EmailPayload {
	const pct = Math.round((used / limit) * 100);
	return {
		to: email,
		kind: 'quota_warning',
		subject: `Tu cuota de facturas está al ${pct} % — ${restaurantName}`,
		html: renderEmailLayout(`
<p>Hola:</p>
<p>Este mes has procesado <strong>${used} de ${limit} facturas</strong> incluidas en tu plan para <strong>${restaurantName}</strong> (${pct} %).</p>
<p>Si superas el límite no podrás procesar más facturas hasta el mes siguiente. Puedes ampliar tu plan en cualquier momento:</p>
${emailButton('https://miseenplace.app/billing', 'Ver planes')}
`, SETTINGS_FOOTER),
	};
}
