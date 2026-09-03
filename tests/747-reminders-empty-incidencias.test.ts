/**
 * Issue #747 item 7 — reminders page shows classification nudges with no
 * context when there are no incidencias.
 *
 * #746 already refocused `/reminders` from payment due-dates onto review
 * `incidencia`s, but the underlying gap it inherited is unchanged: when
 * `data.incidencias` is empty while other notification groups (price shock,
 * uncategorised suppliers, ...) are not, the page skipped straight to those
 * groups with no acknowledgement that the main "incidencias" section is
 * empty. `rem.noIncidencias` fills that gap on both the desktop and mobile
 * variants.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { translations } from '../src/lib/i18n-messages';

const DESKTOP = path.resolve(__dirname, '..', 'src', 'routes', '(app)', 'reminders', '+page.svelte');
const MOBILE = path.resolve(__dirname, '..', 'src', 'lib', 'components', 'mobile', 'MobileAlerts.svelte');

describe('issue #747 — reminders page names an empty incidencias section', () => {
	it('rem.noIncidencias is defined in both locales', () => {
		expect(translations.es['rem.noIncidencias']).toBeTruthy();
		expect(translations.en['rem.noIncidencias']).toBeTruthy();
	});

	it('#746 refocused the page onto review incidencias, not payment due-dates', () => {
		const server = readFileSync(path.join(path.dirname(DESKTOP), '+page.server.ts'), 'utf8');
		expect(server).toMatch(/invoices\.reviewState,\s*'incidencia'/);
		expect(server).not.toMatch(/invoices\.status/);
		expect(server).not.toMatch(/invoices\.dueDate/);
	});

	it('desktop reminders page renders rem.noIncidencias when incidencias.length is 0', () => {
		const source = readFileSync(DESKTOP, 'utf8');
		const ifAt = source.indexOf('{#if data.incidencias.length}');
		expect(ifAt).toBeGreaterThan(-1);
		const elseAt = source.indexOf('{:else}', ifAt);
		const endAt = source.indexOf('{/if}', elseAt);
		expect(elseAt).toBeGreaterThan(ifAt);
		expect(source.slice(elseAt, endAt)).toContain("t('rem.noIncidencias')");
	});

	it('mobile alerts view renders rem.noIncidencias when incidencias.length is 0', () => {
		const source = readFileSync(MOBILE, 'utf8');
		const ifAt = source.indexOf('{#if incidencias.length}');
		expect(ifAt).toBeGreaterThan(-1);
		const elseAt = source.indexOf('{:else}', ifAt);
		const endAt = source.indexOf('{/if}', elseAt);
		expect(elseAt).toBeGreaterThan(ifAt);
		expect(source.slice(elseAt, endAt)).toContain("t('rem.noIncidencias')");
	});
});
