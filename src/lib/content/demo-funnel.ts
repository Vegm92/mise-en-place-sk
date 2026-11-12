import type { Locale } from '$lib/i18n-messages';

type Bilingual = Record<Locale, string>;
type Localized<T> = T extends Bilingual ? string : { [K in keyof T]: Localized<T[K]> };

const b = (es: string, en: string): Bilingual => ({ es, en });

function isBilingual(node: object): node is Bilingual {
	return 'es' in node && 'en' in node;
}

function localize<T extends object>(node: T, locale: Locale): Localized<T> {
	if (isBilingual(node)) return node[locale] as Localized<T>;
	return Object.fromEntries(
		Object.entries(node).map(([key, child]) => [key, localize(child as object, locale)]),
	) as Localized<T>;
}

const COPY = {
	pageTitle: b('Reserva una demo · Mise en Place', 'Book a demo · Mise en Place'),
	metaDescription: b(
		'Mira cómo Mise en Place lee tus facturas de proveedor línea a línea y reserva una demo de 15 minutos con una factura tuya.',
		'See how Mise en Place reads your supplier invoices line by line and book a 15-minute demo on one of your own invoices.',
	),
	headline: b(
		'Mira qué sale de una factura tuya en 15 minutos',
		'See what comes out of one of your invoices in 15 minutes',
	),
	sub: b(
		'Responde cuatro preguntas y elige hora. La demo se hace con una factura tuya, no con datos de ejemplo.',
		'Answer four questions and pick a time. The demo runs on one of your invoices, not on sample data.',
	),
	steps: {
		video: b('Vídeo', 'Video'),
		questions: b('Preguntas', 'Questions'),
		booking: b('Demo', 'Demo'),
	},
	video: {
		title: b('Así funciona', 'How it works'),
		body: b(
			'De la foto de un albarán al aviso de subida de precio.',
			'From a photo of a delivery note to the price-increase alert.',
		),
		cta: b('Continuar', 'Continue'),
	},
	questions: {
		title: b('Cuatro preguntas para preparar tu demo', 'Four questions to prepare your demo'),
		name: b('Nombre', 'Name'),
		email: b('Email', 'Email'),
		phone: b('Teléfono (opcional)', 'Phone (optional)'),
		restaurant: b('Restaurante o grupo', 'Restaurant or group'),
		role: b('¿Cuál es tu papel?', 'What is your role?'),
		locations: b('¿Cuántos locales gestionas?', 'How many locations do you run?'),
		monthlySpend: b(
			'¿Cuánto compras a proveedores al mes, aproximadamente?',
			'Roughly how much do you buy from suppliers per month?',
		),
		currentTool: b('¿Cómo llevas hoy las facturas de proveedor?', 'How do you handle supplier invoices today?'),
		choose: b('Elige una opción', 'Choose an option'),
		privacy: b(
			'Usamos estos datos solo para preparar y agendar tu demo.',
			'We use these details only to prepare and schedule your demo.',
		),
		privacyLink: b('Política de privacidad', 'Privacy policy'),
		submit: b('Solicitar demo', 'Request a demo'),
	},
	roles: {
		owner: b('Propietario o socio', 'Owner or partner'),
		chef: b('Jefe de cocina', 'Head chef'),
		operations: b('Operaciones o gerencia', 'Operations or management'),
		purchasing: b('Compras o administración', 'Purchasing or admin'),
		other: b('Otro', 'Other'),
	},
	locations: {
		one: b('1', '1'),
		two_to_five: b('2 a 5', '2 to 5'),
		six_to_ten: b('6 a 10', '6 to 10'),
		over_ten: b('Más de 10', 'More than 10'),
	},
	spend: {
		under_10k: b('Menos de 10.000 €', 'Under €10,000'),
		'10k_to_20k': b('De 10.000 a 20.000 €', '€10,000 to €20,000'),
		'20k_to_50k': b('De 20.000 a 50.000 €', '€20,000 to €50,000'),
		over_50k: b('Más de 50.000 €', 'Over €50,000'),
	},
	tools: {
		spreadsheet: b('Excel u hojas de cálculo', 'Excel or spreadsheets'),
		software: b('Un programa de compras', 'Purchasing software'),
		gestoria: b('Lo lleva la gestoría', 'Our accountant handles it'),
		none: b('No las reviso línea a línea', 'We do not review them line by line'),
	},
	errors: {
		invalid: b(
			'Revisa los campos: falta alguno o el email no es válido.',
			'Check the fields: one is missing or the email is not valid.',
		),
		rate_limited: b('Demasiados intentos. Prueba de nuevo en un minuto.', 'Too many attempts. Try again in a minute.'),
		bot_suspected: b(
			'No hemos podido verificar el envío. Inténtalo de nuevo.',
			'We could not verify the submission. Please try again.',
		),
		service_unavailable: b(
			'Servicio no disponible ahora mismo. Inténtalo en unos minutos.',
			'Service unavailable right now. Try again in a few minutes.',
		),
	},
	booking: {
		title: b('Elige hora para tu demo', 'Pick a time for your demo'),
		body: b(
			'Son 15 minutos por videollamada. Si puedes, ten a mano una factura reciente de un proveedor: la subimos en directo.',
			'It is a 15-minute video call. If you can, have a recent supplier invoice at hand: we upload it live.',
		),
		cta: b('Elegir hora', 'Pick a time'),
	},
	received: {
		title: b('Solicitud recibida', 'Request received'),
		body: b(
			'Te escribimos al email que nos has dejado para acordar la hora. Si puedes, ten a mano una factura reciente de un proveedor.',
			'We will write to the email you left to agree on a time. If you can, have a recent supplier invoice at hand.',
		),
	},
	selfServe: {
		title: b(
			'Para tu volumen, lo más rápido es probarlo directamente',
			'At your volume, the fastest route is to try it directly',
		),
		body: b(
			'Con menos de 10.000 € al mes en compras, una llamada no te aporta más que subir tus propias facturas. Crea tu cuenta y pruébalo con ellas; si después quieres hablar, escríbenos.',
			'With under €10,000 a month in purchases, a call adds nothing over uploading your own invoices. Create your account and try it with them; if you want to talk afterwards, write to us.',
		),
		cta: b('Crear cuenta', 'Create account'),
	},
};

export type DemoCopy = Localized<typeof COPY>;

export const demoCopy: Record<Locale, DemoCopy> = {
	es: localize(COPY, 'es'),
	en: localize(COPY, 'en'),
};
