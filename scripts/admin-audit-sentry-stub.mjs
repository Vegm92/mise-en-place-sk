// Optional dev-server preload for the admin mobile audit (issue #657).
//
// /admin/errors only renders its table when Sentry is configured, and the rows
// come from a server-side fetch to sentry.io. This preload intercepts that one
// host so the table renders locally with representative rows. It touches no
// application code — load it into the dev server only:
//
//   SENTRY_AUTH_TOKEN=stub SENTRY_ORG=stub-org SENTRY_PROJECT=stub-project \
//   NODE_OPTIONS='--import ./scripts/admin-audit-sentry-stub.mjs' \
//     npx vite dev --port 5207 --host 127.0.0.1
const ISSUES = [
	['ReferenceError: locals.restaurantId is not defined', 'src/routes/(app)/invoices/+page.server.ts in load', 'error', 412, 37],
	['GeminiTimeoutError: extraction exceeded 45000 ms', 'src/lib/server/extract.ts in extractInvoice', 'fatal', 188, 21],
	['PostgresError: duplicate key value violates unique constraint', 'src/lib/server/invoice-save.ts in saveInvoice', 'error', 96, 14],
	['TypeError: Cannot read properties of null (reading "totalAmount")', 'src/lib/components/mep/InvoiceTable.svelte', 'warning', 54, 9],
	['StripeSignatureVerificationError: no signatures found matching the expected signature', 'src/routes/api/stripe-webhook/+server.ts in POST', 'error', 12, 3],
];

const payload = ISSUES.map(([title, culprit, level, count, userCount], i) => ({
	id: String(1000 + i),
	shortId: `MEP-${String(i + 1).padStart(3, '0')}`,
	title,
	culprit,
	level,
	count,
	userCount,
	firstSeen: new Date(Date.now() - (i + 4) * 86400000).toISOString(),
	lastSeen: new Date(Date.now() - (i + 1) * 3600000).toISOString(),
	permalink: `https://stub-org.sentry.io/issues/${1000 + i}/`,
}));

const realFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
	const url = typeof input === 'string' ? input : (input?.url ?? String(input));
	if (url.startsWith('https://de.sentry.io/api/0')) {
		return new Response(JSON.stringify(payload), {
			status: 200,
			headers: { 'content-type': 'application/json' },
		});
	}
	return realFetch(input, init);
};
