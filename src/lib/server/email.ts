import { Resend } from 'resend';
import * as Sentry from '@sentry/sveltekit';

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'Mise en Place <noreply@mise-place.com>';
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://mise-place.com';
const COMPANY_LEGAL_NAME = process.env.COMPANY_LEGAL_NAME ?? '';
const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS ?? '';
const COMPANY_NIF = process.env.COMPANY_NIF ?? '';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export type EmailKind =
	| 'welcome' | 'waitlist_invite' | 'weekly_digest' | 'overdue_invoice'
	| 'trial_expiry' | 'trial_expired' | 'subscription_confirmation' | 'subscription_consolidated'
	| 'quota_warning' | 'verify_email' | 'password_reset' | 'access_approved' | 'promo_code_dispatch';

export interface EmailPayload {
	to: string;
	subject: string;
	html: string;
	kind?: EmailKind;
}

const BRAND_NAME = 'Mise en Place';
const BRAND_CITY = 'Barcelona';

const COLOR_BG = '#f1f0ee';
const COLOR_SURFACE = '#ffffff';
const COLOR_SURFACE2 = '#f8f7f5';
const COLOR_FG = '#17171a';
const COLOR_FG2 = '#46464a';
const COLOR_FG3 = '#5b5b60';
const COLOR_BORDER = 'rgba(20,20,24,.13)';
const COLOR_DIVIDER = 'rgba(20,20,24,.07)';
const COLOR_ACCENT = '#17171a';
const COLOR_ACCENT_SOFT = 'rgba(23,23,26,.07)';

const FONT_STACK = "'Mona Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO_STACK = "'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace";

const LOGO_SVG = '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="2.5" y="3.5" width="3" height="17" rx="1.5" fill="currentColor"></rect><rect x="10.5" y="3.5" width="3" height="13" rx="1.5" fill="currentColor"></rect><rect x="18.5" y="3.5" width="3" height="9" rx="1.5" fill="currentColor"></rect></svg>';

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function p(html: string): string {
	return `<p style="font-size:15px;line-height:1.6;color:${COLOR_FG2};margin:0 0 16px;">${html}</p>`;
}

function strong(html: string): string {
	return `<strong style="color:${COLOR_FG};font-weight:600;">${html}</strong>`;
}

function callout(title: string, body: string): string {
	return `
<div style="background:${COLOR_SURFACE2};border:1px solid ${COLOR_BORDER};border-left:3px solid ${COLOR_ACCENT};border-radius:4px;padding:14px 16px;margin:18px 0 4px;">
	<p style="font-size:13px;font-weight:600;margin:0 0 4px;color:${COLOR_FG};">${title}</p>
	<p style="font-size:12.5px;line-height:1.55;color:${COLOR_FG2};margin:0;">${body}</p>
</div>`;
}

function steps(items: Array<{ title: string; desc: string }>): string {
	const rows = items.map((item, i) => `
	<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid ${COLOR_DIVIDER};"><tr>
		<td width="34" valign="top" style="padding:16px 14px 16px 0;font-family:${MONO_STACK};font-size:11px;color:${COLOR_ACCENT};">${String(i + 1).padStart(2, '0')}</td>
		<td valign="top" style="padding:16px 0;">
			<h3 style="font-size:14px;font-weight:600;margin:0 0 4px;letter-spacing:-.01em;color:${COLOR_FG};">${item.title}</h3>
			<p style="font-size:13px;line-height:1.55;color:${COLOR_FG2};margin:0;">${item.desc}</p>
		</td>
	</tr></table>`).join('');
	return `<div style="border-top:1px solid ${COLOR_DIVIDER};margin:4px 0 8px;">${rows}</div>`;
}

interface LayoutOptions {
	preheader: string;
	tagChip?: string;
	eyebrow: string;
	headline: string;
	bodyHtml: string;
	cta?: { href: string; label: string };
	ctaNote?: string;
	signature?: string;
	footerLinks?: boolean;
	footerNote?: string;
}

