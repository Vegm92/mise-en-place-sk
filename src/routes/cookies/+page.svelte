<script lang="ts">
  import { locale } from '$lib/i18n';
  import LegalPage from '$lib/components/legal/LegalPage.svelte';

  const copy = {
    es: {
      pageTitle: 'Política de Cookies · Mise en Place',
      back:      '← Volver',
      title:     'Política de Cookies',
      meta:      'Última actualización: 6 de septiembre de 2026',
      prevails:  'La versión en español prevalece sobre cualquier traducción.',

      h1:        '1. Qué es una cookie',
      p1:        'Una cookie es un pequeño archivo que un sitio web guarda en tu navegador. Esta página explica cuáles usamos, para qué sirven y cómo puedes cambiar tu elección, conforme al artículo 22.2 de la LSSI y al RGPD.',

      h2:        '2. Cookies que usamos',
      thName:    'Nombre',
      thPurpose: 'Finalidad',
      thType:    'Tipo',
      thLife:    'Duración',

      c1Purpose: 'Mantiene tu sesión iniciada tras autenticarte.',
      c1Type:    'Necesaria',
      c1Life:    'Sesión',
      c2Purpose: 'Guarda tu elección sobre esta política de cookies.',
      c2Type:    'Necesaria',
      c2Life:    '180 días',
      c3Purpose: 'Recuerda el idioma que has elegido.',
      c3Type:    'Necesaria',
      c3Life:    '365 días',
      c4Purpose: 'Registra desde qué campaña o enlace llegaste (utm_source, utm_campaign, variante, referente), para saber qué mensaje funciona. No se comparte con terceros ni te sigue por otros sitios.',
      c4Type:    'Medición — solo con tu consentimiento',
      c4Life:    '30 días',
      c5Purpose: 'Cloudflare Turnstile, en los formularios públicos: distingue personas de bots. Cloudflare la considera estrictamente necesaria para la seguridad del formulario.',
      c5Type:    'Necesaria (proveedor: Cloudflare, Inc.)',
      c5Life:    'Hasta 30 minutos',

      h3:        '3. Almacenamiento local',
      p3:        'Además de cookies, guardamos en el almacenamiento local de tu navegador el tema visual elegido (claro/oscuro) y, dentro de la aplicación, la cola de subidas pendientes cuando estás sin conexión. Esa información no se envía a nuestros servidores ni identifica a nadie.',

      h4:        '4. Tu elección',
      p4:        'La cookie de medición solo se escribe si la aceptas en el aviso que aparece al entrar. Si eliges «Solo las necesarias» no se crea, y si ya existía se borra. Puedes cambiar de opinión en cualquier momento borrando las cookies de este sitio en tu navegador: el aviso volverá a aparecer.',
      p4b:       'Las cookies necesarias no se pueden desactivar desde el aviso porque sin ellas el inicio de sesión, el idioma y la protección antifraude de los formularios dejan de funcionar. Puedes bloquearlas desde la configuración de tu navegador, asumiendo que partes del servicio no funcionarán.',

      h5:        '5. Contacto',
      p5:        'Para cualquier duda sobre esta política: ',

      flPrivacy: 'Política de Privacidad',
      flTerms:   'Términos de Servicio',
      flHome:    'Inicio',
    },
    en: {
      pageTitle: 'Cookie Policy · Mise en Place',
      back:      '← Back',
      title:     'Cookie Policy',
      meta:      'Last updated: September 6, 2026',
      prevails:  'The Spanish version prevails over any translation.',

      h1:        '1. What a cookie is',
      p1:        'A cookie is a small file a website stores in your browser. This page explains which ones we use, what they do, and how to change your choice, in line with article 22.2 of the Spanish LSSI and with the GDPR.',

      h2:        '2. Cookies we use',
      thName:    'Name',
      thPurpose: 'Purpose',
      thType:    'Type',
      thLife:    'Lifetime',

      c1Purpose: 'Keeps you signed in after you authenticate.',
      c1Type:    'Necessary',
      c1Life:    'Session',
      c2Purpose: 'Stores your choice about this cookie policy.',
      c2Type:    'Necessary',
      c2Life:    '180 days',
      c3Purpose: 'Remembers the language you picked.',
      c3Type:    'Necessary',
      c3Life:    '365 days',
      c4Purpose: 'Records which campaign or link you arrived from (utm_source, utm_campaign, variant, referrer), so we know which message works. It is not shared with third parties and does not follow you across other sites.',
      c4Type:    'Measurement — only with your consent',
      c4Life:    '30 days',
      c5Purpose: 'Cloudflare Turnstile, on public forms: tells people apart from bots. Cloudflare treats it as strictly necessary to the security of the form.',
      c5Type:    'Necessary (provider: Cloudflare, Inc.)',
      c5Life:    'Up to 30 minutes',

      h3:        '3. Local storage',
      p3:        'Besides cookies, we keep your chosen visual theme (light/dark) in your browser local storage and, inside the app, the queue of uploads pending while you are offline. That information is never sent to our servers and identifies nobody.',

      h4:        '4. Your choice',
      p4:        'The measurement cookie is written only if you accept it in the notice shown on arrival. If you choose "Necessary only" it is not created, and any existing one is deleted. You can change your mind at any time by clearing this site’s cookies in your browser: the notice will appear again.',
      p4b:       'Necessary cookies cannot be switched off from the notice, because without them sign-in, language and the anti-fraud protection on forms stop working. You can block them from your browser settings, accepting that parts of the service will not work.',

      h5:        '5. Contact',
      p5:        'For any question about this policy: ',

      flPrivacy: 'Privacy Policy',
      flTerms:   'Terms of Service',
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
    <table>
      <thead>
        <tr>
          <th>{c.thName}</th>
          <th>{c.thPurpose}</th>
          <th>{c.thType}</th>
          <th>{c.thLife}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><code>authjs.session-token</code></td>
          <td>{c.c1Purpose}</td>
          <td>{c.c1Type}</td>
          <td>{c.c1Life}</td>
        </tr>
        <tr>
          <td><code>mep_consent</code></td>
          <td>{c.c2Purpose}</td>
          <td>{c.c2Type}</td>
          <td>{c.c2Life}</td>
        </tr>
        <tr>
          <td><code>mep-locale</code></td>
          <td>{c.c3Purpose}</td>
          <td>{c.c3Type}</td>
          <td>{c.c3Life}</td>
        </tr>
        <tr>
          <td><code>mep_attr</code></td>
          <td>{c.c4Purpose}</td>
          <td>{c.c4Type}</td>
          <td>{c.c4Life}</td>
        </tr>
        <tr>
          <td><code>cf_clearance</code></td>
          <td>{c.c5Purpose}</td>
          <td>{c.c5Type}</td>
          <td>{c.c5Life}</td>
        </tr>
      </tbody>
    </table>

    <h2>{c.h3}</h2>
    <p>{c.p3}</p>

    <h2>{c.h4}</h2>
    <p>{c.p4}</p>
    <p>{c.p4b}</p>

    <h2>{c.h5}</h2>
    <p>{c.p5}<a href="mailto:privacy@mise-place.com">privacy@mise-place.com</a></p>
  {/snippet}
  {#snippet footer()}
    <a href="/privacy">{c.flPrivacy}</a> ·
    <a href="/terms">{c.flTerms}</a> ·
    <a href="/">{c.flHome}</a>
  {/snippet}
</LegalPage>
