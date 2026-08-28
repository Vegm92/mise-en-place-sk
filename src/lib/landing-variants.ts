import type { Locale, WaitlistKey } from './i18n';
import type { VenueType } from './constants';

export type LandingVariantOverrides = Record<Locale, Partial<Record<WaitlistKey, string>>>;

export interface LandingVariant {
	slug: string;
	overrides: LandingVariantOverrides;
}

export const LANDING_VARIANTS: Record<string, LandingVariant> = {
	'menu-del-dia': {
		slug: 'menu-del-dia',
		overrides: {
			es: {
				'waitlist.pageTitle':       'Mise en Place — Defiende el margen de tu menú del día',
				'waitlist.metaDescription': '¿Menú del día a precio fijo? Detecta cada subida de proveedor el mismo día y defiende el margen que tu carta no puede subir.',
				'waitlist.ogTitle':         'Tu menú vale 13 €. Tu aceite ya no.',
				'waitlist.headline':        'Tu menú vale 13 €. Tu aceite ya no.',
				'waitlist.sub':             'Para cocinas de menú del día: detectamos cada subida de proveedor el mismo día, para que defiendas el margen que tu carta no puede subir.',
				'waitlist.pain.0.stat':     '0,42 €',
				'waitlist.pain.0.label':    'por cubierto, sin enterarte',
				'waitlist.pain.0.title':    'El aceite subió y no lo viste hasta el cierre de mes.',
				'waitlist.pain.0.body':     'En menú del día el margen se cuenta en céntimos por cubierto. Detectamos la subida el mismo día que llega el albarán, no treinta días después en una hoja de cálculo.',
			},
			en: {
				'waitlist.pageTitle':       'Mise en Place — Protect your set-menu margin',
				'waitlist.metaDescription': 'Running a menú del día? Catch every supplier price hike the same day it lands and defend the margin your fixed price can\'t raise.',
				'waitlist.ogTitle':         "Your set menu is worth €13. Your olive oil no longer is.",
				'waitlist.headline':        "Your set menu is worth €13. Your olive oil no longer is.",
				'waitlist.sub':             "For fixed-menu kitchens: we catch every supplier price hike the same day it happens, so you defend the margin your menu can't raise.",
				'waitlist.pain.0.stat':     '€0.42',
				'waitlist.pain.0.label':    'lost per cover, unnoticed',
				'waitlist.pain.0.title':    "Oil went up and you didn't see it until month-end.",
				'waitlist.pain.0.body':     "On a set menu, margin is counted in cents per cover. We catch the increase the day the delivery note arrives — not thirty days later in a spreadsheet.",
			},
		},
	},

	'aceite-de-oliva': {
		slug: 'aceite-de-oliva',
		overrides: {
			es: {
				'waitlist.pageTitle':       'Mise en Place — Controla el precio del aceite de oliva',
				'waitlist.metaDescription': 'El aceite de oliva sube sin avisar. Detecta cada subida de precio por litro el mismo día que llega el albarán y defiende tu margen.',
				'waitlist.ogTitle':         'El aceite de oliva no pregunta antes de subir. Nosotros sí te avisamos.',
				'waitlist.headline':        'El aceite de oliva no pregunta antes de subir. Nosotros sí te avisamos.',
				'waitlist.sub':             'Para cocinas que dependen del aceite: seguimos el precio por litro albarán a albarán y te avisamos el mismo día que tu proveedor lo sube.',
				'waitlist.pain.0.stat':     '+40 %',
				'waitlist.pain.0.label':    'en dos años',
				'waitlist.pain.0.title':    'El litro de aceite de oliva se ha disparado y nadie te lo dijo a tiempo.',
				'waitlist.pain.0.body':     'Cada subida llega camuflada en el total del albarán. Mise en Place la aísla línea por línea y te avisa el mismo día, no en el cierre de mes.',
			},
			en: {
				'waitlist.pageTitle':       'Mise en Place — Track your olive oil cost',
				'waitlist.metaDescription': 'Olive oil keeps rising without warning. Catch every per-litre price increase the day the delivery note lands and defend your margin.',
				'waitlist.ogTitle':         "Olive oil doesn't ask before it goes up. We do, the same day.",
				'waitlist.headline':        "Olive oil doesn't ask before it goes up. We do, the same day.",
				'waitlist.sub':             "For kitchens that live on olive oil: we track the price per litre delivery note by delivery note, and flag it the day your supplier raises it.",
				'waitlist.pain.0.stat':     '+40%',
				'waitlist.pain.0.label':    'in two years',
				'waitlist.pain.0.title':    'Olive oil doubled down and nobody told you in time.',
				'waitlist.pain.0.body':     "Every increase hides inside the delivery note's total. Mise en Place isolates it line by line and flags it the same day — not at month-end.",
			},
		},
	},

	'verifactu-2027': {
		slug: 'verifactu-2027',
		overrides: {
			es: {
				'waitlist.pageTitle':       'Mise en Place — Preparados para VeriFactu 2027',
				'waitlist.metaDescription': 'VeriFactu será obligatoria en 2027. Digitaliza tus albaranes ahora para llegar con tu histórico de compras ya organizado.',
				'waitlist.ogTitle':         'VeriFactu llega en 2027. Tus albaranes ya están listos.',
				'waitlist.headline':        'VeriFactu llega en 2027. Tus albaranes ya están listos.',
				'waitlist.sub':             'Digitaliza tus albaranes hoy y llega a la obligación de VeriFactu con tu histórico de compras ya ordenado, sin la carrera de última hora.',
				'waitlist.pain.0.stat':     '2027',
				'waitlist.pain.0.label':    'plazo de VeriFactu',
				'waitlist.pain.0.title':    'Cuando llegue la obligación, no quieres estar migrando desde una carpeta de PDFs.',
				'waitlist.pain.0.body':     'Cada albarán que subes hoy queda estructurado y trazable. El día que VeriFactu sea obligatoria, tu histórico de compras ya está preparado — no lo vas a montar en un fin de semana.',
			},
			en: {
				'waitlist.pageTitle':       'Mise en Place — Ready for VeriFactu 2027',
				'waitlist.metaDescription': 'VeriFactu becomes mandatory in 2027. Digitise your delivery notes now so your purchase history is already organised when it lands.',
				'waitlist.ogTitle':         'VeriFactu lands in 2027. Your delivery notes are already ready.',
				'waitlist.headline':        'VeriFactu lands in 2027. Your delivery notes are already ready.',
				'waitlist.sub':             'Digitise your delivery notes today and reach the VeriFactu deadline with your purchase history already organised — no last-minute scramble.',
				'waitlist.pain.0.stat':     '2027',
				'waitlist.pain.0.label':    'VeriFactu deadline',
				'waitlist.pain.0.title':    "You don't want to be migrating from a folder of PDFs when the deadline hits.",
				'waitlist.pain.0.body':     "Every delivery note you upload today ends up structured and traceable. The day VeriFactu becomes mandatory, your purchase history is already there — you won't build it in a weekend.",
			},
		},
	},

	'grupo-multi-local': {
		slug: 'grupo-multi-local',
		overrides: {
			es: {
				'waitlist.pageTitle':       'Mise en Place — Un panel para todos tus locales',
				'waitlist.metaDescription': '¿Varios locales? Compara el gasto por proveedor entre restaurantes y detecta quién paga de más, desde un solo panel.',
				'waitlist.ogTitle':         'Cuatro locales, cuatro maneras de comprar. Un solo panel para verlo todo.',
				'waitlist.headline':        'Cuatro locales, cuatro maneras de comprar. Un solo panel para verlo todo.',
				'waitlist.sub':             'Para grupos con varios locales: compara el gasto por categoría entre restaurantes y detecta qué cocina paga de más por el mismo proveedor.',
				'waitlist.pain.0.stat':     '¿Cuál?',
				'waitlist.pain.0.label':    'paga más caro',
				'waitlist.pain.0.title':    'El mismo proveedor le cobra distinto a cada uno de tus locales.',
				'waitlist.pain.0.body':     'Sin un panel conjunto, cada gerente negocia a ciegas. Mise en Place compara precios entre locales para que negocies con los datos de todo el grupo, no de uno solo.',
			},
			en: {
				'waitlist.pageTitle':       'Mise en Place — One dashboard for every location',
				'waitlist.metaDescription': "Running several locations? Compare supplier prices across restaurants and catch who's overpaying, from one shared dashboard.",
				'waitlist.ogTitle':         'Four locations, four ways of buying. One dashboard to see it all.',
				'waitlist.headline':        'Four locations, four ways of buying. One dashboard to see it all.',
				'waitlist.sub':             'For multi-location groups: compare spend by category across restaurants and catch which kitchen is overpaying the same supplier.',
				'waitlist.pain.0.stat':     'Which one?',
				'waitlist.pain.0.label':    'pays more',
				'waitlist.pain.0.title':    'The same supplier charges each of your locations differently.',
				'waitlist.pain.0.body':     "Without one shared dashboard, every manager negotiates blind. Mise en Place compares prices across locations so you negotiate with the whole group's data, not just one kitchen's.",
			},
		},
	},

	'pescado-fresco': {
		slug: 'pescado-fresco',
		overrides: {
			es: {
				'waitlist.pageTitle':       'Mise en Place — Controla el precio del pescado fresco',
				'waitlist.metaDescription': 'El pescado cambia de precio cada día en lonja. Detecta la subida el mismo día que llega el albarán y ajusta antes de perder margen.',
				'waitlist.ogTitle':         'El pescado cambia de precio cada día en lonja. Tu control no puede ir con retraso.',
				'waitlist.headline':        'El pescado cambia de precio cada día en lonja. Tu control no puede ir con retraso.',
				'waitlist.sub':             'Para cocinas de pescado fresco: registramos el precio de cada especie albarán a albarán, para que veas la subida el mismo día, no cuando ya has fijado el menú.',
				'waitlist.pain.0.stat':     'Cada día',
				'waitlist.pain.0.label':    'cambia el precio en lonja',
				'waitlist.pain.0.title':    'Fijaste el precio del menú con el pescado de la semana pasada.',
				'waitlist.pain.0.body':     'El precio de lonja se mueve a diario y tu carta no. Mise en Place te avisa en cuanto el coste de una especie se dispara, para que ajustes antes de perder margen.',
			},
			en: {
				'waitlist.pageTitle':       'Mise en Place — Track fresh fish prices daily',
				'waitlist.metaDescription': 'Fish prices move every day at the market. Catch the spike the same day it lands and adjust before it costs your margin.',
				'waitlist.ogTitle':         "Fish prices change daily at the market. Your control can't lag behind.",
				'waitlist.headline':        "Fish prices change daily at the market. Your control can't lag behind.",
				'waitlist.sub':             "For fresh-fish kitchens: we log the price of every species delivery note by delivery note, so you see the increase the same day — not after you've already priced the menu.",
				'waitlist.pain.0.stat':     'Every day',
				'waitlist.pain.0.label':    'the market price moves',
				'waitlist.pain.0.title':    'You priced the menu off last week\'s fish.',
				'waitlist.pain.0.body':     "Market prices move daily and your menu doesn't. Mise en Place flags the moment a species' cost spikes, so you adjust before it eats your margin.",
			},
		},
	},
};

export function getLandingVariant(slug: string): LandingVariant | null {
	return Object.prototype.hasOwnProperty.call(LANDING_VARIANTS, slug) ? LANDING_VARIANTS[slug] : null;
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
