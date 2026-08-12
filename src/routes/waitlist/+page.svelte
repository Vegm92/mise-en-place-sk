<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import Sun from '@lucide/svelte/icons/sun';
  import Moon from '@lucide/svelte/icons/moon';
  import type { ActionData, PageData } from './$types';
  import EmailForm from '$lib/components/waitlist/EmailForm.svelte';
  import CaptureMock from '$lib/components/waitlist/CaptureMock.svelte';
  import ExtractMock from '$lib/components/waitlist/ExtractMock.svelte';
  import DashboardMock from '$lib/components/waitlist/DashboardMock.svelte';
  import AppDashboardMock from '$lib/components/waitlist/AppDashboardMock.svelte';

  const { form, data }: { form: ActionData; data: PageData } = $props();

  let theme = $state<'light' | 'dark'>(
    browser ? ((document.documentElement.dataset.theme as 'light' | 'dark') || 'light') : 'light'
  );

  onMount(() => {
    const storedTheme = localStorage.getItem('mep-theme') as 'light' | 'dark' | null;
    if (storedTheme && storedTheme !== theme) theme = storedTheme;
  });

  function toggleTheme() {
    theme = theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('mep-theme', theme);
    document.documentElement.dataset.theme = theme;
  }

  const copy = {
    es: {
      pageTitle:         'Mise en Place — Gestión de facturas para restaurantes',
      metaDescription:   'Digitaliza tus albaranes en segundos. Detecta subidas de precio, controla el gasto por categoría y defiende tu margen. Edición de fundadores — 50 cocinas, Barcelona.',
      ogTitle:           'Sabe en qué gasta tu cocina, antes que tú.',
      ogLocale:          'es_ES',
      betaBadge:         'Beta privada',
      signInLink:        'Entrar a la app →',
      ctaNav:            'Apuntarme',
      eyebrow:           'Control operativo para cocinas profesionales',
      headline:          'Sabe en qué gasta tu cocina, antes que tú.',
      sub:               'Factura tras factura, Mise en Place lee, normaliza y vigila tus precios. Tu margen, defendido cada día.',
      placeholder:       'tu@email.com',
      submit:            'Quiero acceso anticipado',
      submitShort:       'Apuntarme',
      success:           'Estás dentro.',
      successBody:       'Te escribiremos en cuanto abramos un sitio. Vigila tu bandeja.',
      alreadyReg:        'Ya estás en la lista. Te avisamos en cuanto abramos un sitio.',
      errRequired:       'Introduce tu email para continuar.',
      errInvalid:        'Ese email no parece válido.',
      errRateLimited:    'Demasiados intentos. Por favor, espera un momento.',
      privacy:           'Solo guardamos tu email. Sin spam. Sin compromisos.',
      spotTaken:         43,
      spotTotal:         50,
      spotLabel:         'plazas prioritarias asignadas',
      painEyebrow:       'El problema',
      painHead:          'Cada semana se te escapan horas, datos y dinero.',
      pain: [
        { stat: '4–6 h', label: 'a la semana',      title: 'Tu equipo transcribe facturas a mano.',          body: 'Cada albarán acaba en una hoja de cálculo —o en un cajón. Son entre cuatro y seis horas semanales que no cocinan, no entrenan, no atienden.' },
        { stat: '¿0?',   label: 'visibilidad',       title: 'Nadie sabe en qué se gastó la semana.',         body: '¿Cuánto cárnico llevamos este mes? Sin sistema, esa respuesta tarda treinta minutos. Con Mise en Place, está en pantalla antes de que termines la pregunta.' },
        { stat: '+8 %',  label: 'subidas invisibles', title: 'Los proveedores te suben el precio en silencio.', body: 'El aceite sube un ocho por ciento un martes cualquiera. Lo descubres tres meses después, revisando facturas. Mise en Place detecta el cambio y te avisa el mismo día.' },
      ],
      howEyebrow:        'Cómo funciona',
      howHead:           'Tres movimientos. Cero hojas de cálculo.',
      steps: [
        { num: '01', tag: 'Captura',    title: 'Una foto al albarán, o el PDF a la web.',       body: 'Desde el móvil del repartidor, por WhatsApp, o arrastrando el PDF al panel. Sin instalaciones. Sin app que recordar abrir.' },
        { num: '02', tag: 'Inferencia', title: 'El Cerebro de Cocina extrae y normaliza.',       body: 'Proveedor, fechas, IVA, y cada línea con su producto, cantidad y precio. Los nombres se normalizan para que tu inventario sea perfecto.' },
        { num: '03', tag: 'Poder',      title: 'Tu panel se ilumina con datos que importan.',    body: 'Gasto por categoría. Alertas de precio. Integración con tu TPV (Square / Revo) para restar el stock vendido. Tu margen, en tiempo real.' },
      ],
      testimonialsEyebrow: 'Lo que dicen los chefs',
      testimonials: [
        { quote: 'Cada semana pierdo horas pasando facturas a mano. Si funciona como dices, lo firmo ahora mismo.', name: 'Jordi M.',  role: 'Jefe de Cocina · Restaurante de menú · Barcelona' },
        { quote: 'Lo difícil no es gastar. Lo difícil es saber en qué gastas. Nunca tengo esa visión en tiempo real.', name: 'Ana R.', role: 'Responsable de Compras · Hotel boutique · Costa Brava' },
        { quote: 'Si me ahorras el viernes de papeleo, me ahorras una jornada entera del equipo de oficina.',          name: 'Iván C.', role: 'Gerente · Grupo de cuatro locales · Eixample' },
      ],
      founderEyebrow:    'Una nota del fundador',
      founderBody:       'Pasé años en cocinas y en restaurantes como chef y ayudando con la administración. La factura es el documento más maltratado de la industria: nadie la quiere, todos la necesitan. Mise en Place existe para que esa hora del viernes deje de existir.',
      founderName:       'Victor Granda Mancebo',
      founderRole:       'Fundador · Barcelona',
      pricingEyebrow:    'Precios',
      pricingTitle:      'Un plan por cada etapa de la cocina',
      pricingSub:        'Empieza digitalizando gratis. Añade la capa de inteligencia cuando el volumen lo justifique. Precios por restaurante, provisionales hasta el lanzamiento público.',
      pricingProvisional:'precio provisional',
      pricingPerMonth:   '/mes',
      pricingCta:        'Apuntarme',
      pricingRecommended:'Recomendado',
      pricingFoot:       'Todos los planes incluyen digitalización de facturas, vista de gasto por proveedor y soporte en español.',
      pricingTrialName:  'Prueba',
      pricingTrialPrice: 'Gratis',
      pricingTrialLimit: '30 días o 20 facturas · sin tarjeta',
      pricingTrialTagline: 'Prueba el flujo completo de digitalización.',
      pricingTiers: [
        { name: 'Starter', price: 29, recommended: false, tagline: 'Digitaliza y controla el gasto de un restaurante.',
          bullets: ['100 facturas al mes', 'Vista de gasto por categoría y proveedor', '1 restaurante'] },
        { name: 'Pro', price: 59, recommended: true, tagline: 'Todo lo de Starter, más la capa de inteligencia.',
          bullets: ['300 facturas al mes', 'Resumen automático por email', 'Asistente IA sobre tus datos', 'Análisis de precios y control de stock'] },
        { name: 'Business', price: 129, recommended: false, tagline: 'Las mismas funciones, para un grupo de restaurantes.',
          bullets: ['Facturas ilimitadas', 'Hasta 5 restaurantes', 'Soporte prioritario'] },
      ],
      faqEyebrow:        'Dudas frecuentes',
      faq: [
        { q: '¿Qué pasa con mis datos?', a: 'Tus facturas son tuyas. Las almacenamos cifradas en servidores en la UE y puedes exportarlas o eliminarlas en cualquier momento. Nunca las usaremos para entrenar modelos públicos.' },
        { q: '¿Necesito cambiar mi software de TPV?', a: 'No. Mise en Place se conecta a Square y Revo desde el primer día, y exporta a Excel/CSV para el resto. Si usas otro TPV, escríbenos —probablemente lo integremos pronto.' },
        { q: '¿Y si el albarán está manchado o arrugado?', a: 'Esa es nuestra especialidad. El motor lee fotos de móvil hechas con prisas en una cocina caliente. Si algo no se entiende, te lo señala para que lo confirmes tú —no inventa.' },
        { q: '¿Cuánto cuesta?', a: 'Durante el acceso anticipado es gratis. Al lanzamiento: Starter 29 €, Pro 59 € y Business 129 € al mes por restaurante — precios provisionales, pueden ajustarse antes del lanzamiento público.' },
        { q: '¿Cuándo empieza el acceso?', a: 'Abrimos en tandas a partir de julio de 2026. Avisamos por email con al menos una semana de antelación.' },
      ],
      closeHead:         'Empieza por la factura de esta semana.',
      closeSub:          'Deja tu email y te avisamos cuando abramos la siguiente tanda de cocinas.',
      footerNote:        'Mise en Place · Barcelona · 2026 — Hecho en una cocina, no en una sala de juntas.',
      mockWhatsappReply: 'Recibida ✓ · Procesando 14 líneas…',
      mockConfirmed:     '✓ Confirmada',
      mockExtractedIn:   'extraído en 2,3 s',
      mockLinesVat:      '14 líneas · IVA 10 %',
      mockSpendLabel:    'Gasto · últimas 7 semanas',
      mockCatMeat:       'Carne',
      mockCatFish:       'Pescado',
      mockCatVeg:        'Verdura',
      mockAlertTitle:    'Aceite de oliva virgen · +8,1 % esta semana',
      mockReview:        'Revisar',
      mockKpiSpend:      'Gasto del mes',
      mockKpiAvg:        'Media / proveedor',
      mockKpiPending:    'Pendiente',
      mockKpiBudget:     'Presupuesto',
      mockKpiOf:         'de',
      mockKpiInvoicesShort: 'facturas',
      mockChartTitle:    'Evolución del gasto',
    },
    en: {
      pageTitle:         'Mise en Place — Invoice Management for Restaurants',
      metaDescription:   'Digitise your delivery notes in seconds. Detect price rises, track spend by category and defend your margin. Founders edition — 50 kitchens, Barcelona.',
      ogTitle:           'Know what your kitchen spends, before you do.',
      ogLocale:          'en_US',
      betaBadge:         'Private beta',
      signInLink:        'Sign in →',
      ctaNav:            'Sign me up',
      eyebrow:           'Operational control for professional kitchens',
      headline:          'Know what your kitchen spends, before you do.',
      sub:               'Invoice after invoice, Mise en Place reads, normalises, and watches your prices. Your margin, defended every day.',
      placeholder:       'you@email.com',
      submit:            'I want early access',
      submitShort:       'Sign me up',
      success:           "You're in.",
      successBody:       "We'll reach out as soon as a spot opens. Watch your inbox.",
      alreadyReg:        "You're already on the list. We'll let you know when a spot opens.",
      errRequired:       'Enter your email to continue.',
      errInvalid:        "That doesn't look like a valid email.",
      errRateLimited:    'Too many attempts. Please wait a moment.',
      privacy:           'We only store your email. No spam. No commitment.',
      spotTaken:         43,
      spotTotal:         50,
      spotLabel:         'priority spots claimed',
      painEyebrow:       'The problem',
      painHead:          'Every week you lose hours, data, and money.',
      pain: [
        { stat: '4–6 h', label: 'per week',        title: 'Your team transcribes invoices by hand.',      body: "Every delivery note ends up in a spreadsheet — or a drawer. That's four to six hours a week not cooking, not training, not serving." },
        { stat: '¿0?',   label: 'visibility',       title: 'Nobody knows what was spent this week.',      body: "How much meat have we ordered this month? Without a system, answering that takes thirty minutes. With Mise en Place, it's on screen before you finish the question." },
        { stat: '+8 %',  label: 'invisible hikes',  title: 'Suppliers raise prices without telling you.',  body: 'Olive oil goes up eight percent on a random Tuesday. You find out three months later. Mise en Place spots the change and alerts you the same day.' },
      ],
      howEyebrow:        'How it works',
      howHead:           'Three moves. Zero spreadsheets.',
      steps: [
        { num: '01', tag: 'Capture',   title: 'A photo of the note, or the PDF to the web.',      body: "From the delivery driver's phone, via WhatsApp, or dragging the PDF into the panel. No install. No app to remember to open." },
        { num: '02', tag: 'Inference', title: 'The Kitchen Brain extracts and normalises.',         body: 'Supplier, dates, VAT, and every line with its product, quantity and price. Names are normalised so your inventory is perfect.' },
        { num: '03', tag: 'Power',     title: 'Your dashboard lights up with data that matters.',   body: 'Spend by category. Price alerts. Integration with your POS (Square / Revo) to deduct sold stock. Your margin, in real time.' },
      ],
      testimonialsEyebrow: 'What chefs are saying',
      testimonials: [
        { quote: "Every week I lose hours entering invoices by hand. If this works the way you describe, I'd sign right now.", name: 'Jordi M.',  role: 'Head Chef · Set-menu restaurant · Barcelona' },
        { quote: "The hard part isn't spending. It's knowing what you're spending on. I never have that visibility in real time.", name: 'Ana R.', role: 'Purchasing Manager · Boutique hotel · Costa Brava' },
        { quote: 'If you save me Friday paperwork, you save me a full day of office staff.',                                          name: 'Iván C.', role: 'General Manager · 4-venue group · Eixample' },
      ],
      founderEyebrow:    'A note from the founder',
      founderBody:       "I spent three years in kitchens and two in restaurants helping with admin. The invoice is the most mistreated document in the industry: nobody wants it, everybody needs it. Mise en Place exists so that Friday hour stops existing.",
      founderName:       'Víctor Egea Martínez',
      founderRole:       'Founder · Barcelona',
      pricingEyebrow:    'Pricing',
      pricingTitle:      'A plan for each stage of the kitchen',
      pricingSub:        'Start by digitising for free. Add the intelligence layer once volume justifies it. Priced per restaurant, provisional until public launch.',
      pricingProvisional:'provisional price',
      pricingPerMonth:   '/mo',
      pricingCta:        'Sign me up',
      pricingRecommended:'Recommended',
      pricingFoot:       'Every plan includes invoice digitisation, spend-by-supplier view, and human support.',
      pricingTrialName:  'Trial',
      pricingTrialPrice: 'Free',
      pricingTrialLimit: '30 days or 20 invoices · no card',
      pricingTrialTagline: 'Try the whole digitisation flow.',
      pricingTiers: [
        { name: 'Starter', price: 29, recommended: false, tagline: 'Digitise invoices and see where the money goes.',
          bullets: ['100 invoices per month', 'Spend by category and supplier', '1 restaurant'] },
        { name: 'Pro', price: 59, recommended: true, tagline: 'Everything in Starter, plus the intelligence layer.',
          bullets: ['300 invoices per month', 'Automatic email digest', 'AI assistant over your data', 'Price analytics and stock tracking'] },
        { name: 'Business', price: 129, recommended: false, tagline: 'The same features, across a group of restaurants.',
          bullets: ['Unlimited invoices', 'Up to 5 restaurants', 'Priority support'] },
      ],
      faqEyebrow:        'Frequently asked questions',
      faq: [
        { q: 'What happens to my data?', a: 'Your invoices are yours. We store them encrypted on servers in the EU and you can export or delete them at any time. We will never use them to train public models.' },
        { q: 'Do I need to change my POS software?', a: 'No. Mise en Place connects to Square and Revo from day one, and exports to Excel/CSV for the rest. If you use another POS, write to us — we probably integrate it soon.' },
        { q: 'What if the delivery note is stained or crumpled?', a: "That's our specialty. The engine reads phone photos taken in a rush in a hot kitchen. If something is unclear, it flags it for you to confirm — it never makes things up." },
        { q: 'How much does it cost?', a: 'Free during early access. At launch: Starter €29, Pro €59, and Business €129 per month per restaurant — provisional prices, may adjust before public launch.' },
        { q: 'When does access start?', a: 'We open in batches from July 2026. We notify by email at least a week in advance.' },
      ],
      closeHead:         "Start with this week's invoice.",
      closeSub:          "Leave your email and we'll let you know when we open the next batch of kitchens.",
      footerNote:        'Mise en Place · Barcelona · 2026 — Built in a kitchen, not a boardroom.',
      mockWhatsappReply: 'Received ✓ · Processing 14 lines…',
      mockConfirmed:     '✓ Confirmed',
      mockExtractedIn:   'extracted in 2.3 s',
      mockLinesVat:      '14 lines · 10% VAT',
      mockSpendLabel:    'Spend · last 7 weeks',
      mockCatMeat:       'Meat',
      mockCatFish:       'Fish',
      mockCatVeg:        'Vegetables',
      mockAlertTitle:    'Virgin olive oil · +8.1% this week',
      mockReview:        'Review',
      mockKpiSpend:      'Month spend',
      mockKpiAvg:        'Avg / supplier',
      mockKpiPending:    'Pending',
      mockKpiBudget:     'Budget',
      mockKpiOf:         'of',
      mockKpiInvoicesShort: 'invoices',
      mockChartTitle:    'Spend trend',
    },
  } as const;

  type Locale = keyof typeof copy;
  let locale = $state<Locale>('es');
  const t = $derived(copy[locale]);
  const otherLang = $derived(locale === 'es' ? 'EN' : 'ES');
  function toggleLocale() { locale = locale === 'es' ? 'en' : 'es'; }

  let openFaq = $state(0);

  const spotPct = $derived((t.spotTaken / t.spotTotal) * 100);
