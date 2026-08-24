<script lang="ts">
  import StatusBadge from '$lib/components/mep/StatusBadge.svelte';
  import { fmtEur } from '$lib/formatters';
  import { locale, t } from '$lib/i18n';

  interface Invoice {
    id: number;
    invoice_number: string | null;
    supplier_name: string | null;
    total_amount: number | null;
    display_amount?: number | null;
    status: string | null;
    invoice_date: string | null;
    line_items?: unknown[];
  }

  let {
    invoices,
    q,
    onSearch,
  }: {
    invoices: Invoice[];
    q: string;
    onSearch: (value: string) => void;
    } = $props();

  let activeFilter = $state('month');

  const filters = [
    { id: 'month', labelKey: 'minv.filter.month' },
    { id: 'pending', labelKey: 'minv.filter.pending' },
    { id: 'overdue', labelKey: 'minv.filter.overdue' },
    { id: 'supplier', labelKey: 'minv.filter.supplier' },
    { id: 'category', labelKey: 'minv.filter.category' },
  ];

  const filtered = $derived.by(() => {
    let list = invoices;
    if (activeFilter === 'pending') {
      list = list.filter(inv => inv.status === 'pending');
    } else if (activeFilter === 'overdue') {
      list = list.filter(inv => inv.status === 'overdue');
    }
    return list;
  });

  const grouped = $derived.by(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups: Map<string, Invoice[]> = new Map();
    for (const inv of filtered) {
      const d = inv.invoice_date ? new Date(inv.invoice_date) : null;
      let label = $t('misc.noDate');
      if (d) {
        d.setHours(0, 0, 0, 0);
        if (d.getTime() === today.getTime()) {
          label = `${$t('misc.today')} · ${today.toLocaleDateString($locale, { day: 'numeric', month: 'long' })}`;
        } else if (d.getTime() === yesterday.getTime()) {
          label = `${$t('misc.yesterday')} · ${yesterday.toLocaleDateString($locale, { day: 'numeric', month: 'long' })}`;
        } else {
          label = d.toLocaleDateString($locale, { day: 'numeric', month: 'long' });
        }
      }
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(inv);
    }
    return [...groups.entries()];
  });
</script>

<div style="height: 100%; display: flex; flex-direction: column; overflow: hidden; padding-top: 2px;">
  <div style="padding: 0 18px 10px; position: relative;">
    <span style="position: absolute; left: 30px; top: 50%; transform: translateY(-50%); color: var(--mep-fg-3); pointer-events: none;">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
      </svg>
    </span>
    <input
      class="input"
      style="width: 100%; height: 40px; padding-left: 36px; box-sizing: border-box;"
      type="search"
      placeholder={$t('inv.searchPlaceholder')}
      value={q}
      oninput={(e) => onSearch((e.target as HTMLInputElement).value)}
    />
  </div>

  <div style="display: flex; gap: 6px; padding: 0 18px 12px; overflow-x: auto; flex-shrink: 0;">
    {#each filters as f}
      <button
        class="chip {activeFilter === f.id ? 'active' : ''}"
        onclick={() => activeFilter = f.id}
      >{$t(f.labelKey)}</button>
    {/each}
  </div>

  <div style="flex: 1; overflow: auto; padding-bottom: 24px;">
    {#if grouped.length === 0}
      <div style="padding: 40px 18px; text-align: center; color: var(--mep-fg-3); font-size: 13px;">
        {$t('misc.invoice.zero')}
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
                    <StatusBadge status={inv.status ?? 'pending'} style="font-size: 11px; padding: 1px 5px;" />
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
                    <div class="num" style="font-size: 11px; color: var(--mep-fg-3);">
                      {inv.line_items.length} {$t('minv.linesSuffix')}
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
