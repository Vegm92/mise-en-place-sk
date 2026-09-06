export type LegalEntity = {
	tradeName: string;
	legalName: string | null;
	taxId: string | null;
	registeredAddress: string | null;
	companyRegistry: string | null;
	contactEmail: string;
	privacyEmail: string;
	city: string;
	country: string;
};

export const LEGAL_ENTITY: LegalEntity = {
	tradeName: 'Mise en Place',
	legalName: null,
	taxId: null,
	registeredAddress: null,
	companyRegistry: null,
	contactEmail: 'hola@mise-place.com',
	privacyEmail: 'privacy@mise-place.com',
	city: 'Barcelona',
	country: 'España',
};

export function entityIsRegistered(entity: LegalEntity = LEGAL_ENTITY): boolean {
	return Boolean(entity.legalName && entity.taxId && entity.registeredAddress);
}