</script>

<svelte:head>
  <title>{t.pageTitle}</title>
  <meta name="description" content={t.metaDescription} />
  <link rel="canonical" href={data.canonicalUrl} />

  <meta property="og:type"        content="website" />
  <meta property="og:url"         content={data.canonicalUrl} />
  <meta property="og:site_name"   content="Mise en Place" />
  <meta property="og:title"       content={t.ogTitle} />
  <meta property="og:description" content={t.metaDescription} />
  <meta property="og:locale"      content={t.ogLocale} />

  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content={t.ogTitle} />
  <meta name="twitter:description" content={t.metaDescription} />

  {@html `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: 'Mise en Place',
        url: data.canonicalUrl.replace('/waitlist', ''),
        inLanguage: locale === 'es' ? 'es' : 'en',
        potentialAction: { '@type': 'RegisterAction', target: data.canonicalUrl + '#join' },
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Mise en Place',
        description: t.metaDescription,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR', description: locale === 'es' ? 'Edición de fundadores — lista de espera' : 'Founders edition — waitlist' },
        creator: { '@type': 'Organization', name: 'Mise en Place', address: { '@type': 'PostalAddress', addressLocality: 'Barcelona', addressCountry: 'ES' } },
      },
    ],
  })}</script>`}
</svelte:head>