function renderEmailLayout(opts: LayoutOptions): string {
	const chipHtml = opts.tagChip
		? `<span style="font-family:${MONO_STACK};font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${COLOR_ACCENT};background:${COLOR_ACCENT_SOFT};padding:4px 8px;border-radius:4px;white-space:nowrap;">${opts.tagChip}</span>`
		: '';

	const ctaNoteHtml = opts.ctaNote
		? `<p style="font-size:12px;color:${COLOR_FG3};margin:16px 0 0;line-height:1.5;text-align:center;">${opts.ctaNote}</p>`
		: '';

	const ctaHtml = opts.cta ? `
	<tr><td align="center" style="padding:32px 40px 40px;">
		<a href="${opts.cta.href}" style="display:inline-block;background:${COLOR_ACCENT};color:#ffffff;font-size:14px;font-weight:600;letter-spacing:-.005em;padding:14px 32px;border-radius:6px;text-decoration:none;">${opts.cta.label}</a>
		${ctaNoteHtml}
	</td></tr>` : '';

	const signatureHtml = opts.signature
		? `<p style="font-size:13px;color:${COLOR_FG2};line-height:1.6;margin:0 0 18px;">${opts.signature}</p>`
		: '';

	const footerLinksHtml = opts.footerLinks ? `
	<div style="font-size:11px;margin:0 0 12px;">
		<a href="${APP_BASE_URL}/settings" style="color:${COLOR_FG3};text-decoration:none;border-bottom:1px solid rgba(15,20,30,.14);padding-bottom:1px;margin-right:14px;">Preferencias de email</a>
		<a href="${APP_BASE_URL}/privacy" style="color:${COLOR_FG3};text-decoration:none;border-bottom:1px solid rgba(15,20,30,.14);padding-bottom:1px;">Privacidad</a>
	</div>` : '';

	const legalLines = [
		COMPANY_LEGAL_NAME ? escapeHtml(COMPANY_LEGAL_NAME) : BRAND_NAME,
		COMPANY_ADDRESS ? escapeHtml(COMPANY_ADDRESS) : '',
		COMPANY_NIF ? `NIF ${escapeHtml(COMPANY_NIF)}` : '',
	].filter(Boolean).join('<br>');

	return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:${COLOR_BG};font-family:${FONT_STACK};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR_BG};padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${COLOR_SURFACE};border:1px solid ${COLOR_BORDER};border-radius:2px;">
	<tr><td style="padding:10px 40px;background:${COLOR_SURFACE2};border-bottom:1px solid ${COLOR_DIVIDER};font-size:11px;color:${COLOR_FG3};letter-spacing:.01em;">${opts.preheader}</td></tr>
	<tr><td style="padding:24px 40px 20px;">
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
			<td valign="middle" style="color:${COLOR_FG};">
				<table role="presentation" cellpadding="0" cellspacing="0"><tr>
					<td valign="middle" style="padding-right:10px;">${LOGO_SVG}</td>
					<td valign="middle">
						<span style="font-size:14px;font-weight:600;letter-spacing:-.01em;color:${COLOR_FG};">${BRAND_NAME}</span><br>
						<span style="font-size:10px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:${COLOR_FG3};">${BRAND_CITY}</span>
					</td>
				</tr></table>
			</td>
			<td valign="middle" align="right">${chipHtml}</td>
		</tr></table>
	</td></tr>
	<tr><td style="padding:0 40px;"><div style="height:1px;line-height:1px;font-size:1px;background:${COLOR_DIVIDER};">&nbsp;</div></td></tr>
	<tr><td style="padding:32px 40px 8px;">
		<p style="font-size:11px;font-weight:500;letter-spacing:.09em;text-transform:uppercase;color:${COLOR_FG3};margin:0 0 12px;">${opts.eyebrow}</p>
		<h1 style="font-size:27px;line-height:1.18;font-weight:600;letter-spacing:-.025em;margin:0 0 14px;color:${COLOR_FG};">${opts.headline}</h1>
		${opts.bodyHtml}
	</td></tr>
	${ctaHtml}
	<tr><td style="padding:26px 40px 30px;background:${COLOR_SURFACE2};border-top:1px solid ${COLOR_DIVIDER};">
		${signatureHtml}
		${footerLinksHtml}
		<p style="font-size:11px;line-height:1.7;color:${COLOR_FG3};margin:0;">${legalLines}${opts.footerNote ? `<br>${opts.footerNote}` : ''}</p>
	</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
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
		from: EMAIL_FROM,
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
	const name = escapeHtml(restaurantName ?? 'tu restaurante');
	return {
		to: email,
		kind: 'welcome',
		subject: '¡Bienvenido a Mise en Place! 🎉',
		html: renderEmailLayout({
			preheader: `Tu cuenta para ${name} ya está activa — esto es lo que pasa a continuación.`,
			tagChip: 'Cuenta activa',
			eyebrow: 'Bienvenida',
			headline: '¡Bienvenido a Mise en Place!',
			bodyHtml: `
${p(`Tu cuenta para ${strong(name)} ya está activa.`)}
${steps([
	{ title: 'Sube tu primera factura', desc: 'Una foto o un PDF de un albarán de proveedor es suficiente para empezar.' },
	{ title: 'La leemos automáticamente', desc: 'Extraemos productos, precios y totales — sin transcripción manual.' },
	{ title: 'Ves tu primer panel', desc: 'Gasto por categoría y proveedor, listo en minutos.' },
])}
${p('Tus primeros 14 días son gratis — sin tarjeta.')}`,
			cta: { href: APP_BASE_URL, label: 'Abrir la aplicación' },
			signature: `Nos vemos en la cocina,<br>${strong('El equipo de Mise en Place')}`,
		}),
	};
}

