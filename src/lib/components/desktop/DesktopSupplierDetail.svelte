<script lang="ts">
  import { categoryColor, categoryTint, seriesColor, SERIES_OTHER } from '$lib/colors';
  import { fmtEur, fmtDate, fmtDateShort, fmtMonthShort, initials } from '$lib/formatters';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Mail from '@lucide/svelte/icons/mail';
  import Phone from '@lucide/svelte/icons/phone';
  import MapPin from '@lucide/svelte/icons/map-pin';
  import Truck from '@lucide/svelte/icons/truck';
  import CreditCard from '@lucide/svelte/icons/credit-card';
  import StatusBadge from '$lib/components/mep/StatusBadge.svelte';
  import { locale, t, ti, tp, tcat } from '$lib/i18n';
  import { getScoreColor } from '$lib/status';

  function scoreLabelKey(score: number): string {
    if (score >= 70) return 'sup.score.very';
    if (score >= 40) return 'sup.score.ok';
    return 'sup.score.poor';
  }

  interface Supplier {
    name: string;
    category: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    cif: string | null;
    iban: string | null;
    address: string | null;
    deliveryDays: string | null;
    paymentTerms: string | null;
    notes: string | null;
    alias: string | null;
  }
  interface Invoice {
    id: number;
    invoiceNumber: string | null;
    invoiceDate: string | null;
    dueDate: string | null;
    totalAmount: number | null;
    status: string | null;
  }
  interface Metrics {
    score: number;
    priceStabilityCv: number | null;
    priceStabilityScore: number;
    frequencyScore: number;
    timelinessScore: number;
  }
  interface MonthlyBar { key: string; value: number; partial: boolean }
  interface Conversion {
    id: number;
    ingredient: string;
    purchaseUnit: string;
    canonicalUnit: string;
    conversionFactor: number;
  }
  interface Product {
    description: string | null;
    unit: string | null;
    avgPrice: number | null;
    totalQty: number | null;
    totalSpend: number | null;
    lastDate: string | null;
  }

  let {
    supplier: s,
    invoices,
    metrics: m,
    monthly,
    conversions,
    products,
    categories,
    prefillIngredient = '',
    prefillPurchaseUnit = '',
    tab       = $bindable<'resumen'|'albaranes'|'productos'|'conversiones'>('resumen'),
    editing   = $bindable(false),
    confirmDelete = $bindable(false),
    highlightCategory = $bindable(false),
  }: {
    supplier: Supplier;
    invoices: Invoice[];
    metrics: Metrics | null;
    monthly: MonthlyBar[];
    conversions: Conversion[];
    products: Product[];
    categories: string[];
    prefillIngredient?: string;
    prefillPurchaseUnit?: string;
    tab?: 'resumen'|'albaranes'|'productos'|'conversiones';
    editing?: boolean;
    confirmDelete?: boolean;
    highlightCategory?: boolean;
  } = $props();

  const color = $derived(categoryColor(s.category));
  const tint  = $derived(categoryTint(s.category));

  const today = new Date().toISOString().slice(0, 10);

  const totalSpend = $derived(invoices.reduce((a, i) => a + (i.totalAmount ?? 0), 0));
  const paidCount  = $derived(invoices.filter(i => i.status === 'paid').length);
  const openCount  = $derived(invoices.filter(i => i.status === 'pending').length);
  const avgInvoice = $derived(invoices.length ? totalSpend / invoices.length : 0);
  const pendingAmt = $derived(invoices.filter(i => i.status === 'pending').reduce((a, i) => a + (i.totalAmount ?? 0), 0));

  const chartMax = $derived(Math.max(...monthly.map(m => m.value), 1));
  const chartAvg = $derived((() => {
    const nonZero = monthly.filter(m => m.value > 0);
    return nonZero.length ? nonZero.reduce((s, m) => s + m.value, 0) / nonZero.length : 0;
  })());

  interface DonutSlice {
    label: string; spend: number; pct: number; color: string;
    unit: string | null; totalQty: number | null; avgPrice: number | null; lastDate: string | null;
    dash: number; offset: number;
  }
  const productDonut = $derived((() => {
    const ranked = [...products]
      .map(p => ({ ...p, spend: p.totalSpend ?? (p.avgPrice ?? 0) * (p.totalQty ?? 0) }))
      .sort((a, b) => b.spend - a.spend);
    const total = ranked.reduce((a, p) => a + p.spend, 0);
    if (total <= 0) return { slices: [] as DonutSlice[], total: 0 };

    const top = ranked.slice(0, 5);
    const rest = ranked.slice(5);
    const restSpend = rest.reduce((a, p) => a + p.spend, 0);

    const entries = top.map((p, i) => ({
      label: p.description ?? '—', spend: p.spend, color: seriesColor(i),
      unit: p.unit, totalQty: p.totalQty, avgPrice: p.avgPrice, lastDate: p.lastDate,
    }));
    if (restSpend > 0) {
      entries.push({ label: t('sup.products.other'), spend: restSpend, color: SERIES_OTHER,
        unit: null, totalQty: null, avgPrice: null, lastDate: null });
    }

    let cursor = 0;
    const CIRC = 2 * Math.PI * 70;
    const slices: DonutSlice[] = entries.map(e => {
      const pct = e.spend / total;
      const dash = pct * CIRC;
      const slice: DonutSlice = { ...e, pct, dash, offset: cursor };
      cursor += dash;
      return slice;
    });
    return { slices, total };
  })());
  let hoveredSlice = $state<number | null>(null);

  const CL = 40;
  const CW = 620;
  const CH = 140;
  const CB = 170;
  const VW = 700;

  function invoiceStatus(inv: Invoice): string {
    if (inv.status === 'paid') return 'paid';
    if (inv.dueDate && inv.dueDate < today) return 'overdue';
    return inv.status ?? 'pending';
  }
