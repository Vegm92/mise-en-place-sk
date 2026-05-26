<script lang="ts">
  import type { PageData } from './$types';
  import { VALID_CATEGORIES, CATEGORY_COLORS, SUPPLIER_BADGE_CLS, SUPPLIER_BADGE_LABEL, PRICE_STABILITY_BADGE } from '$lib/constants';
  import { fmtEur } from '$lib/formatters';
  import { ArrowLeft, Pencil, Trash2 } from 'lucide-svelte';

  let { data }: { data: PageData } = $props();

  let editing = $state(false);
  let confirmDelete = $state(false);

  const s = $derived(data.supplier);
  const m = $derived(data.metrics);

  const totalSpend = $derived(data.invoices.reduce((a, i) => a + (i.totalAmount ?? 0), 0));
  const paidCount  = $derived(data.invoices.filter(i => i.status === 'paid').length);

  const today = new Date().toISOString().slice(0, 10);

  function fmtDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function invoiceBadge(inv: typeof data.invoices[0]): 'overdue' | 'due_soon' | 'paid_up' | 'pending' {
    if (inv.status === 'paid') return 'paid_up';
    if (inv.dueDate && inv.dueDate < today) return 'overdue';
    const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    if (inv.dueDate && inv.dueDate <= weekEnd) return 'due_soon';
    return 'pending';
  }

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

  const stabilityLevel = $derived(
    m ? (m.priceStabilityCv === null ? null : m.priceStabilityCv < 5 ? 'stable' : m.priceStabilityCv <= 15 ? 'moderate' : 'volatile') : null
  );

  const color = $derived(CATEGORY_COLORS[s.category ?? 'Other'] ?? CATEGORY_COLORS['Other']);
  function initials(name: string) {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }
</script>