export function waitlistInviteEmail(email: string, couponCode?: string): EmailPayload {
	const couponCallout = couponCode
		? callout(`Código ${escapeHtml(couponCode)}`, 'Úsalo al pagar y tu primer mes es gratis.')
		: '';
	return {
		to: email,
		kind: 'waitlist_invite',
		subject: 'Tu invitación a Mise en Place',
		html: renderEmailLayout({
			preheader: 'Estabas en la lista de espera — ya estamos listos para ti.',
			tagChip: 'Invitación',
			eyebrow: 'Lista de espera',
			headline: 'Tu cocina ya puede entrar.',
			bodyHtml: `
${p('Estabas en nuestra lista de espera — y ya estamos listos para ti.')}
${p(`${strong('Mise en Place')} ya está disponible: inteligencia de facturas de proveedores con IA para restaurantes independientes.`)}
${couponCallout}`,
			cta: { href: `${APP_BASE_URL}/signup`, label: 'Crear tu cuenta' },
			signature: `Nos vemos pronto en el pase,<br>${strong('El equipo de Mise en Place')}`,
			footerNote: 'Recibes este correo porque te apuntaste en la lista de espera de Mise en Place.',
		}),
	};
}

export function accessApprovedEmail(email: string, couponCode?: string): EmailPayload {
	const couponCallout = couponCode
		? callout(`Código ${escapeHtml(couponCode)}`, 'Tu descuento de fundador. Úsalo al pasar por caja.')
		: '';
	return {
		to: email,
		kind: 'access_approved',
		subject: 'Tu acceso a Mise en Place ya está activo',
		html: renderEmailLayout({
			preheader: 'Ya puedes entrar — tu cuenta está activada.',
			tagChip: 'Acceso activado',
			eyebrow: 'Beta privada',
			headline: 'Ya puedes entrar.',
			bodyHtml: `
${p('Hemos activado tu cuenta: ya tienes acceso completo a Mise en Place.')}
${p(`Entra con el email con el que te registraste (${strong(escapeHtml(email))}) y monta tu restaurante en un par de minutos.`)}
${couponCallout}`,
			cta: { href: `${APP_BASE_URL}/login`, label: 'Entrar en la aplicación' },
			signature: `Nos vemos en el pase,<br>${strong('El equipo de Mise en Place')}`,
			footerNote: 'Recibes este correo porque tenías una cuenta pendiente de activación en Mise en Place.',
		}),
	};
}

export function promoCodeEmail(email: string, promoCode: string): EmailPayload {
	const code = escapeHtml(promoCode);
	return {
		to: email,
		kind: 'promo_code_dispatch',
		subject: 'Tu código de descuento Mise en Place',
		html: renderEmailLayout({
			preheader: 'Tienes un código de descuento para usar al crear tu cuenta.',
			tagChip: 'Promoción',
			eyebrow: 'Código de descuento',
			headline: 'Tu código de descuento.',
			bodyHtml: `
${p('Te compartimos un código de descuento para usar al crear tu cuenta en Mise en Place.')}
${callout(`Código ${code}`, 'Úsalo al pagar y obtén un descuento especial.')}
${p('Si todavía no tienes cuenta, regístrate y aplica el código durante el pago.')}`,
			cta: { href: `${APP_BASE_URL}/signup`, label: 'Crear tu cuenta' },
			signature: `Nos vemos en el pase,<br>${strong('El equipo de Mise en Place')}`,
			footerNote: 'Recibes este correo porque estás en la lista de espera de Mise en Place.',
		}),
	};
}

export function weeklyDigestEmail(email: string, restaurantName: string, digestHtml: string): EmailPayload {
	const styledDigest = digestHtml.replace(/<p>/g, `<p style="font-size:15px;line-height:1.6;color:${COLOR_FG2};margin:0 0 16px;">`);
	const name = escapeHtml(restaurantName);
	return {
		to: email,
		kind: 'weekly_digest',
		subject: `Tu resumen semanal — ${restaurantName}`,
		html: renderEmailLayout({
			preheader: `Tu resumen semanal de gastos de ${name}.`,
			eyebrow: 'Resumen semanal',
			headline: `Resumen semanal — ${name}`,
			bodyHtml: `
${p('Este es el resumen semanal de gastos:')}
${styledDigest}`,
			cta: { href: `${APP_BASE_URL}/reports`, label: 'Ver el resumen completo' },
			footerLinks: true,
		}),
	};
}

