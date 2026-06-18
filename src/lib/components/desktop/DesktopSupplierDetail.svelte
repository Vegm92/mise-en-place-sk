<script lang="ts">
  import { VALID_CATEGORIES, CATEGORY_COLORS } from '$lib/constants';
  import { fmtEur, fmtDate, fmtDateShort, initials } from '$lib/formatters';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Mail from '@lucide/svelte/icons/mail';
  import Phone from '@lucide/svelte/icons/phone';
  import Truck from '@lucide/svelte/icons/truck';
  import CreditCard from '@lucide/svelte/icons/credit-card';
  import StatusBadge from '$lib/components/mep/StatusBadge.svelte';
  import { locale, t, ti, tp } from '$lib/i18n';

  interface Supplier {
    name: string;
    category: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    cif: string | null;
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
  interface MonthlyBar { label: string; value: number; partial: boolean }

  let {
    supplier: s,
    invoices,
    metrics: m,
    monthly,
    tab       = $bindable<'resumen'|'facturas'|'productos'|'conversiones'>('resumen'),
    editing   = $bindable(false),
    confirmDelete = $bindable(false),
  }: {
    supplier: Supplier;
    invoices: Invoice[];
    metrics: Metrics | null;
    monthly: MonthlyBar[];
    tab?: 'resumen'|'facturas'|'productos'|'conversiones';
    editing?: boolean;
    confirmDelete?: boolean;
  } = $props();

  const color = $derived(CATEGORY_COLORS[s.category ?? 'Other'] ?? CATEGORY_COLORS['Other']);

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

  // SVG chart constants
  const CL = 40;
  const CW = 620;
  const CH = 140;
  const CB = 170;
  const VW = 700;

  function scoreColor(score: number) {
    if (score >= 70) return '#3A8C5C';
    if (score >= 40) return '#C8843A';
    return '#E05555';
  }
  function invoiceStatus(inv: Invoice): string {
    if (inv.status === 'paid') return 'paid';
    if (inv.dueDate && inv.dueDate < today) return 'overdue';
    return inv.status ?? 'pending';
  }
</script>

<div class="hidden md:flex" style="height:100%;flex-direction:column;overflow:hidden;">
  <div style="display:flex;flex-direction:column;flex:1;min-height:0;">

    <!-- Sticky header area -->
    <div style="padding:18px 24px 0;flex-shrink:0;">

      <!-- Breadcrumb -->
      <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--mep-fg-3);margin-bottom:12px;">
        <a href="/suppliers" style="color:var(--mep-fg-3);text-decoration:none;display:inline-flex;align-items:center;gap:4px;">
          <ArrowLeft size={12} /> {$t('nav.suppliers')}
        </a>
        <ChevronRight size={11} />
        <span style="color:var(--mep-fg-2);">{s.name}</span>
      </div>

      <!-- Supplier header -->
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">
        <div style="
          width:52px;height:52px;border-radius:26px;flex-shrink:0;
          background:{color}24;color:{color};
          display:inline-flex;align-items:center;justify-content:center;
          font-size:16px;font-weight:700;
        ">{initials(s.name)}</div>
        <div style="flex:1;min-width:0;">
          <h1 style="margin:0 0 4px;font-size:22px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.4px;">{s.name}</h1>
          <div style="display:flex;align-items:center;gap:12px;font-size:12.5px;color:var(--mep-fg-3);">
            {#if s.category}
              <span style="display:inline-flex;align-items:center;gap:5px;">
                <span class="swatch" style="background:{color};"></span>
                {s.category}
              </span>
            {:else}
              <span style="font-style:italic;">{$t('sup.noCategory')}</span>
            {/if}
            {#if s.contactEmail}
              <span>· {s.contactEmail}</span>
            {/if}
          </div>
        </div>
        {#if !editing}
          <div style="display:flex;gap:8px;">
            {#if s.contactEmail}
              <a href="mailto:{s.contactEmail}" class="btn btn-secondary"
                style="height:32px;font-size:12.5px;display:inline-flex;align-items:center;gap:6px;text-decoration:none;">
                <Mail size={13} /> {$t('sup.contact')}
              </a>
            {/if}
            <button class="btn btn-secondary" style="height:32px;font-size:12.5px;display:inline-flex;align-items:center;gap:6px;"
              onclick={() => { editing = true; confirmDelete = false; }}>
              <Pencil size={13} /> {$t('action.edit')}
            </button>
            <button class="btn" style="height:32px;font-size:12.5px;color:#E05555;border-color:#E05555;display:inline-flex;align-items:center;gap:6px;"
              onclick={() => { confirmDelete = !confirmDelete; }}>
              <Trash2 size={13} /> {$t('action.delete')}
            </button>
          </div>
        {/if}
      </div>

      <!-- Delete confirmation -->
      {#if confirmDelete}
        <div class="card" style="padding:14px;border-left:3px solid #E05555;margin-bottom:14px;">
          <p class="body-strong" style="color:#E05555;margin-bottom:8px;">{$t('sup.confirmDelete.title')}</p>
          <p class="body" style="color:var(--mep-fg-3);font-size:12px;margin-bottom:12px;">
            {$tp('sup.confirmDelete.body', invoices.length)}
          </p>
          <div style="display:flex;gap:8px;">
            <form method="post" action="?/delete">
              <button type="submit" class="btn" style="background:#E05555;color:#fff;border-color:#E05555;height:30px;font-size:12px;">
                {$t('sup.confirmDelete.yes')}
              </button>
            </form>
            <button class="btn" style="height:30px;font-size:12px;" onclick={() => confirmDelete = false}>{$t('edit.cancel')}</button>
          </div>
        </div>
      {/if}

      <!-- Edit form -->
      {#if editing}
        <div class="card" style="padding:20px;margin-bottom:14px;">
          <p class="body-strong" style="margin-bottom:14px;">{$t('sup.edit.title')}</p>
          <form method="post" action="?/update" style="display:flex;flex-direction:column;gap:12px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div>
                <label for="edit-name" class="label" style="display:block;margin-bottom:4px;">{$t('sup.field.name')}</label>
                <input id="edit-name" class="input" name="name" value={s.name} required style="width:100%;" />
              </div>
              <div>
                <label for="edit-category" class="label" style="display:block;margin-bottom:4px;">{$t('sup.field.category')}</label>
                <select id="edit-category" class="input" name="category" style="width:100%;">
                  <option value="">{$t('sup.noCategory')}</option>
                  {#each VALID_CATEGORIES as cat}
                    <option value={cat} selected={s.category === cat}>{cat}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label for="edit-cif" class="label" style="display:block;margin-bottom:4px;">{$t('sup.field.cif')}</label>
                <input id="edit-cif" class="input" name="cif" value={s.cif ?? ''} style="width:100%;" placeholder="B12345678" />
              </div>
              <div>
                <label for="edit-email" class="label" style="display:block;margin-bottom:4px;">{$t('sup.field.email')}</label>
                <input id="edit-email" class="input" name="contact_email" type="email" value={s.contactEmail ?? ''} style="width:100%;" placeholder="proveedor@ejemplo.com" />
              </div>
              <div>
                <label for="edit-phone" class="label" style="display:block;margin-bottom:4px;">{$t('sup.field.phone')}</label>
                <input id="edit-phone" class="input" name="contact_phone" type="tel" value={s.contactPhone ?? ''} style="width:100%;" placeholder="+34 600 000 000" />
              </div>
              <div>
                <label for="edit-delivery" class="label" style="display:block;margin-bottom:4px;">{$t('sup.field.delivery')}</label>
                <input id="edit-delivery" class="input" name="delivery_days" value={s.deliveryDays ?? ''} style="width:100%;" placeholder="Lun, Mié, Vie" />
              </div>
              <div>
                <label for="edit-terms" class="label" style="display:block;margin-bottom:4px;">{$t('sup.field.terms')}</label>
                <input id="edit-terms" class="input" name="payment_terms" value={s.paymentTerms ?? ''} style="width:100%;" placeholder="30 días" />
              </div>
              <div>
                <label for="edit-notes" class="label" style="display:block;margin-bottom:4px;">{$t('field.notes')}</label>
                <input id="edit-notes" class="input" name="notes" value={s.notes ?? ''} style="width:100%;" placeholder="Notas internas…" />
              </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:4px;">
              <button type="submit" class="btn btn-primary" style="height:32px;font-size:12.5px;">{$t('set.save')}</button>
              <button type="button" class="btn" style="height:32px;font-size:12.5px;" onclick={() => editing = false}>{$t('edit.cancel')}</button>
            </div>
          </form>
        </div>
      {/if}

      <!-- Tabs -->
      <div style="display:flex;gap:0;border-bottom:1px solid var(--mep-divider);">
        {#each [
          { id: 'resumen',      label: $t('sup.tab.resumen') },
          { id: 'facturas',     label: $t('nav.invoices'),    count: invoices.length },
          { id: 'productos',    label: $t('sup.tab.productos') },
          { id: 'conversiones', label: $t('sup.tab.conversiones') },
        ] as tabItem}
          <button
            style="
              border:0;background:transparent;cursor:pointer;font-family:inherit;
              padding:10px 16px;margin-bottom:-1px;
              border-bottom:{tab === tabItem.id ? '2px solid var(--mep-acc)' : '2px solid transparent'};
              font-size:13px;font-weight:{tab === tabItem.id ? '600' : '500'};
              color:{tab === tabItem.id ? 'var(--mep-fg)' : 'var(--mep-fg-3)'};
              display:inline-flex;align-items:center;gap:6px;
            "
            onclick={() => tab = tabItem.id as typeof tab}>
            {tabItem.label}
            {#if tabItem.count !== undefined}
              <span style="font-size:11px;font-weight:500;padding:1px 6px;border-radius:999px;
                background:var(--mep-surface-2);color:var(--mep-fg-3);">{tabItem.count}</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <!-- Tab content -->
    <div style="flex:1;min-height:0;overflow:auto;padding:18px 24px 24px;">

      <!-- ── RESUMEN ── -->
      {#if tab === 'resumen'}
        <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:14px;align-items:start;">

          <!-- Left column -->
          <div style="display:flex;flex-direction:column;gap:14px;">

            <!-- Monthly spend chart -->
            <div class="card" style="padding:16px 16px 12px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                <div>
                  <div class="subtitle">{$t('sup.monthlySpend')}</div>
                  <div style="font-size:12px;color:var(--mep-fg-3);margin-top:2px;">{$t('sup.last7months')}</div>
                </div>
                {#if chartAvg > 0}
                  <div style="display:flex;align-items:baseline;gap:8px;">
                    <span class="num" style="font-size:20px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.4px;">{fmtEur(chartAvg)}</span>
                    <span style="font-size:11.5px;color:var(--mep-fg-3);">{$t('sup.monthlyAvg')}</span>
                  </div>
                {/if}
              </div>
              <svg width="100%" viewBox="0 0 {VW} 200" style="display:block;overflow:visible;margin-top:12px;">
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
                      font-size="10.5" font-weight="500" fill="var(--mep-fg)">
                      {bar.value >= 1000
                        ? (bar.value / 1000).toFixed(1).replace('.', ',') + 'k'
                        : fmtEur(bar.value)}
                    </text>
                  {/if}
                  <text x={bx + 18} y={CB + 14} text-anchor="middle"
                    font-size="10.5" fill="var(--mep-fg-3)">{bar.label}</text>
                {/each}
                {#if chartAvg > 0}
                  {@const avgY = CB - (chartAvg / chartMax) * CH}
                  <line x1={CL} x2={CL + CW} y1={avgY} y2={avgY}
                    stroke="var(--mep-fg-3)" stroke-dasharray="4 4" stroke-width="1" />
                {/if}
              </svg>
            </div>

            <!-- KPI strip -->
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
              <div class="card" style="padding:14px;">
                <div class="label" style="margin-bottom:6px;">{$t('sup.avgInvoice')}</div>
                <div class="num" style="font-size:20px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.4px;line-height:1.1;">
                  {fmtEur(avgInvoice)}
                </div>
                <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:6px;">{$tp('misc.invoice', invoices.length)}</div>
              </div>
              <div class="card" style="padding:14px;">
                <div class="label" style="margin-bottom:6px;">{$t('sup.openInvoices')}</div>
                <div class="num" style="font-size:20px;font-weight:600;
                  color:{openCount > 0 ? 'var(--mep-warn)' : 'var(--mep-fg)'};letter-spacing:-0.4px;line-height:1.1;">
                  {openCount}
                </div>
                <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:6px;">{paidCount} {$t('sup.paid')}</div>
              </div>
              <div class="card" style="padding:14px;">
                <div class="label" style="margin-bottom:6px;">{$t('sup.pendingPayment')}</div>
                <div class="num" style="font-size:20px;font-weight:600;
                  color:{pendingAmt > 0 ? 'var(--mep-warn)' : 'var(--mep-fg)'};letter-spacing:-0.4px;line-height:1.1;">
                  {fmtEur(pendingAmt)}
                </div>
                <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:6px;">{$t('sup.openAmount')}</div>
              </div>
            </div>

            <!-- Reliability breakdown -->
            {#if m}
              <div class="card" style="padding:20px;">
                <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">
                  <div>
                    <div class="subtitle" style="margin-bottom:2px;">{$t('sup.reliability')}</div>
                    <div style="font-size:11px;color:var(--mep-fg-3);">{$t('sup.reliability.sub')}</div>
                  </div>
                  <div style="flex:1;"></div>
                  <div style="
                    width:52px;height:52px;border-radius:50%;
                    border:3px solid {scoreColor(m.score)};
                    display:flex;align-items:center;justify-content:center;flex-direction:column;
                  ">
                    <span style="font-size:15px;font-weight:700;color:{scoreColor(m.score)};line-height:1;">{m.score}</span>
                    <span style="font-size:9px;color:var(--mep-fg-3);">/100</span>
                  </div>
                  <span style="font-size:12px;font-weight:600;color:{scoreColor(m.score)};">{m.score >= 70 ? $t('sup.score.very') : m.score >= 40 ? $t('sup.score.ok') : $t('sup.score.poor')}</span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
                  <div style="padding:10px;background:var(--mep-surface-2);border-radius:8px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                      <span class="label">{$t('sup.score.prices')}</span>
                      <span style="font-size:12px;font-weight:700;color:{scoreColor(m.priceStabilityScore * 3)};">{m.priceStabilityScore}/33</span>
                    </div>
                    <p style="font-size:11px;color:var(--mep-fg-3);margin:0;">
                      {#if m.priceStabilityCv !== null}CV: {m.priceStabilityCv.toFixed(1)}%{:else}{$t('sup.score.noData')}{/if}
                    </p>
                  </div>
                  <div style="padding:10px;background:var(--mep-surface-2);border-radius:8px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                      <span class="label">{$t('sup.score.regularity')}</span>
                      <span style="font-size:12px;font-weight:700;color:{scoreColor(m.frequencyScore * 3)};">{m.frequencyScore}/33</span>
                    </div>
                    <p style="font-size:11px;color:var(--mep-fg-3);margin:0;">{$t('sup.score.historical')}</p>
                  </div>
                  <div style="padding:10px;background:var(--mep-surface-2);border-radius:8px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                      <span class="label">{$t('sup.score.punctuality')}</span>
                      <span style="font-size:12px;font-weight:700;color:{scoreColor(m.timelinessScore * 2.9)};">{m.timelinessScore}/34</span>
                    </div>
                    <p style="font-size:11px;color:var(--mep-fg-3);margin:0;">{$t('sup.score.timeliness')}</p>
                  </div>
                </div>
              </div>
            {:else if invoices.length < 3}
              <div class="card" style="padding:16px;display:flex;align-items:center;gap:10px;">
                <span style="font-size:20px;opacity:0.4;">📊</span>
                <div>
                  <p class="body-strong" style="color:var(--mep-fg-2);">{$t('sup.insufficient')}</p>
                  <p style="font-size:12px;color:var(--mep-fg-3);">{$t('sup.insufficient.desc')}</p>
                </div>
              </div>
            {/if}

          </div>

          <!-- Right column -->
          <div style="display:flex;flex-direction:column;gap:14px;">

            <!-- Info card -->
            <div class="card" style="padding:16px;">
              <div class="subtitle" style="margin-bottom:10px;">{$t('sup.info')}</div>
              {#if !s.contactEmail && !s.contactPhone && !s.cif && !s.deliveryDays && !s.paymentTerms && !s.notes && !s.alias}
                <p style="font-size:12.5px;color:var(--mep-fg-3);font-style:italic;">{$t('sup.noContact')}</p>
                <button class="btn btn-secondary" style="height:28px;font-size:12px;margin-top:8px;"
                  onclick={() => { editing = true; confirmDelete = false; }}>
                  <Pencil size={11} /> {$t('sup.addData')}
                </button>
              {:else}
                <div style="display:flex;flex-direction:column;gap:10px;">
                  {#if s.contactEmail}
                    <div style="display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--mep-fg-2);">
                      <Mail size={14} style="color:var(--mep-fg-3);flex-shrink:0;" />
                      <a href="mailto:{s.contactEmail}" style="color:var(--mep-fg-2);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{s.contactEmail}</a>
                    </div>
                  {/if}
                  {#if s.contactPhone}
                    <div style="display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--mep-fg-2);">
                      <Phone size={14} style="color:var(--mep-fg-3);flex-shrink:0;" />
                      <a href="tel:{s.contactPhone}" style="color:var(--mep-fg-2);text-decoration:none;">{s.contactPhone}</a>
                    </div>
                  {/if}
                  {#if s.cif}
                    <div style="display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--mep-fg-2);">
                      <CreditCard size={14} style="color:var(--mep-fg-3);flex-shrink:0;" />
                      <span>CIF/NIF: {s.cif}</span>
                    </div>
                  {/if}
                  {#if s.deliveryDays}
                    <div style="display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--mep-fg-2);">
                      <Truck size={14} style="color:var(--mep-fg-3);flex-shrink:0;" />
                      <span>{$t('sup.deliveryPrefix')}: {s.deliveryDays}</span>
                    </div>
                  {/if}
                  {#if s.paymentTerms}
                    <div style="display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--mep-fg-2);">
                      <CreditCard size={14} style="color:var(--mep-fg-3);flex-shrink:0;" />
                      <span>{$t('sup.paymentPrefix')}: {s.paymentTerms}</span>
                    </div>
                  {/if}
                  {#if s.alias}
                    <div style="font-size:12.5px;color:var(--mep-fg-3);">{$t('sup.aliasPrefix')}: {s.alias}</div>
                  {/if}
                  {#if s.notes}
                    <div style="font-size:12.5px;color:var(--mep-fg-3);font-style:italic;">{s.notes}</div>
                  {/if}
                </div>
              {/if}
            </div>

            <!-- Recent invoices -->
            <div class="card" style="padding:0;overflow:hidden;">
              <div style="padding:14px 16px 8px;display:flex;align-items:center;justify-content:space-between;">
                <div class="subtitle">{$t('dash.invoices')}</div>
                {#if invoices.length > 5}
                  <button style="font-size:12.5px;color:var(--mep-acc);font-weight:500;background:none;border:0;cursor:pointer;padding:0;"
                    onclick={() => tab = 'facturas'}>
                    {$ti('sup.viewAll', { n: invoices.length })}
                  </button>
                {/if}
              </div>
              {#if !invoices.length}
                <div style="padding:16px 16px 20px;text-align:center;">
                  <p style="font-size:12.5px;color:var(--mep-fg-3);">{$t('sup.noInvoices')}</p>
                </div>
              {:else}
                {#each invoices.slice(0, 5) as inv (inv.id)}
                  <a href="/invoice/{inv.id}" style="padding:10px 16px;display:flex;align-items:center;gap:10px;
                    border-top:1px solid var(--mep-divider);text-decoration:none;color:inherit;">
                    <div style="flex:1;min-width:0;">
                      <div class="num" style="font-size:12.5px;font-weight:500;color:var(--mep-fg);">
                        {inv.invoiceNumber ?? '—'}
                      </div>
                      <div style="font-size:11px;color:var(--mep-fg-3);">{fmtDateShort(inv.invoiceDate, $locale)}</div>
                    </div>
                    <div class="num" style="font-size:13px;font-weight:500;color:var(--mep-fg);">
                      {fmtEur(inv.totalAmount ?? 0)}
                    </div>
                    <StatusBadge status={invoiceStatus(inv)} style="font-size:10px;padding:1px 5px;" />
                  </a>
                {/each}
              {/if}
            </div>

          </div>
        </div>

      <!-- ── FACTURAS ── -->
      {:else if tab === 'facturas'}
        {#if !invoices.length}
          <div style="text-align:center;padding:48px 24px;">
            <p style="font-size:13px;color:var(--mep-fg-3);">{$t('sup.noInvoices')}</p>
          </div>
        {:else}
          <div class="card" style="padding:0;overflow:hidden;">
            <table class="tbl" style="table-layout:fixed;">
              <thead>
                <tr>
                  <th style="width:150px;">{$t('sup.tbl.number')}</th>
                  <th style="width:110px;">{$t('tbl.date')}</th>
                  <th style="width:110px;">{$t('tbl.due')}</th>
                  <th class="num" style="width:130px;">{$t('sup.tbl.amount')}</th>
                  <th style="width:100px;">{$t('tbl.status')}</th>
                </tr>
              </thead>
              <tbody>
                {#each invoices as inv (inv.id)}
                  <tr class="row" onclick={() => location.replace(`/invoice/${inv.id}`)} style="cursor:pointer;">
                    <td style="font-size:12.5px;color:var(--mep-fg-2);">{inv.invoiceNumber ?? '—'}</td>
                    <td style="font-size:12.5px;">{fmtDate(inv.invoiceDate, $locale)}</td>
                    <td style="font-size:12.5px;color:var(--mep-fg-2);">{fmtDate(inv.dueDate, $locale)}</td>
                    <td class="num" style="font-weight:500;">{fmtEur(inv.totalAmount ?? 0)}</td>
                    <td><StatusBadge status={invoiceStatus(inv)} style="font-size:11px;padding:2px 7px;" /></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}

      <!-- ── PRODUCTOS ── -->
      {:else if tab === 'productos'}
        <div class="card" style="padding:32px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px;">
          <div style="font-size:28px;opacity:0.3;margin-bottom:4px;">📦</div>
          <p class="body-strong" style="color:var(--mep-fg-2);">{$t('sup.products.title')}</p>
          <p style="font-size:12.5px;color:var(--mep-fg-3);max-width:340px;">
            {$t('sup.products.desc')}
          </p>
        </div>

      <!-- ── CONVERSIONES ── -->
      {:else if tab === 'conversiones'}
        <div class="card" style="padding:32px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px;">
          <div style="font-size:28px;opacity:0.3;margin-bottom:4px;">⚖️</div>
          <p class="body-strong" style="color:var(--mep-fg-2);">{$t('sup.conversions.title')}</p>
          <p style="font-size:12.5px;color:var(--mep-fg-3);max-width:340px;">
            {$t('sup.conversions.desc')}
          </p>
        </div>
      {/if}

    </div>
  </div>
</div>
