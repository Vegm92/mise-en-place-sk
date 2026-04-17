<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData } from './$types';

  const { form }: { form: ActionData } = $props();

  // ── i18n ──────────────────────────────────────────────────────────────────
  const copy = {
    es: {
      lang:             'EN',
      pageTitle:        'Mise en Place — Lista de espera',
      eyebrow:          'Acceso anticipado · Barcelona',
      headline:         'Mise Control: El Cerebro Operativo de tu Cocina',
      sub:              'Sube una factura. En segundos está registrada, categorizada y analizada. Sin hojas de cálculo. Sin errores de transcripción.',
      ctaHeadline:      'Sé de los primeros en probarlo',
      ctaSub:           'Abrimos acceso por orden de lista. Déjanos tu email y te avisamos.',
      placeholder:      'tu@email.com',
      submit:           'Apuntarme',
      success:          '¡Estás dentro! Te avisaremos en cuanto abramos el acceso anticipado.',
      errRequired:      'Introduce tu email para continuar.',
      errInvalid:       'Ese email no parece válido.',
      incentive:        'Incentivo exclusivo: Los primeros 50 registros obtienen 1 mes gratis y setup prioritario.',
      footerNote:       'Solo almacenamos tu email. Sin spam. Sin compromisos.',
      integrationsLabel:'Compatible con tu flujo de trabajo:',
      painEyebrow:      'El problema',
      painHead:         'Cada semana pierdes tiempo y dinero sin saberlo.',
      pain: [
        { display: '4–6h',  title: 'Horas perdidas, cada semana',          body: 'Cada factura acaba en una hoja de cálculo, o peor, en un cajón. Tu equipo invierte entre 4 y 6 horas semanales pasando datos a mano. Ese tiempo se puede recuperar.', dark: false },
        { display: '¿0?',   title: 'Visibilidad de gasto en tiempo real',  body: '¿Cuánto has gastado esta semana en cárnico? Sin una herramienta, esta pregunta tarda minutos. Con Mise en Place, la respuesta es inmediata.',                        dark: true  },
        { display: '+8%',   title: 'Subidas de precio que no ves venir',   body: 'Tu proveedor sube el aceite un 8% y te enteras tres meses después al revisar facturas. Mise en Place detecta el cambio y te avisa automáticamente.',                  dark: false },
      ],
      howTitle:         'Así de sencillo',
      steps: [
        { num: '1', title: 'Captura Instantánea y WhatsApp Bot', body: 'Envía la foto del albarán por WhatsApp o sube el PDF a la web. Sin instalaciones. Desde donde estés.',                                                    img: '/taking-pic.png',      alt: 'Fotografiando una factura con el móvil' },
        { num: '2', title: 'Inferencia y Normalización',          body: 'Nuestro Cerebro de Cocina extrae proveedor, fechas y cada ingrediente. Los nombres se normalizan para que tu inventario sea perfecto. En segundos.',     img: '/invoice-extract.png', alt: 'Datos extraídos de la factura automáticamente' },
        { num: '3', title: 'Poder Operativo y Margen Perfecto',   body: 'Tu Dashboard se ilumina. Alertas de precio al instante e integración total con tu TPV (Square/Revo) para restar stock vendido.',                         img: '/cehf-ejc.png',        alt: 'Dashboard con análisis de costes' },
      ],
      testimonialsTitle: 'Lo que nos dicen los chefs',
      testimonials: [
        { quote: 'Cada semana pierdo horas pasando facturas a mano. Si esto funciona como dices, lo firmo ahora mismo.', name: 'Jordi M.', role: 'Jefe de Cocina · Restaurante de menú, Barcelona',  initials: 'JM', dark: false },
        { quote: 'Lo más difícil no es gastar, es saber en qué gastas. Nunca tengo esa visión en tiempo real.',          name: 'Ana R.',   role: 'Responsable de Compras · Hotel boutique, Costa Brava', initials: 'AR', dark: true  },
      ],
    },
    en: {
      lang:             'ES',
      pageTitle:        'Mise en Place — Waitlist',
      eyebrow:          'Early access · Barcelona',
      headline:         'Mise Control: The Operating Brain of Your Kitchen',
      sub:              'Upload an invoice. In seconds it\'s logged, categorized, and analyzed. No spreadsheets. No manual errors.',
      ctaHeadline:      'Be among the first to try it',
      ctaSub:           'We open access in order of sign-up. Leave your email and we\'ll reach out.',
      placeholder:      'you@email.com',
      submit:           'Sign me up',
      success:          'You\'re in! We\'ll reach out as soon as early access opens.',
      errRequired:      'Enter your email to continue.',
      errInvalid:       'That doesn\'t look like a valid email.',
      incentive:        'Exclusive incentive: First 50 sign-ups get 1 month free and priority setup.',
      footerNote:       'We only store your email. No spam. No commitment.',
      integrationsLabel:'Works with your workflow:',
      painEyebrow:      'The problem',
      painHead:         'Every week you lose time and money without knowing it.',
      pain: [
        { display: '4–6h', title: 'Hours lost, every week',                    body: 'Every invoice ends up in a spreadsheet — or worse, in a drawer. Your team spends 4 to 6 hours a week entering data by hand. That time is yours to take back.', dark: false },
        { display: '¿0?',  title: 'Real-time spend visibility',                body: 'How much did you spend on meat this week? Without a tool, answering that takes minutes. With Mise en Place, it\'s instant.',                                      dark: true  },
        { display: '+8%',  title: 'Price hikes you don\'t see coming',         body: 'Your supplier raises olive oil 8% and you find out three months later. Mise en Place detects the change and alerts you automatically.',                          dark: false },
      ],
      howTitle:         'That simple',
      steps: [
        { num: '1', title: 'Instant Capture & WhatsApp Bot',     body: 'Send a photo of the invoice via WhatsApp or upload the PDF to the web. No setup required. From anywhere.',                              img: '/taking-pic.png',      alt: 'Photographing an invoice with a phone' },
        { num: '2', title: 'Inference & Normalization',           body: 'Our Kitchen Brain extracts vendor, dates, and every ingredient. Names are normalized so your inventory is perfect. In seconds.',        img: '/invoice-extract.png', alt: 'Invoice data extracted automatically' },
        { num: '3', title: 'Operational Power & Perfect Margins', body: 'Your Dashboard lights up. Instant price alerts and full POS integration (Square/Revo) to deduct sold stock.',                         img: '/cehf-ejc.png',        alt: 'Cost analytics dashboard' },
      ],
      testimonialsTitle: 'What chefs tell us',
      testimonials: [
        { quote: 'Every week I lose hours entering invoices by hand. If this works the way you describe, I\'d sign up right now.',                  name: 'Jordi M.', role: 'Head Chef · Set-menu restaurant, Barcelona',    initials: 'JM', dark: false },
        { quote: 'The hard part isn\'t spending — it\'s knowing what you\'re spending on. I never have that visibility in real time.',              name: 'Ana R.',   role: 'Purchasing Manager · Boutique hotel, Costa Brava', initials: 'AR', dark: true  },
      ],
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
</script>

<svelte:head><title>{t.pageTitle}</title></svelte:head>

<!-- ── Lang toggle ──────────────────────────────────────────────────────── -->
<div class="fixed top-4 right-5 z-50">
  <button
    onclick={toggleLocale}
    class="text-xs font-semibold tracking-widest uppercase px-3 py-1.5 rounded-full
           border border-[#3e3850] text-[#9a90a8] bg-[#1e1e28]/80 backdrop-blur
           hover:text-[#e8b4a0] hover:border-[#c8847a] transition-colors"
  >{t.lang}</button>
</div>

<!-- ── Hero ─────────────────────────────────────────────────────────────── -->
<section class="bg-[#1e1e28] text-white px-6 pt-24 pb-20 text-center">
  <p class="text-[.68rem] font-bold tracking-[.22em] uppercase text-[#c8847a] mb-6">{t.eyebrow}</p>

  <h1 class="text-[2.6rem] md:text-5xl lg:text-[3.75rem] font-extrabold leading-[1.08] max-w-3xl mx-auto text-[#f0ece8] tracking-tight">
    {t.headline}
  </h1>

  <p class="mt-6 text-base md:text-lg text-[#9a90a8] max-w-lg mx-auto leading-relaxed">
    {t.sub}
  </p>

  <div class="mt-10 max-w-md mx-auto w-full">
    {#if form?.success}
      <div class="bg-[#2a2a38] border border-[#0d9488]/40 rounded-xl px-6 py-5 text-[#5eead4] text-sm leading-relaxed">
        {t.success}
      </div>
    {:else}
      <form
        method="POST" action="?/join" use:enhance
        onsubmit={(e) => {
          const input = (e.currentTarget as HTMLFormElement).querySelector('input[name="email"]') as HTMLInputElement;
          emailError = validateEmail(input.value);
          if (emailError) e.preventDefault();
        }}
        class="flex flex-col sm:flex-row gap-3"
      >
        <div class="flex-1 flex flex-col gap-1">
          <input type="email" name="email" placeholder={t.placeholder} autocomplete="email"
            class="w-full rounded-xl px-4 py-[.8rem] text-sm bg-[#2a2a38] border border-[#3e3850]
                   text-[#f0ece8] placeholder-[#5a5068]
                   focus:outline-none focus:border-[#0d9488] focus:ring-1 focus:ring-[#0d9488] transition-colors"
            oninput={() => { emailError = ''; }}
          />
          {#if emailError || serverError()}
            <p class="text-xs text-[#e8887e] text-left px-1">{emailError || serverError()}</p>
          {/if}
        </div>
        <button type="submit"
          class="shrink-0 rounded-xl px-6 py-[.8rem] text-sm font-bold
                 bg-[#0d9488] text-white hover:bg-[#0f766e] active:bg-[#134e4a]
                 transition-colors w-full sm:w-auto"
        >{t.submit}</button>
      </form>
      <p class="mt-3 text-[.72rem] text-[#5eead4] font-medium">✦ {t.incentive}</p>
      <p class="mt-2 text-[.7rem] text-[#4a4060]">{t.footerNote}</p>
    {/if}
  </div>
</section>

<!-- ── Integrations strip ─────────────────────────────────────────────────── -->
<div class="bg-[#16161e] border-y border-[#2a2a38] px-6 py-4">
  <div class="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-10">
    <p class="text-[.65rem] font-bold tracking-[.18em] uppercase text-[#5a5068] shrink-0">{t.integrationsLabel}</p>
    <div class="flex items-center gap-4 flex-wrap justify-center">
      {#each ['Square', 'Revo TPV', 'Excel / CSV'] as tool}
        <div class="flex items-center gap-2 px-4 py-[.45rem] rounded-lg bg-[#2a2a38] border border-[#3e3850]">
          <span class="w-2 h-2 rounded-full bg-[#2dd4bf] shrink-0"></span>
          <span class="text-[.75rem] font-semibold text-[#9a90a8]">{tool}</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<!-- ── Pain points ───────────────────────────────────────────────────────── -->
<section class="bg-[#f2f0f4] px-6 pt-20 pb-24">
  <div class="max-w-5xl mx-auto">
    <p class="text-[.68rem] font-bold tracking-[.22em] uppercase text-[#c8847a] mb-4 text-center">{t.painEyebrow}</p>
    <h2 class="text-3xl md:text-4xl font-extrabold text-[#1e1e28] text-center max-w-2xl mx-auto leading-[1.15] mb-14 tracking-tight">
      {t.painHead}
    </h2>

    <div class="grid md:grid-cols-3 rounded-2xl overflow-hidden shadow-md">
      {#each t.pain as item}
        <div class="flex flex-col gap-5 px-10 py-12
                    {item.dark ? 'bg-[#1e1e28]' : 'bg-white'}
                    border border-[#e8e4ec] md:border-0 md:border-r md:last:border-r-0
                    {item.dark ? 'md:border-r-[#3e3850]' : 'md:border-r-[#eceaf0]'}">
          <span class="text-[4.5rem] font-black leading-none tracking-tighter
                       {item.dark ? 'text-[#c8847a]' : 'text-[#c8847a]'}">
            {item.display}
          </span>
          <div class="flex flex-col gap-3">
            <h3 class="text-[1.05rem] font-bold leading-snug {item.dark ? 'text-[#f0ece8]' : 'text-[#1e1e28]'}">
              {item.title}
            </h3>
            <p class="text-sm leading-relaxed {item.dark ? 'text-[#7a7090]' : 'text-[#6a607a]'}">
              {item.body}
            </p>
          </div>
        </div>
      {/each}
    </div>
  </div>
</section>

<!-- ── Feature showcase ──────────────────────────────────────────────────── -->
<section class="bg-[#1e1e28] px-6 pt-20 pb-28">
  <p class="text-[.68rem] font-bold tracking-[.22em] uppercase text-[#c8847a] mb-20 text-center">{t.howTitle}</p>

  <div class="max-w-5xl mx-auto flex flex-col gap-28">
    {#each t.steps as step, i}
      <div class="grid md:grid-cols-2 gap-10 md:gap-24 items-center">

        <div class="flex flex-col gap-6 {i % 2 === 1 ? 'md:order-2' : ''}">
          <div class="w-9 h-9 rounded-full bg-[#c8847a]/15 border border-[#c8847a]/30
                      flex items-center justify-center text-[#e8b4a0] font-bold text-sm shrink-0">
            {step.num}
          </div>
          <h3 class="text-[1.75rem] md:text-[2.1rem] font-extrabold text-[#f0ece8] leading-[1.12] tracking-tight">
            {step.title}
          </h3>
          <p class="text-[.95rem] text-[#7a7090] leading-[1.7]">{step.body}</p>
        </div>

        <div class="{i % 2 === 1 ? 'md:order-1' : ''}">
          <div class="rounded-2xl overflow-hidden border border-[#3e3850] shadow-[0_20px_64px_rgba(0,0,0,0.45)]">
            <img src={step.img} alt={step.alt} class="w-full object-cover object-top block" loading="lazy" />
          </div>
        </div>

      </div>
    {/each}
  </div>
</section>

<!-- ── Testimonials ───────────────────────────────────────────────────────── -->
<section class="bg-[#f2f0f4] px-6 py-24">
  <h2 class="text-center text-3xl md:text-[2.2rem] font-extrabold text-[#1e1e28] mb-14 tracking-tight">
    {t.testimonialsTitle}
  </h2>

  <div class="max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
    {#each t.testimonials as item}
      <div class="rounded-2xl px-10 py-10 flex flex-col gap-6
                  {item.dark
                    ? 'bg-[#1e1e28] border border-[#3e3850]'
                    : 'bg-white border border-[#e4e0e8] shadow-sm'}">
        <span class="text-[3.5rem] leading-[0.75] font-black text-[#c8847a] select-none">"</span>
        <p class="text-[.975rem] leading-[1.7] {item.dark ? 'text-[#c8c0d8]' : 'text-[#2e2840]'}">
          {item.quote}
        </p>
        <div class="pt-5 border-t {item.dark ? 'border-[#2a2a38]' : 'border-[#f0ece8]'}
                    flex items-center gap-3 mt-auto">
          <div class="w-11 h-11 rounded-full bg-[#c8847a]/15 border border-[#c8847a]/30
                      flex items-center justify-center text-[#c8847a] font-bold text-xs shrink-0">
            {item.initials}
          </div>
          <div>
            <p class="text-sm font-bold {item.dark ? 'text-[#f0ece8]' : 'text-[#1e1e28]'}">{item.name}</p>
            <p class="text-xs {item.dark ? 'text-[#7a7090]' : 'text-[#9a90a8]'}">{item.role}</p>
          </div>
        </div>
      </div>
    {/each}
  </div>
</section>

<!-- ── Bottom CTA ────────────────────────────────────────────────────────── -->
<section class="bg-[#1e1e28] px-6 py-24 text-center">
  <div class="w-12 h-1 bg-[#0d9488] rounded-full mx-auto mb-8"></div>
  <h2 class="text-3xl md:text-[2.5rem] font-extrabold text-[#f0ece8] max-w-xl mx-auto leading-[1.12] tracking-tight">
    {t.ctaHeadline}
  </h2>
  <p class="mt-4 text-sm text-[#9a90a8] max-w-sm mx-auto leading-relaxed">{t.ctaSub}</p>

  <div class="mt-10 max-w-md mx-auto">
    {#if form?.success}
      <div class="bg-[#2a2a38] border border-[#0d9488]/40 rounded-xl px-6 py-5 text-[#5eead4] text-sm leading-relaxed">
        {t.success}
      </div>
    {:else}
      <form
        method="POST" action="?/join" use:enhance
        onsubmit={(e) => {
          const input = (e.currentTarget as HTMLFormElement).querySelector('input[name="email"]') as HTMLInputElement;
          const err = validateEmail(input.value);
          if (err) { emailError = err; e.preventDefault(); }
        }}
        class="flex flex-col sm:flex-row gap-3"
      >
        <div class="flex-1 flex flex-col gap-1">
          <input type="email" name="email" placeholder={t.placeholder} autocomplete="email"
            class="w-full rounded-xl px-4 py-[.8rem] text-sm bg-[#2a2a38] border border-[#3e3850]
                   text-[#f0ece8] placeholder-[#5a5068]
                   focus:outline-none focus:border-[#0d9488] focus:ring-1 focus:ring-[#0d9488] transition-colors"
            oninput={() => { emailError = ''; }}
          />
          {#if emailError || serverError()}
            <p class="text-xs text-[#e8887e] text-left px-1">{emailError || serverError()}</p>
          {/if}
        </div>
        <button type="submit"
          class="shrink-0 rounded-xl px-6 py-[.8rem] text-sm font-bold
                 bg-[#0d9488] text-white hover:bg-[#0f766e] active:bg-[#134e4a]
                 transition-colors w-full sm:w-auto"
        >{t.submit}</button>
      </form>
      <p class="mt-3 text-[.72rem] text-[#5eead4] font-medium">✦ {t.incentive}</p>
      <p class="mt-2 text-[.7rem] text-[#4a4060]">{t.footerNote}</p>
    {/if}
  </div>
</section>

<!-- ── Footer ────────────────────────────────────────────────────────────── -->
<footer class="bg-[#13131a] px-6 py-10 text-center">
  <p class="text-[.65rem] font-bold tracking-[.18em] uppercase text-[#3e3850]">Mise en Place</p>
  <p class="text-[.6rem] text-[#2e2840] mt-1">Barcelona · {new Date().getFullYear()}</p>
</footer>
