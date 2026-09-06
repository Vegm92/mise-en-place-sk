<script lang="ts">
  import { locale } from '$lib/i18n';
  import LegalPage from '$lib/components/legal/LegalPage.svelte';

  const copy = {
    es: {
      pageTitle: 'Política de Reembolsos · Mise en Place',
      back:      '← Volver',
      title:     'Política de Reembolsos y Cancelación',
      meta:      'Última actualización: 6 de septiembre de 2026',
      prevails:  'La versión en español prevalece sobre cualquier traducción.',

      h1:        '1. Alcance',
      p1:        'Esta política desarrolla la cláusula 6 de los Términos de Servicio y se aplica a las suscripciones de pago de Mise en Place. En caso de discrepancia, prevalece esta política.',

      h2:        '2. Prueba gratuita',
      p2:        'La suscripción empieza con un periodo de prueba gratuito. No se pide tarjeta para iniciarlo y no se cobra nada si no contratas un plan de pago al terminar.',

      h3:        '3. Cancelación',
      d3a:       'Puedes cancelar cuando quieras desde Ajustes → Facturación, sin dar explicaciones ni llamar a nadie.',
      d3b:       'La cancelación surte efecto al final del periodo de facturación en curso: conservas el acceso hasta esa fecha.',
      d3c:       'No se renueva automáticamente después de cancelar.',

      h4:        '4. Reembolsos',
      d4a:       'Reembolsamos íntegramente cualquier cobro efectuado por error nuestro (duplicado, plan equivocado, cobro tras una cancelación).',
      d4b:       'Reembolsamos íntegramente el primer mes de un plan de pago si lo solicitas dentro de los 14 días siguientes al cobro y no has procesado más de 20 documentos en ese periodo.',
      d4c:       'Fuera de esos casos no reembolsamos periodos ya iniciados y no consumidos: la cancelación detiene la siguiente renovación, no la actual.',
      d4d:       'Si una incidencia atribuible a nosotros deja el servicio inutilizable durante más de 72 horas seguidas en un mes facturado, reembolsamos la parte proporcional de ese mes a solicitud tuya.',

      h5:        '5. Cómo pedir un reembolso',
      p5a:       'Escribe a ',
      p5b:       ' desde el correo de tu cuenta, indicando el importe y la fecha del cobro. Respondemos en un máximo de 5 días hábiles y, si procede, el reembolso se emite a través de Stripe al mismo medio de pago en un plazo de 5 a 10 días hábiles según tu banco.',

      h6:        '6. Clientes que son consumidores',
      p6:        'Mise en Place se dirige a profesionales y empresas del sector de la hostelería, por lo que el derecho de desistimiento de 14 días previsto para consumidores en el Real Decreto Legislativo 1/2007 no resulta aplicable con carácter general. Si contratas como consumidor, ese derecho te ampara y esta política no lo limita.',

      h7:        '7. Contacto',
      p7:        'Para cualquier duda sobre pagos o reembolsos: ',

      flTerms:   'Términos de Servicio',
      flPrivacy: 'Política de Privacidad',
      flHome:    'Inicio',
    },
    en: {
      pageTitle: 'Refund Policy · Mise en Place',
      back:      '← Back',
      title:     'Refund and Cancellation Policy',
      meta:      'Last updated: September 6, 2026',
      prevails:  'The Spanish version prevails over any translation.',

      h1:        '1. Scope',
      p1:        'This policy expands clause 6 of the Terms of Service and applies to paid Mise en Place subscriptions. Where the two differ, this policy prevails.',

      h2:        '2. Free trial',
      p2:        'A subscription starts with a free trial period. No card is required to begin it, and nothing is charged if you do not take a paid plan when it ends.',

      h3:        '3. Cancellation',
      d3a:       'You can cancel whenever you like from Settings → Billing, with no explanation required and nobody to call.',
      d3b:       'Cancellation takes effect at the end of the current billing period: you keep access until that date.',
      d3c:       'Nothing renews automatically after you cancel.',

      h4:        '4. Refunds',
      d4a:       'We refund in full any charge made through our own error (a duplicate, the wrong plan, a charge after a cancellation).',
      d4b:       'We refund in full the first month of a paid plan if you ask within 14 days of the charge and have processed no more than 20 documents in that period.',
      d4c:       'Outside those cases we do not refund periods already started and unused: cancelling stops the next renewal, not the current one.',
      d4d:       'If an incident attributable to us leaves the service unusable for more than 72 consecutive hours within a billed month, we refund that month pro rata on request.',

      h5:        '5. How to request a refund',
      p5a:       'Write to ',
      p5b:       ' from your account email, giving the amount and the date of the charge. We answer within 5 working days and, where due, the refund is issued through Stripe back to the same payment method within 5 to 10 working days depending on your bank.',

      h6:        '6. Customers who are consumers',
      p6:        'Mise en Place is aimed at hospitality professionals and businesses, so the 14-day right of withdrawal that Spanish Royal Legislative Decree 1/2007 grants consumers does not generally apply. If you contract as a consumer, that right protects you and this policy does not limit it.',

      h7:        '7. Contact',
      p7:        'For any question about payments or refunds: ',

      flTerms:   'Terms of Service',
      flPrivacy: 'Privacy Policy',
      flHome:    'Home',
    },
  } as const;

  const c = $derived(copy[locale.current]);
</script>

<LegalPage pageTitle={c.pageTitle} back={c.back} title={c.title} meta={c.meta} prevails={c.prevails}>
  {#snippet children()}
    <h2>{c.h1}</h2>
    <p>{c.p1}</p>

    <h2>{c.h2}</h2>
    <p>{c.p2}</p>

    <h2>{c.h3}</h2>
    <ul>
      <li>{c.d3a}</li>
      <li>{c.d3b}</li>
      <li>{c.d3c}</li>
    </ul>

    <h2>{c.h4}</h2>
    <ul>
      <li>{c.d4a}</li>
      <li>{c.d4b}</li>
      <li>{c.d4c}</li>
      <li>{c.d4d}</li>
    </ul>

    <h2>{c.h5}</h2>
    <p>{c.p5a}<a href="mailto:hola@mise-place.com">hola@mise-place.com</a>{c.p5b}</p>

    <h2>{c.h6}</h2>
    <p>{c.p6}</p>

    <h2>{c.h7}</h2>
    <p>{c.p7}<a href="mailto:hola@mise-place.com">hola@mise-place.com</a></p>
  {/snippet}
  {#snippet footer()}
    <a href="/terms">{c.flTerms}</a> ·
    <a href="/privacy">{c.flPrivacy}</a> ·
    <a href="/">{c.flHome}</a>
  {/snippet}
</LegalPage>
