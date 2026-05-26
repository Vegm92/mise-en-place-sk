<script lang="ts">
  import type { PageData } from './$types';
  import { SUPPLIER_BADGE_CLS, SUPPLIER_BADGE_LABEL } from '$lib/constants';
  import { t } from '$lib/i18n';
  import { fmtEur } from '$lib/formatters';
  import { Search, ChevronRight } from 'lucide-svelte';

  let { data }: { data: PageData } = $props();

  let search = $state('');

  const filtered = $derived(
    search.trim()
      ? data.suppliers.filter(s =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          (s.category ?? '').toLowerCase().includes(search.toLowerCase())
        )
      : data.suppliers
  );

  const totalSpend = $derived(data.suppliers.reduce((s, x) => s + (x.month_spend ?? 0), 0));
  const totalOpen  = $derived(data.suppliers.reduce((s, x) => s + (x.open_count ?? 0), 0));
  const unassigned = $derived(data.suppliers.filter(s => !s.category || s.category === 'Other').length);

  function initials(name: string) {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  function fmtDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  }

</script>

<div style="height:100%;display:flex;flex-direction:column;overflow:hidden;">
  <div style="padding:20px 24px 0;display:flex;flex-direction:column;gap:14px;flex:1;min-height:0;">

    <!-- Filter bar -->
    <div class="card" style="padding:10px 12px;display:flex;align-items:center;gap:10px;flex-shrink:0;">
      <div style="position:relative;flex:1;min-width:200px;">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--mep-fg-3);">
          <Search size={14} />
        </span>
        <input class="input" style="padding-left:32px;width:100%;"
          placeholder="Buscar por nombre o categoría…" bind:value={search} />
      </div>
    </div>

    <!-- Summary stats -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;flex-shrink:0;">
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">Proveedores activos</div>
        <div class="num" style="font-size:22px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.4px;line-height:1.1;">{data.suppliers.length}</div>
        <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:6px;">en total</div>
      </div>
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">Gasto total</div>
        <div class="num" style="font-size:22px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.4px;line-height:1.1;">{fmtEur(totalSpend)}</div>
        <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:6px;">este mes</div>
      </div>
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">Facturas abiertas</div>
        <div class="num" style="font-size:22px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.4px;line-height:1.1;">{totalOpen}</div>
        <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:6px;">pendientes de pago</div>
      </div>
      <div class="card" style="padding:14px;">
        <div class="label" style="margin-bottom:6px;">Sin categoría</div>
        <div class="num" style="font-size:22px;font-weight:600;color:{unassigned > 0 ? 'var(--mep-warn)' : 'var(--mep-fg)'};letter-spacing:-0.4px;line-height:1.1;">{unassigned}</div>
        <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:6px;">{unassigned > 0 ? 'por asignar' : 'todos asignados'}</div>
      </div>
    </div>

    <!-- Table -->
    <div class="card" style="padding:0;overflow:hidden;flex:1;display:flex;flex-direction:column;">
      <div style="overflow:auto;flex:1;">
        {#if !filtered.length}
          <div style="text-align:center;padding:48px 24px;display:flex;flex-direction:column;align-items:center;gap:8px;">
            {#if search}
              <p class="body" style="color:var(--mep-fg-3);">Sin resultados para "{search}"</p>
            {:else}
              <div style="font-size:28px;margin-bottom:4px;opacity:0.3;">🏪</div>
              <p class="body-strong" style="color:var(--mep-fg-2);">Aún no hay proveedores</p>
              <p class="body" style="color:var(--mep-fg-3);max-width:320px;">Sube tu primera factura y crearemos los proveedores automáticamente a partir de los datos extraídos.</p>
              <a href="/" class="btn btn-primary" style="height:34px;font-size:13px;text-decoration:none;margin-top:8px;">Subir factura</a>
            {/if}
          </div>
        {:else}
          <table class="tbl" style="table-layout:fixed;">
            <thead>
              <tr>
                <th style="width:30%;">Proveedor</th>
                <th style="width:160px;">Categoría</th>
                <th class="num" style="width:100px;">Facturas</th>
                <th class="num" style="width:140px;">Gasto (mes)</th>
                <th style="width:100px;">Estado</th>
                <th style="width:130px;">Último pedido</th>
                <th style="width:40px;"></th>
              </tr>
            </thead>
            <tbody>
              {#each filtered as s (s.id)}
                <tr class="row">
                  <td>
                    <div style="display:flex;align-items:center;gap:10px;">
                      <span style="
                        width:28px;height:28px;border-radius:14px;flex-shrink:0;
                        background:{s.color}24;color:{s.color};
                        display:inline-flex;align-items:center;justify-content:center;
                        font-size:11px;font-weight:600;
                      ">{initials(s.name)}</span>
                      <span style="font-size:13px;font-weight:500;color:var(--mep-fg);
                        overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{s.name}</span>
                    </div>
                  </td>
                  <td>
                    <form method="post" action="?/setCategory">
                      <input type="hidden" name="supplier_id" value={s.id} />
                      <select name="category" class="input"
                        style="height:26px;font-size:12px;padding:0 6px;width:100%;"
                        onchange={(e) => (e.currentTarget as HTMLSelectElement).form?.submit()}>
                        <option value="">Sin categoría</option>
                        {#each data.categories as cat}
                          <option value={cat} selected={s.category === cat}>{cat}</option>
                        {/each}
                      </select>
                    </form>
                  </td>
                  <td class="num" style="font-size:12.5px;color:var(--mep-fg-2);">{s.open_count}</td>
                  <td class="num" style="font-weight:500;">{fmtEur(s.month_spend ?? 0)}</td>
                  <td>
                    <span class="{SUPPLIER_BADGE_CLS[s.badge] ?? 'badge badge-pending'}"
                      style="font-size:11px;padding:2px 7px;">
                      {SUPPLIER_BADGE_LABEL[s.badge] ?? s.badge}
                    </span>
                  </td>
                  <td class="num" style="font-size:12.5px;color:var(--mep-fg-2);">{fmtDate(s.last_invoice_date)}</td>
                  <td style="text-align:right;">
                    <ChevronRight size={13} style="color:var(--mep-fg-3);" />
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
    </div>

  </div>
</div>
