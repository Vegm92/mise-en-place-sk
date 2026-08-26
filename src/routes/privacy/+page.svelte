<script lang="ts">
  import { onMount } from 'svelte';
  import { locale, initLocale } from '$lib/i18n';

  onMount(() => { initLocale(); });

  function toggleLocale() { locale.update((l) => (l === 'es' ? 'en' : 'es')); }

  const copy = {
    es: {
      pageTitle:    'Política de Privacidad · Mise en Place',
      back:         '← Volver',
      title:        'Política de Privacidad',
      meta:         'Última actualización: 1 de junio de 2026',
      prevails:     'La versión en español prevalece sobre cualquier traducción.',

      h1:           '1. Responsable del tratamiento',
      p1a:          'Mise en Place SL',
      p1b:          ' (en adelante, "nosotros", "la Empresa") es el responsable del tratamiento de los datos personales recogidos a través de la plataforma Mise en Place (mise-en-place.app).',

      h2:           '2. Datos que recopilamos',
      d2a1:         'Datos de cuenta:',
      d2a2:         ' dirección de correo electrónico, nombre y contraseña cifrada.',
      d2b1:         'Datos del negocio:',
      d2b2:         ' albaranes e información de proveedores que tú mismo subes.',
      d2c1:         'Datos de uso:',
      d2c2:         ' registros de acceso, identificadores de sesión, métricas de rendimiento anónimas.',
      d2d1:         'Datos de pago:',
      d2d2:         ' procesados directamente por Stripe; nosotros no almacenamos datos de tarjeta.',

      h3:           '3. Base legal del tratamiento',
      d3a1:         'Ejecución de contrato',
      d3a2:         ' (Art. 6.1.b RGPD): prestación del servicio contratado.',
      d3b1:         'Interés legítimo',
      d3b2:         ' (Art. 6.1.f RGPD): seguridad, prevención de fraude y mejora del servicio.',
      d3c1:         'Cumplimiento de obligación legal',
      d3c2:         ' (Art. 6.1.c RGPD): conservación de registros contables.',

      h4:           '4. Sub-encargados del tratamiento (DPA)',
      p4:           'Para prestar el servicio, compartimos datos con los siguientes sub-encargados:',
      thProvider:   'Proveedor',
      thFunction:   'Función',
      thCountry:    'País',
      r1Function:   'Base de datos y autenticación',
      r1Country:    'Sudeste asiático',
      r2Function:   'Extracción de datos de albaranes mediante IA',
      r2Country:    'EE.UU. (cláusulas contractuales tipo)',
      r3Function:   'Procesamiento de pagos',
      r3Country:    'EE.UU. (cláusulas contractuales tipo)',
      r4Function:   'Monitorización de errores',
      r4Country:    'EE.UU. (cláusulas contractuales tipo)',

      h5:           '5. Transferencias internacionales',
      p5:           'Los proveedores estadounidenses mencionados anteriormente están sujetos a las cláusulas contractuales tipo (CCT) aprobadas por la Comisión Europea, garantizando un nivel de protección equivalente al RGPD.',

      h6:           '6. Conservación de datos',
      d6a:          'Datos de cuenta: hasta la eliminación de la cuenta + 30 días de retención para reversión.',
      d6b:          'Albaranes y datos financieros: 5 años desde la fecha del documento (obligación legal contable).',
      d6c:          'Registros de auditoría: 5 años.',
      d6d:          'Datos de sesión y logs: 90 días.',

      h7:           '7. Tus derechos (RGPD)',
      p7a:          'Puedes ejercer los siguientes derechos enviando un correo a ',
      p7b:          ':',
      d7a1:         'Acceso (Art. 15):',
      d7a2:         ' obtener una copia de tus datos. Disponible en ',
      d7aEm:        'Ajustes → Exportar mis datos',
      d7b1:         'Rectificación (Art. 16):',
      d7b2:         ' corregir datos inexactos.',
      d7c1:         'Supresión (Art. 17):',
      d7c2:         ' solicitar la eliminación de tu cuenta y datos. Disponible en ',
      d7cEm:        'Ajustes → Eliminar cuenta',
      d7d1:         'Portabilidad (Art. 20):',
      d7d2:         ' recibir tus datos en formato JSON estructurado.',
      d7e1:         'Oposición (Art. 21):',
      d7e2:         ' oponerte al tratamiento basado en interés legítimo.',
      p7c1:         'Responderemos en el plazo máximo de 30 días. Tienes derecho a presentar una reclamación ante la ',
      p7cStrong:    'AEPD',
      p7c2:         ' (www.aepd.es).',

      h8:           '8. Cookies',
      p8:           'Usamos únicamente cookies estrictamente necesarias para mantener tu sesión autenticada. No empleamos cookies de seguimiento ni publicidad de terceros.',

      h9:           '9. Seguridad',
      p9:           'Todos los datos se transmiten cifrados mediante TLS 1.2+. Las contraseñas se almacenan con hash bcrypt. El acceso a los datos de producción está restringido mediante roles y auditoría.',

      h10:          '10. Contacto',
      p10:          'Para cualquier cuestión sobre privacidad: ',

      flTerms:      'Términos de Servicio',
      flHome:       'Inicio',
    },
    en: {
      pageTitle:    'Privacy Policy · Mise en Place',
      back:         '← Back',
      title:        'Privacy Policy',
      meta:         'Last updated: June 1, 2026',
      prevails:     'The Spanish version prevails over any translation.',

      h1:           '1. Data controller',
      p1a:          'Mise en Place SL',
      p1b:          ' (hereinafter "we", "the Company") is the controller of the personal data collected through the Mise en Place platform (mise-en-place.app).',

      h2:           '2. Data we collect',
      d2a1:         'Account data:',
      d2a2:         ' email address, name and encrypted password.',
      d2b1:         'Business data:',
      d2b2:         ' invoices, delivery notes and supplier information that you upload yourself.',
      d2c1:         'Usage data:',
      d2c2:         ' access logs, session identifiers, anonymous performance metrics.',
      d2d1:         'Payment data:',
      d2d2:         ' processed directly by Stripe; we do not store card data.',

      h3:           '3. Legal basis for processing',
      d3a1:         'Performance of a contract',
      d3a2:         ' (Art. 6.1.b GDPR): provision of the contracted service.',
      d3b1:         'Legitimate interest',
      d3b2:         ' (Art. 6.1.f GDPR): security, fraud prevention and service improvement.',
      d3c1:         'Compliance with a legal obligation',
      d3c2:         ' (Art. 6.1.c GDPR): retention of accounting records.',

      h4:           '4. Sub-processors (DPA)',
      p4:           'To provide the service, we share data with the following sub-processors:',
      thProvider:   'Provider',
      thFunction:   'Function',
      thCountry:    'Country',
      r1Function:   'Database and authentication',
      r1Country:    'Southeast Asia',
      r2Function:   'AI-based invoice data extraction',
      r2Country:    'USA (standard contractual clauses)',
      r3Function:   'Payment processing',
      r3Country:    'USA (standard contractual clauses)',
      r4Function:   'Error monitoring',
      r4Country:    'USA (standard contractual clauses)',

      h5:           '5. International transfers',
      p5:           'The US providers mentioned above are subject to the standard contractual clauses (SCC) approved by the European Commission, ensuring a level of protection equivalent to the GDPR.',

      h6:           '6. Data retention',
      d6a:          'Account data: until account deletion + 30 days of retention for reversal.',
      d6b:          'Invoices and financial data: 5 years from the document date (legal accounting obligation).',
      d6c:          'Audit logs: 5 years.',
      d6d:          'Session data and logs: 90 days.',

      h7:           '7. Your rights (GDPR)',
      p7a:          'You may exercise the following rights by sending an email to ',
      p7b:          ':',
      d7a1:         'Access (Art. 15):',
      d7a2:         ' obtain a copy of your data. Available under ',
      d7aEm:        'Settings → Export my data',
      d7b1:         'Rectification (Art. 16):',
      d7b2:         ' correct inaccurate data.',
      d7c1:         'Erasure (Art. 17):',
      d7c2:         ' request the deletion of your account and data. Available under ',
      d7cEm:        'Settings → Delete account',
      d7d1:         'Portability (Art. 20):',
      d7d2:         ' receive your data in structured JSON format.',
      d7e1:         'Objection (Art. 21):',
      d7e2:         ' object to processing based on legitimate interest.',
      p7c1:         'We will respond within a maximum of 30 days. You have the right to lodge a complaint with the ',
      p7cStrong:    'AEPD',
      p7c2:         ' (www.aepd.es).',

      h8:           '8. Cookies',
      p8:           'We use only strictly necessary cookies to keep your session authenticated. We do not use third-party tracking or advertising cookies.',

      h9:           '9. Security',
      p9:           'All data is transmitted encrypted via TLS 1.2+. Passwords are stored with bcrypt hashing. Access to production data is restricted through roles and auditing.',

      h10:          '10. Contact',
      p10:          'For any privacy-related matter: ',

      flTerms:      'Terms of Service',
      flHome:       'Home',
    },
  } as const;

  const c = $derived(copy[$locale]);
