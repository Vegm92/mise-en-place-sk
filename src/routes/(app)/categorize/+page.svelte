<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';
  import { locale, t, tcat } from '$lib/i18n';
  import { fmtEur } from '$lib/formatters';

  let { data }: { data: PageData } = $props();
</script>

<div class="p-4 md:p-6" style="display:flex;flex-direction:column;gap:12px;">
  <h1 class="h2">{t('cat.lines.title')}</h1>
  <p class="body">{t('cat.lines.intro')}</p>

  {#if data.lines.length === 0}
    <div class="card p-4">{t('cat.lines.empty')}</div>
  {:else}
    <div class="card" style="padding:0;">
      {#each data.lines as line (line.id)}
        <form method="POST" action="?/set" use:enhance style="display:flex;align-items:center;gap:12px;padding:10px 14px;flex-wrap:wrap;">
          <input type="hidden" name="lineId" value={line.id} />
          <div style="flex:1;min-width:180px;">
            <div style="font-weight:600;">{line.description}</div>
            <div class="label">{line.supplier ?? '—'} · {line.invoiceNumber ?? '—'}</div>
          </div>
          <div style="min-width:80px;text-align:right;">{fmtEur(line.amount, locale.current)}</div>
          <select name="category" aria-label={t('cat.lines.pick')} onchange={(e) => e.currentTarget.form?.requestSubmit()}>
            <option value="" selected disabled>{t('cat.lines.pick')}</option>
            {#each data.categories as category}
              <option value={category}>{tcat(category)}</option>
            {/each}
          </select>
        </form>
      {/each}
    </div>
  {/if}
</div>
