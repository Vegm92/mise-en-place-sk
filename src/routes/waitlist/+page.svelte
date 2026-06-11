<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData, PageData } from './$types';

  const { form, data }: { form: ActionData; data: PageData } = $props();

  const copy = {
    es: {
      lang:              'EN',
      pageTitle:         'Mise en Place — Gestión de facturas para restaurantes',
      metaDescription:   'Digitaliza tus albaranes en segundos. Detecta subidas de precio, controla el gasto por categoría y defiende tu margen. Edición de fundadores — 50 cocinas, Barcelona.',
      ogTitle:           'Tus facturas, leídas. Tu margen, defendido.',
      ogLocale:          'es_ES',
      edition:           'N.º 01 · Edición de fundadores',
      city:              'Barcelona',
      date:              'Mayo 2026',
      betaBadge:         'Beta privada',
      signInLabel:       'Ya tienes cuenta',
      signInLink:        'Entrar a la app →',
      ctaNav:            'Apuntarme',
      eyebrowLine:       'Portada · Lista de espera',
      headline:          'Tus facturas, leídas. Tu margen, defendido.',
      sub:               'El sistema operativo que tus albaranes siempre debieron tener. Hecho en Barcelona, para cocinas de menú y de barra.',
      railTiradaLabel:   'Tirada',
      railTirada:        '50',
      railTiradaSub:     'cocinas',
      railAsgLabel:      'Asignadas',
      railAsg:           '43',
      railAsgSub:        'de 50',
      railOpenLabel:     'Apertura',
      railOpen:          'Jul',
      railOpenSub:       '2026',
      joinLabel:         'Únete a la edición',
      incentive:         'Las primeras 50 cocinas: 1 mes gratis y setup prioritario.',
      privacy:           'Solo guardamos tu email. Sin spam. Sin compromisos.',
      placeholder:       'tu@email.com',
      submit:            'Quiero acceso anticipado',
      submitShort:       'Apuntarme',
      success:           'Estás dentro.',
      successBody:       'Te escribiremos en cuanto abramos un sitio. Vigila tu bandeja.',
      alreadyReg:        'Ya estás en la lista. Te avisamos en cuanto abramos un sitio.',
      errRequired:       'Introduce tu email para continuar.',
      errInvalid:        'Ese email no parece válido.',
      intLabel:          'Compatible con tu flujo',
      integrations:      ['Square POS', 'Revo TPV', 'Holded', 'Excel / CSV', 'WhatsApp Business'],
      painChapter:       'I · El problema',
      painReadings:      'Tres lecturas',
      painHead:          'Cada semana se te escapan horas, datos y dinero.',
      pain: [
        { stat: '4–6 h', label: 'a la semana',      title: 'Tu equipo transcribe facturas a mano.',          body: 'Cada albarán acaba en una hoja de cálculo —o en un cajón. Son entre cuatro y seis horas semanales que no cocinan, no entrenan, no atienden.' },
        { stat: '¿0?',   label: 'visibilidad',       title: 'Nadie sabe en qué se gastó la semana.',         body: '¿Cuánto cárnico llevamos este mes? Sin sistema, esa respuesta tarda treinta minutos. Con Mise en Place, está en pantalla antes de que termines la pregunta.' },
        { stat: '+8 %',  label: 'subidas invisibles', title: 'Los proveedores te suben el precio en silencio.', body: 'El aceite sube un ocho por ciento un martes cualquiera. Lo descubres tres meses después. Mise en Place detecta el cambio y te avisa el mismo día.' },
      ],
      howChapter:        'II · El método',
      howHead:           'Tres movimientos. Cero hojas de cálculo.',
      steps: [
        { num: '01', tag: 'Captura',    title: 'Una foto al albarán, o el PDF a la web.',       body: 'Desde el móvil del repartidor, por WhatsApp, o arrastrando el PDF al panel. Sin instalaciones. Sin app que recordar abrir.' },
        { num: '02', tag: 'Inferencia', title: 'El Cerebro de Cocina extrae y normaliza.',       body: 'Proveedor, fechas, IVA, y cada línea con su producto, cantidad y precio. Los nombres se normalizan para que tu inventario sea perfecto.' },
        { num: '03', tag: 'Poder',      title: 'Tu panel se ilumina con datos que importan.',    body: 'Gasto por categoría. Alertas de precio. Integración con tu TPV (Square / Revo) para restar el stock vendido. Tu margen, en tiempo real.' },
      ],
      testChapter:       'III · Voces',
      testHead:          'Conversaciones con quienes ya viven el problema.',
      testimonials: [
        { quote: 'Cada semana pierdo horas pasando facturas a mano. Si funciona como dices, lo firmo ahora mismo.', name: 'Jordi M.',  role: 'Jefe de Cocina · Restaurante de menú · Barcelona',      initials: 'JM' },
        { quote: 'Lo difícil no es gastar. Lo difícil es saber en qué gastas. Nunca tengo esa visión en tiempo real.', name: 'Ana R.', role: 'Responsable de Compras · Hotel boutique · Costa Brava',  initials: 'AR' },
        { quote: 'Si me ahorras el viernes de papeleo, me ahorras una jornada entera del equipo de oficina.',          name: 'Iván C.', role: 'Gerente · Grupo de cuatro locales · Eixample',            initials: 'IC' },
      ],
      ctaChapter:        'VI · Fin de la edición',
      ctaHead1:          'Una plaza, una cocina.',
      ctaHead2:          'Asegura la tuya.',
      ctaSub:            'Abrimos plazas por orden de lista. Déjanos tu email.',
      footerNote:        'Hecho en una cocina, no en una sala de juntas.',
    },
    en: {
      lang:              'ES',
      pageTitle:         'Mise en Place — Invoice Management for Restaurants',
      metaDescription:   'Digitise your delivery notes in seconds. Detect price rises, track spend by category and defend your margin. Founders edition — 50 kitchens, Barcelona.',
      ogTitle:           'Your invoices, read. Your margin, defended.',
      ogLocale:          'en_US',
      edition:           'No. 01 · Founders edition',
      city:              'Barcelona',
      date:              'May 2026',
      betaBadge:         'Private beta',
      signInLabel:       'Already have an account?',
      signInLink:        'Sign in →',
      ctaNav:            'Sign me up',
      eyebrowLine:       'Cover · Waitlist',
      headline:          'Your invoices, read. Your margin, defended.',
      sub:               'The operating system your delivery notes always deserved. Built in Barcelona, for set-menu and bar kitchens.',
      railTiradaLabel:   'Edition',
      railTirada:        '50',
      railTiradaSub:     'kitchens',
      railAsgLabel:      'Allocated',
      railAsg:           '43',
      railAsgSub:        'of 50',
      railOpenLabel:     'Opening',
      railOpen:          'Jul',
      railOpenSub:       '2026',
      joinLabel:         'Join the edition',
      incentive:         'First 50 kitchens get 1 month free and priority setup.',
      privacy:           'We only store your email. No spam. No commitment.',
      placeholder:       'you@email.com',
      submit:            'I want early access',
      submitShort:       'Sign me up',
      success:           "You're in.",
      successBody:       "We'll reach out as soon as a spot opens. Watch your inbox.",
      alreadyReg:        "You're already on the list. We'll let you know when a spot opens.",
      errRequired:       'Enter your email to continue.',
      errInvalid:        "That doesn't look like a valid email.",
      intLabel:          'Works with your workflow',
      integrations:      ['Square POS', 'Revo TPV', 'Holded', 'Excel / CSV', 'WhatsApp Business'],
      painChapter:       'I · The problem',
      painReadings:      'Three readings',
      painHead:          'Every week you lose hours, data, and money.',
      pain: [
        { stat: '4–6 h', label: 'per week',        title: 'Your team transcribes invoices by hand.',      body: 'Every delivery note ends up in a spreadsheet — or a drawer. That\'s four to six hours a week not cooking, not training, not serving.' },
        { stat: '¿0?',   label: 'visibility',       title: 'Nobody knows what was spent this week.',      body: 'How much meat have we ordered this month? Without a system, answering that takes thirty minutes. With Mise en Place, it\'s on screen before you finish the question.' },
        { stat: '+8 %',  label: 'invisible hikes',  title: 'Suppliers raise prices without telling you.',  body: 'Olive oil goes up eight percent on a random Tuesday. You find out three months later. Mise en Place spots the change and alerts you the same day.' },
      ],
      howChapter:        'II · The method',
      howHead:           'Three moves. Zero spreadsheets.',
      steps: [
        { num: '01', tag: 'Capture',   title: 'A photo of the note, or the PDF to the web.',      body: 'From the delivery driver\'s phone, via WhatsApp, or dragging the PDF into the panel. No install. No app to remember to open.' },
        { num: '02', tag: 'Inference', title: 'The Kitchen Brain extracts and normalises.',         body: 'Supplier, dates, VAT, and every line with its product, quantity and price. Names are normalised so your inventory is perfect.' },
        { num: '03', tag: 'Power',     title: 'Your dashboard lights up with data that matters.',   body: 'Spend by category. Price alerts. Integration with your POS (Square / Revo) to deduct sold stock. Your margin, in real time.' },
      ],
      testChapter:       'III · Voices',
      testHead:          'Conversations with people already living the problem.',
      testimonials: [
        { quote: 'Every week I lose hours entering invoices by hand. If this works the way you describe, I\'d sign right now.', name: 'Jordi M.',  role: 'Head Chef · Set-menu restaurant · Barcelona',       initials: 'JM' },
        { quote: 'The hard part isn\'t spending. It\'s knowing what you\'re spending on. I never have that visibility in real time.', name: 'Ana R.', role: 'Purchasing Manager · Boutique hotel · Costa Brava', initials: 'AR' },
        { quote: 'If you save me Friday paperwork, you save me a full day of office staff.',                                          name: 'Iván C.', role: 'General Manager · 4-venue group · Eixample',      initials: 'IC' },
      ],
      ctaChapter:        'VI · End of edition',
      ctaHead1:          'One spot, one kitchen.',
      ctaHead2:          'Claim yours.',
      ctaSub:            'We open spots in sign-up order. Leave your email.',
      footerNote:        'Built in a kitchen, not a boardroom.',
    },
  } as const;

  type Locale = keyof typeof copy;
  let locale = $state<Locale>('es');
  const t = $derived(copy[locale]);
  function toggleLocale() { locale = locale === 'es' ? 'en' : 'es'; }

  let emailError = $state('');
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validateEmail(value: string): string {
    if (!value.trim()) return t.errRequired;
    if (!EMAIL_RE.test(value.trim())) return t.errInvalid;
    return '';
  }

  function serverError(): string {
    if (!form || form.success) return '';
    if ((form as { error?: string }).error === 'required') return t.errRequired;
    if ((form as { error?: string }).error === 'invalid') return t.errInvalid;
    return '';
  }

  // ── Mock data ──────────────────────────────────────────────────────────
  const extractLines = [
    { ok: true,  desc: 'Solomillo de ternera ibérica', qty: '4,20 kg', total: '119,28' },
    { ok: true,  desc: 'Costillas de cerdo ibérico',   qty: '3,50 kg', total: '51,10'  },
    { ok: true,  desc: 'Carrillera de ternera',        qty: '2,80 kg', total: '34,72'  },
    { ok: false, desc: 'Chorizo cular ibérico',        qty: '1,20 kg', total: '27,36'  },
    { ok: true,  desc: 'Lomo embuchado',               qty: '0,80 kg', total: '29,20'  },
  ];

  const rawWeeks = [
    { l: 'S15', a: 22, b: 18, c: 14, hi: false },
    { l: 'S16', a: 26, b: 16, c: 18, hi: false },
    { l: 'S17', a: 24, b: 20, c: 16, hi: false },
    { l: 'S18', a: 30, b: 22, c: 14, hi: false },
    { l: 'S19', a: 28, b: 24, c: 18, hi: false },
    { l: 'S20', a: 36, b: 22, c: 22, hi: false },
    { l: 'S21', a: 38, b: 28, c: 20, hi: true  },
  ];

  // Compute chart bar positions in script so SVG can use plain numbers
  const CH = 130, CPT = 14, CPB = 22, CVW = 400, padL = 28;
  const CAW = CVW - padL - 10;
  const CCW = CAW / rawWeeks.length;
  const CBW = 22;
  const CMT = Math.max(...rawWeeks.map(w => w.a + w.b + w.c));

  const chartWeeks = rawWeeks.map((w, i) => {
    const cx = padL + CCW * i + CCW / 2 - CBW / 2;
    let sy = CPT + CH;
    const segs = [
      { v: w.a, fill: '#7a5b3a' },
      { v: w.b, fill: '#4d5b7a' },
      { v: w.c, fill: '#3d6b5a' },
    ].map(s => {
      const h = (s.v / CMT) * CH;
      sy -= h;
      return { x: cx, y: sy, w: CBW, h: Math.max(h, 0.5), fill: s.fill };
    });
    return { l: w.l, hi: w.hi, segs, lx: cx + CBW / 2, ly: CPT + CH + CPB - 8, topY: sy, total: w.a + w.b + w.c };
  });
  const svgH = CH + CPT + CPB;
