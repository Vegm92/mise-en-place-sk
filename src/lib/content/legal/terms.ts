import type { Bilingual } from './privacy';

export const termsMeta = {
	pageTitle: { es: 'Términos de Servicio · Mise en Place', en: 'Terms of Service · Mise en Place' },
	back: { es: '← Volver', en: '← Back' },
	toggleLabel: { es: 'EN', en: 'ES' },
	title: { es: 'Términos de Servicio', en: 'Terms of Service' },
	dateLine: { es: 'Última actualización: 1 de junio de 2026', en: 'Last updated: June 1, 2026' },
	prevails: { es: 'La versión en español prevalece sobre cualquier traducción.', en: 'The Spanish version prevails over any translation.' },
	contactEmail: 'legal@mise-place.com',
	footer: {
		privacy: { es: 'Política de Privacidad', en: 'Privacy Policy' },
		cookies: { es: 'Política de Cookies', en: 'Cookie Policy' },
		refunds: { es: 'Reembolsos', en: 'Refunds' },
		legal: { es: 'Aviso Legal', en: 'Legal Notice' },
		home: { es: 'Inicio', en: 'Home' },
	},
};

export type TermsSection =
	| { id: 'acceptance'; heading: Bilingual; text: Bilingual }
	| { id: 'description'; heading: Bilingual; text: Bilingual }
	| { id: 'accounts'; heading: Bilingual; items: Bilingual[] }
	| { id: 'acceptableUse'; heading: Bilingual; intro: Bilingual; items: Bilingual[] }
	| { id: 'ip'; heading: Bilingual; text: Bilingual }
	| { id: 'billing'; heading: Bilingual; items: Bilingual[]; linkPre: Bilingual; linkText: Bilingual; linkPost: Bilingual }
	| { id: 'availability'; heading: Bilingual; text: Bilingual }
	| { id: 'liability'; heading: Bilingual; text: Bilingual }
	| { id: 'privacy'; heading: Bilingual; textPre: Bilingual; linkText: Bilingual; textPost: Bilingual }
	| { id: 'modifications'; heading: Bilingual; text: Bilingual }
	| { id: 'termination'; heading: Bilingual; textPre: Bilingual; emphasis: Bilingual; textPost: Bilingual }
	| { id: 'governingLaw'; heading: Bilingual; text: Bilingual }
	| { id: 'contact'; heading: Bilingual; textPre: Bilingual };

