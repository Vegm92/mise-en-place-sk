#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PROJECT_DIRECTIVES } from './lint-directives.mjs';

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

const SCOPE_OK = new RegExp(`(?:${PROJECT_DIRECTIVES.join('|')}):`);

/**
 * Ratcheting allowlist for the `form-get-cast` gate below (issue #844): the
 * `+page.server.ts` files that still cast `form.get(...)`/`formData.get(...)`
 * with `as` instead of deriving their input from a schema. `form.get()`
 * genuinely returns `string | File | null` — the cast lies to the type
 * checker, and a client that posts a file part under that field name either
 * throws (a string method called on a `File`) or flows the `File` onward
 * untyped. New occurrences outside this list fail the gate; an existing
 * offender is removed from the list in the same PR that converts it (see
 * src/lib/server/public-form-action.ts's `schema` option + `parseForm`, and
 * src/routes/signup/+page.server.ts for the converted shape). Do not add a
 * file here to silence a *new* cast — the allowlist is for the offenders
 * that predate this gate, not an escape hatch.
 */
const FORM_GET_CAST_ALLOWLIST = new Set([]);

const GATES = {
	'no-sql-raw': {
		roots: ['src'],
		extensions: ['.ts', '.svelte'],
		pattern: /sql\.raw\(/,
		message: 'sql.raw() is banned — use parameterized sql`...` templates instead'
	},
	'tenant-scope': {
		roots: ['src/routes', 'src/lib/server'],
		extensions: ['.ts'],
		pattern: /eq\([a-zA-Z]*\.restaurantId,/,
		exclude: (filePath) => filePath.includes(`${path.sep}admin${path.sep}`) || path.basename(filePath) === 'tenant.ts',
		message: 'raw eq(*.restaurantId,...) found — use forTenant().scope() instead (ADR-001 / issue #138)'
	},
	'form-get-cast': {
		roots: ['src/routes'],
		extensions: ['.ts'],
		pattern: /\bform(?:Data)?\.get\([^)]*\)\s*as\s+/,
		exclude: (filePath) => path.basename(filePath) !== '+page.server.ts',
		allowlist: FORM_GET_CAST_ALLOWLIST,
		message: 'form.get(...)/formData.get(...) cast with `as` bypasses validation — FormData.get() returns\n' +
			'  string | File | null, so a client that posts a file part under that field name either throws or\n' +
			'  flows a File through untyped. Derive the input from a schema instead: add `schema:` to the\n' +
			'  publicFormAction() options (src/lib/server/public-form-action.ts) or call its `parseForm()`\n' +
			'  directly, following src/routes/signup/+page.server.ts (issue #844). To shrink the allowlist,\n' +
			'  convert one of its files and remove that file\'s entry from FORM_GET_CAST_ALLOWLIST above.'
	}
};

/**
 * Tables whose rows belong to a restaurant, derived from schema.ts rather than
 * hardcoded so a newly added tenant table is covered the moment it is declared.
 *
 * `restaurants` is excluded because it *is* the tenant. The rest of the
 * exclusions are ADR-001's non-tenant tables: `user_restaurants` is the
 * membership pivot (keyed by user, not restaurant) and `subscriptions` is
 * billing state keyed by the Stripe customer.
 */
const NON_TENANT_TABLES = new Set(['userRestaurants', 'subscriptions']);

function tenantScopedTables() {
	const found = new Map();
	const schemaDir = path.join(ROOT, 'src/lib/server/schema');
	const schemaFile = path.join(ROOT, 'src/lib/server/schema.ts');
	let schemaFiles = [];
	if (fs.existsSync(schemaDir)) schemaFiles = walk(schemaDir, ['.ts']);
	else if (fs.existsSync(schemaFile)) schemaFiles = [schemaFile];
	if (schemaFiles.length === 0) return found;
	for (const file of schemaFiles) {
		const src = fs.readFileSync(file, 'utf8');
		const decl = /export const (\w+)\s*=\s*pgTable\(\s*['"](\w+)['"]/g;
		const starts = [];
		let m;
		while ((m = decl.exec(src))) starts.push({ ident: m[1], table: m[2], at: m.index });
		starts.forEach((s, i) => {
			const end = i + 1 < starts.length ? starts[i + 1].at : src.length;
			if (!/\brestaurantId\s*:/.test(src.slice(s.at, end))) return;
			if (NON_TENANT_TABLES.has(s.ident)) return;
			found.set(s.ident, s.table);
		});
	}
	return found;
}

/**
 * Flags `.from(<tenantTable>)` in a statement that carries no tenant predicate.
 *
 * The tenant-scope gate above bans the *wrong* helper; this one bans a *missing*
 * one, which is the shape that actually leaks (and the shape RLS never caught,
 * since the app connects as the table owner — ADR-005). Both leaks fixed in
 * #380 looked like this.
 *
 * A statement is accepted when it goes through forTenant().scope(), or names
 * a restaurantId column directly (bulk queries like `inArray(x.restaurantId,
 * ridsTheUserOwns)` are legitimate). Anything else needs an explicit
 *
 *   // tenant-scope-ok: <why this query is safe unscoped>
 *
 * on or above the statement — deliberate cross-tenant work (background jobs,
 * lookups already keyed by a validated owner id) is real, but should be stated.
 */
/**
 * Bounds of the expression containing `index`, tracking bracket depth so the
 * object literal in `.select({ … })` does not end it early, and so a sibling
 * query inside a `Promise.all([...])` does not bleed in — the latter matters,
 * because a scoped sibling would otherwise vouch for an unscoped query.
 *
 * Boundaries are `;` and `,` at depth 0, or the opening bracket we are nested in.
 */
function scanBoundary(src, index, dir) {
	const deepen = dir < 0 ? ')]}' : '([{';
	const narrow = dir < 0 ? '([{' : ')]}';
	let depth = 0;
	let pos = index;
	while (pos > 0 && pos < src.length) {
		const ch = dir < 0 ? src[pos - 1] : src[pos];
		if (deepen.includes(ch)) depth++;
		else if (narrow.includes(ch)) {
			if (depth === 0) break;
			depth--;
		} else if ((ch === ';' || ch === ',') && depth === 0) break;
		pos += dir;
	}
	return pos;
}

function statementBounds(src, index) {
	return [scanBoundary(src, index, -1), scanBoundary(src, index, 1)];
}

function matchViolation(src, m, tableName, file) {
	const [start, end] = statementBounds(src, m.index);
	const statement = src.slice(start, end);
	const whereAt = statement.indexOf('.where(');
	const filter = whereAt === -1 ? '' : statement.slice(whereAt);
	if (/scope\(/.test(filter) || /\.restaurantId\b/.test(filter)) return null;
	const lineNo = src.slice(0, m.index).split('\n').length;
	const above = src.slice(0, start).split('\n').slice(-3).join('\n');
	if (SCOPE_OK.test(statement) || SCOPE_OK.test(above)) return null;
	return `${path.relative(ROOT, file)}:${lineNo}: .from(${tableName}) with no tenant predicate`;
}

function scanFile(file, tables, violations) {
	const src = fs.readFileSync(file, 'utf8');
	const re = /\.from\(\s*(\w+)/g;
	let m;
	while ((m = re.exec(src))) {
		if (tables.has(m[1])) {
			const v = matchViolation(src, m, m[1], file);
			if (v) violations.push(v);
		}
	}
}

function runUnscopedQueryGate() {
	const tables = tenantScopedTables();
	if (tables.size === 0) {
		console.error('Error: could not derive tenant tables from schema — gate cannot run');
		return false;
	}
	const violations = [];
	for (const root of ['src/routes', 'src/lib/server']) {
		const absRoot = path.join(ROOT, root);
		if (!fs.existsSync(absRoot)) continue;
		for (const file of walk(absRoot, ['.ts'])) {
			// Admin tooling is cross-tenant by definition, same carve-out as tenant-scope.
			if (file.includes(`${path.sep}admin${path.sep}`)) continue;
			scanFile(file, tables, violations);
		}
	}
	if (violations.length > 0) {
		console.error(
			'Error: query on a tenant-scoped table with no tenant predicate — use forTenant().scope(),\n' +
				'filter on restaurantId, or annotate with `// tenant-scope-ok: <reason>` (ADR-001 / issue #380)'
		);
		for (const v of violations) console.error(`  ${v}`);
		return false;
	}
	return true;
}

/**
 * Guards known to establish, before a mutation, that the acting user owns the
 * resource an action's params/form-data resolved (a batch id, a restaurant id,
 * ...). Add a name here the moment a new one is introduced — the gate below
 * only recognizes calls by name, so an unlisted guard reads as no guard at all.
 */
const KNOWN_AUTHZ_GUARDS = ['requireOwnedBatch', 'requireOwner'];

const AUTHZ_CHECK_OK = new RegExp(`(?:${PROJECT_DIRECTIVES.join('|')}):`);

/**
 * Finds the balanced `{ ... }` starting at `openIdx` (which must point at a
 * `{`). Same trick as `scanBoundary` above, specialized to braces only — good
 * enough for extracting an object literal or arrow-function body without a
 * full parser, which is the level of rigor the rest of this file works at.
 */
function extractBalanced(src, openIdx) {
	let depth = 0;
	for (let i = openIdx; i < src.length; i++) {
		if (src[i] === '{') depth++;
		else if (src[i] === '}') {
			depth--;
			if (depth === 0) return src.slice(openIdx, i + 1);
		}
	}
	return src.slice(openIdx);
}

/**
 * Splits the `actions: Actions = { ... }` object into one entry per exported
 * action, each as `{ name, start, body }` — `start` is the absolute offset of
 * the action's key (for line numbers and for reading the comment lines above
 * it), `body` is the balanced text of its arrow-function body.
 *
 * Deliberately shallow: an action is read as written, not as everything it
 * transitively calls. A mutation buried in an imported helper (or a same-file
 * helper the action merely calls by name) is invisible here, same tradeoff
 * `tenant-scope`/`unscoped-tenant-query` make by working on source text
 * rather than a call graph. That is why `KNOWN_AUTHZ_GUARDS` and the
 * forTenant-anywhere-in-body check below are checked by simple presence, not
 * by proving they run before every mutation line — precision beyond that
 * needs a real parser, which this project's lints intentionally don't carry.
 */
function findActions(src) {
	const declMatch = /export const actions(?:\s*:\s*[^={]+)?\s*=\s*\{/.exec(src);
	if (!declMatch) return [];
	const objOpen = declMatch.index + declMatch[0].length - 1;
	const objBody = extractBalanced(src, objOpen);

	const entries = [];
	const keyRe = /(^|\n)\t([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?\(/g;
	let m;
	while ((m = keyRe.exec(objBody))) {
		const name = m[2];
		const arrowOpen = objBody.indexOf('=> {', m.index);
		if (arrowOpen === -1) continue;
		const bodyOpen = arrowOpen + 3;
		const body = extractBalanced(objBody, bodyOpen);
		entries.push({ name, start: objOpen + m.index + m[1].length, body });
	}
	return entries;
}

/** Tenant-table mutation call sites: `db.insert(products)`, `tx.delete(invoices)`, ... */
const BUILDER_MUTATION_RE = /\b(?:db|tx)\.(?:insert|update|delete)\(\s*([A-Za-z_$][\w$]*)/g;

/** Raw-SQL mutation call sites: `db.execute(sql\`INSERT INTO products ...\`)`. */
const EXECUTE_CALL_RE = /\b(?:db|tx)\.execute(?:<[^>]*>)?\(/g;
const RAW_MUTATION_TABLE_RE = /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?([a-z_]+)"?/gi;

function bodyMutatesTenantTable(body, tableIdents, tableNames) {
	BUILDER_MUTATION_RE.lastIndex = 0;
	let m;
	while ((m = BUILDER_MUTATION_RE.exec(body))) {
		if (tableIdents.has(m[1])) return true;
	}
	EXECUTE_CALL_RE.lastIndex = 0;
	if (EXECUTE_CALL_RE.test(body)) {
		RAW_MUTATION_TABLE_RE.lastIndex = 0;
		let rm;
		while ((rm = RAW_MUTATION_TABLE_RE.exec(body))) {
			if (tableNames.has(rm[1].toLowerCase())) return true;
		}
	}
	return false;
}

function actionAuthzViolation(src, file, action) {
	const { name, start, body } = action;
	if (!bodyMutatesTenantTable(body, actionAuthzViolation.tableIdents, actionAuthzViolation.tableNames)) return null;

	const hasGuard = KNOWN_AUTHZ_GUARDS.some((g) => new RegExp(`\\b${g}\\s*\\(`).test(body));
	if (hasGuard) return null;

	const isTenantScoped = /\bforTenant\s*\(/.test(body) || /\.scope\(/.test(body);
	if (isTenantScoped) return null;

	const above = src.slice(0, start).split('\n').slice(-3).join('\n');
	if (AUTHZ_CHECK_OK.test(body) || AUTHZ_CHECK_OK.test(above)) return null;

	const lineNo = src.slice(0, start).split('\n').length;
	return `${path.relative(ROOT, file)}:${lineNo}: action '${name}' mutates a tenant table with no known guard ` +
		`(${KNOWN_AUTHZ_GUARDS.join(', ')}), no forTenant()/.scope() in the action body, and no ` +
		`\`// tenant-check-ok: <reason>\` escape comment`;
}

function runActionAuthzGate() {
	const tables = tenantScopedTables();
	if (tables.size === 0) {
		console.error('Error: could not derive tenant tables from schema — gate cannot run');
		return false;
	}
	actionAuthzViolation.tableIdents = new Set(tables.keys());
	actionAuthzViolation.tableNames = new Set([...tables.values()].map((n) => n.toLowerCase()));

	const root = path.join(ROOT, 'src/routes/(app)');
	if (!fs.existsSync(root)) return true;

	const violations = [];
	for (const file of walk(root, ['.ts'])) {
		if (path.basename(file) !== '+page.server.ts') continue;
		const src = fs.readFileSync(file, 'utf8');
		for (const action of findActions(src)) {
			const v = actionAuthzViolation(src, file, action);
			if (v) violations.push(v);
		}
	}
	if (violations.length > 0) {
		console.error(
			'Error: a form action mutates a tenant table without an authorization check — call a known guard\n' +
				'before the mutation, scope every mutation with forTenant()/.scope(), or annotate with\n' +
				'`// tenant-check-ok: <reason>` (ADR-001 / issue #517)'
		);
		for (const v of violations) console.error(`  ${v}`);
		return false;
	}
	return true;
}

/**
 * Ratcheting per-file budget for issue #845: the `style="…var(--mep-*)…"`
 * attributes that still style components by hand instead of using the Tailwind
 * utilities `@theme inline` generates from the same tokens (`text-fg-3`,
 * `bg-surface`, `shadow-card`, …). src/app.css states the rule in its own
 * words: never put hex codes or var(--mep-*) in component .svelte files.
 *
 * The count is a gate rather than a style preference: those attributes are the
 * only reason svelte.config.js has to ship `style-src 'unsafe-inline'`, so the
 * strict hash-mode CSP around them is not actually strict until this reaches
 * zero. Conversion is inherently many small diffs — one file per PR,
 * worst-first — and this budget is what keeps the total moving one way.
 *
 * The numbers may go down, never up. Convert a file, then set its entry to the
 * new count (or delete the entry at zero) in the same commit; the gate fails
 * on a count that is above its budget *and* on one that is below it, because a
 * stale budget silently allows drift back up to the old number. A file with no
 * entry is budgeted at zero, so new inline token styles fail on arrival.
 */
const INLINE_TOKEN_STYLE_BUDGET = new Map([
	['src/routes/(app)/+layout.svelte', 58],
	['src/routes/(app)/suppliers/[id]/+page.svelte', 53],
	['src/routes/(app)/budgets/+page.svelte', 49],
	['src/routes/(app)/analytics/extraction/+page.svelte', 48],
	['src/lib/components/UploadPanel.svelte', 43],
	['src/routes/(app)/analytics/prices/+page.svelte', 29],
	['src/lib/components/mobile/MobileInvoiceDetail.svelte', 27],
	['src/routes/(app)/chat/+page.svelte', 26],
	['src/routes/signup/+page.svelte', 22],
	['src/lib/components/mobile/MobileAnalyticsPrices.svelte', 21],
	['src/lib/components/mobile/MobileInvoiceList.svelte', 21],
	['src/lib/components/mep/BillingStatusCard.svelte', 19],
	['src/routes/(admin)/admin/+page.svelte', 1],
	['src/routes/(app)/analytics/spend/+page.svelte', 17],
	['src/routes/(app)/suppliers/+page.svelte', 17],
	['src/lib/components/mobile/MobileProducts.svelte', 16],
	['src/lib/components/mobile/MobileSuppliersList.svelte', 15],
	['src/lib/components/mep/BillingFeatureMatrix.svelte', 14],
	['src/lib/components/mobile/MobileAnalyticsSpend.svelte', 14],
	['src/lib/components/mobile/MobileDashboard.svelte', 14],
	['src/lib/components/waitlist/CaptureMock.svelte', 14],
	['src/lib/components/mep/BillingPlanCard.svelte', 13],
	['src/lib/components/waitlist/ExtractMock.svelte', 13],
	['src/routes/(app)/settings/+page.svelte', 12],
	['src/lib/components/waitlist/AppDashboardMock.svelte', 11],
	['src/routes/onboarding/+page.svelte', 11],
	['src/lib/components/mep/NotificationBell.svelte', 10],
	['src/lib/components/mobile/MobileRecipes.svelte', 10],
	['src/routes/(admin)/+layout.svelte', 10],
	['src/routes/(app)/invoice/[id]/+page.svelte', 10],
	['src/routes/s/[token]/+page.svelte', 10],
	['src/lib/components/desktop/DesktopDashboard.svelte', 9],
	['src/lib/components/mobile/MobileAlerts.svelte', 9],
	['src/lib/components/waitlist/DashboardMock.svelte', 9],
	['src/routes/(app)/billing/+page.svelte', 9],
	['src/routes/(app)/invoices/+page.svelte', 9],
	['src/lib/components/waitlist/EmailForm.svelte', 8],
	['src/routes/(app)/billing/confirm/+page.svelte', 8],
	['src/lib/components/mep/AlertRow.svelte', 6],
	['src/lib/components/mep/ConfirmDialog.svelte', 6],
	['src/lib/components/mep/TrendLineChart.svelte', 6],
	['src/lib/components/mobile/turno/WorkCardMobile.svelte', 6],
	['src/routes/(app)/settings/confirm-email/+page.svelte', 6],
	['src/lib/components/admin/AdminSystemBanner.svelte', 5],
	['src/lib/components/desktop/turno/WorkCard.svelte', 5],
	['src/routes/forgot-password/+page.svelte', 5],
	['src/routes/verify-email/+page.svelte', 5],
	['src/lib/components/mep/ChatFab.svelte', 4],
	['src/lib/components/mep/CoachMark.svelte', 4],
	['src/lib/components/mep/PeriodPicker.svelte', 4],
	['src/routes/(app)/help/+page.svelte', 4],
	['src/routes/(app)/products/+page.svelte', 4],
	['src/routes/(app)/reports/[type]/+page.svelte', 4],
	['src/routes/(app)/reports/+page.svelte', 4],
	['src/routes/reset-password/+page.svelte', 4],
	['src/lib/components/admin/AdminPageHead.svelte', 3],
	['src/lib/components/mep/AuthShell.svelte', 3],
	['src/lib/components/mep/DateRangePicker.svelte', 3],
	['src/lib/components/mep/FlowSteps.svelte', 3],
	['src/lib/components/mep/NotificationItem.svelte', 3],
	['src/routes/(app)/recipes/[id]/sheet/+page.svelte', 3],
	['src/routes/+error.svelte', 3],
	['src/lib/components/admin/AdminKpiCard.svelte', 2],
	['src/lib/components/mep/ListPageTemplate.svelte', 2],
	['src/lib/components/desktop/turno/StatusChip.svelte', 1],
	['src/lib/components/FileTypeBadge.svelte', 1],
	['src/lib/components/mep/ErrorBoundary.svelte', 1],
	['src/lib/components/mep/RecipeLineRow.svelte', 1],
	['src/routes/(app)/plantilla-lista/+page.svelte', 1],
	['src/routes/(app)/recipes/[id]/cocina/+page.svelte', 1],
]);

/**
 * Deliberately matches the attribute, not the declaration: one `style` carrying
 * four token references is one attribute to retire, and one CSP concession.
 */
function countInlineTokenStyles(src) {
	return (src.match(/style="[^"]*var\(--mep-/g) ?? []).length;
}

function runInlineTokenStyleGate() {
	const root = path.join(ROOT, 'src');
	if (!fs.existsSync(root)) return true;

	const over = [];
	const stale = [];
	const seen = new Set();
	for (const file of walk(root, ['.svelte'])) {
		const rel = path.relative(ROOT, file).split(path.sep).join('/');
		const budget = INLINE_TOKEN_STYLE_BUDGET.get(rel) ?? 0;
		if (budget > 0) seen.add(rel);
		const count = countInlineTokenStyles(fs.readFileSync(file, 'utf8'));
		if (count > budget) over.push(`${rel}: ${count} inline token styles, budget ${budget}`);
		else if (count < budget)
			stale.push(
				`${rel}: ${count} inline token styles, budget ${budget} — ` +
					(count === 0 ? 'fully converted, delete its entry' : `lower the entry to ${count}`)
			);
	}
	for (const rel of INLINE_TOKEN_STYLE_BUDGET.keys()) {
		if (!seen.has(rel)) stale.push(`${rel}: no longer exists — drop its entry`);
	}

	if (over.length > 0) {
		console.error(
			'Error: inline style="…var(--mep-*)…" above the recorded budget — style with the Tailwind\n' +
				'  utilities @theme inline already generates from these tokens (src/app.css) instead. Genuinely\n' +
				'  dynamic values stay inline, but move the static parts to classes so the attribute goes away\n' +
				'  (issue #845; retiring all of them is what lets style-src drop \'unsafe-inline\').'
		);
		for (const v of over) console.error(`  ${v}`);
	}
	if (stale.length > 0) {
		console.error(
			'Error: INLINE_TOKEN_STYLE_BUDGET is stale — a budget above the real count would let the drift\n' +
				'  climb back to the old number. Lower the entries below in the same commit that converted them.'
		);
		for (const v of stale) console.error(`  ${v}`);
	}
	return over.length === 0 && stale.length === 0;
}

function walk(dir, extensions) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...walk(full, extensions));
		} else if (extensions.includes(path.extname(entry.name))) {
			files.push(full);
		}
	}
	return files;
}

function runGate(name, gate) {
	const violations = [];
	const allowed = [];
	for (const root of gate.roots) {
		const absRoot = path.join(ROOT, root);
		if (!fs.existsSync(absRoot)) continue;
		for (const file of walk(absRoot, gate.extensions)) {
			if (gate.exclude?.(file)) continue;
			const rel = path.relative(ROOT, file).split(path.sep).join('/');
			const isAllowlisted = gate.allowlist?.has(rel) ?? false;
			const lines = fs.readFileSync(file, 'utf8').split('\n');
			lines.forEach((line, i) => {
				if (gate.pattern.test(line)) {
					const entry = `${rel}:${i + 1}: ${line.trim()}`;
					(isAllowlisted ? allowed : violations).push(entry);
				}
			});
		}
	}
	if (allowed.length > 0) {
		console.warn(`Note: ${gate.message}\n  (allowlisted — not failing the build; see FORM_GET_CAST_ALLOWLIST)`);
		for (const v of allowed) console.warn(`  ${v}`);
	}
	if (violations.length > 0) {
		console.error(`Error: ${gate.message}`);
		for (const v of violations) console.error(`  ${v}`);
		return false;
	}
	return true;
}

const requested = process.argv[2];
const names = requested
	? [requested]
	: [...Object.keys(GATES), 'unscoped-tenant-query', 'action-authz', 'inline-token-style'];

let ok = true;
for (const name of names) {
	if (name === 'unscoped-tenant-query') {
		if (!runUnscopedQueryGate()) ok = false;
		continue;
	}
	if (name === 'action-authz') {
		if (!runActionAuthzGate()) ok = false;
		continue;
	}
	if (name === 'inline-token-style') {
		if (!runInlineTokenStyleGate()) ok = false;
		continue;
	}
	const gate = GATES[name];
	if (!gate) {
		console.error(`Unknown lint gate: ${name}`);
		process.exit(1);
	}
	if (!runGate(name, gate)) ok = false;
}

process.exit(ok ? 0 : 1);
