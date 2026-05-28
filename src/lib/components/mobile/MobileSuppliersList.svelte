<script lang="ts">
  import { fmtEur } from '$lib/formatters';
  import { ChevronRight } from 'lucide-svelte';

  interface Supplier {
    id: number;
    name: string;
    color: string | null;
    category: string | null;
    month_spend: number | null;
    delta_pct: number | null;
    month_invoice_count: number | null;
  }

  let { suppliers }: { suppliers: Supplier[] } = $props();

  let search = $state('');

  const filtered = $derived(
    suppliers.filter(s => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return s.name.toLowerCase().includes(q) || (s.category ?? '').toLowerCase().includes(q);
    })
  );

  function initials(name: string) {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  function deltaColor(v: number) {
    return v > 0 ? 'var(--mep-neg)' : 'var(--mep-pos)';
  }
</script>

<div style="height: 100%; display: flex; flex-direction: column; overflow: hidden; padding-top: 2px;">
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
      placeholder="Buscar proveedor o categoría…"
      bind:value={search}
    />
  </div>

  <!-- List -->
  <div style="flex: 1; overflow: auto; padding: 0 18px 24px; display: flex; flex-direction: column; gap: 8px;">
    {#if filtered.length === 0}
      <div style="padding: 40px 0; text-align: center; color: var(--mep-fg-3); font-size: 13px;">
        Sin proveedores
      </div>
    {:else}
      {#each filtered as s}
        <a href="/suppliers/{s.id}" style="
          display: flex; align-items: center; gap: 12px;
          padding: 12px; border-radius: 10px;
          background: var(--mep-surface);
          text-decoration: none;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        ">
          <div style="
            width: 40px; height: 40px; border-radius: 20px; flex-shrink: 0;
            background: {s.color ?? 'var(--mep-acc)'}24; color: {s.color ?? 'var(--mep-acc)'};
            display: flex; align-items: center; justify-content: center;
            font-size: 12px; font-weight: 600;
          ">
            {initials(s.name)}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 13.5px; font-weight: 500; color: var(--mep-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              {s.name}
            </div>
            <div style="font-size: 11px; color: var(--mep-fg-3); margin-top: 2px;">
              {s.category && s.category !== 'Other' ? s.category : 'Sin categoría'}{s.month_invoice_count ? ` · ${s.month_invoice_count} facturas` : ''}
            </div>
          </div>
          <div style="text-align: right; flex-shrink: 0;">
            <div class="num" style="font-size: 13px; font-weight: 500; color: var(--mep-fg);">
              {s.month_spend != null ? fmtEur(s.month_spend) : '—'}
            </div>
            {#if s.delta_pct != null && Math.abs(s.delta_pct) >= 0.1}
              <div class="num" style="font-size: 11px; color: {deltaColor(s.delta_pct)};">
                {s.delta_pct > 0 ? '↑' : '↓'}{Math.abs(s.delta_pct).toFixed(1).replace('.', ',')}%
              </div>
            {/if}
          </div>
          <ChevronRight size={14} style="color: var(--mep-fg-3); flex-shrink: 0;" />
        </a>
      {/each}
    {/if}
  </div>
</div>
