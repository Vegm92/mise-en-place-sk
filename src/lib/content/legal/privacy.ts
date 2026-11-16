import { LEGAL_ENTITY, SUBPROCESSORS, entityIsRegistered } from '../../legal-entity';
import type { CountryCode, LegalEntity, Subprocessor, SubprocessorId, TransferBasis } from '../../legal-entity';

export type Bilingual = { es: string; en: string };

export const privacyMeta = {
	pageTitle: { es: 'Política de Privacidad · Mise en Place', en: 'Privacy Policy · Mise en Place' },
	back: { es: '← Volver', en: '← Back' },
	toggleLabel: { es: 'EN', en: 'ES' },
	title: { es: 'Política de Privacidad', en: 'Privacy Policy' },
	dateLine: { es: 'Última actualización: 18 de octubre de 2026', en: 'Last updated: October 18, 2026' },
	prevails: { es: 'La versión en español prevalece sobre cualquier traducción.', en: 'The Spanish version prevails over any translation.' },
	contactEmail: LEGAL_ENTITY.privacyEmail,
	footer: {
		terms: { es: 'Términos de Servicio', en: 'Terms of Service' },
		cookies: { es: 'Política de Cookies', en: 'Cookie Policy' },
		refunds: { es: 'Reembolsos', en: 'Refunds' },
		legal: { es: 'Aviso Legal', en: 'Legal Notice' },
		home: { es: 'Inicio', en: 'Home' },
	},
};

export type PrivacySection =
	| { id: 'controller'; heading: Bilingual; lead: Bilingual; text: Bilingual }
	| { id: 'dataCollected'; heading: Bilingual; items: { term: Bilingual; text: Bilingual }[] }
	| { id: 'legalBasis'; heading: Bilingual; items: { term: Bilingual; text: Bilingual }[] }
	| { id: 'subprocessors'; heading: Bilingual; intro: Bilingual; tableHead: { provider: Bilingual; fn: Bilingual; country: Bilingual }; rows: { provider: Bilingual; fn: Bilingual; country: Bilingual }[] }
	| { id: 'transfers'; heading: Bilingual; text: Bilingual }
	| { id: 'retention'; heading: Bilingual; items: Bilingual[] }
	| { id: 'rights'; heading: Bilingual; introPre: Bilingual; introPost: Bilingual; items: { term: Bilingual; text: Bilingual; emphasis?: Bilingual }[]; outroPre: Bilingual; outroStrong: Bilingual; outroPost: Bilingual }
	| { id: 'cookies'; heading: Bilingual; paragraphs: Bilingual[]; linkPre: Bilingual; linkText: Bilingual; linkPost: Bilingual }
	| { id: 'security'; heading: Bilingual; text: Bilingual }
	| { id: 'processor'; heading: Bilingual; textPre: Bilingual; linkText: Bilingual; textPost: Bilingual }
	| { id: 'contact'; heading: Bilingual; textPre: Bilingual };

const SUBPROCESSOR_FUNCTION: Record<SubprocessorId, Bilingual> = {
	railwayHosting: { es: 'Alojamiento de la aplicación, base de datos y procesos en segundo plano', en: 'Application hosting, database and background jobs' },
	railwayStorage: { es: 'Almacenamiento de los documentos subidos (albaranes y facturas)', en: 'Storage of uploaded documents (delivery notes and invoices)' },
	gemini: { es: 'Extracción de datos de albaranes y respuestas del asistente mediante IA', en: 'AI-based invoice data extraction and assistant answers' },
	googleSignIn: { es: 'Inicio de sesión con Google, solo si lo eliges', en: 'Sign-in with Google, only if you choose it' },
	stripe: { es: 'Procesamiento de pagos', en: 'Payment processing' },
	sentry: { es: 'Monitorización de errores', en: 'Error monitoring' },
	resend: { es: 'Envío de los correos electrónicos del servicio', en: 'Sending the service’s emails' },
	cloudflare: { es: 'Protección antibot de los formularios públicos (Turnstile)', en: 'Anti-bot protection on public forms (Turnstile)' },
};

export const COUNTRY_NAME: Record<CountryCode, Bilingual> = {
	SG: { es: 'Singapur', en: 'Singapore' },
	US: { es: 'EE. UU.', en: 'USA' },
	IE: { es: 'Irlanda', en: 'Ireland' },
	NL: { es: 'Países Bajos', en: 'Netherlands' },
	DE: { es: 'Alemania', en: 'Germany' },
};

export const TRANSFER_BASIS: Record<TransferBasis, Bilingual> = {
	dpf: { es: 'Marco de Privacidad de Datos UE-EE. UU.', en: 'EU-U.S. Data Privacy Framework' },
	scc: { es: 'cláusulas contractuales tipo', en: 'standard contractual clauses' },
};