</script>

<div class="hidden md:flex h-full flex-col overflow-hidden">
  <div class="flex flex-col flex-1 min-h-0">

    <div class="px-6 pt-[18px] shrink-0">

      <div class="flex items-center gap-1.5 text-xs text-fg-3 mb-3">
        <a href="/suppliers" class="text-fg-3 no-underline inline-flex items-center gap-1">
          <ArrowLeft size={12} /> {t('nav.suppliers')}
        </a>
        <ChevronRight size={11} />
        <span class="text-fg-2">{s.name}</span>
      </div>

      <div class="flex items-center gap-4 mb-4">
        <div class="w-[52px] h-[52px] rounded-full shrink-0 inline-flex items-center justify-center text-base font-bold"
          style="background:{tint};color:{color};">{initials(s.name)}</div>
        <div class="flex-1 min-w-0">
          <h1 class="mb-1 text-[22px] font-semibold text-fg tracking-[-0.4px]">{s.name}</h1>
          <div class="flex items-center gap-3 text-[12.5px] text-fg-3">
            {#if s.category}
              <span class="inline-flex items-center gap-[5px]">
                <span class="swatch" style="background:{color};"></span>
                {tcat(s.category)}
              </span>
            {:else}
              <span class="italic">{t('sup.noCategory')}</span>
            {/if}
            {#if s.contactEmail}
              <span>· {s.contactEmail}</span>
            {/if}
          </div>
        </div>
        {#if !editing}
          <div class="flex gap-2">
            {#if s.contactEmail}
              <a href="mailto:{s.contactEmail}" class="btn btn-secondary text-[12.5px] inline-flex items-center gap-1.5 no-underline">
                <Mail size={13} /> {t('sup.contact')}
              </a>
            {/if}
            <button class="btn btn-secondary text-[12.5px] inline-flex items-center gap-1.5"
              onclick={() => { editing = true; confirmDelete = false; }}>
              <Pencil size={13} /> {t('action.edit')}
            </button>
            <button class="btn text-[12.5px] text-neg border-neg inline-flex items-center gap-1.5"
              onclick={() => { confirmDelete = !confirmDelete; }}>
              <Trash2 size={13} /> {t('action.delete')}
            </button>
          </div>
        {/if}
      </div>

      {#if confirmDelete}
        <div class="card p-3.5 border-l-[3px] border-l-neg mb-3.5">
          <p class="body-strong text-neg mb-2">{t('sup.confirmDelete.title')}</p>
          <p class="body text-fg-3 text-xs mb-3">
            {tp('sup.confirmDelete.body', invoices.length)}
          </p>
          <div class="flex gap-2">
            <form method="post" action="?/delete">
              <button type="submit" class="btn bg-neg text-neg-fg border-neg h-[30px] text-xs">
                {t('sup.confirmDelete.yes')}
              </button>
            </form>
            <button class="btn h-[30px] text-xs" onclick={() => confirmDelete = false}>{t('edit.cancel')}</button>
          </div>
        </div>
      {/if}

      {#if editing}
        <div class="card p-5 mb-3.5">
          <p class="body-strong mb-3.5">{t('sup.edit.title')}</p>
          <form method="post" action="?/update" class="flex flex-col gap-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="edit-name" class="label block mb-1">{t('sup.field.name')}</label>
                <input id="edit-name" class="input w-full" name="name" value={s.name} required />
              </div>
              <div>
                <label for="edit-category" class="label block mb-1">{t('sup.field.category')}</label>
                <select id="edit-category" class="input w-full" class:mep-field-highlight={highlightCategory} name="category"
                  onfocus={() => highlightCategory = false} onchange={() => highlightCategory = false}>
                  <option value="">{t('sup.noCategory')}</option>
                  {#each categories as cat}
                    <option value={cat} selected={s.category === cat}>{tcat(cat)}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label for="edit-cif" class="label block mb-1">{t('sup.field.cif')}</label>
                <input id="edit-cif" class="input w-full" name="cif" value={s.cif ?? ''} placeholder="B12345678" />
              </div>
              <div>
                <label for="edit-iban" class="label block mb-1">{t('sup.field.iban')}</label>
                <input id="edit-iban" class="input w-full" name="iban" value={s.iban ?? ''} placeholder={t('sup.ph.iban')} />
              </div>
              <div>
                <label for="edit-address" class="label block mb-1">{t('sup.field.address')}</label>
                <input id="edit-address" class="input w-full" name="address" value={s.address ?? ''} placeholder={t('sup.ph.address')} />
              </div>
              <div>
                <label for="edit-email" class="label block mb-1">{t('sup.field.email')}</label>
                <input id="edit-email" class="input w-full" name="contact_email" type="email" value={s.contactEmail ?? ''} placeholder={t('sup.ph.email')} />
              </div>
              <div>
                <label for="edit-phone" class="label block mb-1">{t('sup.field.phone')}</label>
                <input id="edit-phone" class="input w-full" name="contact_phone" type="tel" value={s.contactPhone ?? ''} placeholder="+34 600 000 000" />
              </div>
              <div>
                <label for="edit-delivery" class="label block mb-1">{t('sup.field.delivery')}</label>
                <input id="edit-delivery" class="input w-full" name="delivery_days" value={s.deliveryDays ?? ''} placeholder={t('sup.ph.delivery')} />
              </div>
              <div>
                <label for="edit-terms" class="label block mb-1">{t('sup.field.terms')}</label>
                <input id="edit-terms" class="input w-full" name="payment_terms" value={s.paymentTerms ?? ''} placeholder={t('sup.ph.terms')} />
              </div>
              <div>
                <label for="edit-notes" class="label block mb-1">{t('field.notes')}</label>
                <input id="edit-notes" class="input w-full" name="notes" value={s.notes ?? ''} placeholder={t('sup.ph.notes')} />
              </div>
            </div>
            <div class="flex gap-2 mt-1">
              <button type="submit" class="btn btn-primary text-[12.5px]">{t('set.save')}</button>
              <button type="button" class="btn text-[12.5px]" onclick={() => editing = false}>{t('edit.cancel')}</button>
            </div>
          </form>
        </div>
      {/if}

      <div class="flex gap-0 border-b border-divider">
        {#each [
          { id: 'resumen',      label: t('sup.tab.resumen') },
          { id: 'albaranes',     label: t('nav.invoices'),    count: invoices.length },
          { id: 'productos',    label: t('sup.tab.productos') },
          { id: 'conversiones', label: t('sup.tab.conversiones') },
        ] as tabItem}
          <button
            class="border-0 bg-transparent cursor-pointer font-[inherit] px-4 py-2.5 -mb-px text-[13px] inline-flex items-center gap-1.5 {tab === tabItem.id ? 'border-b-2 border-b-acc font-semibold text-fg' : 'border-b-2 border-b-transparent font-medium text-fg-3'}"
            onclick={() => tab = tabItem.id as typeof tab}>
            {tabItem.label}
            {#if tabItem.count !== undefined}
              <span class="text-[11px] font-medium px-1.5 py-px rounded-full bg-surface-2 text-fg-3">{tabItem.count}</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-auto px-6 pt-[18px] pb-6">

      {#if tab === 'resumen'}
        <div class="grid grid-cols-[1.4fr_1fr] gap-3.5 items-start">

          <div class="flex flex-col gap-3.5">

            <div class="card px-4 pt-4 pb-3">
              <div class="flex items-center justify-between mb-1">
                <div>
                  <div class="subtitle">{t('sup.monthlySpend')}</div>
                  <div class="text-xs text-fg-3 mt-0.5">{t('sup.last7months')}</div>
                </div>
                {#if chartAvg > 0}
                  <div class="flex items-baseline gap-2">
                    <span class="num text-xl font-semibold text-fg tracking-[-0.4px]">{fmtEur(chartAvg, locale.current)}</span>
                    <span class="text-[11.5px] text-fg-3">{t('sup.monthlyAvg')}</span>
                  </div>
                {/if}
              </div>
              <svg width="100%" viewBox="0 0 {VW} 200" class="block overflow-visible mt-3">
                {#each monthly as bar, i}
                  {@const colW = CW / monthly.length}
                  {@const bx   = CL + i * colW + (colW - 36) / 2}
                  {@const bh   = chartMax > 0 ? (bar.value / chartMax) * CH : 0}
                  {@const by   = CB - bh}
                  {#if bh > 0}
                    <rect x={bx} y={by} width={36} height={bh}
                      fill={bar.partial ? 'var(--mep-acc-soft)' : color}
                      stroke={bar.partial ? color : 'none'}
                      stroke-dasharray={bar.partial ? '3 2' : ''}
                      stroke-width="1.2"
                      rx="2" />
                    <text x={bx + 18} y={by - 4} text-anchor="middle"
                      font-size="10.5" font-weight="500" class="fill-fg">
                      {bar.value >= 1000
                        ? (bar.value / 1000).toFixed(1).replace('.', ',') + 'k'
                        : fmtEur(bar.value, locale.current)}
                    </text>
                  {/if}
                  <text x={bx + 18} y={CB + 14} text-anchor="middle"
                    font-size="10.5" class="fill-fg-3">{fmtMonthShort(bar.key, locale.current)}</text>
                {/each}
                {#if chartAvg > 0}
                  {@const avgY = CB - (chartAvg / chartMax) * CH}
                  <line x1={CL} x2={CL + CW} y1={avgY} y2={avgY}
                    class="stroke-fg-3" stroke-dasharray="4 4" stroke-width="1" />
                {/if}
              </svg>
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div class="card p-3.5">
                <div class="label mb-1.5">{t('sup.avgInvoice')}</div>
                <div class="num text-xl font-semibold text-fg tracking-[-0.4px] leading-[1.1]">
                  {fmtEur(avgInvoice, locale.current)}
                </div>
                <div class="text-[11.5px] text-fg-3 mt-1.5">{tp('misc.invoice', invoices.length)}</div>
              </div>
              <div class="card p-3.5">
                <div class="label mb-1.5">{t('sup.openInvoices')}</div>
                <div class="num text-xl font-semibold tracking-[-0.4px] leading-[1.1] {openCount > 0 ? 'text-warn' : 'text-fg'}">
                  {openCount}
                </div>
                <div class="text-[11.5px] text-fg-3 mt-1.5">{paidCount} {t('sup.paid')}</div>
              </div>
              <div class="card p-3.5">
                <div class="label mb-1.5">{t('sup.pendingPayment')}</div>
                <div class="num text-xl font-semibold tracking-[-0.4px] leading-[1.1] {pendingAmt > 0 ? 'text-warn' : 'text-fg'}">
                  {fmtEur(pendingAmt, locale.current)}
                </div>
                <div class="text-[11.5px] text-fg-3 mt-1.5">{t('sup.openAmount')}</div>
              </div>
            </div>

            {#if m}
              <div class="card p-5">
                <div class="flex items-center gap-4 mb-4">
                  <div>
                    <div class="subtitle mb-0.5">{t('sup.reliability')}</div>
                    <div class="text-[11px] text-fg-3">{t('sup.reliability.sub')}</div>
                  </div>
                  <div class="flex-1"></div>
                  <div class="w-[52px] h-[52px] rounded-full flex items-center justify-center flex-col"
                    style="border:3px solid {getScoreColor(m.score)};">
                    <span class="text-[15px] font-bold leading-none" style="color:{getScoreColor(m.score)};">{m.score}</span>
                    <span class="text-[11px] text-fg-3">/100</span>
                  </div>
                  <span class="text-xs font-semibold" style="color:{getScoreColor(m.score)};">{t(scoreLabelKey(m.score))}</span>
                </div>
                <div class="grid grid-cols-3 gap-2.5">
                  <div class="p-2.5 bg-surface-2 rounded-lg">
                    <div class="flex justify-between items-center mb-1">
                      <span class="label">{t('sup.score.prices')}</span>
                      <span class="text-xs font-bold" style="color:{getScoreColor(m.priceStabilityScore * 3)};">{m.priceStabilityScore}/33</span>
                    </div>
                    <p class="text-[11px] text-fg-3 m-0">
                      {#if m.priceStabilityCv !== null}CV: {m.priceStabilityCv.toFixed(1)}%{:else}{t('sup.score.noData')}{/if}
                    </p>
                  </div>
                  <div class="p-2.5 bg-surface-2 rounded-lg">
                    <div class="flex justify-between items-center mb-1">
                      <span class="label">{t('sup.score.regularity')}</span>
                      <span class="text-xs font-bold" style="color:{getScoreColor(m.frequencyScore * 3)};">{m.frequencyScore}/33</span>
                    </div>
                    <p class="text-[11px] text-fg-3 m-0">{t('sup.score.historical')}</p>
                  </div>
                  <div class="p-2.5 bg-surface-2 rounded-lg">
                    <div class="flex justify-between items-center mb-1">
                      <span class="label">{t('sup.score.punctuality')}</span>
                      <span class="text-xs font-bold" style="color:{getScoreColor(m.timelinessScore * 2.9)};">{m.timelinessScore}/34</span>
                    </div>
                    <p class="text-[11px] text-fg-3 m-0">{t('sup.score.timeliness')}</p>
                  </div>
                </div>
              </div>
            {:else if invoices.length < 3}
              <div class="card p-4 flex items-center gap-2.5">
                <span class="text-xl opacity-40">📊</span>
                <div>
                  <p class="body-strong text-fg-2">{t('sup.insufficient')}</p>
                  <p class="text-xs text-fg-3">{t('sup.insufficient.desc')}</p>
                </div>
              </div>
            {/if}

          </div>

          <div class="flex flex-col gap-3.5">

            <div class="card p-4">
              <div class="subtitle mb-2.5">{t('sup.info')}</div>
              {#if !s.contactEmail && !s.contactPhone && !s.cif && !s.iban && !s.address && !s.deliveryDays && !s.paymentTerms && !s.notes && !s.alias}
                <p class="text-[12.5px] text-fg-3 italic">{t('sup.noContact')}</p>
                <button class="btn btn-secondary h-[28px] text-xs mt-2"
                  onclick={() => { editing = true; confirmDelete = false; }}>
                  <Pencil size={11} /> {t('sup.addData')}
                </button>
              {:else}
                <div class="flex flex-col gap-2.5">
                  {#if s.contactEmail}
                    <div class="flex items-center gap-2.5 text-[12.5px] text-fg-2">
                      <Mail size={14} class="text-fg-3 shrink-0" />
                      <a href="mailto:{s.contactEmail}" class="text-fg-2 no-underline overflow-hidden text-ellipsis whitespace-nowrap">{s.contactEmail}</a>
                    </div>
                  {/if}
                  {#if s.contactPhone}
                    <div class="flex items-center gap-2.5 text-[12.5px] text-fg-2">
                      <Phone size={14} class="text-fg-3 shrink-0" />
                      <a href="tel:{s.contactPhone}" class="text-fg-2 no-underline">{s.contactPhone}</a>
                    </div>
                  {/if}
                  {#if s.cif}
                    <div class="flex items-center gap-2.5 text-[12.5px] text-fg-2">
                      <CreditCard size={14} class="text-fg-3 shrink-0" />
                      <span>{t('sup.field.cif')}: {s.cif}</span>
                    </div>
                  {/if}
                  {#if s.iban}
                    <div class="flex items-center gap-2.5 text-[12.5px] text-fg-2">
                      <CreditCard size={14} class="text-fg-3 shrink-0" />
                      <span>{t('sup.field.iban')}: {s.iban}</span>
                    </div>
                  {/if}
                  {#if s.address}
                    <div class="flex items-center gap-2.5 text-[12.5px] text-fg-2">
                      <MapPin size={14} class="text-fg-3 shrink-0" />
                      <span>{s.address}</span>
                    </div>
                  {/if}
                  {#if s.deliveryDays}
                    <div class="flex items-center gap-2.5 text-[12.5px] text-fg-2">
                      <Truck size={14} class="text-fg-3 shrink-0" />
                      <span>{t('sup.deliveryPrefix')}: {s.deliveryDays}</span>
                    </div>
                  {/if}
                  {#if s.paymentTerms}
                    <div class="flex items-center gap-2.5 text-[12.5px] text-fg-2">
                      <CreditCard size={14} class="text-fg-3 shrink-0" />
                      <span>{t('sup.paymentPrefix')}: {s.paymentTerms}</span>
                    </div>
                  {/if}
                  {#if s.alias}
                    <div class="text-[12.5px] text-fg-3">{t('sup.aliasPrefix')}: {s.alias}</div>
                  {/if}
                  {#if s.notes}
                    <div class="text-[12.5px] text-fg-3 italic">{s.notes}</div>
                  {/if}
                </div>
              {/if}
            </div>

            <div class="card p-0 overflow-hidden">
              <div class="px-4 pt-3.5 pb-2 flex items-center justify-between">
                <div class="subtitle">{t('dash.invoices')}</div>
                {#if invoices.length > 5}
                  <button class="text-[12.5px] text-acc font-medium bg-none border-0 cursor-pointer p-0"
                    onclick={() => tab = 'albaranes'}>
                    {ti('sup.viewAll', { n: invoices.length })}
                  </button>
                {/if}
              </div>
              {#if !invoices.length}
                <div class="px-4 pt-4 pb-5 text-center">
                  <p class="text-[12.5px] text-fg-3">{t('sup.noInvoices')}</p>
                </div>
              {:else}
                {#each invoices.slice(0, 5) as inv (inv.id)}
                  <a href="/invoice/{inv.id}" class="px-4 py-2.5 flex items-center gap-2.5 border-t border-divider no-underline text-inherit">
                    <div class="flex-1 min-w-0">
                      <div class="num text-[12.5px] font-medium text-fg">
                        {inv.invoiceNumber ?? '—'}
                      </div>
                      <div class="text-[11px] text-fg-3">{fmtDateShort(inv.invoiceDate, locale.current)}</div>
                    </div>
                    <div class="num text-[13px] font-medium text-fg">
                      {fmtEur(inv.totalAmount ?? 0, locale.current)}
                    </div>
                    <StatusBadge status={invoiceStatus(inv)} style="font-size:11px;padding:1px 5px;" />
                  </a>
                {/each}
              {/if}
            </div>

          </div>
        </div>

      {:else if tab === 'albaranes'}
        {#if !invoices.length}
          <div class="text-center px-6 py-12">
            <p class="text-[13px] text-fg-3">{t('sup.noInvoices')}</p>
          </div>
        {:else}
          <div class="card p-0 overflow-hidden">
            <table class="tbl table-fixed">
              <thead>
                <tr>
                  <th class="w-[150px]">{t('sup.tbl.number')}</th>
                  <th class="w-[110px]">{t('tbl.date')}</th>
                  <th class="w-[110px]">{t('tbl.due')}</th>
                  <th class="num w-[130px]">{t('sup.tbl.amount')}</th>
                  <th class="w-[100px]">{t('tbl.status')}</th>
                </tr>
              </thead>
              <tbody>
                {#each invoices as inv (inv.id)}
                  <tr class="row cursor-pointer" onclick={() => location.replace(`/invoice/${inv.id}`)}>
                    <td class="text-[12.5px] text-fg-2">{inv.invoiceNumber ?? '—'}</td>
                    <td class="text-[12.5px]">{fmtDate(inv.invoiceDate, locale.current)}</td>
                    <td class="text-[12.5px] text-fg-2">{fmtDate(inv.dueDate, locale.current)}</td>
                    <td class="num font-medium">{fmtEur(inv.totalAmount ?? 0, locale.current)}</td>
                    <td><StatusBadge status={invoiceStatus(inv)} style="font-size:11px;padding:2px 7px;" /></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}

      {:else if tab === 'productos'}
        {#if products.length === 0}
          <div class="card p-6 flex items-center gap-2.5">
            <span class="text-[22px] opacity-35">📦</span>
            <p class="text-[12.5px] text-fg-3 m-0">{t('sup.products.empty')}</p>
          </div>
        {:else}
          <div class="card p-4 mb-3.5">
            <div class="subtitle mb-3">{t('sup.products.dominance')}</div>
            <div class="flex gap-6 items-center">
              <div class="relative shrink-0 w-[180px] h-[180px]">
                <svg width="180" height="180" viewBox="0 0 180 180" class="overflow-visible -rotate-90">
                  {#each productDonut.slices as slice, i}
                    {@const CIRC = 2 * Math.PI * 70}
                    {@const GAP = productDonut.slices.length > 1 ? 2 : 0}
                    <circle cx="90" cy="90" r="70" fill="none"
                      stroke={slice.color}
                      stroke-width={hoveredSlice === i ? 30 : 26}
                      stroke-dasharray="{Math.max(slice.dash - GAP, 0)} {CIRC - slice.dash + GAP}"
                      stroke-dashoffset={-slice.offset}
                      opacity={hoveredSlice === null || hoveredSlice === i ? 1 : 0.35}
                      style="cursor:pointer;transition:stroke-width 120ms,opacity 120ms;"
                      role="img"
                      aria-label="{slice.label}: {fmtEur(slice.spend, locale.current)} ({(slice.pct * 100).toFixed(0)}%)"
                      onmouseenter={() => hoveredSlice = i}
                      onmouseleave={() => hoveredSlice = null} />
                  {/each}
                </svg>
                <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  {#if hoveredSlice !== null && productDonut.slices[hoveredSlice]}
                    <span class="num text-[15px] font-semibold text-fg">{(productDonut.slices[hoveredSlice].pct * 100).toFixed(0)}%</span>
                    <span class="text-[11px] text-fg-3 max-w-[100px] text-center overflow-hidden text-ellipsis whitespace-nowrap">{productDonut.slices[hoveredSlice].label}</span>
                  {:else}
                    <span class="num text-[15px] font-semibold text-fg">{fmtEur(productDonut.total, locale.current)}</span>
                    <span class="text-[11px] text-fg-3">{t('sup.products.totalSpend')}</span>
                  {/if}
                </div>
              </div>

              <div class="flex-1 min-w-0 flex flex-col gap-[7px]">
                {#each productDonut.slices as slice, i}
                  <div class="flex items-center gap-2 px-1.5 py-1 rounded-md cursor-default {hoveredSlice === i ? 'bg-surface-2' : 'bg-transparent'}"
                    role="group" aria-label={slice.label}
                    onmouseenter={() => hoveredSlice = i} onmouseleave={() => hoveredSlice = null}>
                    <span class="w-[9px] h-[9px] rounded-[2px] shrink-0" style="background:{slice.color};"></span>
                    <span class="text-xs text-fg-2 flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" title={slice.label}>
                      {slice.label}
                    </span>
                    <span class="num text-[11.5px] text-fg-3 shrink-0 w-[34px] text-right">{(slice.pct * 100).toFixed(0)}%</span>
                    <span class="num text-xs font-medium text-fg shrink-0 w-20 text-right">{fmtEur(slice.spend, locale.current)}</span>
                  </div>
                  {#if slice.totalQty != null}
                    <div class="sup-product-detail text-[11px] text-fg-3 -mt-0.5 mb-0.5 ml-[23px]" class:is-visible={hoveredSlice === i}>
                      {slice.totalQty.toFixed(2)} {slice.unit ?? ''} · {t('sup.products.avgPrice')} {fmtEur(slice.avgPrice ?? 0, locale.current)}{slice.lastDate ? ` · ${fmtDateShort(slice.lastDate, locale.current)}` : ''}
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
          </div>
          <div class="card p-0 overflow-hidden">
            <table class="tbl table-fixed">
              <thead>
                <tr>
                  <th>{t('tbl.desc')}</th>
                  <th class="w-[90px]">{t('tbl.unit')}</th>
                  <th class="num w-[120px]">{t('sup.products.avgPrice')}</th>
                  <th class="num w-[130px]">{t('sup.products.colSpend')}</th>
                  <th class="num w-[150px]">{t('sup.products.colUnits')}</th>
                  <th class="w-[130px]">{t('sup.products.lastDate')}</th>
                </tr>
              </thead>
              <tbody>
                {#each products as p (p.description + '|' + p.unit)}
                  <tr>
                    <td class="text-[12.5px]">{p.description ?? '—'}</td>
                    <td class="text-[12.5px] text-fg-2">{p.unit ?? '—'}</td>
                    <td class="num text-[12.5px]">{p.avgPrice != null ? fmtEur(p.avgPrice, locale.current) : '—'}</td>
                    <td class="num text-[12.5px]">{p.totalSpend != null ? fmtEur(p.totalSpend, locale.current) : '—'}</td>
                    <td class="num text-[12.5px]">{p.totalQty != null ? p.totalQty.toFixed(2) : '—'}</td>
                    <td class="text-[12.5px] text-fg-2">{p.lastDate ? fmtDateShort(p.lastDate, locale.current) : '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}

      {:else if tab === 'conversiones'}
        <div class="flex flex-col gap-3.5">

          {#if conversions.length > 0}
            <div class="card p-0 overflow-hidden">
              <table class="tbl table-fixed">
                <thead>
                  <tr>
                    <th>{t('sup.conv.ingredient')}</th>
                    <th class="w-[140px]">{t('sup.conv.purchaseUnit')}</th>
                    <th class="w-[140px]">{t('sup.conv.canonicalUnit')}</th>
                    <th class="num w-[100px]">{t('sup.conv.factor')}</th>
                    <th class="w-[80px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each conversions as conv (conv.id)}
                    <tr>
                      <td class="text-[12.5px]">{conv.ingredient}</td>
                      <td class="text-[12.5px] text-fg-2">{conv.purchaseUnit}</td>
                      <td class="text-[12.5px] text-fg-2">{conv.canonicalUnit}</td>
                      <td class="num text-[12.5px]">{conv.conversionFactor}</td>
                      <td>
                        <form method="post" action="?/deleteConversion" class="m-0">
                          <input type="hidden" name="conversion_id" value={conv.id} />
                          <button type="submit" class="btn h-[26px] text-[11px] text-neg border-neg px-2 py-0">
                            {t('sup.conv.delete')}
                          </button>
                        </form>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <div class="card p-5 flex items-center gap-2.5">
              <span class="text-[22px] opacity-35">⚖️</span>
              <p class="text-[12.5px] text-fg-3 m-0">{t('sup.conv.empty')}</p>
            </div>
          {/if}

          <div class="card p-4">
            <p class="body-strong mb-3">{t('sup.conv.add')}</p>
            <form method="post" action="?/addConversion"
              class="grid grid-cols-[1fr_1fr_1fr_100px_auto] gap-2 items-end">
              <div>
                <label for="conv-ingredient" class="label block mb-[3px]">{t('sup.conv.ingredient')}</label>
                <input id="conv-ingredient" class="input w-full" name="ingredient" required placeholder={t('sup.conv.ph.ingredient')} value={prefillIngredient} />
              </div>
              <div>
                <label for="conv-purchase-unit" class="label block mb-[3px]">{t('sup.conv.purchaseUnit')}</label>
                <input id="conv-purchase-unit" class="input w-full" name="purchase_unit" required placeholder={t('sup.conv.ph.purchase')} value={prefillPurchaseUnit} />
              </div>
              <div>
                <label for="conv-canonical-unit" class="label block mb-[3px]">{t('sup.conv.canonicalUnit')}</label>
                <input id="conv-canonical-unit" class="input w-full" name="canonical_unit" required placeholder={t('sup.conv.ph.canonical')} />
              </div>
              <div>
                <label for="conv-factor" class="label block mb-[3px]">{t('sup.conv.factor')}</label>
                <input id="conv-factor" class="input w-full" name="conversion_factor" type="number" min="0.001" step="any" required
                  placeholder="1" />
              </div>
              <button type="submit" class="btn btn-primary h-9 text-[12.5px] whitespace-nowrap">
                + {t('sup.conv.add')}
              </button>
            </form>
          </div>

        </div>
      {/if}

    </div>
  </div>
</div>

<style>
  .sup-product-detail {
    opacity: 0;
    transform: translateY(4px);
    pointer-events: none;
    transition: opacity 200ms ease, transform 200ms ease;
  }
  .sup-product-detail.is-visible {
    opacity: 1;
    transform: translateY(0);
    transition-delay: 100ms;
  }
  @media (prefers-reduced-motion: reduce) {
    .sup-product-detail {
      transition: none;
    }
    .sup-product-detail.is-visible {
      transition-delay: 0ms;
    }
  }
</style>
