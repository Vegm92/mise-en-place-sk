<script lang="ts">
  import type { PageData } from './$types';
  import { VALID_CATEGORIES, CATEGORY_COLORS } from '$lib/constants';
  import { fmtEur, fmtDate, fmtDateShort, initials } from '$lib/formatters';
  import { locale } from '$lib/i18n';
  import { ArrowLeft, Pencil, Trash2, Mail, Phone, Truck, CreditCard } from 'lucide-svelte';
  import StatusBadge from '$lib/components/mep/StatusBadge.svelte';
  import DesktopSupplierDetail from '$lib/components/desktop/DesktopSupplierDetail.svelte';

  let { data }: { data: PageData } = $props();

  let tab           = $state<'resumen' | 'facturas' | 'productos' | 'conversiones'>('resumen');
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

  const today   = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  function scoreColor(score: number) {
    if (score >= 70) return '#3A8C5C';
    if (score >= 40) return '#C8843A';
    return '#E05555';
  }

  function scoreLabel(score: number) {
    if (score >= 70) return 'Muy fiable';
    if (score >= 40) return 'Fiable';
    return 'Poco fiable';
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
      <ArrowLeft size={14} /> Proveedores
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
            <span style="font-style:italic;">Sin categoría</span>
          {/if}
        </div>
      </div>
      <button class="btn btn-secondary" style="height:32px;font-size:12px;padding:0 10px;display:inline-flex;align-items:center;gap:5px;"
        onclick={() => { editing = !editing; confirmDelete = false; }}>
        <Pencil size={12} /> Editar
      </button>
    </div>

    <!-- Edit form (mobile) -->
    {#if editing}
      <div class="card" style="padding:16px;margin-bottom:12px;">
        <p class="body-strong" style="margin-bottom:12px;">Editar proveedor</p>
        <form method="post" action="?/update" style="display:flex;flex-direction:column;gap:10px;">
          <div>
            <label for="m-edit-name" class="label" style="display:block;margin-bottom:4px;">Nombre</label>
            <input id="m-edit-name" class="input" name="name" value={s.name} required style="width:100%;" />
          </div>
          <div>
            <label for="m-edit-category" class="label" style="display:block;margin-bottom:4px;">Categoría</label>
            <select id="m-edit-category" class="input" name="category" style="width:100%;">
              <option value="">Sin categoría</option>
              {#each VALID_CATEGORIES as cat}
                <option value={cat} selected={s.category === cat}>{cat}</option>
              {/each}
            </select>
          </div>
          <div>
            <label for="m-edit-email" class="label" style="display:block;margin-bottom:4px;">Email</label>
            <input id="m-edit-email" class="input" name="contact_email" type="email" value={s.contactEmail ?? ''} style="width:100%;" />
          </div>
          <div>
            <label for="m-edit-phone" class="label" style="display:block;margin-bottom:4px;">Teléfono</label>
            <input id="m-edit-phone" class="input" name="contact_phone" type="tel" value={s.contactPhone ?? ''} style="width:100%;" />
          </div>
          <div style="display:flex;gap:8px;margin-top:4px;">
            <button type="submit" class="btn btn-primary" style="height:32px;font-size:12.5px;">Guardar</button>
            <button type="button" class="btn" style="height:32px;font-size:12.5px;" onclick={() => editing = false}>Cancelar</button>
          </div>
        </form>
      </div>
    {/if}

    <!-- KPI strip -->
    <div class="card" style="margin-bottom:12px;padding:10px 14px;display:flex;align-items:center;">
      <div style="flex:1;text-align:center;">
        <div class="num" style="font-size:15px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.3px;">{fmtEur(totalSpend)}</div>
        <div style="font-size:10px;color:var(--mep-fg-3);margin-top:1px;">Gasto total</div>
      </div>
      <div style="width:1px;height:26px;background:var(--mep-divider);"></div>
      <div style="flex:1;text-align:center;">
        <div class="num" style="font-size:15px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.3px;">{data.invoices.length}</div>
        <div style="font-size:10px;color:var(--mep-fg-3);margin-top:1px;">Facturas</div>
      </div>
      <div style="width:1px;height:26px;background:var(--mep-divider);"></div>
      <div style="flex:1;text-align:center;">
        <div class="num" style="font-size:15px;font-weight:600;color:{pendingAmt > 0 ? 'var(--mep-warn)' : 'var(--mep-fg)'};letter-spacing:-0.3px;">{fmtEur(pendingAmt)}</div>
        <div style="font-size:10px;color:var(--mep-fg-3);margin-top:1px;">Pendiente</div>
      </div>
    </div>

    <!-- Tabs -->
    <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:12px;scrollbar-width:none;">
      {#each [
        { id: 'resumen',  label: 'Resumen' },
        { id: 'facturas', label: 'Facturas', count: data.invoices.length },
        { id: 'productos', label: 'Productos' },
      ] as t}
        <button
          onclick={() => tab = t.id as typeof tab}
          style="
            border:0;height:30px;padding:0 12px;border-radius:15px;white-space:nowrap;cursor:pointer;font-family:inherit;
            background:{tab === t.id ? 'var(--mep-acc)' : 'var(--mep-surface)'};
            color:{tab === t.id ? 'var(--mep-acc-fg)' : 'var(--mep-fg-2)'};
            font-size:12px;font-weight:500;
            box-shadow:{tab === t.id ? 'none' : '0 1px 2px rgba(0,0,0,0.04)'};
            display:inline-flex;align-items:center;gap:5px;
          ">
          {t.label}
          {#if t.count !== undefined}
            <span class="num" style="font-size:10px;font-weight:600;">{t.count}</span>
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
        <div class="subtitle" style="margin-bottom:10px;">Información</div>
        {#if !s.contactEmail && !s.contactPhone && !s.cif && !s.deliveryDays && !s.paymentTerms}
          <p style="font-size:12.5px;color:var(--mep-fg-3);font-style:italic;">Sin información registrada.</p>
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
                <span>Pago: {s.paymentTerms}</span>
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
            <div class="subtitle">Facturas recientes</div>
            {#if data.invoices.length > 4}
              <button style="font-size:12px;color:var(--mep-acc);font-weight:500;background:none;border:0;cursor:pointer;padding:0;"
                onclick={() => tab = 'facturas'}>Ver todas ({data.invoices.length})</button>
            {/if}
          </div>
          {#each data.invoices.slice(0, 4) as inv (inv.id)}
            <div style="padding:10px 14px;display:flex;align-items:center;gap:10px;border-top:1px solid var(--mep-divider);cursor:pointer;"
              onclick={() => location.replace(`/invoice/${inv.id}`)}>
              <div style="flex:1;min-width:0;">
                <div class="num" style="font-size:13px;font-weight:500;color:var(--mep-fg);">{inv.invoiceNumber ?? '—'}</div>
                <div style="font-size:11px;color:var(--mep-fg-3);">{fmtDateShort(inv.invoiceDate, $locale)}</div>
              </div>
              <div class="num" style="font-size:13px;font-weight:500;color:var(--mep-fg);">{fmtEur(inv.totalAmount ?? 0)}</div>
              <StatusBadge status={invoiceStatus(inv)} style="font-size:10px;padding:1px 5px;" />
            </div>
          {/each}
        </div>
      {/if}

      <!-- Reliability -->
      {#if m}
        <div class="card" style="padding:14px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
            <div class="subtitle" style="flex:1;">Fiabilidad</div>
            <div style="
              width:42px;height:42px;border-radius:50%;
              border:3px solid {scoreColor(m.score)};
              display:flex;align-items:center;justify-content:center;flex-direction:column;
            ">
              <span style="font-size:13px;font-weight:700;color:{scoreColor(m.score)};line-height:1;">{m.score}</span>
              <span style="font-size:8px;color:var(--mep-fg-3);">/100</span>
            </div>
            <span style="font-size:12px;font-weight:600;color:{scoreColor(m.score)};">{scoreLabel(m.score)}</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
            {#each [
              { label: 'Precios', score: m.priceStabilityScore, max: 33 },
              { label: 'Regularidad', score: m.frequencyScore, max: 33 },
              { label: 'Puntualidad', score: m.timelinessScore, max: 34 },
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
        <div style="padding:40px 0;text-align:center;color:var(--mep-fg-3);font-size:13px;">Sin facturas registradas</div>
      {:else}
        {#each data.invoices as inv (inv.id)}
          <div class="card" style="padding:12px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;"
            onclick={() => location.replace(`/invoice/${inv.id}`)}>
            <div style="flex:1;min-width:0;">
              <div class="num" style="font-size:13.5px;font-weight:500;color:var(--mep-fg);">{inv.invoiceNumber ?? '—'}</div>
              <div style="font-size:11px;color:var(--mep-fg-3);margin-top:2px;">{fmtDate(inv.invoiceDate, $locale)}{inv.dueDate ? ` · vence ${fmtDateShort(inv.dueDate, $locale)}` : ''}</div>
            </div>
            <div class="num" style="font-size:14px;font-weight:600;color:var(--mep-fg);">{fmtEur(inv.totalAmount ?? 0)}</div>
            <StatusBadge status={invoiceStatus(inv)} style="font-size:10px;padding:1px 5px;" />
          </div>
        {/each}
      {/if}

    {:else if tab === 'productos'}
      <div class="card" style="padding:32px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px;">
        <div style="font-size:28px;opacity:0.3;">📦</div>
        <p class="body-strong" style="color:var(--mep-fg-2);">Catálogo de productos</p>
        <p style="font-size:12.5px;color:var(--mep-fg-3);max-width:280px;">Disponible cuando activemos la extracción de líneas de factura.</p>
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
    bind:tab
    bind:editing
    bind:confirmDelete
  />
</div>
