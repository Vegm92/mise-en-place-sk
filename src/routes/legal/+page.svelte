<script lang="ts">
  import { locale } from '$lib/i18n';
  import LegalPage from '$lib/components/legal/LegalPage.svelte';
  import { LEGAL_ENTITY, entityIsRegistered } from '$lib/legal-entity';

  const e = LEGAL_ENTITY;
  const registered = entityIsRegistered(e);

  const copy = {
    es: {
      pageTitle: 'Aviso Legal · Mise en Place',
      back:      '← Volver',
      title:     'Aviso Legal',
      meta:      'Última actualización: 6 de septiembre de 2026',
      prevails:  'La versión en español prevalece sobre cualquier traducción.',

      h1:        '1. Datos identificativos del prestador',
      p1:        'En cumplimiento del artículo 10 de la Ley 34/2002, de servicios de la sociedad de la información y de comercio electrónico (LSSI-CE), se facilitan los siguientes datos:',
      lTrade:    'Denominación comercial',
      lLegal:    'Denominación social',
      lTaxId:    'NIF',
      lAddress:  'Domicilio',
      lRegistry: 'Registro Mercantil',
      lEmail:    'Correo de contacto',
      lCity:     'Localidad',
      pending:   'Mise en Place se encuentra en fase previa al lanzamiento comercial y todavía no opera como sociedad constituida. Los datos registrales se publicarán aquí en cuanto se complete la constitución; hasta entonces no se presta ningún servicio de pago ni se emite factura.',

      h2:        '2. Objeto',
      p2:        'Este sitio ofrece información sobre Mise en Place, una plataforma de digitalización de albaranes y control de costes para hostelería, y permite apuntarse a su lista de acceso anticipado y crear una cuenta.',

      h3:        '3. Condiciones de uso',
      p3a:       'El uso del servicio se rige por los ',
      p3Terms:   'Términos de Servicio',
      p3b:       ', el tratamiento de datos personales por la ',
      p3Privacy: 'Política de Privacidad',
      p3c:       ' y el uso de cookies por la ',
      p3Cookies: 'Política de Cookies',
      p3d:       '.',

      h4:        '4. Propiedad intelectual e industrial',
      p4:        'El código, el diseño, la marca y los textos de este sitio pertenecen a sus titulares y no pueden reproducirse sin autorización. Los iconos proceden de la biblioteca Lucide, distribuida bajo licencia ISC. La tipografía Mona Sans se distribuye bajo licencia SIL Open Font License 1.1. No se utilizan fotografías de terceros en este sitio: todas las ilustraciones de producto son maquetas generadas por la propia aplicación.',

      h5:        '5. Responsabilidad',
      p5:        'No respondemos de los daños derivados del uso del sitio por parte del usuario ni de las interrupciones ajenas a nuestro control. Los límites de responsabilidad aplicables al servicio contratado figuran en los Términos de Servicio.',

      h6:        '6. Legislación aplicable',
      p6:        'Este aviso legal se rige por la legislación española.',

      h7:        '7. Contacto',
      p7:        'Para cualquier comunicación relativa a este sitio: ',

      flTerms:   'Términos de Servicio',
      flPrivacy: 'Política de Privacidad',
      flCookies: 'Política de Cookies',
      flHome:    'Inicio',
    },
    en: {
      pageTitle: 'Legal Notice · Mise en Place',
      back:      '← Back',
      title:     'Legal Notice',
      meta:      'Last updated: September 6, 2026',
      prevails:  'The Spanish version prevails over any translation.',

      h1:        '1. Identifying details of the provider',
      p1:        'In compliance with article 10 of Spanish Law 34/2002 on information society services and electronic commerce (LSSI-CE), the following details are provided:',
      lTrade:    'Trading name',
      lLegal:    'Registered name',
      lTaxId:    'Tax ID',
      lAddress:  'Registered address',
      lRegistry: 'Companies Register',
      lEmail:    'Contact email',
      lCity:     'Location',
      pending:   'Mise en Place is pre-launch and does not yet operate as an incorporated company. Registration details will be published here as soon as incorporation completes; until then no paid service is provided and no invoice is issued.',

      h2:        '2. Purpose',
      p2:        'This site provides information about Mise en Place, a delivery-note digitisation and cost-control platform for hospitality, and lets you join its early-access list and create an account.',

      h3:        '3. Terms of use',
      p3a:       'Use of the service is governed by the ',
      p3Terms:   'Terms of Service',
      p3b:       ', the processing of personal data by the ',
      p3Privacy: 'Privacy Policy',
      p3c:       ' and the use of cookies by the ',
      p3Cookies: 'Cookie Policy',
      p3d:       '.',

      h4:        '4. Intellectual and industrial property',
      p4:        'The code, design, branding and text of this site belong to their owners and may not be reproduced without permission. Icons come from the Lucide library, distributed under the ISC licence. The Mona Sans typeface is distributed under the SIL Open Font License 1.1. No third-party photography is used on this site: every product illustration is a mockup generated by the application itself.',

      h5:        '5. Liability',
      p5:        'We are not liable for damage arising from the user’s use of the site, nor for interruptions outside our control. The liability limits applicable to the contracted service are set out in the Terms of Service.',

      h6:        '6. Governing law',
      p6:        'This legal notice is governed by Spanish law.',

      h7:        '7. Contact',
      p7:        'For any communication regarding this site: ',

      flTerms:   'Terms of Service',
      flPrivacy: 'Privacy Policy',
      flCookies: 'Cookie Policy',
      flHome:    'Home',
    },
  } as const;

  const c = $derived(copy[locale.current]);
