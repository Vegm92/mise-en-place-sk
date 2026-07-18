<script lang="ts">
  import { untrack } from 'svelte';
  import type { PageData } from './$types';
  import { VALID_CATEGORIES, CATEGORY_COLORS } from '$lib/constants';
  import { fmtEur, fmtDate, fmtDateShort, initials } from '$lib/formatters';
  import { locale, t, ti } from '$lib/i18n';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Mail from '@lucide/svelte/icons/mail';
  import Phone from '@lucide/svelte/icons/phone';
  import Truck from '@lucide/svelte/icons/truck';
  import CreditCard from '@lucide/svelte/icons/credit-card';
  import StatusBadge from '$lib/components/mep/StatusBadge.svelte';
  import DesktopSupplierDetail from '$lib/components/desktop/DesktopSupplierDetail.svelte';

  let { data }: { data: PageData } = $props();

  let tab = $state<'resumen' | 'facturas' | 'productos' | 'conversiones'>(untrack(() => data.initialTab));
  let editing       = $state(false);
  let confirmDelete = $state(false);

  const s = $derived(data.supplier);
  const m = $derived(data.metrics);

  const totalSpend  = $derived(data.invoices.reduce((a, i) => a + (i.totalAmount ?? 0), 0));
  const paidCount   = $derived(data.invoices.filter(i => i.status === 'paid').length);
  const openCount   = $derived(data.invoices.filter(i => i.status === 'pending').length);
  const avgInvoice  = $derived(data.invoices.length ? totalSpend / data.invoices.length : 0);
  const pendingAmt  = $derived(data.invoices.filter(i => i.status === 'pending').reduce((a, i) => a + (i.totalAmount ?? 0), 0));

  const color = $derived(CATEGORY_COLORS[s.category ?? 'Other'] ?? CATEGORY_COLORS['Other']);

  // Product spend donut â€” top 5 + "Other", fixed categorical hue order (never cycled)
  const SERIES_COLORS = ['var(--mep-series-1)', 'var(--mep-series-2)', 'var(--mep-series-3)', 'var(--mep-series-4)', 'var(--mep-series-5)'];
  const productDonut = $derived((() => {
    const ranked = [...data.products]
      .map(p => ({ ...p, spend: (p.avgPrice ?? 0) * (p.totalQty ?? 0) }))
      .sort((a, b) => b.spend - a.spend);
    const total = ranked.reduce((a, p) => a + p.spend, 0);
    if (total <= 0) return { slices: [], total: 0 };

    const top = ranked.slice(0, 5);
    const rest = ranked.slice(5);
    const restSpend = rest.reduce((a, p) => a + p.spend, 0);

    const entries = top.map((p, i) => ({ label: p.description ?? 'â€”', spend: p.spend, color: SERIES_COLORS[i] }));
    if (restSpend > 0) entries.push({ label: $t('sup.products.other'), spend: restSpend, color: 'var(--mep-series-other)' });

    let cursor = 0;
    const CIRC = 2 * Math.PI * 60;
    const slices = entries.map(e => {
      const pct = e.spend / total;
      const dash = pct * CIRC;
      const slice = { ...e, pct, dash, offset: cursor };
      cursor += dash;
      return slice;
    });
    return { slices, total };
  })());

  const today   = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  function scoreColor(score: number) {
    if (score >= 70) return '#3A8C5C';
    if (score >= 40) return '#C8843A';
    return '#E05555';
  }

  function scoreLabelKey(score: number) {
    if (score >= 70) return 'sup.score.very';
    if (score >= 40) return 'sup.score.ok';
    return 'sup.score.poor';
  }

  function invoiceStatus(inv: typeof data.invoices[0]): string {
    if (inv.status === 'paid') return 'paid';
    if (inv.dueDate && inv.dueDate < today) return 'overdue';
    return inv.status ?? 'pending';
  }

</script>

