import type { Locale, WaitlistKey } from './i18n';
import type { VenueType } from './constants';

export type LandingVariantOverrides = Record<Locale, Partial<Record<WaitlistKey, string>>>;

export interface LandingVariant {
	slug: string;
	overrides: LandingVariantOverrides;
}

interface VariantCopy {
	pageTitle: string;
	metaDescription: string;
	headline: string;
	sub: string;
	painStat: string;
	painLabel: string;
	painTitle: string;
	painBody: string;
}

function keyed(copy: VariantCopy): Partial<Record<WaitlistKey, string>> {
	return {
		'waitlist.pageTitle':       copy.pageTitle,
		'waitlist.metaDescription': copy.metaDescription,
		'waitlist.ogTitle':         copy.headline,
		'waitlist.headline':        copy.headline,
		'waitlist.sub':             copy.sub,
		'waitlist.pain.0.stat':     copy.painStat,
		'waitlist.pain.0.label':    copy.painLabel,
		'waitlist.pain.0.title':    copy.painTitle,
		'waitlist.pain.0.body':     copy.painBody,
	};
}

function landingVariant(slug: string, copy: Record<Locale, VariantCopy>): LandingVariant {
	return { slug, overrides: { es: keyed(copy.es), en: keyed(copy.en) } };
}