</script>

<LegalPage pageTitle={c.pageTitle} back={c.back} title={c.title} meta={c.meta} prevails={c.prevails}>
  {#snippet children()}
    <h2>{c.h1}</h2>
    <p>{c.p1}</p>
    <ul>
      <li><strong>{c.lTrade}:</strong> {e.tradeName}</li>
      {#if e.legalName}<li><strong>{c.lLegal}:</strong> {e.legalName}</li>{/if}
      {#if e.taxId}<li><strong>{c.lTaxId}:</strong> {e.taxId}</li>{/if}
      {#if e.registeredAddress}<li><strong>{c.lAddress}:</strong> {e.registeredAddress}</li>{/if}
      {#if e.companyRegistry}<li><strong>{c.lRegistry}:</strong> {e.companyRegistry}</li>{/if}
      <li><strong>{c.lEmail}:</strong> <a href="mailto:{e.contactEmail}">{e.contactEmail}</a></li>
      <li><strong>{c.lCity}:</strong> {e.city}, {e.country}</li>
    </ul>
    {#if !registered}
      <p>{c.pending}</p>
    {/if}

    <h2>{c.h2}</h2>
    <p>{c.p2}</p>

    <h2>{c.h3}</h2>
    <p>
      {c.p3a}<a href="/terms">{c.p3Terms}</a>{c.p3b}<a href="/privacy">{c.p3Privacy}</a>{c.p3c}<a href="/cookies">{c.p3Cookies}</a>{c.p3d}
    </p>

    <h2>{c.h4}</h2>
    <p>{c.p4}</p>

    <h2>{c.h5}</h2>
    <p>{c.p5}</p>

    <h2>{c.h6}</h2>
    <p>{c.p6}</p>

    <h2>{c.h7}</h2>
    <p>{c.p7}<a href="mailto:{e.contactEmail}">{e.contactEmail}</a></p>
  {/snippet}
  {#snippet footer()}
    <a href="/terms">{c.flTerms}</a> ·
    <a href="/privacy">{c.flPrivacy}</a> ·
    <a href="/cookies">{c.flCookies}</a> ·
    <a href="/">{c.flHome}</a>
  {/snippet}
</LegalPage>
