<script lang="ts">
  import { onMount } from 'svelte';
  import { locale, initLocale } from '$lib/i18n';

  onMount(() => { initLocale(); });

  function toggleLocale() { locale.update((l) => (l === 'es' ? 'en' : 'es')); }

  const copy = {
    es: {
      pageTitle:  'Términos de Servicio · Mise en Place',
      back:       '← Volver',
      title:      'Términos de Servicio',
      meta:       'Última actualización: 1 de junio de 2026',
      prevails:   'La versión en español prevalece sobre cualquier traducción.',

      h1:         '1. Aceptación',
      p1:         'Al registrarte o usar Mise en Place (el "Servicio"), aceptas estos Términos en su totalidad. Si no estás de acuerdo, no uses el Servicio.',

      h2:         '2. Descripción del Servicio',
      p2:         'Mise en Place es una plataforma SaaS de gestión de albaranes y control de costes para el sector de la hostelería. Proporciona extracción automática de albaranes mediante inteligencia artificial, análisis de gasto por proveedor, presupuestos por categoría y alertas de precio.',

      h3:         '3. Cuentas y seguridad',
      d3a:        'Debes proporcionar información veraz y mantenerla actualizada.',
      d3b:        'Eres responsable de mantener la confidencialidad de tu contraseña.',
      d3c:        'Notifícanos inmediatamente si sospechas de acceso no autorizado a tu cuenta.',
      d3d:        'Puedes invitar a miembros adicionales a tu restaurante; eres responsable de su uso del Servicio.',

      h4:         '4. Uso aceptable',
      p4:         'Queda prohibido:',
      d4a:        'Usar el Servicio para actividades ilegales o fraudulentas.',
      d4b:        'Intentar acceder a datos de otros usuarios.',
      d4c:        'Realizar ingeniería inversa o reproducir el software.',
      d4d:        'Sobrecargar la infraestructura mediante ataques automatizados (scraping masivo, DoS).',

      h5:         '5. Propiedad intelectual',
      p5:         'Todo el software, diseño y marca son propiedad de Mise en Place SL. Tus datos (albaranes, proveedores, etc.) son y permanecen de tu propiedad; nos otorgas una licencia para procesarlos únicamente con el fin de prestar el Servicio.',

      h6:         '6. Pagos y suscripción',
      d6a:        'El Servicio se ofrece con un periodo de prueba gratuito de 30 días.',
      d6b:        'Los planes de pago se cobran mensualmente mediante Stripe.',
      d6c:        'Las cancelaciones surten efecto al final del período de pago en curso.',
      d6d:        'No se realizan reembolsos parciales por períodos no utilizados, salvo exigencia legal.',

      h7:         '7. Disponibilidad y SLA',
      p7:         'Nos esforzamos por mantener una disponibilidad del 99,5% mensual. No garantizamos disponibilidad ininterrumpida. Los mantenimientos planificados se anunciarán con al menos 24 horas de antelación.',

      h8:         '8. Limitación de responsabilidad',
      p8:         'En la máxima medida permitida por la ley, nuestra responsabilidad total ante ti no superará el importe abonado en los 12 meses anteriores al hecho causante. No somos responsables de pérdidas de datos causadas por errores del usuario, interrupciones de terceros o causas de fuerza mayor.',

      h9:         '9. Privacidad',
      p9a:        'El tratamiento de datos personales se rige por nuestra ',
      p9Link:     'Política de Privacidad',
      p9b:        ', que forma parte integrante de estos Términos.',

      h10:        '10. Modificaciones',
      p10:        'Podemos modificar estos Términos con un preaviso de 30 días por correo electrónico. El uso continuado del Servicio tras dicho plazo implica la aceptación de los nuevos Términos.',

      h11:        '11. Rescisión',
      p11a:       'Puedes cancelar tu cuenta en cualquier momento desde ',
      p11Em:      'Ajustes → Eliminar cuenta',
      p11b:       '. Nos reservamos el derecho de suspender cuentas que incumplan estos Términos.',

      h12:        '12. Ley aplicable y jurisdicción',
      p12:        'Estos Términos se rigen por la ley española. Las partes se someten a la jurisdicción de los Juzgados y Tribunales de Madrid, con renuncia expresa a cualquier otro fuero que pudiera corresponderles.',

      h13:        '13. Contacto',
      p13:        'Para cualquier consulta sobre estos Términos: ',

      flPrivacy:  'Política de Privacidad',
      flHome:     'Inicio',
    },
    en: {
      pageTitle:  'Terms of Service · Mise en Place',
      back:       '← Back',
      title:      'Terms of Service',
      meta:       'Last updated: June 1, 2026',
      prevails:   'The Spanish version prevails over any translation.',

      h1:         '1. Acceptance',
      p1:         'By registering for or using Mise en Place (the "Service"), you accept these Terms in their entirety. If you do not agree, do not use the Service.',

      h2:         '2. Description of the Service',
      p2:         'Mise en Place is a SaaS platform for invoice management and cost control for the hospitality sector. It provides automatic invoice extraction using artificial intelligence, spend analysis by supplier, category budgets and price alerts.',

      h3:         '3. Accounts and security',
      d3a:        'You must provide truthful information and keep it up to date.',
      d3b:        'You are responsible for keeping your password confidential.',
      d3c:        'Notify us immediately if you suspect unauthorized access to your account.',
      d3d:        'You may invite additional members to your restaurant; you are responsible for their use of the Service.',

      h4:         '4. Acceptable use',
      p4:         'The following is prohibited:',
      d4a:        'Using the Service for illegal or fraudulent activities.',
      d4b:        'Attempting to access other users’ data.',
      d4c:        'Reverse-engineering or reproducing the software.',
      d4d:        'Overloading the infrastructure through automated attacks (mass scraping, DoS).',

      h5:         '5. Intellectual property',
      p5:         'All software, design and branding are the property of Mise en Place SL. Your data (invoices, suppliers, etc.) is and remains your property; you grant us a license to process it solely for the purpose of providing the Service.',

      h6:         '6. Billing and payments',
      d6a:        'The Service is offered with a 30-day free trial period.',
      d6b:        'Paid plans are billed monthly through Stripe.',
      d6c:        'Cancellations take effect at the end of the current billing period.',
      d6d:        'No partial refunds are made for unused periods, unless required by law.',

      h7:         '7. Availability and SLA',
      p7:         'We strive to maintain 99.5% monthly availability. We do not guarantee uninterrupted availability. Planned maintenance will be announced at least 24 hours in advance.',

      h8:         '8. Limitation of liability',
      p8:         'To the maximum extent permitted by law, our total liability to you shall not exceed the amount paid in the 12 months prior to the triggering event. We are not liable for data loss caused by user error, third-party interruptions or force majeure.',

      h9:         '9. Privacy',
      p9a:        'The processing of personal data is governed by our ',
      p9Link:     'Privacy Policy',
      p9b:        ', which forms an integral part of these Terms.',

      h10:        '10. Modifications',
      p10:        'We may modify these Terms with 30 days’ prior notice by email. Continued use of the Service after that period implies acceptance of the new Terms.',

      h11:        '11. Termination',
      p11a:       'You may cancel your account at any time from ',
      p11Em:      'Settings → Delete account',
      p11b:       '. We reserve the right to suspend accounts that breach these Terms.',

      h12:        '12. Governing law and jurisdiction',
      p12:        'These Terms are governed by Spanish law. The parties submit to the jurisdiction of the Courts and Tribunals of Madrid, expressly waiving any other jurisdiction that might apply to them.',

      h13:        '13. Contact',
      p13:        'For any query regarding these Terms: ',

      flPrivacy:  'Privacy Policy',
      flHome:     'Home',
    },
  } as const;

  const c = $derived(copy[$locale]);
