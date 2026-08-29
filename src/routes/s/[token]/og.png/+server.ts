import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildPublicDigestPayload, resolveShareToken } from '$lib/server/digest-share';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { DIGEST_SHARE_VIEW_RATE_LIMIT_RPM } from '$lib/server/env';
import { runAsSystem } from '$lib/server/db';

const WIDTH = 1200;
const HEIGHT = 630;
const INK = '#1a1a1a';
const MUTED = '#6b6b6b';
const NEG = '#b03a3a';
const POS = '#14694a';
const PAPER = '#f1f0ee';
const CARD = '#ffffff';

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function fmtPct(value: number | null): string {
	if (value === null || !Number.isFinite(value)) return '—';
	const sign = value > 0 ? '+' : value < 0 ? '−' : '';
	return `${sign}${Math.abs(value).toFixed(1).replace('.', ',')} %`;
}

function toneColor(value: number | null): string {
	if (value === null || value === 0) return INK;
	return value > 0 ? NEG : POS;
}

function moverRow(category: string, deltaPct: number | null, y: number): string {
	const label = escapeXml(category);
	const value = escapeXml(fmtPct(deltaPct));
	const color = toneColor(deltaPct);
	return `
		<text x="80" y="${y}" font-family="Arial, sans-serif" font-size="26" fill="${INK}">${label}</text>
		<text x="1120" y="${y}" text-anchor="end" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="${color}">${value}</text>
	`;
}

export const GET: RequestHandler = async ({ params, getClientAddress }) => {
	const ip = getClientAddress();
	if (!(await checkRateLimit(`digest-share-og:${ip}`, DIGEST_SHARE_VIEW_RATE_LIMIT_RPM))) {
		error(429, 'Too many requests');
	}

	const { resolved, payload } = await runAsSystem(async () => {
		const resolved = await resolveShareToken(params.token);
		if (!resolved) return { resolved: null, payload: null };
		return { resolved, payload: await buildPublicDigestPayload(resolved.restaurantId, resolved.week) };
	});
	if (!resolved || !payload) error(404, 'Not Found');

	const headline = payload.empty ? '—' : fmtPct(payload.spendChangePct);
	const headlineColor = payload.empty ? MUTED : toneColor(payload.spendChangePct);
	const movers = payload.categoryMovers
		.slice(0, 3)
		.map((mover, i) => moverRow(mover.category, mover.deltaPct, 420 + i * 46));

	const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
	<rect width="${WIDTH}" height="${HEIGHT}" fill="${PAPER}" />
	<rect x="40" y="40" width="${WIDTH - 80}" height="${HEIGHT - 80}" rx="20" fill="${CARD}" stroke="#e4e2de" />
	<text x="80" y="120" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="${INK}">Mise en Place</text>
	<text x="80" y="160" font-family="Arial, sans-serif" font-size="20" fill="${MUTED}">Resumen anonimizado · Semana ${escapeXml(payload.week)}</text>
	<text x="80" y="290" font-family="Arial, sans-serif" font-size="96" font-weight="700" fill="${headlineColor}">${escapeXml(headline)}</text>
	<text x="80" y="330" font-family="Arial, sans-serif" font-size="22" fill="${MUTED}">gasto vs. semana anterior</text>
	${movers.join('')}
	<text x="80" y="${HEIGHT - 60}" font-family="Arial, sans-serif" font-size="16" fill="${MUTED}">Solo variaciones porcentuales — sin importes, proveedores ni facturas.</text>
</svg>`;

	return new Response(svg, {
		headers: {
			'Content-Type': 'image/svg+xml',
			'Cache-Control': 'public, max-age=3600',
			'X-Robots-Tag': 'noindex',
		},
	});
};