<!-- ── MOBILE ─────────────────────────────────────────────────────────── -->
<div class="flex md:hidden" style="height:100%;flex-direction:column;overflow:hidden;">

  <!-- Header -->
  <div style="padding:14px 18px 0;flex-shrink:0;">
    <a href="/suppliers" style="display:inline-flex;align-items:center;gap:4px;font-size:13px;color:var(--mep-fg-3);text-decoration:none;margin-bottom:12px;">
      <ArrowLeft size={14} /> {$t('sup.back')}
    </a>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
      <div style="
        width:44px;height:44px;border-radius:22px;flex-shrink:0;
        background:{color}24;color:{color};
        display:flex;align-items:center;justify-content:center;
        font-size:14px;font-weight:700;
      ">{initials(s.name)}</div>
      <div style="flex:1;min-width:0;">
        <h1 style="margin:0 0 3px;font-size:18px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{s.name}</h1>
        <div style="font-size:11.5px;color:var(--mep-fg-3);display:flex;align-items:center;gap:5px;">
          {#if s.category}
            <span class="swatch" style="background:{color};"></span>{s.category}
          {:else}
            <span style="font-style:italic;">{$t('sup.noCategory')}</span>
          {/if}
        </div>
      </div>
      <button class="btn btn-secondary" style="height:32px;font-size:12px;padding:0 10px;display:inline-flex;align-items:center;gap:5px;"
        onclick={() => { editing = !editing; confirmDelete = false; }}>
        <Pencil size={12} /> {$t('action.edit')}
      </button>
    </div>

    <!-- Edit form (mobile) -->
    {#if editing}
      <div class="card" style="padding:16px;margin-bottom:12px;">
        <p class="body-strong" style="margin-bottom:12px;">{$t('sup.edit.title')}</p>
        <form method="post" action="?/update" style="display:flex;flex-direction:column;gap:10px;">
          <div>
            <label for="m-edit-name" class="label" style="display:block;margin-bottom:4px;">{$t('sup.field.name')}</label>
            <input id="m-edit-name" class="input" name="name" value={s.name} required style="width:100%;" />
          </div>
          <div>
            <label for="m-edit-category" class="label" style="display:block;margin-bottom:4px;">{$t('sup.field.category')}</label>
            <select id="m-edit-category" class="input" name="category" style="width:100%;">
              <option value="">{$t('sup.noCategory')}</option>
              {#each VALID_CATEGORIES as cat}
                <option value={cat} selected={s.category === cat}>{cat}</option>
              {/each}
            </select>
          </div>
          <div>
            <label for="m-edit-email" class="label" style="display:block;margin-bottom:4px;">{$t('sup.fieldEmail')}</label>
            <input id="m-edit-email" class="input" name="contact_email" type="email" value={s.contactEmail ?? ''} style="width:100%;" />
          </div>
          <div>
            <label for="m-edit-phone" class="label" style="display:block;margin-bottom:4px;">{$t('sup.field.phone')}</label>
            <input id="m-edit-phone" class="input" name="contact_phone" type="tel" value={s.contactPhone ?? ''} style="width:100%;" />
          </div>
          <div style="display:flex;gap:8px;margin-top:4px;">
            <button type="submit" class="btn btn-primary" style="height:32px;font-size:12.5px;">{$t('set.save')}</button>
            <button type="button" class="btn" style="height:32px;font-size:12.5px;" onclick={() => editing = false}>{$t('edit.cancel')}</button>
          </div>
        </form>
      </div>
    {/if}

    <!-- KPI strip -->
    <div class="card" style="margin-bottom:12px;padding:10px 14px;display:flex;align-items:center;">
      <div style="flex:1;text-align:center;">
        <div class="num" style="font-size:15px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.3px;">{fmtEur(totalSpend)}</div>
        <div style="font-size:10px;color:var(--mep-fg-3);margin-top:1px;">{$t('sup.totalSpend')}</div>
      </div>
      <div style="width:1px;height:26px;background:var(--mep-divider);"></div>
      <div style="flex:1;text-align:center;">
        <div class="num" style="font-size:15px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.3px;">{data.invoices.length}</div>
        <div style="font-size:10px;color:var(--mep-fg-3);margin-top:1px;">{$t('sup.kpiInvoices')}</div>
      </div>
      <div style="width:1px;height:26px;background:var(--mep-divider);"></div>
      <div style="flex:1;text-align:center;">
        <div class="num" style="font-size:15px;font-weight:600;color:{pendingAmt > 0 ? 'var(--mep-warn)' : 'var(--mep-fg)'};letter-spacing:-0.3px;">{fmtEur(pendingAmt)}</div>
        <div style="font-size:10px;color:var(--mep-fg-3);margin-top:1px;">{$t('sup.pending')}</div>
      </div>
    </div>

    <!-- Tabs -->
    <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:12px;scrollbar-width:none;">
      {#each [
        { id: 'resumen',      label: $t('sup.tab.resumen') },
        { id: 'facturas',     label: $t('nav.invoices'), count: data.invoices.length },
        { id: 'productos',    label: $t('sup.tab.productos') },
        { id: 'conversiones', label: $t('sup.tab.conversiones'), count: data.conversions.length || undefined },
      ] as tabItem}
        <button
          onclick={() => tab = tabItem.id as typeof tab}
          style="
            border:0;height:30px;padding:0 12px;border-radius:15px;white-space:nowrap;cursor:pointer;font-family:inherit;
            background:{tab === tabItem.id ? 'var(--mep-acc)' : 'var(--mep-surface)'};
            color:{tab === tabItem.id ? 'var(--mep-acc-fg)' : 'var(--mep-fg-2)'};
            font-size:12px;font-weight:500;
            box-shadow:{tab === tabItem.id ? 'none' : '0 1px 2px rgba(0,0,0,0.04)'};
            display:inline-flex;align-items:center;gap:5px;
          ">
          {tabItem.label}
          {#if tabItem.count !== undefined}
            <span class="num" style="font-size:10px;font-weight:600;">{tabItem.count}</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <!-- Tab content (scrollable) -->
  <div style="flex:1;overflow:auto;padding:0 18px 24px;display:flex;flex-direction:column;gap:10px;">

    {#if tab === 'resumen'}

      <!-- Info card -->
      <div class="card" style="padding:14px;">
        <div class="subtitle" style="margin-bottom:10px;">{$t('sup.info')}</div>
        {#if !s.contactEmail && !s.contactPhone && !s.cif && !s.deliveryDays && !s.paymentTerms}
          <p style="font-size:12.5px;color:var(--mep-fg-3);font-style:italic;">{$t('sup.infoEmpty')}</p>
        {:else}
          <div style="display:flex;flex-direction:column;gap:8px;">
            {#if s.contactEmail}
              <div style="display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--mep-fg-2);">
                <Mail size={13} style="color:var(--mep-fg-3);flex-shrink:0;" />
                <a href="mailto:{s.contactEmail}" style="color:var(--mep-fg-2);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{s.contactEmail}</a>
              </div>
            {/if}
            {#if s.contactPhone}
              <div style="display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--mep-fg-2);">
                <Phone size={13} style="color:var(--mep-fg-3);flex-shrink:0;" />
                <a href="tel:{s.contactPhone}" style="color:var(--mep-fg-2);text-decoration:none;">{s.contactPhone}</a>
              </div>
            {/if}
            {#if s.cif}
              <div style="display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--mep-fg-2);">
                <CreditCard size={13} style="color:var(--mep-fg-3);flex-shrink:0;" />
                <span>CIF/NIF: {s.cif}</span>
              </div>
            {/if}
            {#if s.deliveryDays}
              <div style="display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--mep-fg-2);">
                <Truck size={13} style="color:var(--mep-fg-3);flex-shrink:0;" />
                <span>{s.deliveryDays}</span>
              </div>
            {/if}
            {#if s.paymentTerms}
              <div style="display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--mep-fg-2);">
                <CreditCard size={13} style="color:var(--mep-fg-3);flex-shrink:0;" />
                <span>{$t('sup.paymentPrefix')}: {s.paymentTerms}</span>
              </div>
            {/if}
            {#if s.notes}
              <p style="font-size:12px;color:var(--mep-fg-3);font-style:italic;margin:0;">{s.notes}</p>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Recent invoices -->
      {#if data.invoices.length}
        <div class="card" style="padding:0;overflow:hidden;">
          <div style="padding:12px 14px 8px;display:flex;align-items:center;justify-content:space-between;">
            <div class="subtitle">{$t('sup.recentInvoices')}</div>
            {#if data.invoices.length > 4}
              <button style="font-size:12px;color:var(--mep-acc);font-weight:500;background:none;border:0;cursor:pointer;padding:0;"
                onclick={() => tab = 'facturas'}>{$ti('sup.viewAll', { n: data.invoices.length })}</button>
            {/if}
          </div>
          {#each data.invoices.slice(0, 4) as inv (inv.id)}
            <a href="/invoice/{inv.id}" style="padding:10px 14px;display:flex;align-items:center;gap:10px;border-top:1px solid var(--mep-divider);text-decoration:none;color:inherit;">
              <div style="flex:1;min-width:0;">
                <div class="num" style="font-size:13px;font-weight:500;color:var(--mep-fg);">{inv.invoiceNumber ?? '—'}</div>
                <div style="font-size:11px;color:var(--mep-fg-3);">{fmtDateShort(inv.invoiceDate, $locale)}</div>
              </div>
              <div class="num" style="font-size:13px;font-weight:500;color:var(--mep-fg);">{fmtEur(inv.totalAmount ?? 0)}</div>
              <StatusBadge status={invoiceStatus(inv)} style="font-size:10px;padding:1px 5px;" />
            </a>
          {/each}
        </div>
      {/if}

      <!-- Reliability -->
      {#if m}
        <div class="card" style="padding:14px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
            <div class="subtitle" style="flex:1;">{$t('sup.reliabilityShort')}</div>
            <div style="
              width:42px;height:42px;border-radius:50%;
              border:3px solid {scoreColor(m.score)};
              display:flex;align-items:center;justify-content:center;flex-direction:column;
            ">
              <span style="font-size:13px;font-weight:700;color:{scoreColor(m.score)};line-height:1;">{m.score}</span>
              <span style="font-size:8px;color:var(--mep-fg-3);">/100</span>
            </div>
            <span style="font-size:12px;font-weight:600;color:{scoreColor(m.score)};">{$t(scoreLabelKey(m.score))}</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
            {#each [
              { label: $t('sup.score.prices'), score: m.priceStabilityScore, max: 33 },
              { label: $t('sup.score.regularity'), score: m.frequencyScore, max: 33 },
              { label: $t('sup.score.punctuality'), score: m.timelinessScore, max: 34 },
            ] as kpi}
              <div style="padding:8px;background:var(--mep-surface-2);border-radius:8px;text-align:center;">
                <div style="font-size:14px;font-weight:700;color:{scoreColor(kpi.score * 3)};" class="num">{kpi.score}/{kpi.max}</div>
                <div class="label" style="font-size:10px;margin-top:2px;">{kpi.label}</div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

    {:else if tab === 'facturas'}

      {#if !data.invoices.length}
        <div style="padding:40px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px;">
          <div style="color:var(--mep-fg-3);font-size:13px;line-height:1.5;">
            {$t('sup.noInvoicesYet')}<br />{$t('sup.noInvoicesYetSub')}
          </div>
          <a href="/" class="btn btn-primary" style="height:34px;font-size:13px;text-decoration:none;">
            {$t('sup.uploadInvoice')}
          </a>
        </div>
      {:else}
        {#each data.invoices as inv (inv.id)}
          <a href="/invoice/{inv.id}" class="card" style="padding:12px 14px;display:flex;align-items:center;gap:10px;text-decoration:none;color:inherit;">
            <div style="flex:1;min-width:0;">
              <div class="num" style="font-size:13.5px;font-weight:500;color:var(--mep-fg);">{inv.invoiceNumber ?? '—'}</div>
              <div style="font-size:11px;color:var(--mep-fg-3);margin-top:2px;">{fmtDate(inv.invoiceDate, $locale)}{inv.dueDate ? ` · ${$t('sup.dueShort')} ${fmtDateShort(inv.dueDate, $locale)}` : ''}</div>
            </div>
            <div class="num" style="font-size:14px;font-weight:600;color:var(--mep-fg);">{fmtEur(inv.totalAmount ?? 0)}</div>
            <StatusBadge status={invoiceStatus(inv)} style="font-size:10px;padding:1px 5px;" />
          </a>
        {/each}
      {/if}

    {:else if tab === 'productos'}
      {#if !data.products.length}
        <div class="card" style="padding:20px;display:flex;align-items:center;gap:10px;">
          <span style="font-size:22px;opacity:0.35;">📦</span>
          <p style="font-size:12.5px;color:var(--mep-fg-3);margin:0;">{$t('sup.products.empty')}</p>
        </div>
      {:else}
        <div class="card" style="padding:14px;">
          <div class="subtitle" style="margin-bottom:12px;">{$t('sup.products.dominance')}</div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:14px;">
            <div style="position:relative;width:132px;height:132px;">
              <svg width="132" height="132" viewBox="0 0 132 132" style="transform:rotate(-90deg);">
                {#each productDonut.slices as slice}
                  {@const CIRC = 2 * Math.PI * 60}
                  {@const GAP = productDonut.slices.length > 1 ? 2 : 0}
                  <circle cx="66" cy="66" r="60" fill="none"
                    stroke={slice.color} stroke-width="22"
                    stroke-dasharray="{Math.max(slice.dash - GAP, 0)} {CIRC - slice.dash + GAP}"
                    stroke-dashoffset={-slice.offset}
                    role="img" aria-label="{slice.label}: {fmtEur(slice.spend)} ({(slice.pct * 100).toFixed(0)}%)" />
                {/each}
              </svg>
              <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
                <span class="num" style="font-size:14px;font-weight:600;color:var(--mep-fg);">{fmtEur(productDonut.total)}</span>
                <span style="font-size:9.5px;color:var(--mep-fg-3);">{$t('sup.products.totalSpend')}</span>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:7px;width:100%;">
              {#each productDonut.slices as slice}
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="width:9px;height:9px;border-radius:2px;background:{slice.color};flex-shrink:0;"></span>
                  <span style="font-size:12px;color:var(--mep-fg-2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{slice.label}</span>
                  <span class="num" style="font-size:11px;color:var(--mep-fg-3);flex-shrink:0;">{(slice.pct * 100).toFixed(0)}%</span>
                  <span class="num" style="font-size:12px;font-weight:500;color:var(--mep-fg);flex-shrink:0;width:70px;text-align:right;">{fmtEur(slice.spend)}</span>
                </div>
              {/each}
            </div>
          </div>
        </div>
        {#each data.products as prod ((prod.description ?? '') + '|' + (prod.unit ?? ''))}
          <div class="card" style="padding:12px 14px;">
            <div style="font-size:13px;font-weight:500;color:var(--mep-fg);margin-bottom:3px;">
              {prod.description ?? '—'}
            </div>
            <div style="display:flex;gap:10px;font-size:11.5px;color:var(--mep-fg-3);">
              {#if prod.unit}<span>{prod.unit}</span>{/if}
              {#if prod.avgPrice != null}<span>· {fmtEur(prod.avgPrice)}</span>{/if}
              {#if prod.lastDate}<span>· {fmtDateShort(prod.lastDate, $locale)}</span>{/if}
            </div>
          </div>
        {/each}
      {/if}

    {:else if tab === 'conversiones'}
      {#if !data.conversions.length}
        <div class="card" style="padding:20px;display:flex;align-items:center;gap:10px;">
          <span style="font-size:22px;opacity:0.35;">⚖️</span>
          <p style="font-size:12.5px;color:var(--mep-fg-3);margin:0;">{$t('sup.conv.empty')}</p>
        </div>
      {:else}
        {#each data.conversions as conv (conv.id)}
          <div class="card" style="padding:12px 14px;">
            <div style="font-size:13px;font-weight:500;color:var(--mep-fg);margin-bottom:4px;">{conv.ingredient}</div>
            <div style="font-size:11.5px;color:var(--mep-fg-3);">
              {conv.purchaseUnit} → {conv.canonicalUnit} &nbsp;·&nbsp; ×{conv.conversionFactor}
            </div>
          </div>
        {/each}
      {/if}
      <!-- Mobile add form -->
      <div class="card" style="padding:14px;">
        <p class="body-strong" style="margin-bottom:10px;font-size:12.5px;">{$t('sup.conv.add')}</p>
        <form method="post" action="?/addConversion" style="display:flex;flex-direction:column;gap:8px;">
          <input class="input" name="ingredient" required placeholder={$t('sup.conv.ph.ingredient')} />
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <input class="input" name="purchase_unit" required placeholder={$t('sup.conv.ph.purchase')} />
            <input class="input" name="canonical_unit" required placeholder={$t('sup.conv.ph.canonical')} />
          </div>
          <input class="input" name="conversion_factor" type="number" min="0.001" step="any" required placeholder="Factor (p.ej. 6)" />
          <button type="submit" class="btn btn-primary" style="height:34px;font-size:12.5px;">
            + {$t('sup.conv.add')}
          </button>
        </form>
      </div>
    {/if}

  </div>
</div>

<!-- Desktop supplier detail -->
<div class="hidden md:flex" style="height:100%;flex-direction:column;overflow:hidden;">
  <DesktopSupplierDetail
    supplier={data.supplier}
    invoices={data.invoices}
    metrics={data.metrics}
    monthly={data.monthly}
    conversions={data.conversions}
    products={data.products}
    bind:tab
    bind:editing
    bind:confirmDelete
  />
</div>