</script>

<svelte:head>
  <title>{t.pageTitle}</title>
  <meta name="description" content={t.metaDescription} />
  <link rel="canonical" href={data.canonicalUrl} />

  <!-- Open Graph -->
  <meta property="og:type"        content="website" />
  <meta property="og:url"         content={data.canonicalUrl} />
  <meta property="og:site_name"   content="Mise en Place" />
  <meta property="og:title"       content={t.ogTitle} />
  <meta property="og:description" content={t.metaDescription} />
  <meta property="og:locale"      content={t.ogLocale} />

  <!-- Twitter / X Card -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content={t.ogTitle} />
  <meta name="twitter:description" content={t.metaDescription} />

  <!-- Structured data -->
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
  style="width:100%;min-height:100vh;background:var(--mep-bg);color:var(--mep-fg);
         border-top:4px solid var(--mep-acc);font-family:inherit;">

  <!-- ── Nav ───────────────────────────────────────────────────────────── -->
  <nav style="display:flex;align-items:center;gap:14px;padding:14px 32px;
              border-bottom:1px solid var(--mep-fg);">
    <div style="display:flex;align-items:center;gap:10px;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="color:var(--mep-acc);flex-shrink:0;">
        <rect x="2.5"  y="3.5" width="3" height="17" rx="1.2" stroke="currentColor" stroke-width="1.6"/>
        <rect x="10.5" y="3.5" width="3" height="13" rx="1.2" stroke="currentColor" stroke-width="1.6"/>
        <rect x="18.5" y="3.5" width="3" height="9"  rx="1.2" stroke="currentColor" stroke-width="1.6"/>
      </svg>
      <span style="font-size:15px;font-weight:600;letter-spacing:-0.2px;color:var(--mep-fg);">Mise en Place</span>
    </div>
    <span style="font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;
                 color:var(--mep-acc);padding:2px 7px;border-radius:4px;
                 background:var(--mep-acc-soft);font-family:var(--mep-fs-mono);">{t.betaBadge}</span>
    <div style="flex:1;"></div>
    <a href="/login" style="font-size:12.5px;font-weight:500;color:var(--mep-fg-2);text-decoration:none;
                            white-space:nowrap;">{t.signInLink}</a>
    <div style="display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;
                border:1px solid var(--mep-border);background:var(--mep-surface);
                font-size:10.5px;font-weight:600;letter-spacing:0.06em;color:var(--mep-fg-2);
                font-family:var(--mep-fs-mono);gap:8px;">
      <button onclick={toggleLocale} style="background:transparent;border:none;cursor:pointer;
                                            padding:0;font-family:inherit;font-size:inherit;
                                            font-weight:inherit;letter-spacing:inherit;
                                            color:var(--mep-fg-2);">{t.lang}</button>
    </div>
    <a href="#join" class="btn btn-primary" style="height:32px;padding:0 14px;font-size:12px;
                                                    font-weight:600;text-decoration:none;">{t.ctaNav}</a>
  </nav>

  <!-- ── Masthead ──────────────────────────────────────────────────────── -->
  <div style="padding:10px 32px;border-bottom:1px solid var(--mep-divider);
              display:flex;justify-content:space-between;align-items:center;
              font-size:10.5px;color:var(--mep-fg-3);font-family:var(--mep-fs-mono);
              letter-spacing:0.06em;text-transform:uppercase;font-weight:500;">
    <span>{t.edition}</span>
    <span>{t.city}</span>
    <span>{t.date}</span>
  </div>

  <!-- ── Hero ──────────────────────────────────────────────────────────── -->
  <section style="padding:64px 32px 56px;">
    <div style="max-width:1280px;margin:0 auto;display:grid;
                grid-template-columns:120px 1fr 280px;gap:32px;align-items:flex-start;">

      <!-- Left rail -->
      <div style="display:flex;flex-direction:column;gap:28px;padding-top:12px;">
        {#each [
          { label: t.railTiradaLabel, value: t.railTirada, sub: t.railTiradaSub, color: 'var(--mep-fg)' },
          { label: t.railAsgLabel,    value: t.railAsg,    sub: t.railAsgSub,    color: 'var(--mep-acc)' },
          { label: t.railOpenLabel,   value: t.railOpen,   sub: t.railOpenSub,   color: 'var(--mep-fg)' },
        ] as stat}
          <div>
            <div style="font-size:9.5px;color:var(--mep-fg-3);font-family:var(--mep-fs-mono);
                        letter-spacing:0.1em;text-transform:uppercase;font-weight:500;margin-bottom:4px;">
              {stat.label}
            </div>
            <div style="font-size:22px;font-weight:600;color:{stat.color};
                        font-family:var(--mep-fs-mono);letter-spacing:-0.4px;">{stat.value}</div>
            <div style="font-size:10.5px;color:var(--mep-fg-3);">{stat.sub}</div>
          </div>
        {/each}
      </div>

      <!-- Center: headline + form -->
      <div>
        <div style="font-size:11px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;
                    color:var(--mep-acc);font-family:var(--mep-fs-mono);margin-bottom:28px;
                    display:flex;align-items:center;gap:12px;">
          <span style="width:32px;height:1px;background:var(--mep-acc);display:inline-block;"></span>
          <span>{t.eyebrowLine}</span>
        </div>
        <h1 style="margin:0;font-size:clamp(52px,6vw,88px);font-weight:700;color:var(--mep-fg);
                   letter-spacing:-0.04em;line-height:0.96;text-wrap:balance;">
          {t.headline.split(' ')[0]}
          <br />
          <span style="font-style:italic;color:var(--mep-acc);font-weight:500;">
            {t.headline.split(' ')[1]}
          </span>
        </h1>
        <div style="margin-top:32px;display:grid;grid-template-columns:1fr 1fr;gap:32px;
                    border-top:1px solid var(--mep-fg);padding-top:20px;">
          <p style="margin:0;font-size:15px;line-height:1.6;color:var(--mep-fg-2);">
            <span style="float:left;font-size:44px;font-weight:700;line-height:0.9;
                         padding-right:6px;padding-top:4px;color:var(--mep-acc);letter-spacing:-0.08em;">
              {t.sub[0]}
            </span>
            {t.sub.slice(1)}
          </p>
          <div id="join" style="display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:10.5px;color:var(--mep-fg-3);font-family:var(--mep-fs-mono);
                        letter-spacing:0.1em;text-transform:uppercase;font-weight:500;">
              {t.joinLabel}
            </div>
            {#if form?.success}
              <div style="background:var(--mep-pos-soft);border:1px solid var(--mep-pos);
                          border-radius:8px;padding:14px 16px;">
                <div style="font-size:14px;font-weight:600;color:var(--mep-pos);margin-bottom:4px;">
                  {t.success}
                </div>
                <div style="font-size:12.5px;color:var(--mep-fg-2);line-height:1.5;">
                  {(form as { alreadyRegistered?: boolean }).alreadyRegistered ? t.alreadyReg : t.successBody}
                </div>
              </div>
            {:else}
              <form method="POST" action="?/join" use:enhance
                onsubmit={(e) => {
                  const input = (e.currentTarget as HTMLFormElement).querySelector('input[name="email"]') as HTMLInputElement;
                  emailError = validateEmail(input.value);
                  if (emailError) e.preventDefault();
                }}
                style="display:flex;flex-direction:column;gap:8px;">
                <div style="display:flex;gap:8px;">
                  <input type="email" name="email" placeholder={t.placeholder} autocomplete="email"
                    class="input"
                    style="flex:1;height:44px;font-size:14px;"
                    oninput={() => { emailError = ''; }}
                  />
                  <button type="submit" class="btn btn-primary"
                    style="height:44px;padding:0 18px;font-size:13.5px;font-weight:600;flex-shrink:0;">
                    {t.submitShort}
                  </button>
                </div>
                {#if emailError || serverError()}
                  <p style="font-size:11.5px;color:var(--mep-neg);margin:0;padding-left:2px;">
                    {emailError || serverError()}
                  </p>
                {/if}
              </form>
              <div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style="color:var(--mep-acc);flex-shrink:0;">
                  <path d="M8 1l1.8 3.6L14 5.5l-3 2.9.7 4.1L8 10.4l-3.7 1.9.7-4.1-3-2.9 4.2-.9z" fill="currentColor"/>
                </svg>
                <span style="font-size:11.5px;color:var(--mep-acc);font-weight:500;">{t.incentive}</span>
              </div>
              <div style="font-size:11px;color:var(--mep-fg-3);padding-left:2px;">{t.privacy}</div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Right: rotated extract preview -->
      <div>
        <div style="font-size:9.5px;color:var(--mep-fg-3);font-family:var(--mep-fs-mono);
                    letter-spacing:0.1em;text-transform:uppercase;font-weight:500;margin-bottom:10px;">
          {locale === 'es' ? 'Inserto · Muestra' : 'Insert · Sample'}
        </div>
        <div style="background:var(--mep-surface);border:1px solid var(--mep-divider);padding:14px;
                    box-shadow:0 14px 40px rgba(0,0,0,0.08);transform:rotate(1.2deg);">
          <div style="display:flex;align-items:center;gap:8px;padding-bottom:10px;
                      border-bottom:1px solid var(--mep-divider);margin-bottom:8px;">
            <div style="width:20px;height:20px;border-radius:4px;background:var(--mep-acc-soft);
                        color:var(--mep-acc);display:flex;align-items:center;justify-content:center;
                        font-size:10px;flex-shrink:0;">✦</div>
            <div>
              <div style="font-size:11px;font-weight:600;color:var(--mep-fg);">Cárnicas Ibérico Aranda</div>
              <div style="font-size:9.5px;color:var(--mep-fg-3);font-family:var(--mep-fs-mono);">2026-A-0471 · 19/05/2026 · 2,3 s</div>
            </div>
          </div>
          {#each extractLines as line}
            <div style="display:grid;grid-template-columns:10px 1fr 48px 42px;gap:8px;
                        padding:5px 0;border-bottom:1px solid var(--mep-divider);
                        align-items:center;font-size:10.5px;">
              <div style="width:8px;height:8px;border-radius:4px;flex-shrink:0;
                          background:{line.ok ? 'var(--mep-pos-soft)' : 'var(--mep-warn-soft)'};
                          color:{line.ok ? 'var(--mep-pos)' : 'var(--mep-warn)'};
                          display:flex;align-items:center;justify-content:center;font-size:6px;">
                {line.ok ? '✓' : '!'}
              </div>
              <span style="color:var(--mep-fg-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{line.desc}</span>
              <span style="color:var(--mep-fg-3);font-family:var(--mep-fs-mono);text-align:right;">{line.qty}</span>
              <span style="color:var(--mep-fg);font-weight:500;font-family:var(--mep-fs-mono);text-align:right;">{line.total} €</span>
            </div>
          {/each}
          <div style="display:flex;justify-content:space-between;padding-top:8px;font-family:var(--mep-fs-mono);">
            <span style="font-size:10px;color:var(--mep-fg-3);">14 líneas · IVA 10 %</span>
            <span style="font-size:12px;font-weight:700;color:var(--mep-fg);">482,65 €</span>
          </div>
        </div>
      </div>

    </div>
  </section>

  <!-- ── Integrations strip ─────────────────────────────────────────────── -->
  <div style="padding:14px 32px;border-top:1px solid var(--mep-fg);border-bottom:1px solid var(--mep-fg);
              display:flex;align-items:center;gap:32px;overflow:hidden;">
    <span style="font-size:10px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;
                 color:var(--mep-fg-3);font-family:var(--mep-fs-mono);flex-shrink:0;">
      {t.intLabel} ·
    </span>
    <div style="display:flex;gap:28px;align-items:center;font-size:13px;font-weight:600;
                color:var(--mep-fg);letter-spacing:-0.02em;">
      {#each t.integrations as name, i}
        {name}
        {#if i < t.integrations.length - 1}
          <span style="color:var(--mep-acc);font-family:var(--mep-fs-mono);font-size:14px;">×</span>
        {/if}
      {/each}
    </div>
  </div>

  <!-- ── Pain — Chapter I ───────────────────────────────────────────────── -->
  <section style="padding:88px 32px 56px;">
    <div style="max-width:1280px;margin:0 auto;">
      <div style="display:grid;grid-template-columns:120px 1fr;gap:32px;margin-bottom:56px;">
        <div style="font-size:9.5px;color:var(--mep-fg-3);font-family:var(--mep-fs-mono);
                    letter-spacing:0.1em;text-transform:uppercase;font-weight:500;">{t.painChapter}</div>
        <h2 style="margin:0;font-size:clamp(36px,4vw,52px);font-weight:600;color:var(--mep-fg);
                   letter-spacing:-0.03em;line-height:1.05;max-width:880px;text-wrap:balance;">
          {t.painHead.split(',')[0]},<br />
          <span style="color:var(--mep-acc);">{t.painHead.split(',').slice(1).join(',').trim()}</span>
        </h2>
      </div>
      <div style="display:grid;grid-template-columns:120px 1fr 1fr 1fr;gap:32px;
                  padding-top:32px;border-top:1px solid var(--mep-fg);">
        <div style="font-size:10.5px;color:var(--mep-fg-3);font-family:var(--mep-fs-mono);
                    letter-spacing:0.06em;text-transform:uppercase;font-weight:500;">{t.painReadings}</div>
        {#each t.pain as p, i}
          <div style="display:flex;flex-direction:column;gap:12px;padding-right:16px;
                      {i < 2 ? 'border-right:1px solid var(--mep-divider)' : ''}">
            <div style="font-size:10.5px;color:var(--mep-acc);font-family:var(--mep-fs-mono);
                        letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">
              Lectura · 0{i + 1}
            </div>
            <div style="display:flex;align-items:baseline;gap:6px;border-bottom:1px solid var(--mep-divider);
                        padding-bottom:12px;">
              <span style="font-size:clamp(48px,5vw,68px);font-weight:700;color:var(--mep-fg);
                           letter-spacing:-0.05em;line-height:0.9;font-family:var(--mep-fs-mono);">{p.stat}</span>
              <span style="font-size:11px;color:var(--mep-fg-3);letter-spacing:0.06em;
                           text-transform:uppercase;font-weight:500;font-family:var(--mep-fs-mono);">{p.label}</span>
            </div>
            <h3 style="margin:0;font-size:18px;font-weight:600;color:var(--mep-fg);
                       letter-spacing:-0.02em;line-height:1.2;">{p.title}</h3>
            <p style="margin:0;font-size:13px;line-height:1.7;color:var(--mep-fg-2);">{p.body}</p>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- ── How — Chapter II ──────────────────────────────────────────────── -->
  <section style="padding:72px 32px;background:var(--mep-surface-2);
                  border-top:1px solid var(--mep-fg);border-bottom:1px solid var(--mep-fg);">
    <div style="max-width:1280px;margin:0 auto;">
      <div style="display:grid;grid-template-columns:120px 1fr;gap:32px;margin-bottom:48px;">
        <div style="font-size:9.5px;color:var(--mep-fg-3);font-family:var(--mep-fs-mono);
                    letter-spacing:0.1em;text-transform:uppercase;font-weight:500;">{t.howChapter}</div>
        <h2 style="margin:0;font-size:clamp(36px,4vw,52px);font-weight:600;color:var(--mep-fg);
                   letter-spacing:-0.03em;line-height:1.05;max-width:720px;">{t.howHead}</h2>
      </div>

      {#each t.steps as step, i}
        <div style="display:grid;grid-template-columns:120px 1fr 1fr;gap:32px;padding:40px 0;
                    border-top:1px solid var(--mep-divider);align-items:start;">
          <div>
            <div style="font-size:clamp(48px,5vw,68px);font-weight:700;color:var(--mep-acc);
                        letter-spacing:-0.05em;line-height:0.9;font-family:var(--mep-fs-mono);">{step.num}</div>
            <div style="margin-top:8px;font-size:11px;color:var(--mep-fg-3);letter-spacing:0.12em;
                        text-transform:uppercase;font-weight:600;font-family:var(--mep-fs-mono);">{step.tag}</div>
          </div>
          <div style="padding-top:8px;">
            <h3 style="margin:0;font-size:28px;font-weight:600;color:var(--mep-fg);
                       letter-spacing:-0.02em;line-height:1.15;">{step.title}</h3>
            <p style="margin:16px 0 0;font-size:14.5px;line-height:1.7;color:var(--mep-fg-2);
                      max-width:360px;">{step.body}</p>
          </div>

          <!-- ── Product mock (replaces PNG screenshots) ── -->
          <div>
            {#if i === 0}
              <!-- Mock 01 · Capture: faux invoice + WhatsApp bubble -->
              <div style="position:relative;width:100%;aspect-ratio:4/3;border-radius:16px;overflow:hidden;
                          background:linear-gradient(135deg,var(--mep-surface-2) 0%,var(--mep-surface) 100%);
                          border:1px solid var(--mep-divider);padding:28px;
                          display:flex;align-items:center;justify-content:center;">
                <!-- Faux invoice paper -->
                <div style="position:absolute;top:22px;left:22px;width:54%;height:78%;
                            background:var(--mep-surface);border:1px solid var(--mep-divider);
                            border-radius:4px;box-shadow:0 14px 40px rgba(0,0,0,0.12);
                            transform:rotate(-6deg);padding:14px 16px;
                            display:flex;flex-direction:column;gap:6px;overflow:hidden;">
                  <div style="font-size:10px;font-weight:700;color:var(--mep-fg);font-family:var(--mep-fs-mono);">
                    CÁRNICAS IBÉRICO ARANDA
                  </div>
                  <div style="font-size:8.5px;color:var(--mep-fg-3);font-family:var(--mep-fs-mono);">CIF B81234567 · Madrid</div>
                  <div style="height:1px;background:var(--mep-divider);margin:4px 0;"></div>
                  <div style="display:flex;justify-content:space-between;font-size:8.5px;color:var(--mep-fg-2);font-family:var(--mep-fs-mono);">
                    <span>FACTURA</span><span>N.º 2026-A-0471</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;font-size:8.5px;color:var(--mep-fg-3);font-family:var(--mep-fs-mono);">
                    <span>Fecha</span><span>19/05/2026</span>
                  </div>
                  <div style="height:1px;background:var(--mep-divider);margin:4px 0;"></div>
                  {#each ['Solomillo ibérico','Costillas cerdo','Carrillera','Chorizo cular','Lomo embuchado'] as prod, pi}
                    <div style="display:flex;justify-content:space-between;font-size:8px;color:var(--mep-fg-2);font-family:var(--mep-fs-mono);">
                      <span>{prod}</span><span>{(20 + pi * 14).toFixed(2)} €</span>
                    </div>
                  {/each}
                  <div style="flex:1;"></div>
                  <div style="height:1px;background:var(--mep-divider);"></div>
                  <div style="display:flex;justify-content:space-between;font-size:9px;font-weight:700;color:var(--mep-fg);font-family:var(--mep-fs-mono);">
                    <span>TOTAL</span><span>482,65 €</span>
                  </div>
                </div>
                <!-- WhatsApp bubble -->
                <div style="position:absolute;right:28px;bottom:28px;width:46%;
                            display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
                  <div style="max-width:90%;background:#dcf8c6;color:#0a2618;
                              border-radius:12px 12px 4px 12px;padding:8px;font-size:11px;
                              box-shadow:0 8px 20px rgba(0,0,0,0.12);">
                    <div style="width:100%;height:76px;border-radius:6px;
                                background:linear-gradient(135deg,#c1bfaf 0%,#8a8678 60%,#5f5a4d 100%);
                                display:flex;align-items:center;justify-content:center;">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="color:rgba(255,255,255,0.5);">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        <circle cx="12" cy="13" r="4" stroke="currentColor" stroke-width="1.5"/>
                      </svg>
                    </div>
                    <div style="font-size:10px;margin-top:5px;font-family:var(--mep-fs-mono);">albaran_aranda.jpg · 1.2 MB</div>
                  </div>
                  <div style="max-width:90%;background:#ffffff;color:#0a2618;
                              border-radius:12px 12px 12px 4px;padding:8px 12px;font-size:11.5px;
                              box-shadow:0 8px 20px rgba(0,0,0,0.12);font-weight:500;">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                      <span style="width:12px;height:12px;border-radius:6px;background:var(--mep-acc);
                                   color:var(--mep-acc-fg);display:flex;align-items:center;
                                   justify-content:center;font-size:7px;font-weight:700;">M</span>
                      <span style="font-size:10px;font-weight:600;">Mise en Place</span>
                    </div>
                    Recibida ✓ · Procesando 14 líneas…
                    <div style="font-size:9.5px;color:#5a8a6f;margin-top:3px;font-family:var(--mep-fs-mono);">14:02</div>
                  </div>
                </div>
              </div>

            {:else if i === 1}
              <!-- Mock 02 · Extract: structured invoice table -->
              <div class="card" style="width:100%;padding:0;overflow:hidden;display:flex;flex-direction:column;">
                <div style="padding:12px 16px;border-bottom:1px solid var(--mep-divider);
                            display:flex;align-items:center;gap:10px;">
                  <div style="width:22px;height:22px;border-radius:5px;background:var(--mep-acc-soft);
                              color:var(--mep-acc);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M8 1l1.8 3.6L14 5.5l-3 2.9.7 4.1L8 10.4l-3.7 1.9.7-4.1-3-2.9 4.2-.9z" fill="currentColor"/>
                    </svg>
                  </div>
                  <div style="flex:1;min-width:0;">
                    <div style="font-size:12px;font-weight:600;color:var(--mep-fg);">Cárnicas Ibérico Aranda</div>
                    <div style="font-size:10.5px;color:var(--mep-fg-3);font-family:var(--mep-fs-mono);">
                      2026-A-0471 · 19/05/2026 · extraído en 2,3 s
                    </div>
                  </div>
                  <span style="font-size:9.5px;font-weight:500;padding:2px 7px;border-radius:4px;
                               background:var(--mep-pos-soft);color:var(--mep-pos);display:inline-flex;align-items:center;gap:4px;">
                    ✓ Confirmada
                  </span>
                </div>
                {#each extractLines as line, li}
                  <div style="display:grid;grid-template-columns:14px 1fr 70px 60px;gap:10px;
                              padding:8px 16px;border-bottom:{li === extractLines.length - 1 ? '0' : '1px solid var(--mep-divider)'};
                              align-items:center;font-size:11.5px;">
                    <div style="width:12px;height:12px;border-radius:6px;flex-shrink:0;
                                background:{line.ok ? 'var(--mep-pos-soft)' : 'var(--mep-warn-soft)'};
                                color:{line.ok ? 'var(--mep-pos)' : 'var(--mep-warn)'};
                                display:flex;align-items:center;justify-content:center;font-size:7px;">
                      {line.ok ? '✓' : '!'}
                    </div>
                    <span style="color:var(--mep-fg-2);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                      {line.desc}
                    </span>
                    <span style="color:var(--mep-fg-3);text-align:right;font-family:var(--mep-fs-mono);">{line.qty}</span>
                    <span style="color:var(--mep-fg);font-weight:500;text-align:right;font-family:var(--mep-fs-mono);">{line.total} €</span>
                  </div>
                {/each}
                <div style="padding:10px 16px;background:var(--mep-surface-2);border-top:1px solid var(--mep-divider);
                            display:flex;align-items:center;justify-content:space-between;">
                  <span style="font-size:11px;color:var(--mep-fg-3);">14 líneas · IVA 10 %</span>
                  <span style="font-size:13px;font-weight:700;color:var(--mep-fg);font-family:var(--mep-fs-mono);">482,65 €</span>
                </div>
              </div>

            {:else}
              <!-- Mock 03 · Dashboard: stacked bar chart + alert -->
              <div class="card" style="padding:16px;display:flex;flex-direction:column;gap:12px;">
                <div style="display:flex;align-items:center;justify-content:space-between;">
                  <div>
                    <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;
                                letter-spacing:0.08em;font-weight:500;font-family:var(--mep-fs-mono);">
                      Gasto · últimas 7 semanas
                    </div>
                    <div style="display:flex;align-items:baseline;gap:6px;margin-top:4px;">
                      <span style="font-size:22px;font-weight:700;color:var(--mep-fg);
                                   letter-spacing:-0.4px;font-family:var(--mep-fs-mono);">3.842,15 €</span>
                      <span style="font-size:11px;color:var(--mep-pos);font-weight:600;
                                   display:inline-flex;align-items:center;gap:2px;">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 8V2M2 5l3-3 3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        12,4 %
                      </span>
                    </div>
                  </div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
                    {#each [{ k:'Carne', c:'#7a5b3a' }, { k:'Pescado', c:'#4d5b7a' }, { k:'Verdura', c:'#3d6b5a' }] as cat}
                      <div style="display:flex;align-items:center;gap:4px;">
                        <span style="width:8px;height:8px;border-radius:2px;background:{cat.c};flex-shrink:0;"></span>
                        <span style="font-size:10px;color:var(--mep-fg-3);">{cat.k}</span>
                      </div>
                    {/each}
                  </div>
                </div>
                <!-- SVG chart with pre-computed positions -->
                <svg viewBox="0 0 {CVW} {svgH}" width="100%" style="display:block;overflow:visible;">
                  {#each [0, 0.5, 1] as p}
                    <line x1={padL} x2={CVW - 10} y1={CPT + CH * (1 - p)} y2={CPT + CH * (1 - p)}
                          stroke="var(--mep-divider)" stroke-width="1"/>
                  {/each}
                  {#each chartWeeks as wk}
                    <g style="opacity:{!wk.hi ? 0.45 : 1};">
                      {#each wk.segs as seg}
                        <rect x={seg.x} y={seg.y} width={seg.w} height={seg.h} fill={seg.fill}/>
                      {/each}
                      <text x={wk.lx} y={wk.ly} text-anchor="middle" font-size="9.5"
                            fill="var(--mep-fg-3)" font-family="var(--mep-fs-mono)">{wk.l}</text>
                      {#if wk.hi}
                        <text x={wk.lx} y={wk.topY - 4} text-anchor="middle" font-size="9.5"
                              font-weight="700" fill="var(--mep-fg)" font-family="var(--mep-fs-mono)">
                          {((wk.total / 10) + 0.86).toFixed(2).replace('.', ',')} k
                        </text>
                      {/if}
                    </g>
                  {/each}
                </svg>
                <!-- Alert row -->
                <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;
                            border-radius:8px;background:var(--mep-warn-soft);">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="color:var(--mep-warn);flex-shrink:0;">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                  <div style="flex:1;min-width:0;">
                    <div style="font-size:11.5px;color:var(--mep-fg);font-weight:600;">
                      Aceite de oliva virgen · +8,1 % esta semana
                    </div>
                    <div style="font-size:10.5px;color:var(--mep-fg-3);font-family:var(--mep-fs-mono);">
                      Aceites Gómez Hermanos · 4,80 € → 5,19 € / L
                    </div>
                  </div>
                  <span style="font-size:10px;font-weight:600;color:var(--mep-warn);
                               text-transform:uppercase;letter-spacing:0.06em;font-family:var(--mep-fs-mono);">
                    Revisar
                  </span>
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </section>

  <!-- ── Testimonials — Chapter III ────────────────────────────────────── -->
  <section style="padding:88px 32px;">
    <div style="max-width:1280px;margin:0 auto;">
      <div style="display:grid;grid-template-columns:120px 1fr;gap:32px;margin-bottom:48px;">
        <div style="font-size:9.5px;color:var(--mep-fg-3);font-family:var(--mep-fs-mono);
                    letter-spacing:0.1em;text-transform:uppercase;font-weight:500;">{t.testChapter}</div>
        <h2 style="margin:0;font-size:clamp(36px,4vw,52px);font-weight:600;color:var(--mep-fg);
                   letter-spacing:-0.03em;line-height:1.05;max-width:720px;">{t.testHead}</h2>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;
                  background:var(--mep-divider);border:1px solid var(--mep-divider);">
        {#each t.testimonials as item}
          <div style="background:var(--mep-bg);padding:36px 32px;
                      display:flex;flex-direction:column;gap:20px;">
            <span style="font-size:80px;line-height:0.6;color:var(--mep-acc);height:30px;
                         font-weight:700;letter-spacing:-0.06em;">&ldquo;</span>
            <p style="margin:0;font-size:18px;line-height:1.45;color:var(--mep-fg);
                      letter-spacing:-0.01em;font-style:italic;flex:1;">{item.quote}</p>
            <div style="padding-top:16px;border-top:1px solid var(--mep-divider);
                        font-size:11.5px;color:var(--mep-fg-2);font-family:var(--mep-fs-mono);">
              <span style="font-weight:600;color:var(--mep-fg);">{item.name}</span><br />
              <span style="color:var(--mep-fg-3);">{item.role}</span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- ── Final CTA — inverted ───────────────────────────────────────────── -->
  <section style="padding:100px 32px;background:var(--mep-fg);color:var(--mep-bg);
                  --mep-border-strong:rgba(255,255,255,0.2);--mep-surface:rgba(255,255,255,0.05);
                  --mep-divider:rgba(255,255,255,0.15);">
    <div style="max-width:1280px;margin:0 auto;display:grid;
                grid-template-columns:120px 1fr 360px;gap:32px;align-items:center;">
      <div style="font-size:9.5px;color:rgba(255,255,255,0.45);font-family:var(--mep-fs-mono);
                  letter-spacing:0.1em;text-transform:uppercase;font-weight:500;">{t.ctaChapter}</div>
      <h2 style="margin:0;font-size:clamp(44px,5vw,64px);font-weight:700;color:inherit;
                 letter-spacing:-0.03em;line-height:0.98;text-wrap:balance;">
        {t.ctaHead1}<br />
        <span style="color:var(--mep-acc);font-style:italic;font-weight:500;">{t.ctaHead2}</span>
      </h2>
      <div>
        <p style="margin:0 0 16px;font-size:13px;color:rgba(255,255,255,0.6);">{t.ctaSub}</p>
        {#if form?.success}
          <div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);
                      border-radius:8px;padding:14px 16px;font-size:13px;color:rgba(255,255,255,0.8);">
            {(form as { alreadyRegistered?: boolean }).alreadyRegistered ? t.alreadyReg : t.successBody}
          </div>
        {:else}
          <form method="POST" action="?/join" use:enhance
            onsubmit={(e) => {
              const input = (e.currentTarget as HTMLFormElement).querySelector('input[name="email"]') as HTMLInputElement;
              const err = validateEmail(input.value);
              if (err) { emailError = err; e.preventDefault(); }
            }}
            style="display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;gap:8px;">
              <input type="email" name="email" placeholder={t.placeholder} autocomplete="email"
                style="flex:1;height:48px;padding:0 14px;font-size:14px;border-radius:6px;
                       background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);
                       color:#fff;outline:none;font-family:inherit;"
                oninput={() => { emailError = ''; }}
              />
              <button type="submit" class="btn btn-primary"
                style="height:48px;padding:0 20px;font-size:14px;font-weight:600;flex-shrink:0;">
                {t.submitShort}
              </button>
            </div>
            {#if emailError || serverError()}
              <p style="font-size:11.5px;color:var(--mep-neg);margin:0;">{emailError || serverError()}</p>
            {/if}
            <div style="font-size:11px;color:rgba(255,255,255,0.45);font-family:var(--mep-fs-mono);">{t.privacy}</div>
          </form>
        {/if}
      </div>
    </div>
  </section>

  <!-- ── Footer ────────────────────────────────────────────────────────── -->
  <footer style="padding:20px 32px;display:flex;align-items:center;justify-content:space-between;
                 font-size:11px;color:var(--mep-fg-3);font-family:var(--mep-fs-mono);
                 letter-spacing:0.06em;border-top:1px solid var(--mep-divider);">
    <div style="display:flex;align-items:center;gap:8px;">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style="color:var(--mep-acc);">
        <rect x="2.5"  y="3.5" width="3" height="17" rx="1.2" stroke="currentColor" stroke-width="1.6"/>
        <rect x="10.5" y="3.5" width="3" height="13" rx="1.2" stroke="currentColor" stroke-width="1.6"/>
        <rect x="18.5" y="3.5" width="3" height="9"  rx="1.2" stroke="currentColor" stroke-width="1.6"/>
      </svg>
      <span>Mise en Place · Barcelona · {new Date().getFullYear()}</span>
    </div>
    <span>{t.footerNote}</span>
  </footer>

</div>
