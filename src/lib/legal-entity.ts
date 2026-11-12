import { isValidSpanishTaxId, normalizeTaxId } from './tax-id';

export type EntityForm = 'sociedad_limitada' | 'autonomo';

export type LegalEntity = {
	isPlaceholder: boolean;
	form: EntityForm | null;
	tradeName: string;
	legalName: string | null;
	taxId: string | null;
	registeredAddress: string | null;
	companyRegistry: string | null;
	contactEmail: string;
	privacyEmail: string;
	legalEmail: string;
	dpoEmail: string | null;
	city: string;
	country: string;
};

export const LEGAL_ENTITY: LegalEntity = {
	isPlaceholder: true,
	form: null,
	tradeName: 'Mise en Place',
	legalName: null,
	taxId: null,
	registeredAddress: null,
	companyRegistry: null,
	contactEmail: 'hola@mise-place.com',
	privacyEmail: 'privacy@mise-place.com',
	legalEmail: 'legal@mise-place.com',
	dpoEmail: null,
	city: 'Barcelona',
	country: 'España',
};

export type CountryCode = 'SG' | 'US' | 'IE' | 'NL' | 'DE';

export type TransferBasis = 'dpf' | 'scc';

export type SubprocessorId =
	| 'railwayHosting'
	| 'railwayStorage'
	| 'gemini'
	| 'googleSignIn'
	| 'stripe'
	| 'sentry'
	| 'resend'
	| 'cloudflare';

export type Subprocessor = {
	id: SubprocessorId;
	provider: string;
	region: string | null;
	countries: CountryCode[];
	transfer: TransferBasis;
};

export const SUBPROCESSORS: readonly Subprocessor[] = [
	{ id: 'railwayHosting', provider: 'Railway Corporation', region: 'asia-southeast1', countries: ['SG'], transfer: 'scc' },
	{ id: 'railwayStorage', provider: 'Railway Corporation', region: 'Virginia, iad', countries: ['US'], transfer: 'scc' },
	{ id: 'gemini', provider: 'Google LLC (Gemini API)', region: null, countries: ['US'], transfer: 'dpf' },
	{ id: 'googleSignIn', provider: 'Google LLC', region: null, countries: ['US'], transfer: 'dpf' },
	{ id: 'stripe', provider: 'Stripe Payments Europe, Ltd. / Stripe, LLC', region: null, countries: ['IE', 'US'], transfer: 'dpf' },
	{ id: 'sentry', provider: 'Functional Software, Inc. (Sentry)', region: null, countries: ['US'], transfer: 'dpf' },
	{ id: 'resend', provider: 'Resend', region: null, countries: ['US'], transfer: 'dpf' },
	{ id: 'cloudflare', provider: 'Cloudflare, Inc.', region: null, countries: ['US'], transfer: 'dpf' },
];

export type EntityProblem = 'form' | 'legalName' | 'taxId' | 'registeredAddress' | 'companyRegistry' | 'slName';

const SL_NAME = /\b(S\.?\s?L\.?\s?U?\.?|SOCIEDAD LIMITADA( UNIPERSONAL)?)$/i;

export function entityProblems(entity: LegalEntity): EntityProblem[] {
	const problems: EntityProblem[] = [];
	if (!entity.form) problems.push('form');
	if (!entity.legalName) problems.push('legalName');
	const taxId = normalizeTaxId(entity.taxId);
	const taxIdMatchesForm = entity.form === 'sociedad_limitada' ? taxId?.startsWith('B') : !/^[A-W]/.test(taxId ?? '');
	if (!isValidSpanishTaxId(entity.taxId) || !taxIdMatchesForm) problems.push('taxId');
	if (!entity.registeredAddress) problems.push('registeredAddress');
	if (entity.form === 'sociedad_limitada') {
		if (!entity.companyRegistry) problems.push('companyRegistry');
		if (entity.legalName && !SL_NAME.test(entity.legalName.trim())) problems.push('slName');
	}
	return problems;
}

export function entityIsRegistered(entity: LegalEntity = LEGAL_ENTITY): boolean {
	return !entity.isPlaceholder && entityProblems(entity).length === 0;
}

export type IdentityField = 'tradeName' | 'legalName' | 'holderName' | 'taxId' | 'registeredAddress' | 'companyRegistry' | 'contactEmail' | 'city';

export type IdentityRow = { field: IdentityField; value: string };

export function identityRows(entity: LegalEntity = LEGAL_ENTITY): IdentityRow[] {
	const registered = entityIsRegistered(entity);
	const official: [IdentityField, string | null][] = registered
		? [
			[entity.form === 'sociedad_limitada' ? 'legalName' : 'holderName', entity.legalName],
			['taxId', entity.taxId],
			['registeredAddress', entity.registeredAddress],
			['companyRegistry', entity.form === 'sociedad_limitada' ? entity.companyRegistry : null],
		]
		: [];
	const rows: [IdentityField, string | null][] = [
		['tradeName', entity.tradeName],
		...official,
		['contactEmail', entity.contactEmail],
		['city', `${entity.city}, ${entity.country}`],
	];
	return rows.flatMap(([field, value]) => (value ? [{ field, value }] : []));
}

export function emailFooterLines(entity: LegalEntity = LEGAL_ENTITY): string[] {
	if (!entityIsRegistered(entity)) return [entity.tradeName];
	return [entity.legalName ?? entity.tradeName, entity.registeredAddress ?? '', `NIF ${entity.taxId ?? ''}`];
}
