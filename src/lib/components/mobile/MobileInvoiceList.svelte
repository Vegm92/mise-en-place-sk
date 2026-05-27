<script lang="ts">
  import MobilePageHeader from './MobilePageHeader.svelte';
  import StatusBadge from '$lib/components/mep/StatusBadge.svelte';
  import { fmtEur } from '$lib/formatters';

  interface Invoice {
    id: number;
    invoice_number: string | null;
    supplier_name: string | null;
    total_amount: number | null;
    display_amount?: number | null;
    status: string;
    invoice_date: string | null;
    line_items?: { id?: number }[];
  }

  let {
    invoices,
    hasAlert = false,
  }: {
    invoices: Invoice[];
    hasAlert?: boolean;
  } = $props();

  let searchQuery = $state('');
  let activeFilter = $state('month');

  const filters = [
    { id: 'month', label: 'Este mes' },
    { id: 'pending', label: 'Por revisar' },
    { id: 'overdue', label: 'Vencidas' },
  ];

  const filtered = $derived.by(() => {
    let list = invoices;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(inv =>
        inv.supplier_name?.toLowerCase().includes(q) ||
        inv.invoice_number?.toLowerCase().includes(q)
      );
    }
    if (activeFilter === 'pending') {
      list = list.filter(inv => inv.status === 'pending');
    } else if (activeFilter === 'overdue') {
      list = list.filter(inv => inv.status === 'overdue');
    }
    return list;
  });

  // Group by date label
  const grouped = $derived.by(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups: Map<string, Invoice[]> = new Map();
    for (const inv of filtered) {
      const d = inv.invoice_date ? new Date(inv.invoice_date) : null;
      let label = 'Sin fecha';
      if (d) {
        d.setHours(0, 0, 0, 0);
        if (d.getTime() === today.getTime()) {
          label = `Hoy · ${today.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`;
        } else if (d.getTime() === yesterday.getTime()) {
          label = `Ayer · ${yesterday.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`;
        } else {
          label = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
        }
      }
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(inv);
    }
    return [...groups.entries()];
  });
</script>

<div style="height: 100%; display: flex; flex-direction: column; overflow: hidden;">
  <MobilePageHeader title="Facturas" {hasAlert} />

  <!-- Search -->
  <div style="padding: 0 18px 10px; position: relative;">
    <span style="position: absolute; left: 30px; top: 50%; transform: translateY(-50%); color: var(--mep-fg-3); pointer-events: none;">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
      </svg>
    </span>
    <input
      class="input"
      style="width: 100%; height: 40px; padding-left: 36px; font-size: 14px; box-sizing: border-box;"
      placeholder="Buscar N.º, proveedor…"
      bind:value={searchQuery}
    />
  </div>

  <!-- Filter chips -->
  <div style="display: flex; gap: 6px; padding: 0 18px 12px; overflow-x: auto; flex-shrink: 0;">
    {#each filters as f}
      <button
        style="
          border: 0; height: 30px; padding: 0 12px; border-radius: 15px; white-space: nowrap;
          background: {activeFilter === f.id ? 'var(--mep-acc)' : 'var(--mep-surface)'};
          color: {activeFilter === f.id ? 'var(--mep-acc-fg)' : 'var(--mep-fg-2)'};
          font-size: 12px; font-weight: 500; cursor: pointer;
          box-shadow: {activeFilter === f.id ? 'none' : '0 1px 2px rgba(0,0,0,0.04)'};
          font-family: inherit;
        "
        onclick={() => activeFilter = f.id}
      >{f.label}</button>
    {/each}
  </div>

  <!-- Grouped invoice list -->
  <div style="flex: 1; overflow: auto; padding-bottom: 90px;">
    {#if grouped.length === 0}
      <div style="padding: 40px 18px; text-align: center; color: var(--mep-fg-3); font-size: 13px;">
        Sin facturas
      </div>
    {:else}
      {#each grouped as [label, group]}
        <div style="margin-bottom: 16px;">
          <div style="
            padding: 6px 18px;
            font-size: 11.5px; color: var(--mep-fg-3);
            text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500;
          ">{label}</div>
          <div style="padding: 0 18px; display: flex; flex-direction: column; gap: 8px;">
            {#each group as inv}
              <a href="/invoice/{inv.id}" style="
                display: flex; align-items: center; gap: 12px;
                padding: 12px; border-radius: 10px;
                background: var(--mep-surface);
                text-decoration: none;
                box-shadow: 0 1px 3px rgba(0,0,0,0.05);
              ">
                <div style="
                  width: 40px; height: 40px; border-radius: 8px; flex-shrink: 0;
                  background: var(--mep-surface-2); color: var(--mep-fg-2);
                  display: flex; align-items: center; justify-content: center;
                ">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <div style="flex: 1; min-width: 0;">
                  <div style="font-size: 13.5px; font-weight: 500; color: var(--mep-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    {inv.supplier_name ?? '—'}
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px; margin-top: 3px;">
                    <StatusBadge status={inv.status} style="font-size: 9.5px; padding: 1px 5px;" />
                    <span class="num" style="font-size: 11px; color: var(--mep-fg-3);">
                      {inv.invoice_number ?? '—'}
                    </span>
                  </div>
                </div>
                <div style="text-align: right; flex-shrink: 0;">
                  <div class="num" style="font-size: 14px; font-weight: 600; color: var(--mep-fg);">
                    {(inv.display_amount ?? inv.total_amount) != null ? fmtEur((inv.display_amount ?? inv.total_amount)!) : '—'}
                  </div>
                  {#if inv.line_items && inv.line_items.length > 0}
                    <div class="num" style="font-size: 10.5px; color: var(--mep-fg-3);">
                      {inv.line_items.length} líneas
                    </div>
                  {/if}
                </div>
              </a>
            {/each}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>