export function overdueInvoiceEmail(email: string, restaurantName: string, overdueCount: number, totalOwed: string): EmailPayload {
	const invoicesWord = overdueCount === 1 ? 'factura vencida' : 'facturas vencidas';
	const invoicesLabel = `${overdueCount} ${invoicesWord}`;
	const name = escapeHtml(restaurantName);
	const total = escapeHtml(totalOwed);
	return {
		to: email,
		kind: 'overdue_invoice',
		subject: `${invoicesLabel} — ${restaurantName}`,
		html: renderEmailLayout({
			preheader: `${invoicesLabel} por un total de ${totalOwed} en ${name}.`,
			tagChip: 'Recordatorio',
			eyebrow: 'Facturas vencidas',
			headline: invoicesLabel,
			bodyHtml: p(`Tienes ${strong(invoicesLabel)} por un total de ${strong(total)} en ${name}.`),
			cta: { href: `${APP_BASE_URL}/reminders`, label: 'Revisar y marcar como pagadas' },
			footerLinks: true,
		}),
	};
}

export function trialExpiryEmail(email: string, restaurantName: string, daysLeft: number): EmailPayload {
	const daysWord = daysLeft === 1 ? 'día' : 'días';
	const daysLabel = `${daysLeft} ${daysWord}`;
	const name = escapeHtml(restaurantName);
	return {
		to: email,
		kind: 'trial_expiry',
		subject: `Tu prueba gratuita termina en ${daysLabel} — ${restaurantName}`,
		html: renderEmailLayout({
			preheader: `Tu prueba gratuita para ${name} termina en ${daysLabel}.`,
			tagChip: 'Prueba gratuita',
			eyebrow: 'Prueba gratuita',
			headline: `Termina en ${daysLabel}`,
			bodyHtml: `
${p(`Tu prueba gratuita de Mise en Place para ${strong(name)} termina en ${strong(daysLabel)}.`)}
${p('Suscríbete ahora para mantener el acceso completo a tus facturas, analíticas y alertas.')}`,
			cta: { href: `${APP_BASE_URL}/billing`, label: 'Activar suscripción' },
			footerNote: 'Mise en Place · Desde 49 €/mes por restaurante',
		}),
	};
}

export function trialExpiredEmail(email: string, restaurantName: string): EmailPayload {
	const name = escapeHtml(restaurantName);
	return {
		to: email,
		kind: 'trial_expired',
		subject: `Tu prueba gratuita ha terminado — ${restaurantName}`,
		html: renderEmailLayout({
			preheader: `La prueba gratuita para ${name} ha terminado.`,
			tagChip: 'Prueba gratuita',
			eyebrow: 'Prueba gratuita',
			headline: 'Tu prueba gratuita ha terminado.',
			bodyHtml: `
${p(`La prueba gratuita de Mise en Place para ${strong(name)} ha terminado.`)}
${p('Tus datos siguen intactos y puedes consultarlos, exportarlos o descargarlos cuando quieras. Para volver a subir facturas y usar las funciones con IA, activa una suscripción.')}`,
			cta: { href: `${APP_BASE_URL}/billing`, label: 'Activar suscripción' },
			footerNote: 'Mise en Place · Desde 49 €/mes por restaurante',
		}),
	};
}

export function subscriptionConfirmationEmail(email: string, restaurantName: string, planName: string): EmailPayload {
	const name = escapeHtml(restaurantName);
	const plan = escapeHtml(planName);
	return {
		to: email,
		kind: 'subscription_confirmation',
		subject: `Suscripción activada: plan ${planName} — ${restaurantName}`,
		html: renderEmailLayout({
			preheader: `Tu suscripción al plan ${plan} para ${name} ya está activa.`,
			tagChip: 'Suscripción activa',
			eyebrow: 'Confirmación',
			headline: `Plan ${plan} activado`,
			bodyHtml: `
${p(`¡Gracias! Tu suscripción al plan ${strong(plan)} para ${strong(name)} ya está activa.`)}
${p('Puedes consultar tu factura y gestionar la suscripción en cualquier momento desde la sección de facturación.')}`,
			cta: { href: `${APP_BASE_URL}/billing`, label: 'Gestionar suscripción' },
		}),
	};
}

