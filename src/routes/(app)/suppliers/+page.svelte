<script lang="ts">
  import type { PageData } from './$types';
  import { SUPPLIER_BADGE_CLS, SUPPLIER_BADGE_LABEL } from '$lib/constants';
  import { t } from '$lib/i18n';

  let { data }: { data: PageData } = $props();

  const badgeCls   = SUPPLIER_BADGE_CLS;
  const badgeLabel = SUPPLIER_BADGE_LABEL;
</script>

<div class="p-6">
  {#if !data.suppliers.length}
    <p class="body text-center py-16">{$t('sup.empty')}</p>
  {:else}
    <div class="grid grid-cols-3 gap-3 max-[900px]:grid-cols-2 max-[600px]:grid-cols-1">
      {#each data.suppliers as s (s.id)}
        <div class="card p-4 hover:border-acc transition-colors">
          <p class="label mb-1" style="color:{s.color};">{s.category}</p>
          <p class="body-strong mb-4" style="font-size:15px;">{s.name}</p>

          <div class="grid grid-cols-3 gap-2 mb-4">
            <div>
              <p class="body text-fg-3" style="font-size:11px;">{$t('sup.thisMonth')}</p>
              <p class="num text-fg font-semibold" style="font-size:13px;">{Math.round(s.month_spend)}</p>
            </div>
            <div>
              <p class="body text-fg-3" style="font-size:11px;">{$t('sup.openInv')}</p>
              <p class="num text-fg font-semibold" style="font-size:13px;">{s.open_count}</p>
            </div>
            <div>
              <p class="body text-fg-3" style="font-size:11px;">{$t('sup.lastInv')}</p>
              <p class="num text-fg font-semibold" style="font-size:13px;">{s.last_invoice_date ?? '—'}</p>
            </div>
          </div>

          <div class="flex items-center justify-between">
            <span class="{badgeCls[s.badge] ?? 'badge badge-pending'}">{badgeLabel[s.badge] ?? s.badge}</span>
            <form method="post" action="?/setCategory">
              <input type="hidden" name="supplier_id" value={s.id} />
              <select name="category" class="input" style="height:28px;font-size:12px;padding:0 6px;"
                onchange={(e) => (e.currentTarget as HTMLSelectElement).form?.submit()}>
                <option value="">{$t('sup.setCategory')}</option>
                {#each data.categories as cat}
                  <option value={cat} selected={s.category === cat}>{cat}</option>
                {/each}
              </select>
            </form>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