function locationCell(sub: Subprocessor, loc: keyof Bilingual): string {
	const countries = sub.countries.map((c) => COUNTRY_NAME[c][loc]).join(' / ');
	const region = sub.region ? ` (${sub.region})` : '';
	return `${countries}${region} · ${TRANSFER_BASIS[sub.transfer][loc]}`;
}

function subprocessorRow(sub: Subprocessor): { provider: Bilingual; fn: Bilingual; country: Bilingual } {
	return {
		provider: { es: sub.provider, en: sub.provider },
		fn: SUBPROCESSOR_FUNCTION[sub.id],
		country: { es: locationCell(sub, 'es'), en: locationCell(sub, 'en') },
	};
}

function dpoSentence(entity: LegalEntity): Bilingual {
	if (entity.dpoEmail) {
		return { es: ` Delegado de protección de datos: ${entity.dpoEmail}.`, en: ` Data protection officer: ${entity.dpoEmail}.` };
	}
	return {
		es: ' No hemos designado delegado de protección de datos porque nuestra actividad no está entre las que lo exigen (art. 37 RGPD y art. 34 LOPDGDD).',
		en: ' We have not appointed a data protection officer because our activity is not among those that require one (Art. 37 GDPR and Art. 34 LOPDGDD).',
	};
}

function controllerSection(entity: LegalEntity): PrivacySection {
	const heading = { es: '1. Responsable del tratamiento', en: '1. Data controller' };
	const dpo = dpoSentence(entity);
	if (entityIsRegistered(entity)) {
		const name = entity.legalName ?? entity.tradeName;
		return {
			id: 'controller',
			heading,
			lead: { es: name, en: name },
			text: {
				es: `, con NIF ${entity.taxId} y domicilio en ${entity.registeredAddress} (en adelante, "nosotros"), es el responsable del tratamiento de los datos personales recogidos a través de la plataforma ${entity.tradeName} (mise-place.com).${dpo.es}`,
				en: `, with tax ID ${entity.taxId} and registered address at ${entity.registeredAddress} (hereinafter "we"), is the controller of the personal data collected through the ${entity.tradeName} platform (mise-place.com).${dpo.en}`,
			},
		};
	}
	return {
		id: 'controller',
		heading,
		lead: { es: entity.tradeName, en: entity.tradeName },
		text: {
			es: ` está en fase previa al lanzamiento comercial y todavía no la explota ninguna sociedad constituida. Hasta entonces, el responsable del tratamiento de los datos personales recogidos a través de la plataforma (mise-place.com) es su fundador, como persona física (en adelante, "nosotros"). Su nombre completo, NIF y domicilio se publicarán en el Aviso Legal antes de que se cobre por el servicio; mientras tanto puedes solicitarlos en ${entity.privacyEmail}.${dpo.es}`,
			en: ` is pre-launch and no incorporated company operates it yet. Until then, the controller of the personal data collected through the platform (mise-place.com) is its founder, as a natural person (hereinafter "we"). Their full name, tax ID and address will be published in the Legal Notice before the service is charged for; in the meantime you can request them at ${entity.privacyEmail}.${dpo.en}`,
		},
	};
}