export const termsSections: TermsSection[] = [
	{ id: 'acceptance', heading: { es: '1. Aceptación', en: '1. Acceptance' }, text: { es: 'Al registrarte o usar Mise en Place (el "Servicio"), aceptas estos Términos en su totalidad. Si no estás de acuerdo, no uses el Servicio.', en: 'By registering for or using Mise en Place (the "Service"), you accept these Terms in their entirety. If you do not agree, do not use the Service.' } },
	{ id: 'description', heading: { es: '2. Descripción del Servicio', en: '2. Description of the Service' }, text: { es: 'Mise en Place es una plataforma SaaS de gestión de albaranes y control de costes para el sector de la hostelería. Proporciona extracción automática de albaranes mediante inteligencia artificial, análisis de gasto por proveedor, presupuestos por categoría y alertas de precio.', en: 'Mise en Place is a SaaS platform for invoice management and cost control for the hospitality sector. It provides automatic invoice extraction using artificial intelligence, spend analysis by supplier, category budgets and price alerts.' } },
	{ id: 'accounts', heading: { es: '3. Cuentas y seguridad', en: '3. Accounts and security' }, items: [{ es: 'Debes proporcionar información veraz y mantenerla actualizada.', en: 'You must provide truthful information and keep it up to date.' }, { es: 'Eres responsable de mantener la confidencialidad de tu contraseña.', en: 'You are responsible for keeping your password confidential.' }, { es: 'Notifícanos inmediatamente si sospechas de acceso no autorizado a tu cuenta.', en: 'Notify us immediately if you suspect unauthorized access to your account.' }, { es: 'Puedes invitar a miembros adicionales a tu restaurante; eres responsable de su uso del Servicio.', en: 'You may invite additional members to your restaurant; you are responsible for their use of the Service.' }] },
	{ id: 'acceptableUse', heading: { es: '4. Uso aceptable', en: '4. Acceptable use' }, intro: { es: 'Queda prohibido:', en: 'The following is prohibited:' }, items: [{ es: 'Usar el Servicio para actividades ilegales o fraudulentas.', en: 'Using the Service for illegal or fraudulent activities.' }, { es: 'Intentar acceder a datos de otros usuarios.', en: 'Attempting to access other users’ data.' }, { es: 'Realizar ingeniería inversa o reproducir el software.', en: 'Reverse-engineering or reproducing the software.' }, { es: 'Sobrecargar la infraestructura mediante ataques automatizados (scraping masivo, DoS).', en: 'Overloading the infrastructure through automated attacks (mass scraping, DoS).' }] },
	{ id: 'ip', heading: { es: '5. Propiedad intelectual', en: '5. Intellectual property' }, text: { es: 'Todo el software, diseño y marca son propiedad de Mise en Place SL. Tus datos (albaranes, proveedores, etc.) son y permanecen de tu propiedad; nos otorgas una licencia para procesarlos únicamente con el fin de prestar el Servicio.', en: 'All software, design and branding are the property of Mise en Place SL. Your data (invoices, suppliers, etc.) is and remains your property; you grant us a license to process it solely for the purpose of providing the Service.' } },
	{ id: 'billing', heading: { es: '6. Pagos y suscripción', en: '6. Billing and payments' }, items: [{ es: 'El Servicio se ofrece con un periodo de prueba gratuito de 30 días.', en: 'The Service is offered with a 30-day free trial period.' }, { es: 'Los planes de pago se cobran mensualmente mediante Stripe.', en: 'Paid plans are billed monthly through Stripe.' }, { es: 'Las cancelaciones surten efecto al final del período de pago en curso.', en: 'Cancellations take effect at the end of the current billing period.' }, { es: 'No se realizan reembolsos parciales por períodos no utilizados, salvo exigencia legal o en los supuestos recogidos en la Política de Reembolsos.', en: 'No partial refunds are made for unused periods, unless required by law or under the cases set out in the Refund Policy.' }], linkPre: { es: 'El detalle de cancelaciones y reembolsos figura en la ', en: 'Cancellations and refunds are detailed in the ' }, linkText: { es: 'Política de Reembolsos', en: 'Refund Policy' }, linkPost: { es: '.', en: '.' } },
	{ id: 'availability', heading: { es: '7. Disponibilidad y SLA', en: '7. Availability and SLA' }, text: { es: 'Nos esforzamos por mantener una disponibilidad del 99,5% mensual. No garantizamos disponibilidad ininterrumpida. Los mantenimientos planificados se anunciarán con al menos 24 horas de antelación.', en: 'We strive to maintain 99.5% monthly availability. We do not guarantee uninterrupted availability. Planned maintenance will be announced at least 24 hours in advance.' } },
	{ id: 'liability', heading: { es: '8. Limitación de responsabilidad', en: '8. Limitation of liability' }, text: { es: 'En la máxima medida permitida por la ley, nuestra responsabilidad total ante ti no superará el importe abonado en los 12 meses anteriores al hecho causante. No somos responsables de pérdidas de datos causadas por errores del usuario, interrupciones de terceros o causas de fuerza mayor.', en: 'To the maximum extent permitted by law, our total liability to you shall not exceed the amount paid in the 12 months prior to the triggering event. We are not liable for data loss caused by user error, third-party interruptions or force majeure.' } },
	{ id: 'privacy', heading: { es: '9. Privacidad', en: '9. Privacy' }, textPre: { es: 'El tratamiento de datos personales se rige por nuestra ', en: 'The processing of personal data is governed by our ' }, linkText: { es: 'Política de Privacidad', en: 'Privacy Policy' }, textPost: { es: ', que forma parte integrante de estos Términos.', en: ', which forms an integral part of these Terms.' } },
	{ id: 'modifications', heading: { es: '10. Modificaciones', en: '10. Modifications' }, text: { es: 'Podemos modificar estos Términos con un preaviso de 30 días por correo electrónico. El uso continuado del Servicio tras dicho plazo implica la aceptación de los nuevos Términos.', en: 'We may modify these Terms with 30 days’ prior notice by email. Continued use of the Service after that period implies acceptance of the new Terms.' } },
	{ id: 'termination', heading: { es: '11. Rescisión', en: '11. Termination' }, textPre: { es: 'Puedes cancelar tu cuenta en cualquier momento desde ', en: 'You may cancel your account at any time from ' }, emphasis: { es: 'Ajustes → Eliminar cuenta', en: 'Settings → Delete account' }, textPost: { es: '. Nos reservamos el derecho de suspender cuentas que incumplan estos Términos.', en: '. We reserve the right to suspend accounts that breach these Terms.' } },
	{ id: 'governingLaw', heading: { es: '12. Ley aplicable y jurisdicción', en: '12. Governing law and jurisdiction' }, text: { es: 'Estos Términos se rigen por la ley española. Las partes se someten a la jurisdicción de los Juzgados y Tribunales de Barcelona, con renuncia expresa a cualquier otro fuero que pudiera corresponderles.', en: 'These Terms are governed by Spanish law. The parties submit to the jurisdiction of the Courts and Tribunals of Barcelona, expressly waiving any other jurisdiction that might apply to them.' } },
	{ id: 'contact', heading: { es: '13. Contacto', en: '13. Contact' }, textPre: { es: 'Para cualquier consulta sobre estos Términos: ', en: 'For any query regarding these Terms: ' } },
];