</script>

<svelte:head>
  <title>{c.pageTitle}</title>
</svelte:head>

<div class="mep legal" data-accent="slate" data-density="default">
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
    <p>
      <strong>{c.p1a}</strong>{c.p1b}
    </p>

    <h2>{c.h2}</h2>
    <ul>
      <li><strong>{c.d2a1}</strong>{c.d2a2}</li>
      <li><strong>{c.d2b1}</strong>{c.d2b2}</li>
      <li><strong>{c.d2c1}</strong>{c.d2c2}</li>
      <li><strong>{c.d2d1}</strong>{c.d2d2}</li>
    </ul>

    <h2>{c.h3}</h2>
    <ul>
      <li><strong>{c.d3a1}</strong>{c.d3a2}</li>
      <li><strong>{c.d3b1}</strong>{c.d3b2}</li>
      <li><strong>{c.d3c1}</strong>{c.d3c2}</li>
    </ul>

    <h2>{c.h4}</h2>
    <p>{c.p4}</p>
    <table>
      <thead>
        <tr>
          <th>{c.thProvider}</th>
          <th>{c.thFunction}</th>
          <th>{c.thCountry}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Railway Corporation</td>
          <td>{c.r1Function}</td>
          <td>{c.r1Country}</td>
        </tr>
        <tr>
          <td>Google LLC (Gemini API)</td>
          <td>{c.r2Function}</td>
          <td>{c.r2Country}</td>
        </tr>
        <tr>
          <td>Stripe Inc.</td>
          <td>{c.r3Function}</td>
          <td>{c.r3Country}</td>
        </tr>
        <tr>
          <td>Sentry (Functional Software)</td>
          <td>{c.r4Function}</td>
          <td>{c.r4Country}</td>
        </tr>
      </tbody>
    </table>

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
    <p>{c.p7a}<a href="mailto:privacy@mise-en-place.app">privacy@mise-en-place.app</a>{c.p7b}</p>
    <ul>
      <li><strong>{c.d7a1}</strong>{c.d7a2}<em>{c.d7aEm}</em>.</li>
      <li><strong>{c.d7b1}</strong>{c.d7b2}</li>
      <li><strong>{c.d7c1}</strong>{c.d7c2}<em>{c.d7cEm}</em>.</li>
      <li><strong>{c.d7d1}</strong>{c.d7d2}</li>
      <li><strong>{c.d7e1}</strong>{c.d7e2}</li>
    </ul>
    <p>{c.p7c1}<strong>{c.p7cStrong}</strong>{c.p7c2}</p>

    <h2>{c.h8}</h2>
    <p>{c.p8}</p>

    <h2>{c.h9}</h2>
    <p>{c.p9}</p>

    <h2>{c.h10}</h2>
    <p>
      {c.p10}<a href="mailto:privacy@mise-en-place.app">privacy@mise-en-place.app</a>
    </p>

    <hr />
    <p class="footer-links">
      <a href="/terms">{c.flTerms}</a> ·
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
  strong { color: var(--mep-fg); font-weight: 600; }
  a { color: var(--mep-acc); }
  hr {
    border: none;
    border-top: 1px solid var(--mep-divider);
    margin: 24px 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    margin-top: 8px;
  }
  th, td {
    padding: 8px 12px;
    text-align: left;
    border: 1px solid var(--mep-border);
    color: var(--mep-fg-2);
  }
  thead tr { background: var(--mep-surface-2); }
  th { color: var(--mep-fg); font-weight: 600; }
  .footer-links { font-size: 13px; color: var(--mep-fg-3); margin-top: 16px; }
  .footer-links a { color: var(--mep-fg-3); }
</style>
