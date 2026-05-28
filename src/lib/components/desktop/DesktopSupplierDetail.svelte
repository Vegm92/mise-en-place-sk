<script lang="ts">
  import { VALID_CATEGORIES, CATEGORY_COLORS } from '$lib/constants';
  import { fmtEur, fmtDate, fmtDateShort, initials } from '$lib/formatters';
  import { ArrowLeft, ChevronRight, Pencil, Trash2, Mail, Phone, Truck, CreditCard } from 'lucide-svelte';
  import StatusBadge from '$lib/components/mep/StatusBadge.svelte';

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
  function scoreLabel(score: number) {
    if (score >= 70) return 'Muy fiable';
    if (score >= 40) return 'Fiable';
    return 'Poco fiable';
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
          <ArrowLeft size={12} /> Proveedores
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
              <span style="font-style:italic;">Sin categoría</span>
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
                <Mail size={13} /> Contactar
              </a>
            {/if}
            <button class="btn btn-secondary" style="height:32px;font-size:12.5px;display:inline-flex;align-items:center;gap:6px;"
              onclick={() => { editing = true; confirmDelete = false; }}>
              <Pencil size={13} /> Editar
            </button>
            <button class="btn" style="height:32px;font-size:12.5px;color:#E05555;border-color:#E05555;display:inline-flex;align-items:center;gap:6px;"
              onclick={() => { confirmDelete = !confirmDelete; }}>
              <Trash2 size={13} /> Eliminar
            </button>
          </div>
        {/if}
      </div>

      <!-- Delete confirmation -->
      {#if confirmDelete}
        <div class="card" style="padding:14px;border-left:3px solid #E05555;margin-bottom:14px;">
          <p class="body-strong" style="color:#E05555;margin-bottom:8px;">¿Eliminar este proveedor?</p>
          <p class="body" style="color:var(--mep-fg-3);font-size:12px;margin-bottom:12px;">
            Las {invoices.length} facturas asociadas quedarán sin proveedor. Esta acción no se puede deshacer.
          </p>
          <div style="display:flex;gap:8px;">
            <form method="post" action="?/delete">
              <button type="submit" class="btn" style="background:#E05555;color:#fff;border-color:#E05555;height:30px;font-size:12px;">
                Sí, eliminar
              </button>
            </form>
            <button class="btn" style="height:30px;font-size:12px;" onclick={() => confirmDelete = false}>Cancelar</button>
          </div>
        </div>
      {/if}

      <!-- Edit form -->
      {#if editing}
        <div class="card" style="padding:20px;margin-bottom:14px;">
          <p class="body-strong" style="margin-bottom:14px;">Editar proveedor</p>
          <form method="post" action="?/update" style="display:flex;flex-direction:column;gap:12px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div>
                <label for="edit-name" class="label" style="display:block;margin-bottom:4px;">Nombre</label>
                <input id="edit-name" class="input" name="name" value={s.name} required style="width:100%;" />
              </div>
              <div>
                <label for="edit-category" class="label" style="display:block;margin-bottom:4px;">Categoría</label>
                <select id="edit-category" class="input" name="category" style="width:100%;">
                  <option value="">Sin categoría</option>
                  {#each VALID_CATEGORIES as cat}
                    <option value={cat} selected={s.category === cat}>{cat}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label for="edit-cif" class="label" style="display:block;margin-bottom:4px;">CIF/NIF</label>
                <input id="edit-cif" class="input" name="cif" value={s.cif ?? ''} style="width:100%;" placeholder="B12345678" />
              </div>
              <div>
                <label for="edit-email" class="label" style="display:block;margin-bottom:4px;">Email de contacto</label>
                <input id="edit-email" class="input" name="contact_email" type="email" value={s.contactEmail ?? ''} style="width:100%;" placeholder="proveedor@ejemplo.com" />
              </div>
              <div>
                <label for="edit-phone" class="label" style="display:block;margin-bottom:4px;">Teléfono</label>
                <input id="edit-phone" class="input" name="contact_phone" type="tel" value={s.contactPhone ?? ''} style="width:100%;" placeholder="+34 600 000 000" />
              </div>
              <div>
                <label for="edit-delivery" class="label" style="display:block;margin-bottom:4px;">Días de entrega</label>
                <input id="edit-delivery" class="input" name="delivery_days" value={s.deliveryDays ?? ''} style="width:100%;" placeholder="Lun, Mié, Vie" />
              </div>
              <div>
                <label for="edit-terms" class="label" style="display:block;margin-bottom:4px;">Condiciones de pago</label>
                <input id="edit-terms" class="input" name="payment_terms" value={s.paymentTerms ?? ''} style="width:100%;" placeholder="30 días" />
              </div>
              <div>
                <label for="edit-notes" class="label" style="display:block;margin-bottom:4px;">Notas</label>
                <input id="edit-notes" class="input" name="notes" value={s.notes ?? ''} style="width:100%;" placeholder="Notas internas…" />
              </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:4px;">
              <button type="submit" class="btn btn-primary" style="height:32px;font-size:12.5px;">Guardar</button>
              <button type="button" class="btn" style="height:32px;font-size:12.5px;" onclick={() => editing = false}>Cancelar</button>
            </div>
          </form>
        </div>
      {/if}

      <!-- Tabs -->
      <div style="display:flex;gap:0;border-bottom:1px solid var(--mep-divider);">
        {#each [
          { id: 'resumen',      label: 'Resumen' },
          { id: 'facturas',     label: 'Facturas',    count: invoices.length },
          { id: 'productos',    label: 'Productos' },
          { id: 'conversiones', label: 'Conversiones' },
        ] as t}
          <button
            style="
              border:0;background:transparent;cursor:pointer;font-family:inherit;
              padding:10px 16px;margin-bottom:-1px;
              border-bottom:{tab === t.id ? '2px solid var(--mep-acc)' : '2px solid transparent'};
              font-size:13px;font-weight:{tab === t.id ? '600' : '500'};
              color:{tab === t.id ? 'var(--mep-fg)' : 'var(--mep-fg-3)'};
              display:inline-flex;align-items:center;gap:6px;
            "
            onclick={() => tab = t.id as typeof tab}>
            {t.label}
            {#if t.count !== undefined}
              <span style="font-size:11px;font-weight:500;padding:1px 6px;border-radius:999px;
                background:var(--mep-surface-2);color:var(--mep-fg-3);">{t.count}</span>
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
                  <div class="subtitle">Gasto mensual</div>
                  <div style="font-size:12px;color:var(--mep-fg-3);margin-top:2px;">Últimos 7 meses</div>
                </div>
                {#if chartAvg > 0}
                  <div style="display:flex;align-items:baseline;gap:8px;">
                    <span class="num" style="font-size:20px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.4px;">{fmtEur(chartAvg)}</span>
                    <span style="font-size:11.5px;color:var(--mep-fg-3);">media mensual</span>
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
                <div class="label" style="margin-bottom:6px;">Valor medio factura</div>
                <div class="num" style="font-size:20px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.4px;line-height:1.1;">
                  {fmtEur(avgInvoice)}
                </div>
                <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:6px;">{invoices.length} facturas</div>
              </div>
              <div class="card" style="padding:14px;">
                <div class="label" style="margin-bottom:6px;">Facturas abiertas</div>
                <div class="num" style="font-size:20px;font-weight:600;
                  color:{openCount > 0 ? 'var(--mep-warn)' : 'var(--mep-fg)'};letter-spacing:-0.4px;line-height:1.1;">
                  {openCount}
                </div>
                <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:6px;">{paidCount} pagadas</div>
              </div>
              <div class="card" style="padding:14px;">
                <div class="label" style="margin-bottom:6px;">Pendiente de pago</div>
                <div class="num" style="font-size:20px;font-weight:600;
                  color:{pendingAmt > 0 ? 'var(--mep-warn)' : 'var(--mep-fg)'};letter-spacing:-0.4px;line-height:1.1;">
                  {fmtEur(pendingAmt)}
                </div>
                <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:6px;">importe abierto</div>
              </div>
            </div>

            <!-- Reliability breakdown -->
            {#if m}
              <div class="card" style="padding:20px;">
                <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">
                  <div>
                    <div class="subtitle" style="margin-bottom:2px;">Puntuación de fiabilidad</div>
                    <div style="font-size:11px;color:var(--mep-fg-3);">Basado en los últimos 6 meses</div>
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
                  <span style="font-size:12px;font-weight:600;color:{scoreColor(m.score)};">{scoreLabel(m.score)}</span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
                  <div style="padding:10px;background:var(--mep-surface-2);border-radius:8px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                      <span class="label">Precios</span>
                      <span style="font-size:12px;font-weight:700;color:{scoreColor(m.priceStabilityScore * 3)};">{m.priceStabilityScore}/33</span>
                    </div>
                    <p style="font-size:11px;color:var(--mep-fg-3);margin:0;">
                      {#if m.priceStabilityCv !== null}CV: {m.priceStabilityCv.toFixed(1)}%{:else}Sin datos{/if}
                    </p>
                  </div>
                  <div style="padding:10px;background:var(--mep-surface-2);border-radius:8px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                      <span class="label">Regularidad</span>
                      <span style="font-size:12px;font-weight:700;color:{scoreColor(m.frequencyScore * 3)};">{m.frequencyScore}/33</span>
                    </div>
                    <p style="font-size:11px;color:var(--mep-fg-3);margin:0;">Cadencia histórica</p>
                  </div>
                  <div style="padding:10px;background:var(--mep-surface-2);border-radius:8px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                      <span class="label">Puntualidad</span>
                      <span style="font-size:12px;font-weight:700;color:{scoreColor(m.timelinessScore * 2.9)};">{m.timelinessScore}/34</span>
                    </div>
                    <p style="font-size:11px;color:var(--mep-fg-3);margin:0;">Pagos antes de vencimiento</p>
                  </div>
                </div>
              </div>
            {:else if invoices.length < 3}
              <div class="card" style="padding:16px;display:flex;align-items:center;gap:10px;">
                <span style="font-size:20px;opacity:0.4;">📊</span>
                <div>
                  <p class="body-strong" style="color:var(--mep-fg-2);">Datos insuficientes</p>
                  <p style="font-size:12px;color:var(--mep-fg-3);">Se necesitan al menos 3 facturas para calcular la puntuación de fiabilidad.</p>
                </div>
              </div>
            {/if}

          </div>

          <!-- Right column -->
          <div style="display:flex;flex-direction:column;gap:14px;">

            <!-- Info card -->
            <div class="card" style="padding:16px;">
              <div class="subtitle" style="margin-bottom:10px;">Información</div>
              {#if !s.contactEmail && !s.contactPhone && !s.cif && !s.deliveryDays && !s.paymentTerms && !s.notes && !s.alias}
                <p style="font-size:12.5px;color:var(--mep-fg-3);font-style:italic;">Sin información de contacto registrada.</p>
                <button class="btn btn-secondary" style="height:28px;font-size:12px;margin-top:8px;"
                  onclick={() => { editing = true; confirmDelete = false; }}>
                  <Pencil size={11} /> Añadir datos
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
                      <span>Entrega: {s.deliveryDays}</span>
                    </div>
                  {/if}
                  {#if s.paymentTerms}
                    <div style="display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--mep-fg-2);">
                      <CreditCard size={14} style="color:var(--mep-fg-3);flex-shrink:0;" />
                      <span>Pago: {s.paymentTerms}</span>
                    </div>
                  {/if}
                  {#if s.alias}
                    <div style="font-size:12.5px;color:var(--mep-fg-3);">Alias: {s.alias}</div>
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
                <div class="subtitle">Facturas recientes</div>
                {#if invoices.length > 5}
                  <button style="font-size:12.5px;color:var(--mep-acc);font-weight:500;background:none;border:0;cursor:pointer;padding:0;"
                    onclick={() => tab = 'facturas'}>
                    Ver todas ({invoices.length})
                  </button>
                {/if}
              </div>
              {#if !invoices.length}
                <div style="padding:16px 16px 20px;text-align:center;">
                  <p style="font-size:12.5px;color:var(--mep-fg-3);">Sin facturas registradas</p>
                </div>
              {:else}
                {#each invoices.slice(0, 5) as inv (inv.id)}
                  <div style="padding:10px 16px;display:flex;align-items:center;gap:10px;
                    border-top:1px solid var(--mep-divider);cursor:pointer;"
                    onclick={() => location.replace(`/invoice/${inv.id}`)}>
                    <div style="flex:1;min-width:0;">
                      <div class="num" style="font-size:12.5px;font-weight:500;color:var(--mep-fg);">
                        {inv.invoiceNumber ?? '—'}
                      </div>
                      <div style="font-size:11px;color:var(--mep-fg-3);">{fmtDateShort(inv.invoiceDate)}</div>
                    </div>
                    <div class="num" style="font-size:13px;font-weight:500;color:var(--mep-fg);">
                      {fmtEur(inv.totalAmount ?? 0)}
                    </div>
                    <StatusBadge status={invoiceStatus(inv)} style="font-size:10px;padding:1px 5px;" />
                  </div>
                {/each}
              {/if}
            </div>

          </div>
        </div>

      <!-- ── FACTURAS ── -->
      {:else if tab === 'facturas'}
        {#if !invoices.length}
          <div style="text-align:center;padding:48px 24px;">
            <p style="font-size:13px;color:var(--mep-fg-3);">Sin facturas registradas</p>
          </div>
        {:else}
          <div class="card" style="padding:0;overflow:hidden;">
            <table class="tbl" style="table-layout:fixed;">
              <thead>
                <tr>
                  <th style="width:150px;">Número</th>
                  <th style="width:110px;">Fecha</th>
                  <th style="width:110px;">Vencimiento</th>
                  <th class="num" style="width:130px;">Importe</th>
                  <th style="width:100px;">Estado</th>
                </tr>
              </thead>
              <tbody>
                {#each invoices as inv (inv.id)}
                  <tr class="row" onclick={() => location.replace(`/invoice/${inv.id}`)} style="cursor:pointer;">
                    <td style="font-size:12.5px;color:var(--mep-fg-2);">{inv.invoiceNumber ?? '—'}</td>
                    <td style="font-size:12.5px;">{fmtDate(inv.invoiceDate)}</td>
                    <td style="font-size:12.5px;color:var(--mep-fg-2);">{fmtDate(inv.dueDate)}</td>
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
          <p class="body-strong" style="color:var(--mep-fg-2);">Catálogo de productos</p>
          <p style="font-size:12.5px;color:var(--mep-fg-3);max-width:340px;">
            El análisis de productos por proveedor estará disponible cuando activemos la extracción de líneas de factura.
          </p>
        </div>

      <!-- ── CONVERSIONES ── -->
      {:else if tab === 'conversiones'}
        <div class="card" style="padding:32px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px;">
          <div style="font-size:28px;opacity:0.3;margin-bottom:4px;">⚖️</div>
          <p class="body-strong" style="color:var(--mep-fg-2);">Conversiones de unidad</p>
          <p style="font-size:12.5px;color:var(--mep-fg-3);max-width:340px;">
            Aquí aparecerán las equivalencias de unidad configuradas para este proveedor (p.ej. caja → kg).
          </p>
        </div>
      {/if}

    </div>
  </div>
</div>