<div class="mep" data-accent="amber"
  style="width:100%;min-height:100vh;background:var(--mep-bg);color:var(--mep-fg);font-family:inherit;">

  <nav class="mep-nav" style="display:flex;align-items:center;gap:14px;padding:16px 32px;
              border-bottom:1px solid var(--mep-divider);">
    <div style="display:flex;align-items:center;gap:10px;">
      <svg width="18" height="18" viewBox="0 0 24 24" style="color:var(--mep-acc);flex-shrink:0;">
        <rect x="2.5"  y="3.5" width="3" height="17" rx="1.5" fill="currentColor"/>
        <rect x="10.5" y="3.5" width="3" height="13" rx="1.5" fill="currentColor"/>
        <rect x="18.5" y="3.5" width="3" height="9"  rx="1.5" fill="currentColor"/>
      </svg>
      <span style="font-size:17px;font-weight:600;letter-spacing:-0.2px;color:var(--mep-fg);">Mise en Place</span>
    </div>
    <span style="font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;
                 color:var(--mep-acc);padding:2px 7px;border-radius:4px;
                 background:var(--mep-acc-soft);font-family:var(--mep-fs-mono);">{t.betaBadge}</span>
    <div style="flex:1;"></div>
    <a href="/login" class="mep-nav-signin" style="font-size:13.5px;font-weight:500;color:var(--mep-fg-2);text-decoration:none;
                            white-space:nowrap;">{t.signInLink}</a>
    <button onclick={toggleTheme} aria-label="Toggle theme" style="width:28px;height:28px;flex-shrink:0;
                border-radius:999px;border:1px solid var(--mep-border);background:var(--mep-surface);
                display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--mep-fg-2);">
      {#if theme === 'dark'}<Sun size={14} />{:else}<Moon size={14} />{/if}
    </button>
    <div style="display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;
                border:1px solid var(--mep-border);background:var(--mep-surface);
                font-size:11.5px;font-weight:600;letter-spacing:0.06em;color:var(--mep-fg-2);
                font-family:var(--mep-fs-mono);gap:8px;">
      <button onclick={toggleLocale} style="background:transparent;border:none;cursor:pointer;
                                            padding:0;font-family:inherit;font-size:inherit;
                                            font-weight:inherit;letter-spacing:inherit;
                                            color:var(--mep-fg-2);">{otherLang}</button>
    </div>
    <a href="#join" class="btn btn-primary" style="height:32px;padding:0 14px;font-size:13px;
                                                    font-weight:600;text-decoration:none;">{t.ctaNav}</a>
  </nav>

  <section class="mep-section mep-hero" style="padding:108px 72px 96px;text-align:center;">
    <div class="mep-hero-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:56px;
                align-items:center;max-width:1180px;margin:0 auto;">
      <div>
        <div style="max-width:560px;margin:0 auto;">
          <div style="font-size:12px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;
                      color:var(--mep-acc);font-family:var(--mep-fs-mono);margin-bottom:26px;">
            {t.eyebrow}
          </div>
          <h1 style="margin:0;font-size:clamp(40px,5.6vw,59.5px);font-weight:600;color:var(--mep-fg);
                     letter-spacing:-0.035em;line-height:1.08;text-wrap:balance;">
            {t.headline}
          </h1>
          <p style="margin:22px auto 0;max-width:560px;font-size:18.5px;line-height:1.6;
                    color:var(--mep-fg-2);text-wrap:pretty;">
            {t.sub}
          </p>
        </div>

        <div style="max-width:460px;margin:40px auto 0;" id="join">
          <EmailForm big={true} {form} copy={t} />
        </div>
        <div class="mep-spotbar" style="max-width:460px;margin:18px auto 0;display:flex;align-items:center;gap:14px;
                    padding:10px 14px;border-radius:10px;background:var(--mep-surface);
                    border:1px solid var(--mep-divider);">
          <div style="display:flex;align-items:baseline;gap:6px;">
            <span style="font-size:24px;font-weight:700;color:var(--mep-acc);letter-spacing:-0.6px;
                         line-height:1;font-family:var(--mep-fs-mono);">{t.spotTaken}</span>
            <span style="font-size:15px;color:var(--mep-fg-3);font-family:var(--mep-fs-mono);">/ {t.spotTotal}</span>
          </div>
          <div style="flex:1;min-width:120px;">
            <div style="font-size:12px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.06em;
                        font-weight:500;margin-bottom:5px;font-family:var(--mep-fs-mono);">{t.spotLabel}</div>
            <div style="width:100%;height:5px;border-radius:3px;background:var(--mep-hover);overflow:hidden;">
              <div style="width:{spotPct}%;height:100%;background:var(--mep-acc);border-radius:3px;"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="mep-hero-visual">
        <AppDashboardMock copy={t} />
      </div>
    </div>
  </section>

  <section class="mep-section" style="padding:76px 72px;background:var(--mep-surface-2);
                  border-top:1px solid var(--mep-divider);border-bottom:1px solid var(--mep-divider);">
    <div style="max-width:1000px;margin:0 auto;">
      <div style="font-size:12px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;
                  color:var(--mep-acc);font-family:var(--mep-fs-mono);margin-bottom:14px;">{t.painEyebrow}</div>
      <h2 style="margin:0;max-width:640px;font-size:clamp(31px,3.8vw,37.5px);font-weight:600;
                 color:var(--mep-fg);letter-spacing:-0.025em;line-height:1.15;">{t.painHead}</h2>
      <div class="mep-grid-3" style="margin-top:44px;display:grid;grid-template-columns:repeat(3,1fr);gap:40px;">
        {#each t.pain as p}
          <div style="padding-top:20px;border-top:1px solid var(--mep-border);">
            <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:14px;">
              <span style="font-size:44px;font-weight:700;color:var(--mep-fg);letter-spacing:-0.04em;
                           line-height:1;font-family:var(--mep-fs-mono);">{p.stat}</span>
              <span style="font-size:11.5px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;
                           color:var(--mep-fg-3);font-family:var(--mep-fs-mono);">{p.label}</span>
            </div>
            <div style="font-size:17px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.02em;
                        line-height:1.3;margin-bottom:10px;">{p.title}</div>
            <div style="font-size:14px;color:var(--mep-fg-2);line-height:1.6;">{p.body}</div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="mep-section" style="padding:88px 72px;">
    <div style="max-width:1000px;margin:0 auto;">
      <div style="font-size:12px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;
                  color:var(--mep-acc);font-family:var(--mep-fs-mono);margin-bottom:14px;">{t.howEyebrow}</div>
      <h2 style="margin:0 0 56px;max-width:640px;font-size:clamp(31px,3.8vw,37.5px);font-weight:600;
                 color:var(--mep-fg);letter-spacing:-0.025em;line-height:1.15;">{t.howHead}</h2>

      <div style="display:flex;flex-direction:column;gap:64px;">
        {#each t.steps as step, i}
          <div class="mep-how-row" style="display:grid;grid-template-columns:360px 1fr;gap:56px;align-items:center;">
            <div>
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;
                          font-size:12px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;
                          color:var(--mep-acc);font-family:var(--mep-fs-mono);">
                <span style="width:28px;height:20px;border-radius:4px;background:var(--mep-acc-soft);
                             display:flex;align-items:center;justify-content:center;">{step.num}</span>
                <span>{step.tag}</span>
              </div>
              <h3 style="margin:0;font-size:24px;font-weight:600;color:var(--mep-fg);
                         letter-spacing:-0.01em;line-height:1.25;">{step.title}</h3>
              <p style="margin:12px 0 0;font-size:15px;line-height:1.65;color:var(--mep-fg-2);">{step.body}</p>
            </div>
            <div>
              {#if i === 0}
                <CaptureMock whatsappReply={t.mockWhatsappReply} />
              {:else if i === 1}
                <ExtractMock copy={t} />
              {:else}
                <DashboardMock copy={t} />
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="mep-section" style="padding:76px 72px;background:var(--mep-surface-2);
                  border-top:1px solid var(--mep-divider);border-bottom:1px solid var(--mep-divider);">
    <div style="max-width:1000px;margin:0 auto;">
      <div style="font-size:12px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;
                  color:var(--mep-acc);font-family:var(--mep-fs-mono);margin-bottom:40px;">{t.testimonialsEyebrow}</div>
      <div class="mep-grid-3" style="display:grid;grid-template-columns:repeat(3,1fr);gap:40px;">
        {#each t.testimonials as item}
          <div style="padding-top:22px;border-top:1px solid var(--mep-border);">
            <p style="margin:0;font-size:17px;line-height:1.6;color:var(--mep-fg);letter-spacing:-0.005em;">
              &ldquo;{item.quote}&rdquo;
            </p>
            <div style="margin-top:18px;font-size:13.5px;color:var(--mep-fg-2);">
              <span style="font-weight:600;color:var(--mep-fg);">{item.name}</span>
            </div>
            <div style="font-size:12.5px;color:var(--mep-fg-3);margin-top:3px;">{item.role}</div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="mep-section" style="padding:76px 72px;">
    <div class="mep-founder-card" style="max-width:860px;margin:0 auto;display:flex;gap:24px;align-items:flex-start;
                padding:32px 36px;border-radius:16px;background:var(--mep-surface);border:1px solid var(--mep-divider);">
      <div style="width:92px;height:92px;border-radius:50%;flex-shrink:0;
                  background:linear-gradient(135deg,var(--mep-acc-soft) 0%,var(--mep-acc) 200%);
                  color:var(--mep-acc-fg);display:flex;align-items:center;justify-content:center;
                  font-size:31px;font-weight:700;font-family:var(--mep-fs-mono);letter-spacing:-1px;
                  border:1px solid var(--mep-border);">VE</div>
      <div style="flex:1;">
        <div style="font-size:11.5px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;
                    color:var(--mep-acc);font-family:var(--mep-fs-mono);margin-bottom:10px;">{t.founderEyebrow}</div>
        <p style="margin:0;font-size:19px;line-height:1.55;color:var(--mep-fg);letter-spacing:-0.005em;">
          &ldquo;{t.founderBody}&rdquo;
        </p>
        <div style="margin-top:14px;font-size:13px;color:var(--mep-fg-2);">
          <span style="font-weight:600;color:var(--mep-fg);">{t.founderName}</span>
          {' · '}
          <span style="color:var(--mep-fg-3);">{t.founderRole}</span>
        </div>
      </div>
    </div>
  </section>

  <section class="mep-section" style="padding:76px 72px;background:var(--mep-surface-2);border-top:1px solid var(--mep-divider);border-bottom:1px solid var(--mep-divider);">
    <div style="max-width:1080px;margin:0 auto;">
      <div style="font-size:12px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;
                  color:var(--mep-acc);font-family:var(--mep-fs-mono);margin-bottom:14px;">{t.pricingEyebrow}</div>
      <h2 style="margin:0;max-width:640px;font-size:clamp(31px,3.8vw,37.5px);font-weight:600;
                 color:var(--mep-fg);letter-spacing:-0.025em;line-height:1.15;">{t.pricingTitle}</h2>
      <p style="margin:14px 0 0;max-width:620px;font-size:15px;line-height:1.6;color:var(--mep-fg-2);text-wrap:pretty;">{t.pricingSub}</p>

      <div class="mep-grid-4" style="margin-top:44px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px;align-items:stretch;">
        <div class="card" style="padding:20px 20px 22px;display:flex;flex-direction:column;gap:14px;
                    background:transparent;border-style:dashed;box-shadow:none;">
          <div style="font-size:18px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.01em;">{t.pricingTrialName}</div>
          <div>
            <div class="num" style="font-size:35px;font-weight:600;letter-spacing:-0.025em;color:var(--mep-fg);line-height:1.1;">{t.pricingTrialPrice}</div>
            <div style="margin-top:8px;font-size:12.5px;color:var(--mep-fg-3);">{t.pricingTrialLimit}</div>
          </div>
          <div style="font-size:14px;color:var(--mep-fg-2);line-height:1.45;min-height:34px;">{t.pricingTrialTagline}</div>
          <a href="#join" class="btn btn-secondary" style="height:36px;justify-content:center;text-decoration:none;">{t.pricingCta}</a>
        </div>

        {#each t.pricingTiers as tier}
          <div class="card" style="padding:20px 20px 22px;display:flex;flex-direction:column;gap:14px;position:relative;
                      border-color:{tier.recommended ? 'var(--mep-acc)' : 'var(--mep-border)'};
                      box-shadow:{tier.recommended ? '0 0 0 1px var(--mep-acc), var(--mep-shadow-card)' : 'var(--mep-shadow-card)'};">
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="font-size:18px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.01em;">{tier.name}</div>
              {#if tier.recommended}
                <span style="background:var(--mep-acc);color:var(--mep-acc-fg);font-size:12px;font-weight:500;padding:2px 7px;border-radius:var(--mep-r-tag);">{t.pricingRecommended}</span>
              {/if}
            </div>
            <div>
              <div style="display:flex;align-items:baseline;gap:6px;">
                <span class="num" style="font-size:35px;font-weight:600;letter-spacing:-0.025em;color:var(--mep-fg);
                  border-bottom:2px dotted var(--mep-border-strong);line-height:1.1;">{tier.price} €</span>
                <span style="font-size:14px;color:var(--mep-fg-3);">{t.pricingPerMonth}</span>
              </div>
              <div style="margin-top:8px;">
                <span style="display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:500;
                  letter-spacing:0.02em;text-transform:uppercase;color:var(--mep-fg-3);
                  border:1px dashed var(--mep-border-strong);border-radius:4px;padding:1px 5px;">
                  {t.pricingProvisional}
                </span>
              </div>
            </div>
            <div style="font-size:14px;color:var(--mep-fg-2);line-height:1.45;min-height:34px;">{tier.tagline}</div>
            <a href="#join" class={tier.recommended ? 'btn btn-primary' : 'btn btn-secondary'} style="height:36px;justify-content:center;text-decoration:none;">{t.pricingCta}</a>
            <div style="height:1px;background:var(--mep-divider);"></div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              {#each tier.bullets as bullet}
                <div style="display:flex;gap:8px;align-items:flex-start;font-size:14px;color:var(--mep-fg-2);">
                  <span style="color:{tier.recommended ? 'var(--mep-acc)' : 'var(--mep-fg-3)'};margin-top:1px;flex-shrink:0;">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5l3.5 3.5L16 5.5"/></svg>
                  </span>
                  <span style="line-height:1.4;">{bullet}</span>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <p style="margin:32px 0 0;font-size:13.5px;color:var(--mep-fg-3);line-height:1.6;max-width:780px;text-wrap:pretty;">{t.pricingFoot}</p>
    </div>
  </section>

  <section class="mep-section" style="padding:0 72px 76px;">
    <div style="max-width:720px;margin:0 auto;">
      <div style="font-size:12px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;
                  color:var(--mep-acc);font-family:var(--mep-fs-mono);margin-bottom:20px;">{t.faqEyebrow}</div>
      <div>
        {#each t.faq as row, i}
          {@const isOpen = openFaq === i}
          <div style="border-top:1px solid var(--mep-divider);
                      {i === t.faq.length - 1 ? 'border-bottom:1px solid var(--mep-divider);' : ''}">
            <button onclick={() => { openFaq = isOpen ? -1 : i; }}
              style="width:100%;background:transparent;border:0;cursor:pointer;padding:18px 4px;
                     display:flex;align-items:center;gap:16px;font-family:inherit;text-align:left;">
              <span style="font-size:13px;font-family:var(--mep-fs-mono);color:var(--mep-acc);
                           font-weight:600;width:30px;flex-shrink:0;">0{i + 1}</span>
              <span style="flex:1;font-size:17px;font-weight:500;color:var(--mep-fg);letter-spacing:-0.01em;">{row.q}</span>
              <span style="width:24px;height:24px;border-radius:50%;border:1px solid var(--mep-border);
                           display:flex;align-items:center;justify-content:center;color:var(--mep-fg-2);
                           transform:rotate({isOpen ? '45deg' : '0'});transition:transform 180ms;flex-shrink:0;">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1v8M1 5h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                </svg>
              </span>
            </button>
            {#if isOpen}
              <div transition:slide={{ duration: 280, easing: cubicOut }}
                style="padding:0 4px 18px 50px;font-size:14.5px;line-height:1.65;color:var(--mep-fg-2);">
                {row.a}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="mep-section" style="padding:96px 72px;background:var(--mep-surface-2);border-top:1px solid var(--mep-divider);">
    <div class="mep-close-grid" style="max-width:940px;margin:0 auto;display:grid;grid-template-columns:1fr 420px;
                gap:64px;align-items:center;">
      <div>
        <h2 style="margin:0;font-size:clamp(31px,4vw,40px);font-weight:600;color:var(--mep-fg);
                   letter-spacing:-0.025em;line-height:1.15;text-wrap:balance;">{t.closeHead}</h2>
        <p style="margin:14px 0 0;font-size:17px;line-height:1.6;color:var(--mep-fg-2);max-width:420px;">{t.closeSub}</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px;">
        <EmailForm big={true} {form} copy={t} />
      </div>
    </div>
  </section>

  <footer class="mep-footer mep-section" style="padding:28px 72px;border-top:1px solid var(--mep-divider);
                 display:flex;align-items:center;justify-content:space-between;gap:20px;">
    <div style="display:flex;align-items:center;gap:10px;">
      <svg width="18" height="18" viewBox="0 0 24 24" style="color:var(--mep-acc);flex-shrink:0;">
        <rect x="2.5"  y="3.5" width="3" height="17" rx="1.5" fill="currentColor"/>
        <rect x="10.5" y="3.5" width="3" height="13" rx="1.5" fill="currentColor"/>
        <rect x="18.5" y="3.5" width="3" height="9"  rx="1.5" fill="currentColor"/>
      </svg>
      <span style="font-size:17px;font-weight:600;letter-spacing:-0.2px;color:var(--mep-fg);">Mise en Place</span>
    </div>
    <div style="font-size:12.5px;color:var(--mep-fg-3);font-family:var(--mep-fs-mono);">{t.footerNote}</div>
  </footer>

</div>

<style>
  @media (max-width: 960px) {
    .mep-grid-4 { grid-template-columns: repeat(2, 1fr) !important; }
    .mep-hero-grid { grid-template-columns: 1fr !important; gap: 48px !important; }
    .mep-hero-visual { max-width: 560px; margin: 0 auto; }
  }

  @media (max-width: 640px) {
    .mep-nav { padding: 12px 16px !important; flex-wrap: wrap !important; row-gap: 8px !important; }
    .mep-nav-signin { display: none !important; }
    .mep-section { padding-left: 20px !important; padding-right: 20px !important; }
    .mep-hero { padding-top: 56px !important; }
    .mep-grid-3, .mep-grid-4 { grid-template-columns: 1fr !important; }
    .mep-how-row { grid-template-columns: 1fr !important; gap: 24px !important; }
    .mep-founder-card { flex-direction: column !important; }
    .mep-close-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
    .mep-footer { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }
    .mep-spotbar { flex-wrap: wrap !important; }
    .mep-hero-visual { display: none !important; }
  }
</style>