export const LANDING_VARIANTS: Record<string, LandingVariant> = {
	'menu-del-dia': landingVariant('menu-del-dia', {
		es: {
			pageTitle: 'Mise en Place — Defiende el margen de tu menú del día',
			metaDescription: '¿Menú del día a precio fijo? Detecta cada subida de proveedor el mismo día y defiende el margen que tu carta no puede subir.',
			headline: 'Tu menú vale 13 €. Tu aceite ya no.',
			sub: 'Para cocinas de menú del día: detectamos cada subida de proveedor el mismo día, para que defiendas el margen que tu carta no puede subir.',
			painStat: '0,42 €',
			painLabel: 'por cubierto, sin enterarte',
			painTitle: 'El aceite subió y no lo viste hasta el cierre de mes.',
			painBody: 'En menú del día el margen se cuenta en céntimos por cubierto. Detectamos la subida el mismo día que llega el albarán, no treinta días después en una hoja de cálculo.',
		},
		en: {
			pageTitle: 'Mise en Place — Protect your set-menu margin',
			metaDescription: 'Running a menú del día? Catch every supplier price hike the same day it lands and defend the margin your fixed price can\'t raise.',
			headline: "Your set menu is worth €13. Your olive oil no longer is.",
			sub: "For fixed-menu kitchens: we catch every supplier price hike the same day it happens, so you defend the margin your menu can't raise.",
			painStat: '€0.42',
			painLabel: 'lost per cover, unnoticed',
			painTitle: "Oil went up and you didn't see it until month-end.",
			painBody: "On a set menu, margin is counted in cents per cover. We catch the increase the day the delivery note arrives — not thirty days later in a spreadsheet.",
		},
	}),
	'aceite-de-oliva': landingVariant('aceite-de-oliva', {
		es: {
			pageTitle: 'Mise en Place — Controla el precio del aceite de oliva',
			metaDescription: 'El aceite de oliva sube sin avisar. Detecta cada subida de precio por litro el mismo día que llega el albarán y defiende tu margen.',
			headline: 'El aceite de oliva no pregunta antes de subir. Nosotros sí te avisamos.',
			sub: 'Para cocinas que dependen del aceite: seguimos el precio por litro albarán a albarán y te avisamos el mismo día que tu proveedor lo sube.',
			painStat: '+40 %',
			painLabel: 'en dos años',
			painTitle: 'El litro de aceite de oliva se ha disparado y nadie te lo dijo a tiempo.',
			painBody: 'Cada subida llega camuflada en el total del albarán. Mise en Place la aísla línea por línea y te avisa el mismo día, no en el cierre de mes.',
		},
		en: {
			pageTitle: 'Mise en Place — Track your olive oil cost',
			metaDescription: 'Olive oil keeps rising without warning. Catch every per-litre price increase the day the delivery note lands and defend your margin.',
			headline: "Olive oil doesn't ask before it goes up. We do, the same day.",
			sub: "For kitchens that live on olive oil: we track the price per litre delivery note by delivery note, and flag it the day your supplier raises it.",
			painStat: '+40%',
			painLabel: 'in two years',
			painTitle: 'Olive oil doubled down and nobody told you in time.',
			painBody: "Every increase hides inside the delivery note's total. Mise en Place isolates it line by line and flags it the same day — not at month-end.",
		},
	}),
	'verifactu-2027': landingVariant('verifactu-2027', {
		es: {
			pageTitle: 'Mise en Place — Preparados para VeriFactu 2027',
			metaDescription: 'VeriFactu será obligatoria en 2027. Digitaliza tus albaranes ahora para llegar con tu histórico de compras ya organizado.',
			headline: 'VeriFactu llega en 2027. Tus albaranes ya están listos.',
			sub: 'Digitaliza tus albaranes hoy y llega a la obligación de VeriFactu con tu histórico de compras ya ordenado, sin la carrera de última hora.',
			painStat: '2027',
			painLabel: 'plazo de VeriFactu',
			painTitle: 'Cuando llegue la obligación, no quieres estar migrando desde una carpeta de PDFs.',
			painBody: 'Cada albarán que subes hoy queda estructurado y trazable. El día que VeriFactu sea obligatoria, tu histórico de compras ya está preparado — no lo vas a montar en un fin de semana.',
		},
		en: {
			pageTitle: 'Mise en Place — Ready for VeriFactu 2027',
			metaDescription: 'VeriFactu becomes mandatory in 2027. Digitise your delivery notes now so your purchase history is already organised when it lands.',
			headline: 'VeriFactu lands in 2027. Your delivery notes are already ready.',
			sub: 'Digitise your delivery notes today and reach the VeriFactu deadline with your purchase history already organised — no last-minute scramble.',
			painStat: '2027',
			painLabel: 'VeriFactu deadline',
			painTitle: "You don't want to be migrating from a folder of PDFs when the deadline hits.",
			painBody: "Every delivery note you upload today ends up structured and traceable. The day VeriFactu becomes mandatory, your purchase history is already there — you won't build it in a weekend.",
		},
	}),
	'grupo-multi-local': landingVariant('grupo-multi-local', {
		es: {
			pageTitle: 'Mise en Place — Un panel para todos tus locales',
			metaDescription: '¿Varios locales? Compara el gasto por proveedor entre restaurantes y detecta quién paga de más, desde un solo panel.',
			headline: 'Cuatro locales, cuatro maneras de comprar. Un solo panel para verlo todo.',
			sub: 'Para grupos con varios locales: compara el gasto por categoría entre restaurantes y detecta qué cocina paga de más por el mismo proveedor.',
			painStat: '¿Cuál?',
			painLabel: 'paga más caro',
			painTitle: 'El mismo proveedor le cobra distinto a cada uno de tus locales.',
			painBody: 'Sin un panel conjunto, cada gerente negocia a ciegas. Mise en Place compara precios entre locales para que negocies con los datos de todo el grupo, no de uno solo.',
		},
		en: {
			pageTitle: 'Mise en Place — One dashboard for every location',
			metaDescription: "Running several locations? Compare supplier prices across restaurants and catch who's overpaying, from one shared dashboard.",
			headline: 'Four locations, four ways of buying. One dashboard to see it all.',
			sub: 'For multi-location groups: compare spend by category across restaurants and catch which kitchen is overpaying the same supplier.',
			painStat: 'Which one?',
			painLabel: 'pays more',
			painTitle: 'The same supplier charges each of your locations differently.',
			painBody: "Without one shared dashboard, every manager negotiates blind. Mise en Place compares prices across locations so you negotiate with the whole group's data, not just one kitchen's.",
		},
	}),
	'pescado-fresco': landingVariant('pescado-fresco', {
		es: {
			pageTitle: 'Mise en Place — Controla el precio del pescado fresco',
			metaDescription: 'El pescado cambia de precio cada día en lonja. Detecta la subida el mismo día que llega el albarán y ajusta antes de perder margen.',
			headline: 'El pescado cambia de precio cada día en lonja. Tu control no puede ir con retraso.',
			sub: 'Para cocinas de pescado fresco: registramos el precio de cada especie albarán a albarán, para que veas la subida el mismo día, no cuando ya has fijado el menú.',
			painStat: 'Cada día',
			painLabel: 'cambia el precio en lonja',
			painTitle: 'Fijaste el precio del menú con el pescado de la semana pasada.',
			painBody: 'El precio de lonja se mueve a diario y tu carta no. Mise en Place te avisa en cuanto el coste de una especie se dispara, para que ajustes antes de perder margen.',
		},
		en: {
			pageTitle: 'Mise en Place — Track fresh fish prices daily',
			metaDescription: 'Fish prices move every day at the market. Catch the spike the same day it lands and adjust before it costs your margin.',
			headline: "Fish prices change daily at the market. Your control can't lag behind.",
			sub: "For fresh-fish kitchens: we log the price of every species delivery note by delivery note, so you see the increase the same day — not after you've already priced the menu.",
			painStat: 'Every day',
			painLabel: 'the market price moves',
			painTitle: 'You priced the menu off last week\'s fish.',
			painBody: "Market prices move daily and your menu doesn't. Mise en Place flags the moment a species' cost spikes, so you adjust before it eats your margin.",
		},
	}),
};

export function getLandingVariant(slug: string): LandingVariant | null {
	return Object.hasOwn(LANDING_VARIANTS, slug) ? LANDING_VARIANTS[slug] : null;
}

export function landingVariantSlugs(): string[] {
	return Object.keys(LANDING_VARIANTS);
}

const LANDING_VARIANT_VENUE_TYPE: Partial<Record<string, VenueType>> = {
	'menu-del-dia':      'menu_del_dia',
	'grupo-multi-local': 'grupo',
};

export function venueTypeForLandingVariant(variant: string | null | undefined): VenueType | null {
	if (!variant) return null;
	return LANDING_VARIANT_VENUE_TYPE[variant] ?? null;
}

const VENUE_TYPE_LANDING_VARIANT: Partial<Record<VenueType, string>> = Object.fromEntries(
	Object.entries(LANDING_VARIANT_VENUE_TYPE).map(([slug, venueType]) => [venueType, slug]),
);

export function landingVariantForVenueType(venueType: string | null | undefined): string | null {
	if (!venueType) return null;
	return VENUE_TYPE_LANDING_VARIANT[venueType as VenueType] ?? null;
}
