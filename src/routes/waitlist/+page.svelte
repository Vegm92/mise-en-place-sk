<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData } from './$types';

  const { form }: { form: ActionData } = $props();

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
      alreadyRegistered:'Ya estás en la lista. Te avisaremos en cuanto abramos el acceso.',
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
      alreadyRegistered:'You\'re already on the list. We\'ll reach out when early access opens.',
      errRequired:      'Enter your email to continue.',
      errInvalid:       'That doesn\'t look like a valid email.',
      incentive:        'Exclusive incentive: First 50 sign-ups get 1 month free and priority setup.',
      footerNote:       'We only store your email. No spam. No commitment.',
      integrationsLabel:'Works with your workflow:',
      painEyebrow:      'The problem',
      painHead:         'Every week you lose time and money without knowing it.',
      pain: [
        { display: '4–6h', title: 'Hours lost, every week',             body: 'Every invoice ends up in a spreadsheet — or worse, in a drawer. Your team spends 4 to 6 hours a week entering data by hand. That time is yours to take back.', dark: false },
        { display: '¿0?',  title: 'Real-time spend visibility',         body: 'How much did you spend on meat this week? Without a tool, answering that takes minutes. With Mise en Place, it\'s instant.',                                      dark: true  },
        { display: '+8%',  title: 'Price hikes you don\'t see coming',  body: 'Your supplier raises olive oil 8% and you find out three months later. Mise en Place detects the change and alerts you automatically.',                          dark: false },
      ],
      howTitle:         'That simple',
      steps: [
        { num: '1', title: 'Instant Capture & WhatsApp Bot',     body: 'Send a photo of the invoice via WhatsApp or upload the PDF to the web. No setup required. From anywhere.',                              img: '/taking-pic.png',      alt: 'Photographing an invoice with a phone' },
        { num: '2', title: 'Inference & Normalization',           body: 'Our Kitchen Brain extracts vendor, dates, and every ingredient. Names are normalized so your inventory is perfect. In seconds.',        img: '/invoice-extract.png', alt: 'Invoice data extracted automatically' },
        { num: '3', title: 'Operational Power & Perfect Margins', body: 'Your Dashboard lights up. Instant price alerts and full POS integration (Square/Revo) to deduct sold stock.',                         img: '/cehf-ejc.png',        alt: 'Cost analytics dashboard' },
      ],
      testimonialsTitle: 'What chefs tell us',
      testimonials: [
        { quote: 'Every week I lose hours entering invoices by hand. If this works the way you describe, I\'d sign up right now.',             name: 'Jordi M.', role: 'Head Chef · Set-menu restaurant, Barcelona',    initials: 'JM', dark: false },
        { quote: 'The hard part isn\'t spending — it\'s knowing what you\'re spending on. I never have that visibility in real time.',         name: 'Ana R.',   role: 'Purchasing Manager · Boutique hotel, Costa Brava', initials: 'AR', dark: true  },
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

<!-- Lang toggle -->
<div class="fixed top-4 right-5 z-50">
  <button
    onclick={toggleLocale}
    class="text-[11px] font-semibold tracking-widest uppercase px-3 py-[6px] rounded-full
           border border-[#2A2A2A] text-[#888888] bg-[#0A0A0A]/80 backdrop-blur
           hover:text-white hover:border-[#4A9FD8] transition-colors"
  >{t.lang}</button>
</div>

<!-- Hero -->
<section class="bg-[#0A0A0A] text-white px-6 pt-24 pb-20 text-center">
  <p class="text-[11px] font-bold tracking-[0.22em] uppercase text-[#4A9FD8] mb-6">{t.eyebrow}</p>

  <h1 class="text-[2.6rem] md:text-5xl lg:text-[3.75rem] font-extrabold leading-[1.08] max-w-3xl mx-auto text-white tracking-tight">
    {t.headline}
  </h1>

  <p class="mt-6 text-base md:text-lg text-[#888888] max-w-lg mx-auto leading-relaxed">
    {t.sub}
  </p>

  <div class="mt-10 max-w-md mx-auto w-full">
    {#if form?.success}
      <div class="bg-[#1A1A1A] border border-[#4A9FD8]/40 rounded-[12px] px-6 py-5 text-[#4A9FD8] text-[13px] leading-relaxed">
        {(form as { alreadyRegistered?: boolean }).alreadyRegistered ? t.alreadyRegistered : t.success}
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
            class="w-full rounded-[10px] px-4 py-3 text-[13px] bg-[#1A1A1A] border border-[#2A2A2A]
                   text-white placeholder-[#555555]
                   focus:outline-none focus:border-[#4A9FD8] transition-colors"
            oninput={() => { emailError = ''; }}
          />
          {#if emailError || serverError()}
            <p class="text-[12px] text-[#E05555] text-left px-1">{emailError || serverError()}</p>
          {/if}
        </div>
        <button type="submit"
          class="shrink-0 rounded-[10px] px-6 py-3 text-[13px] font-bold
                 bg-[#4A9FD8] text-white hover:bg-[#3d8ec7] active:bg-[#3480b8]
                 transition-colors w-full sm:w-auto"
        >{t.submit}</button>
      </form>
      <p class="mt-3 text-[11px] text-[#4A9FD8] font-medium">✦ {t.incentive}</p>
      <p class="mt-2 text-[11px] text-[#444444]">{t.footerNote}</p>
    {/if}
  </div>
</section>

<!-- Integrations strip -->
<div class="bg-[#111111] border-y border-[#1A1A1A] px-6 py-4">
  <div class="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-10">
    <p class="text-[10px] font-bold tracking-[0.18em] uppercase text-[#444444] shrink-0">{t.integrationsLabel}</p>
    <div class="flex items-center gap-3 flex-wrap justify-center">
      {#each ['Square', 'Revo TPV', 'Excel / CSV'] as tool}
        <div class="flex items-center gap-2 px-3 py-[6px] rounded-[8px] bg-[#1A1A1A] border border-[#2A2A2A]">
          <span class="w-2 h-2 rounded-full bg-[#4A9FD8] shrink-0"></span>
          <span class="text-[12px] font-semibold text-[#888888]">{tool}</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<!-- Pain points -->
<section class="bg-[#F0F2F5] px-6 pt-20 pb-24">
  <div class="max-w-5xl mx-auto">
    <p class="text-[11px] font-bold tracking-[0.22em] uppercase text-[#4A9FD8] mb-4 text-center">{t.painEyebrow}</p>
    <h2 class="text-3xl md:text-4xl font-extrabold text-[#1A1A1A] text-center max-w-2xl mx-auto leading-[1.15] mb-14 tracking-tight">
      {t.painHead}
    </h2>

    <div class="grid md:grid-cols-3 rounded-[16px] overflow-hidden shadow-md">
      {#each t.pain as item}
        <div class="flex flex-col gap-5 px-10 py-12
                    {item.dark ? 'bg-[#0A0A0A]' : 'bg-white'}
                    border border-[#E5E7EB] md:border-0 md:border-r md:last:border-r-0
                    {item.dark ? 'md:border-r-[#2A2A2A]' : 'md:border-r-[#E5E7EB]'}">
          <span class="text-[4.5rem] font-black leading-none tracking-tighter text-[#4A9FD8]">
            {item.display}
          </span>
          <div class="flex flex-col gap-3">
            <h3 class="text-[1.05rem] font-bold leading-snug {item.dark ? 'text-white' : 'text-[#1A1A1A]'}">
              {item.title}
            </h3>
            <p class="text-[13px] leading-relaxed {item.dark ? 'text-[#888888]' : 'text-[#666666]'}">
              {item.body}
            </p>
          </div>
        </div>
      {/each}
    </div>
  </div>
</section>

<!-- Feature showcase -->
<section class="bg-[#0A0A0A] px-6 pt-20 pb-28">
  <p class="text-[11px] font-bold tracking-[0.22em] uppercase text-[#4A9FD8] mb-20 text-center">{t.howTitle}</p>

  <div class="max-w-5xl mx-auto flex flex-col gap-28">
    {#each t.steps as step, i}
      <div class="grid md:grid-cols-2 gap-10 md:gap-24 items-center">

        <div class="flex flex-col gap-6 {i % 2 === 1 ? 'md:order-2' : ''}">
          <div class="w-9 h-9 rounded-full bg-[#4A9FD8]/15 border border-[#4A9FD8]/30
                      flex items-center justify-center text-[#4A9FD8] font-bold text-[13px] shrink-0">
            {step.num}
          </div>
          <h3 class="text-[1.75rem] md:text-[2.1rem] font-extrabold text-white leading-[1.12] tracking-tight">
            {step.title}
          </h3>
          <p class="text-[15px] text-[#888888] leading-[1.7]">{step.body}</p>
        </div>

        <div class="{i % 2 === 1 ? 'md:order-1' : ''}">
          <div class="rounded-[16px] overflow-hidden border border-[#2A2A2A] shadow-[0_20px_64px_rgba(0,0,0,0.45)]">
            <img src={step.img} alt={step.alt} class="w-full object-cover object-top block" loading="lazy" />
          </div>
        </div>

      </div>
    {/each}
  </div>
</section>

<!-- Testimonials -->
<section class="bg-[#F0F2F5] px-6 py-24">
  <h2 class="text-center text-3xl md:text-[2.2rem] font-extrabold text-[#1A1A1A] mb-14 tracking-tight">
    {t.testimonialsTitle}
  </h2>

  <div class="max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
    {#each t.testimonials as item}
      <div class="rounded-[16px] px-10 py-10 flex flex-col gap-6
                  {item.dark
                    ? 'bg-[#0A0A0A] border border-[#2A2A2A]'
                    : 'bg-white border border-[#E5E7EB] shadow-sm'}">
        <span class="text-[3.5rem] leading-[0.75] font-black text-[#4A9FD8] select-none">"</span>
        <p class="text-[15px] leading-[1.7] {item.dark ? 'text-[#AAAAAA]' : 'text-[#1A1A1A]'}">
          {item.quote}
        </p>
        <div class="pt-5 border-t {item.dark ? 'border-[#2A2A2A]' : 'border-[#F3F4F6]'}
                    flex items-center gap-3 mt-auto">
          <div class="w-11 h-11 rounded-full bg-[#4A9FD8]/15 border border-[#4A9FD8]/30
                      flex items-center justify-center text-[#4A9FD8] font-bold text-[12px] shrink-0">
            {item.initials}
          </div>
          <div>
            <p class="text-[13px] font-bold {item.dark ? 'text-white' : 'text-[#1A1A1A]'}">{item.name}</p>
            <p class="text-[12px] {item.dark ? 'text-[#888888]' : 'text-[#888888]'}">{item.role}</p>
          </div>
        </div>
      </div>
    {/each}
  </div>
</section>

<!-- Bottom CTA -->
<section class="bg-[#0A0A0A] px-6 py-24 text-center">
  <div class="w-12 h-1 bg-[#4A9FD8] rounded-full mx-auto mb-8"></div>
  <h2 class="text-3xl md:text-[2.5rem] font-extrabold text-white max-w-xl mx-auto leading-[1.12] tracking-tight">
    {t.ctaHeadline}
  </h2>
  <p class="mt-4 text-[13px] text-[#888888] max-w-sm mx-auto leading-relaxed">{t.ctaSub}</p>

  <div class="mt-10 max-w-md mx-auto">
    {#if form?.success}
      <div class="bg-[#1A1A1A] border border-[#4A9FD8]/40 rounded-[12px] px-6 py-5 text-[#4A9FD8] text-[13px] leading-relaxed">
        {(form as { alreadyRegistered?: boolean }).alreadyRegistered ? t.alreadyRegistered : t.success}
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
            class="w-full rounded-[10px] px-4 py-3 text-[13px] bg-[#1A1A1A] border border-[#2A2A2A]
                   text-white placeholder-[#555555]
                   focus:outline-none focus:border-[#4A9FD8] transition-colors"
            oninput={() => { emailError = ''; }}
          />
          {#if emailError || serverError()}
            <p class="text-[12px] text-[#E05555] text-left px-1">{emailError || serverError()}</p>
          {/if}
        </div>
        <button type="submit"
          class="shrink-0 rounded-[10px] px-6 py-3 text-[13px] font-bold
                 bg-[#4A9FD8] text-white hover:bg-[#3d8ec7] active:bg-[#3480b8]
                 transition-colors w-full sm:w-auto"
        >{t.submit}</button>
      </form>
      <p class="mt-3 text-[11px] text-[#4A9FD8] font-medium">✦ {t.incentive}</p>
      <p class="mt-2 text-[11px] text-[#444444]">{t.footerNote}</p>
    {/if}
  </div>
</section>

<!-- Footer -->
<footer class="bg-[#060606] px-6 py-10 text-center">
  <div class="flex items-center justify-center gap-2 mb-2">
    <div class="w-5 h-5 rounded-[5px] bg-[#4A9FD8] flex items-center justify-center shrink-0">
      <span class="text-white text-[9px] font-bold leading-none">M</span>
    </div>
    <span class="text-[12px] font-semibold text-[#2A2A2A]">Mise en Place</span>
  </div>
  <p class="text-[11px] text-[#222222]">Barcelona · {new Date().getFullYear()}</p>
</footer>