export function buildPrivacySections(entity: LegalEntity, subprocessors: readonly Subprocessor[]): PrivacySection[] {
	return [
		controllerSection(entity),
		{ id: 'dataCollected', heading: { es: '2. Datos que recopilamos', en: '2. Data we collect' }, items: [{ term: { es: 'Datos de cuenta:', en: 'Account data:' }, text: { es: ' dirección de correo electrónico, nombre y contraseña cifrada.', en: ' email address, name and encrypted password.' } }, { term: { es: 'Datos del negocio:', en: 'Business data:' }, text: { es: ' albaranes e información de proveedores que tú mismo subes.', en: ' invoices, delivery notes and supplier information that you upload yourself.' } }, { term: { es: 'Datos de uso:', en: 'Usage data:' }, text: { es: ' registros de acceso, identificadores de sesión, métricas de rendimiento anónimas.', en: ' access logs, session identifiers, anonymous performance metrics.' } }, { term: { es: 'Datos de pago:', en: 'Payment data:' }, text: { es: ' procesados directamente por Stripe; nosotros no almacenamos datos de tarjeta.', en: ' processed directly by Stripe; we do not store card data.' } }, { term: { es: 'Canal de WhatsApp (si lo vinculas):', en: 'WhatsApp channel (if you link it):' }, text: { es: ' número de teléfono, nombre visible y los documentos que envíes por ese canal. Los mensajes pasan por la infraestructura de WhatsApp (Meta), que los trata según sus propias condiciones. El canal funciona con un cliente no oficial de WhatsApp Web, no con la API oficial de WhatsApp Business, y puede dejar de estar disponible sin previo aviso.', en: ' phone number, display name and the documents you send through that channel. Messages travel through WhatsApp (Meta) infrastructure, which processes them under its own terms. The channel runs on an unofficial WhatsApp Web client, not the official WhatsApp Business API, and may stop working without notice.' } }] },
		{ id: 'legalBasis', heading: { es: '3. Base legal del tratamiento', en: '3. Legal basis for processing' }, items: [{ term: { es: 'Ejecución de contrato', en: 'Performance of a contract' }, text: { es: ' (Art. 6.1.b RGPD): prestación del servicio contratado.', en: ' (Art. 6.1.b GDPR): provision of the contracted service.' } }, { term: { es: 'Interés legítimo', en: 'Legitimate interest' }, text: { es: ' (Art. 6.1.f RGPD): seguridad, prevención de fraude y mejora del servicio.', en: ' (Art. 6.1.f GDPR): security, fraud prevention and service improvement.' } }, { term: { es: 'Cumplimiento de obligación legal', en: 'Compliance with a legal obligation' }, text: { es: ' (Art. 6.1.c RGPD): conservación de registros contables.', en: ' (Art. 6.1.c GDPR): retention of accounting records.' } }] },
		{ id: 'subprocessors', heading: { es: '4. Sub-encargados del tratamiento (DPA)', en: '4. Sub-processors (DPA)' }, intro: { es: 'Para prestar el servicio usamos los siguientes proveedores, que tratan datos personales por nuestra cuenta y, respecto de los datos de cada restaurante, como subencargados:', en: 'To provide the service we use the following providers, who process personal data on our behalf and, for each restaurant’s data, as sub-processors:' }, tableHead: { provider: { es: 'Proveedor', en: 'Provider' }, fn: { es: 'Función', en: 'Function' }, country: { es: 'Ubicación y garantía', en: 'Location and safeguard' } }, rows: subprocessors.map(subprocessorRow) },
		{ id: 'transfers', heading: { es: '5. Transferencias internacionales', en: '5. International transfers' }, text: { es: 'Algunos proveedores tratan datos fuera del Espacio Económico Europeo, como indica la tabla anterior. Cuando el proveedor está establecido en EE. UU. y adherido al Marco de Privacidad de Datos UE-EE. UU., la transferencia se ampara en la decisión de adecuación de la Comisión Europea de 10 de julio de 2023. En el resto de casos se ampara en las cláusulas contractuales tipo aprobadas por la Decisión de Ejecución (UE) 2021/914, incluidas en el acuerdo de tratamiento de datos del proveedor. Si usas el canal de WhatsApp, Meta trata esos mensajes según sus propias condiciones; no es un proveedor contratado por nosotros.', en: 'Some providers process data outside the European Economic Area, as the table above shows. Where the provider is established in the USA and participates in the EU-U.S. Data Privacy Framework, the transfer relies on the European Commission adequacy decision of 10 July 2023. In all other cases it relies on the standard contractual clauses approved by Commission Implementing Decision (EU) 2021/914, included in the provider’s data processing agreement. If you use the WhatsApp channel, Meta processes those messages under its own terms; it is not a provider we have contracted.' } },
		{ id: 'retention', heading: { es: '6. Conservación de datos', en: '6. Data retention' }, items: [{ es: 'Datos de cuenta: hasta que elimines la cuenta. La eliminación desde Ajustes es inmediata en nuestra base de datos; los archivos subidos se borran a continuación, en segundo plano.', en: 'Account data: until you delete your account. Deleting it from Settings removes it from our database immediately; uploaded files are then deleted in the background.' }, { es: 'Albaranes y datos financieros: 5 años desde la fecha del documento (obligación legal contable).', en: 'Invoices and financial data: 5 years from the document date (legal accounting obligation).' }, { es: 'Registros de auditoría: 5 años.', en: 'Audit logs: 5 years.' }, { es: 'Datos de sesión y logs: 90 días.', en: 'Session data and logs: 90 days.' }] },
		{ id: 'rights', heading: { es: '7. Tus derechos (RGPD)', en: '7. Your rights (GDPR)' }, introPre: { es: 'Puedes ejercer los siguientes derechos enviando un correo a ', en: 'You may exercise the following rights by sending an email to ' }, introPost: { es: ':', en: ':' }, items: [{ term: { es: 'Acceso (Art. 15):', en: 'Access (Art. 15):' }, text: { es: ' obtener una copia de tus datos. Disponible en ', en: ' obtain a copy of your data. Available under ' }, emphasis: { es: 'Ajustes → Exportar mis datos', en: 'Settings → Export my data' } }, { term: { es: 'Rectificación (Art. 16):', en: 'Rectification (Art. 16):' }, text: { es: ' corregir datos inexactos.', en: ' correct inaccurate data.' } }, { term: { es: 'Supresión (Art. 17):', en: 'Erasure (Art. 17):' }, text: { es: ' solicitar la eliminación de tu cuenta y datos. Disponible en ', en: ' request the deletion of your account and data. Available under ' }, emphasis: { es: 'Ajustes → Eliminar cuenta', en: 'Settings → Delete account' } }, { term: { es: 'Portabilidad (Art. 20):', en: 'Portability (Art. 20):' }, text: { es: ' recibir tus datos en formato JSON estructurado.', en: ' receive your data in structured JSON format.' } }, { term: { es: 'Oposición (Art. 21):', en: 'Objection (Art. 21):' }, text: { es: ' oponerte al tratamiento basado en interés legítimo.', en: ' object to processing based on legitimate interest.' } }], outroPre: { es: 'Responderemos en el plazo máximo de 30 días. Tienes derecho a presentar una reclamación ante la ', en: 'We will respond within a maximum of 30 days. You have the right to lodge a complaint with the ' }, outroStrong: { es: 'AEPD', en: 'AEPD' }, outroPost: { es: ' (www.aepd.es).', en: ' (www.aepd.es).' } },
		{ id: 'cookies', heading: { es: '8. Cookies', en: '8. Cookies' }, paragraphs: [{ es: 'Usamos cookies estrictamente necesarias para mantener tu sesión autenticada. No empleamos cookies de seguimiento ni publicidad de terceros.', en: 'We use strictly necessary cookies to keep your session authenticated. We do not use third-party tracking or advertising cookies.' }, { es: 'Si llegas a la lista de espera o al registro a través de un enlace de campaña (por ejemplo, con parámetros utm_source o utm_campaign), guardamos esa procedencia en una cookie propia ("mep_attr") durante un máximo de 30 días, solo para saber qué mensaje o canal funciona. Esa cookie solo se escribe si la aceptas en el aviso de cookies; si la rechazas no se crea y, si ya existía, se borra. No se comparte con terceros ni se usa para seguirte por otros sitios.', en: 'If you reach the waitlist or sign-up page through a campaign link (for example, with utm_source or utm_campaign parameters), we store that origin in a first-party cookie ("mep_attr") for up to 30 days, solely to see which message or channel worked. That cookie is written only if you accept it in the cookie notice; if you decline it is not created and any existing one is deleted. It is not shared with third parties or used to track you across other sites.' }], linkPre: { es: 'El detalle completo de cada cookie está en la ', en: 'The full detail of every cookie is in the ' }, linkText: { es: 'Política de Cookies', en: 'Cookie Policy' }, linkPost: { es: '.', en: '.' } },
		{ id: 'security', heading: { es: '9. Seguridad', en: '9. Security' }, text: { es: 'Todos los datos se transmiten cifrados mediante TLS 1.2+. Las contraseñas se almacenan con hash bcrypt. El acceso a los datos de producción está restringido mediante roles y auditoría.', en: 'All data is transmitted encrypted via TLS 1.2+. Passwords are stored with bcrypt hashing. Access to production data is restricted through roles and auditing.' } },
		{ id: 'processor', heading: { es: '10. Datos que tratamos por cuenta de los restaurantes', en: '10. Data we process on behalf of restaurants' }, textPre: { es: 'El contenido de los documentos que sube cada restaurante (albaranes, facturas y datos de proveedores, incluidos los de las personas que aparezcan en ellos) lo tratamos como encargado del tratamiento, por cuenta del restaurante, que es su responsable (art. 28 RGPD). Las condiciones de ese encargo están en la cláusula 13 de los ', en: 'We process the content of the documents each restaurant uploads (delivery notes, invoices and supplier details, including those of any person named in them) as a processor, on behalf of the restaurant, which is the controller (Art. 28 GDPR). The terms of that processing are set out in clause 13 of the ' }, linkText: { es: 'Términos de Servicio', en: 'Terms of Service' }, textPost: { es: '. Si eres proveedor de un restaurante y quieres ejercer tus derechos sobre esos datos, dirígete al restaurante; si nos escribes, le trasladaremos la solicitud.', en: '. If you are a restaurant’s supplier and want to exercise your rights over that data, contact the restaurant; if you write to us, we will pass your request on.' } },
		{ id: 'contact', heading: { es: '11. Contacto', en: '11. Contact' }, textPre: { es: 'Para cualquier cuestión sobre privacidad: ', en: 'For any privacy-related matter: ' } },
	];
}

export const privacySections: PrivacySection[] = buildPrivacySections(LEGAL_ENTITY, SUBPROCESSORS);