<div style="height:100%;display:flex;flex-direction:column;overflow:hidden;">
  <div style="padding:20px 24px;display:flex;flex-direction:column;gap:16px;flex:1;min-height:0;overflow:auto;">

    <!-- Back + actions -->
    <div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">
      <a href="/suppliers" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--mep-fg-3);text-decoration:none;">
        <ArrowLeft size={14} /> Proveedores
      </a>
      <div style="flex:1;"></div>
      {#if !editing}
        <button class="btn" style="height:32px;font-size:12.5px;display:flex;align-items:center;gap:6px;"
          onclick={() => { editing = true; confirmDelete = false; }}>
          <Pencil size={13} /> Editar
        </button>
        <button class="btn" style="height:32px;font-size:12.5px;color:#E05555;border-color:#E05555;display:flex;align-items:center;gap:6px;"
          onclick={() => { confirmDelete = !confirmDelete; }}>
          <Trash2 size={13} /> Eliminar
        </button>
      {/if}
    </div>

    <!-- Delete confirmation -->
    {#if confirmDelete}
      <div class="card" style="padding:14px;border-left:3px solid #E05555;flex-shrink:0;">
        <p class="body-strong" style="color:#E05555;margin-bottom:8px;">¿Eliminar este proveedor?</p>
        <p class="body" style="color:var(--mep-fg-3);font-size:12px;margin-bottom:12px;">
          Las {data.invoices.length} facturas asociadas quedarán sin proveedor. Esta acción no se puede deshacer.
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

    <!-- Header card -->
    <div class="card" style="padding:20px;display:flex;gap:16px;align-items:flex-start;flex-shrink:0;">
      <span style="
        width:48px;height:48px;border-radius:24px;flex-shrink:0;
        background:{color}24;color:{color};
        display:inline-flex;align-items:center;justify-content:center;
        font-size:16px;font-weight:700;
      ">{initials(s.name)}</span>
      <div style="flex:1;">
        <h2 style="font-size:18px;font-weight:600;color:var(--mep-fg);margin:0 0 4px;">{s.name}</h2>
        {#if s.category}
          <span style="font-size:12px;color:var(--mep-fg-3);">{s.category}</span>
        {:else}
          <span style="font-size:12px;color:var(--mep-fg-4);font-style:italic;">Sin categoría</span>
        {/if}
        {#if s.contactEmail}
          <div style="font-size:12px;color:var(--mep-fg-3);margin-top:4px;">{s.contactEmail}</div>
        {/if}
        {#if s.notes}
          <div style="font-size:12px;color:var(--mep-fg-3);margin-top:6px;font-style:italic;">{s.notes}</div>
        {/if}
      </div>
      <div style="display:flex;gap:20px;text-align:right;">
        <div>
          <div class="label" style="margin-bottom:4px;">Gasto total</div>
          <div style="font-size:18px;font-weight:600;color:var(--mep-fg);">{fmtEur(totalSpend)}</div>
        </div>
        <div>
          <div class="label" style="margin-bottom:4px;">Facturas</div>
          <div style="font-size:18px;font-weight:600;color:var(--mep-fg);">{data.invoices.length}</div>
        </div>
        <div>
          <div class="label" style="margin-bottom:4px;">Pagadas</div>
          <div style="font-size:18px;font-weight:600;color:var(--mep-fg);">{paidCount}</div>
        </div>
      </div>
    </div>

    <!-- Edit form -->
    {#if editing}
      <div class="card" style="padding:20px;flex-shrink:0;">
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
              <label for="edit-email" class="label" style="display:block;margin-bottom:4px;">Email de contacto</label>
              <input id="edit-email" class="input" name="contact_email" type="email" value={s.contactEmail ?? ''} style="width:100%;" placeholder="proveedor@ejemplo.com" />
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

    <!-- Reliability score -->
    {#if m}
      <div class="card" style="padding:20px;flex-shrink:0;">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">
          <div>
            <div class="label" style="margin-bottom:4px;">Puntuación de fiabilidad</div>
            <div style="font-size:11px;color:var(--mep-fg-3);">Basado en los últimos 6 meses de facturas</div>
          </div>
          <div style="flex:1;"></div>
          <div style="
            width:56px;height:56px;border-radius:50%;
            border:3px solid {scoreColor(m.score)};
            display:flex;align-items:center;justify-content:center;flex-direction:column;
          ">
            <span style="font-size:16px;font-weight:700;color:{scoreColor(m.score)};line-height:1;">{m.score}</span>
            <span style="font-size:9px;color:var(--mep-fg-3);">/100</span>
          </div>
          <div>
            <span style="
              font-size:12px;font-weight:600;
              color:{scoreColor(m.score)};
            ">{scoreLabel(m.score)}</span>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
          <!-- Price stability -->
          <div style="padding:12px;background:var(--mep-bg-2);border-radius:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span class="label">Estabilidad de precios</span>
              <span style="font-size:13px;font-weight:700;color:{scoreColor(m.priceStabilityScore * 3)};">
                {m.priceStabilityScore}/33
              </span>
            </div>
            {#if stabilityLevel}
              {@const sb = PRICE_STABILITY_BADGE[stabilityLevel]}
              <span style="font-size:11px;padding:2px 7px;border-radius:4px;background:{sb.bg};color:{sb.color};">
                {sb.label}
              </span>
            {:else}
              <span style="font-size:11px;color:var(--mep-fg-3);">Sin datos de precio</span>
            {/if}
            <p style="font-size:11px;color:var(--mep-fg-3);margin-top:6px;">
              Variación de precios de los 5 artículos más pedidos.
              {#if m.priceStabilityCv !== null}
                CV: {m.priceStabilityCv.toFixed(1)}%
              {/if}
            </p>
          </div>

          <!-- Frequency consistency -->
          <div style="padding:12px;background:var(--mep-bg-2);border-radius:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span class="label">Regularidad de pedidos</span>
              <span style="font-size:13px;font-weight:700;color:{scoreColor(m.frequencyScore * 3)};">
                {m.frequencyScore}/33
              </span>
            </div>
            <p style="font-size:11px;color:var(--mep-fg-3);">
              Basado en la cadencia histórica de facturas y ausencias detectadas.
            </p>
          </div>

          <!-- Payment timeliness -->
          <div style="padding:12px;background:var(--mep-bg-2);border-radius:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span class="label">Puntualidad de pago</span>
              <span style="font-size:13px;font-weight:700;color:{scoreColor(m.timelinessScore * 2.9)};">
                {m.timelinessScore}/34
              </span>
            </div>
            <p style="font-size:11px;color:var(--mep-fg-3);">
              Porcentaje de facturas pagadas antes del vencimiento.
            </p>
          </div>
        </div>
      </div>
    {:else if data.invoices.length < 3}
      <div class="card" style="padding:16px;flex-shrink:0;display:flex;align-items:center;gap:10px;">
        <span style="font-size:20px;opacity:0.4;">📊</span>
        <div>
          <p class="body-strong" style="color:var(--mep-fg-2);">Datos insuficientes</p>
          <p style="font-size:12px;color:var(--mep-fg-3);">Se necesitan al menos 3 facturas para calcular la puntuación de fiabilidad.</p>
        </div>
      </div>
    {/if}

    <!-- Invoice list -->
    <div class="card" style="padding:0;overflow:hidden;flex-shrink:0;">
      <div style="padding:14px 16px;border-bottom:1px solid var(--mep-border);">
        <p class="body-strong">Facturas ({data.invoices.length})</p>
      </div>
      {#if !data.invoices.length}
        <div style="padding:24px;text-align:center;">
          <p style="font-size:13px;color:var(--mep-fg-3);">Sin facturas registradas</p>
        </div>
      {:else}
        <table class="tbl" style="table-layout:fixed;">
          <thead>
            <tr>
              <th style="width:140px;">Número</th>
              <th style="width:110px;">Fecha</th>
              <th style="width:110px;">Vencimiento</th>
              <th class="num" style="width:120px;">Importe</th>
              <th style="width:90px;">Estado</th>
            </tr>
          </thead>
          <tbody>
            {#each data.invoices as inv (inv.id)}
              {@const badge = invoiceBadge(inv)}
              <tr class="row" onclick={() => location.replace(`/invoice/${inv.id}`)} style="cursor:pointer;">
                <td style="font-size:12.5px;color:var(--mep-fg-2);">{inv.invoiceNumber ?? '—'}</td>
                <td style="font-size:12.5px;">{fmtDate(inv.invoiceDate)}</td>
                <td style="font-size:12.5px;color:var(--mep-fg-2);">{fmtDate(inv.dueDate)}</td>
                <td class="num" style="font-weight:500;">{fmtEur(inv.totalAmount ?? 0)}</td>
                <td>
                  <span class="{SUPPLIER_BADGE_CLS[badge] ?? 'badge'}" style="font-size:11px;padding:2px 7px;">
                    {SUPPLIER_BADGE_LABEL[badge] ?? badge}
                  </span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>

  </div>
</div>