export function subscriptionConsolidatedEmail(email: string, restaurantName: string, keptRestaurantName: string): EmailPayload {
	const name = escapeHtml(restaurantName);
	const keptName = escapeHtml(keptRestaurantName);
	const downgradedParagraph = p(`${strong(name)} ha vuelto a acceso de prueba. Si necesitas plan de pago allí, puedes activarlo desde la sección de facturación de ese restaurante.`);
	return {
		to: email,
		kind: 'subscription_consolidated',
		subject: `Tu plan de pago en ${restaurantName} ha sido cancelado`,
		html: renderEmailLayout({
			preheader: `Cada cuenta solo puede tener un plan activo; hemos mantenido el de ${keptName}.`,
			tagChip: 'Plan cancelado',
			eyebrow: 'Suscripción',
			headline: 'Tu plan ha cambiado a prueba gratuita',
			bodyHtml: `
${p(`Detectamos que tu cuenta tenía dos suscripciones activas. Como cada cuenta solo puede tener un plan, hemos cancelado la de ${strong(name)} y mantenido la de ${strong(keptName)}.`)}
${downgradedParagraph}`,
			cta: { href: `${APP_BASE_URL}/billing`, label: 'Ver facturación' },
			footerLinks: true,
		}),
	};
}

export function verifyEmailAddress(email: string, verifyUrl: string): EmailPayload {
	return {
		to: email,
		kind: 'verify_email',
		subject: 'Confirma tu correo — Mise en Place',
		html: renderEmailLayout({
			preheader: 'Confirma tu correo para activar tu cuenta de Mise en Place.',
			eyebrow: 'Verificación',
			headline: 'Confirma tu correo.',
			bodyHtml: p(`Confirma tu correo para activar tu cuenta de ${strong('Mise en Place')}:`),
			cta: { href: verifyUrl, label: 'Confirmar correo' },
			ctaNote: 'Este enlace caduca en 1 hora. Si no creaste esta cuenta, ignora este correo.',
		}),
	};
}

export function resetPasswordEmail(email: string, resetUrl: string): EmailPayload {
	return {
		to: email,
		kind: 'password_reset',
		subject: 'Restablecer tu contraseña — Mise en Place',
		html: renderEmailLayout({
			preheader: 'Pediste restablecer tu contraseña de Mise en Place.',
			eyebrow: 'Seguridad',
			headline: 'Restablecer tu contraseña.',
			bodyHtml: p(`Pediste restablecer tu contraseña de ${strong('Mise en Place')}:`),
			cta: { href: resetUrl, label: 'Restablecer contraseña' },
			ctaNote: 'Este enlace caduca en 1 hora. Si no pediste esto, ignora este correo — tu contraseña no cambiará.',
		}),
	};
}

export function changeEmailAddress(newEmail: string, confirmUrl: string): EmailPayload {
	return {
		to: newEmail,
		kind: 'verify_email',
		subject: 'Confirma tu nuevo correo — Mise en Place',
		html: renderEmailLayout({
			preheader: 'Pediste cambiar el correo de tu cuenta de Mise en Place.',
			eyebrow: 'Verificación',
			headline: 'Confirma tu nuevo correo.',
			bodyHtml: p(`Pediste cambiar el correo de tu cuenta de ${strong('Mise en Place')} a esta dirección. Confírmalo aquí:`),
			cta: { href: confirmUrl, label: 'Confirmar nuevo correo' },
			ctaNote: 'Este enlace caduca en 1 hora. Si no pediste este cambio, ignora este correo.',
		}),
	};
}

export function quotaWarningEmail(email: string, restaurantName: string, used: number, limit: number): EmailPayload {
	const pct = Math.round((used / limit) * 100);
	const invoicesLabel = `${used} de ${limit} facturas`;
	const name = escapeHtml(restaurantName);
	return {
		to: email,
		kind: 'quota_warning',
		subject: `Tu cuota de facturas está al ${pct} % — ${restaurantName}`,
		html: renderEmailLayout({
			preheader: `Este mes has procesado ${invoicesLabel} incluidas en tu plan.`,
			tagChip: `${pct} %`,
			eyebrow: 'Cuota de facturas',
			headline: `Cuota al ${pct} %`,
			bodyHtml: `
${p(`Este mes has procesado ${strong(invoicesLabel)} incluidas en tu plan para ${strong(name)} (${pct} %).`)}
${p('Si superas el límite no podrás procesar más facturas hasta el mes siguiente. Puedes ampliar tu plan en cualquier momento:')}`,
			cta: { href: `${APP_BASE_URL}/billing`, label: 'Ver planes' },
			footerLinks: true,
		}),
	};
}
