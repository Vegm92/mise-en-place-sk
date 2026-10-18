/**
 * One module (src/lib/legal-entity.ts) holds who the provider is. /legal,
 * the privacy policy, the terms and the email footer all read it, so the day
 * the NIF arrives the founder edits that file and nothing else (#779, #984).
 *
 * While `isPlaceholder` is true no page may present a company that does not
 * exist; once it is false every identity field the entity sets must reach
 * /legal (LSSI-CE art. 10), so a half-filled entity cannot ship silently.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
	LEGAL_ENTITY,
	SUBPROCESSORS,
	emailFooterLines,
	entityIsRegistered,
	entityProblems,
	identityRows,
	type LegalEntity
} from '../src/lib/legal-entity';
import { TRANSFER_BASIS, buildPrivacySections, privacySections, type PrivacySection } from '../src/lib/content/legal/privacy';
import { buildTermsSections, termsSections, type TermsSection } from '../src/lib/content/legal/terms';

const ROOT = path.resolve(__dirname, '..');
const LOCALES = ['es', 'en'] as const;

const SL: LegalEntity = {
	...LEGAL_ENTITY,
	isPlaceholder: false,
	form: 'sociedad_limitada',
	legalName: 'Ejemplo Hostelería Digital SLU',
	taxId: 'B12345674',
	registeredAddress: 'Calle Ejemplo 1, 08001 Barcelona',
	companyRegistry: 'Registro Mercantil de Barcelona, Tomo 1, Folio 1, Hoja B-1'
};

const AUTONOMO: LegalEntity = {
	...SL,
	form: 'autonomo',
	legalName: 'Nombre Apellido Apellido',
	taxId: '12345678Z',
	companyRegistry: null
};

function pick<T extends { id: string }, K extends T['id']>(list: T[], id: K): Extract<T, { id: K }> {
	const found = list.find((s) => s.id === id);
	if (!found) throw new Error(`section not found: ${id}`);
	return found as Extract<T, { id: K }>;
}

describe('LEGAL_ENTITY as shipped', () => {
	it('is flagged as a placeholder exactly when its data is incomplete', () => {
		expect(LEGAL_ENTITY.isPlaceholder).toBe(entityProblems(LEGAL_ENTITY).length > 0);
		expect(entityIsRegistered(LEGAL_ENTITY)).toBe(!LEGAL_ENTITY.isPlaceholder);
	});

	it('never names "Mise en Place SL" on a legal page, in their content or in the entity module', () => {
		const files = [
			'src/lib/legal-entity.ts',
			'src/lib/content/legal/privacy.ts',
			'src/lib/content/legal/terms.ts',
			'src/routes/legal/+page.svelte',
			'src/routes/privacy/+page.svelte',
			'src/routes/terms/+page.svelte',
			'src/routes/refunds/+page.svelte',
			'src/routes/cookies/+page.svelte'
		];
		for (const file of files) {
			expect(readFileSync(path.join(ROOT, file), 'utf8'), file).not.toMatch(/Mise en Place,?\s+S\.?\s?L/i);
		}
	});

	it('while a placeholder, presents the founder as a natural person and no company', () => {
		if (!LEGAL_ENTITY.isPlaceholder) return;
		const controller = pick(privacySections, 'controller');
		expect(controller.text.es).toMatch(/persona física/);
		expect(controller.text.en).toMatch(/natural person/);
		for (const loc of LOCALES) {
			expect(`${controller.lead[loc]}${controller.text[loc]}`).not.toMatch(/\bS\.?L\.?U?\b/);
		}
		expect(pick(termsSections, 'ip').text.es).toMatch(/identificado en el Aviso Legal/);
	});
});

describe('entityProblems', () => {
	it.each([
		['a complete SL', SL, []],
		['a complete sole trader with no registry entry', AUTONOMO, []],
		['an SL without its Registro Mercantil entry', { ...SL, companyRegistry: null }, ['companyRegistry']],
		['an SL whose name lacks the SL suffix', { ...SL, legalName: 'Ejemplo Hostelería Digital' }, ['slName']],
		['an SL carrying a personal DNI', { ...SL, taxId: '12345678Z' }, ['taxId']],
		['a sole trader carrying a company CIF', { ...AUTONOMO, taxId: 'B12345674' }, ['taxId']],
		['a mistyped NIF', { ...SL, taxId: 'B12345675' }, ['taxId']]
	] as const)('%s', (_label, entity, expected) => {
		expect(entityProblems(entity)).toEqual(expected);
	});

	it('reports every missing LSSI field on the shipped placeholder', () => {
		const problems = entityProblems({ ...LEGAL_ENTITY, form: null, legalName: null, taxId: null, registeredAddress: null });
		expect(problems).toEqual(expect.arrayContaining(['form', 'legalName', 'taxId', 'registeredAddress']));
	});
});

describe('identityRows (what /legal renders)', () => {
	it('renders every identity field a registered SL sets', () => {
		const values = identityRows(SL).map((r) => r.value);
		for (const value of [SL.tradeName, SL.legalName, SL.taxId, SL.registeredAddress, SL.companyRegistry, SL.contactEmail]) {
			expect(values).toContain(value);
		}
		expect(values).toContain(`${SL.city}, ${SL.country}`);
	});

	it('labels a sole trader as the holder and omits the companies register', () => {
		const fields = identityRows({ ...AUTONOMO, companyRegistry: 'stray' }).map((r) => r.field);
		expect(fields).toEqual(['tradeName', 'holderName', 'taxId', 'registeredAddress', 'contactEmail', 'city']);
	});

	it('shows no official identity while the entity is a placeholder, even if some fields are filled', () => {
		const fields = identityRows({ ...SL, isPlaceholder: true }).map((r) => r.field);
		expect(fields).toEqual(['tradeName', 'contactEmail', 'city']);
	});

	it('/legal renders the rows and has an es and en label for every field they can carry', () => {
		const src = readFileSync(path.join(ROOT, 'src/routes/legal/+page.svelte'), 'utf8');
		expect(src).toContain('identityRows(e)');
		const fields = new Set([...identityRows(SL), ...identityRows(AUTONOMO)].map((r) => r.field));
		for (const field of fields) {
			expect(src.match(new RegExp(`\\b${field}:\\s+'`, 'g')) ?? [], field).toHaveLength(2);
		}
	});
});

describe('documents built from a registered entity', () => {
	it('privacy names the controller with its NIF and address in both locales', () => {
		const controller = pick(buildPrivacySections(SL, SUBPROCESSORS), 'controller');
		for (const loc of LOCALES) {
			expect(controller.lead[loc]).toBe(SL.legalName);
			expect(controller.text[loc]).toContain(SL.taxId);
			expect(controller.text[loc]).toContain(SL.registeredAddress);
		}
	});

	it('terms assign the intellectual property to the registered entity', () => {
		const ip = pick(buildTermsSections(SL), 'ip');
		for (const loc of LOCALES) expect(ip.text[loc]).toContain(SL.legalName);
	});

	it('the email footer carries name, address and NIF only once registered', () => {
		expect(emailFooterLines({ ...SL, isPlaceholder: true })).toEqual(['Mise en Place']);
		expect(emailFooterLines(SL)).toEqual([SL.legalName, SL.registeredAddress, `NIF ${SL.taxId}`]);
	});
});

describe('processor terms and sub-processor disclosure (#784)', () => {
	it('every sub-processor row states its location and the transfer safeguard', () => {
		const rows = pick(privacySections, 'subprocessors').rows;
		SUBPROCESSORS.forEach((sub, i) => {
			for (const loc of LOCALES) {
				expect(rows[i]!.country[loc]).toContain(TRANSFER_BASIS[sub.transfer][loc]);
				if (sub.region) expect(rows[i]!.country[loc]).toContain(sub.region);
			}
		});
	});

	it('the terms carry the Art. 28(3) clauses', () => {
		const clause = pick(termsSections, 'dataProcessing');
		const text = clause.items.map((i) => i.es).join('\n');
		for (const topic of ['Objeto y duración', 'Instrucciones', 'Confidencialidad', 'Seguridad', 'Subencargados', 'Asistencia', 'Violaciones de seguridad', 'Fin del encargo', 'Transferencias internacionales', 'Demostración del cumplimiento']) {
			expect(text).toContain(`${topic}:`);
		}
	});

	it('the privacy policy points at the clause number the terms actually use', () => {
		const processor: Extract<PrivacySection, { id: 'processor' }> = pick(privacySections, 'processor');
		const clause: Extract<TermsSection, { id: 'dataProcessing' }> = pick(termsSections, 'dataProcessing');
		const es = processor.textPre.es.match(/cláusula (\d+)/)?.[1];
		const en = processor.textPre.en.match(/clause (\d+)/)?.[1];
		expect(es).toBeDefined();
		expect(en).toBe(es);
		expect(clause.heading.es.startsWith(`${es}.`)).toBe(true);
		expect(clause.heading.en.startsWith(`${es}.`)).toBe(true);
	});
});