</script>

<svelte:head>
  <title>{c.pageTitle}</title>
</svelte:head>

<div class="mep legal" data-accent="tinta" data-density="default">
  <article>
    <div class="topbar">
      <a class="back" href="/">{c.back}</a>
      <button type="button" class="lang-toggle" onclick={toggleLocale}>{$locale === 'es' ? 'EN' : 'ES'}</button>
    </div>

    <h1>{c.title}</h1>
    <p class="meta">{c.meta}</p>
    <p class="meta">{c.prevails}</p>

    <hr />

    <h2>{c.h1}</h2>
    <p>{c.p1}</p>

    <h2>{c.h2}</h2>
    <p>{c.p2}</p>

    <h2>{c.h3}</h2>
    <ul>
      <li>{c.d3a}</li>
      <li>{c.d3b}</li>
      <li>{c.d3c}</li>
      <li>{c.d3d}</li>
    </ul>

    <h2>{c.h4}</h2>
    <p>{c.p4}</p>
    <ul>
      <li>{c.d4a}</li>
      <li>{c.d4b}</li>
      <li>{c.d4c}</li>
      <li>{c.d4d}</li>
    </ul>

    <h2>{c.h5}</h2>
    <p>{c.p5}</p>

    <h2>{c.h6}</h2>
    <ul>
      <li>{c.d6a}</li>
      <li>{c.d6b}</li>
      <li>{c.d6c}</li>
      <li>{c.d6d}</li>
    </ul>

    <h2>{c.h7}</h2>
    <p>{c.p7}</p>

    <h2>{c.h8}</h2>
    <p>{c.p8}</p>

    <h2>{c.h9}</h2>
    <p>
      {c.p9a}<a href="/privacy">{c.p9Link}</a>{c.p9b}
    </p>

    <h2>{c.h10}</h2>
    <p>{c.p10}</p>

    <h2>{c.h11}</h2>
    <p>
      {c.p11a}<em>{c.p11Em}</em>{c.p11b}
    </p>

    <h2>{c.h12}</h2>
    <p>{c.p12}</p>

    <h2>{c.h13}</h2>
    <p>
      {c.p13}<a href="mailto:legal@mise-en-place.app">legal@mise-en-place.app</a>
    </p>

    <hr />
    <p class="footer-links">
      <a href="/privacy">{c.flPrivacy}</a> ·
      <a href="/">{c.flHome}</a>
    </p>
  </article>
</div>

<style>
  .legal {
    min-height: 100vh;
    background: var(--mep-bg);
    color: var(--mep-fg);
  }
  .legal article {
    max-width: 720px;
    margin: 0 auto;
    padding: 48px 24px 80px;
    line-height: 1.7;
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .lang-toggle {
    font-size: 13px;
    color: var(--mep-fg-3);
    background: none;
    border: none;
    cursor: pointer;
  }
  .back {
    font-size: 13px;
    color: var(--mep-fg-3);
    text-decoration: none;
  }
  .back:hover { color: var(--mep-fg-2); }
  h1 {
    margin-top: 24px;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--mep-fg);
  }
  h2 {
    margin-top: 28px;
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--mep-fg);
  }
  .meta { color: var(--mep-fg-3); font-size: 14px; }
  p { color: var(--mep-fg-2); }
  ul { color: var(--mep-fg-2); padding-left: 20px; }
  li { margin: 4px 0; }
  a { color: var(--mep-acc); }
  hr {
    border: none;
    border-top: 1px solid var(--mep-divider);
    margin: 24px 0;
  }
  .footer-links { font-size: 13px; color: var(--mep-fg-3); margin-top: 16px; }
  .footer-links a { color: var(--mep-fg-3); }
</style>
