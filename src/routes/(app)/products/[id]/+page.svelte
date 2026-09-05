<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { untrack } from 'svelte';
  import { t, tcat, locale, ti } from '$lib/i18n';
  import { fmt, formatYoyPct } from '$lib/formatters';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import ConfirmDialog from '$lib/components/mep/ConfirmDialog.svelte';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import Trash2 from '@lucide/svelte/icons/trash-2';

  const { data, form }: { data: PageData; form: ActionData } = $props();
  const { product, linkedSuppliers, aliases, priceHistory, priceByYear, categories, supplierPrices } = $derived(data);

  type BlockedSupplier = { supplierId: number; supplierName: string };
  const blockedSuppliers = $derived(
    (form && 'suppliers' in form ? form.suppliers : []) as BlockedSupplier[]
  );

  let pickedAllergens = $state(untrack(() => new Set<string>(product.allergens ?? [])));
  function toggleAllergen(code: string) {
    const next = new Set(pickedAllergens);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    pickedAllergens = next;
  }

  let confirmUnlinkOpen = $state(false);
  let unlinkSupplierId = $state<number | null>(null);
  let unlinkSupplierName = $state('');
  function requestUnlink(id: number, name: string) {
    unlinkSupplierId = id;
    unlinkSupplierName = name;
    confirmUnlinkOpen = true;
  }
  function executeUnlink() {
    if (unlinkSupplierId == null) return;
    (document.getElementById(`unlink-form-${unlinkSupplierId}`) as HTMLFormElement).submit();
    unlinkSupplierId = null;
  }

  let confirmDeleteOpen = $state(false);
  const canDelete = $derived(linkedSuppliers.length === 0 && blockedSuppliers.length === 0);
  function executeDelete() {
    (document.getElementById('delete-product-form') as HTMLFormElement).submit();
  }
</script>

<div class="flex flex-col gap-4 p-6">

  <a href="/products" class="btn btn-ghost self-start" style="height:28px;font-size:12px;gap:5px;text-decoration:none;">
    <ChevronLeft size={13} />
    {t('prod.detail.back')}
  </a>

  <SectionCard title={product.canonicalName} sub={t('prod.detail.editTitle')}>
    <form method="post" action="?/update" class="flex flex-col gap-3">
      <div class="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
        <div class="flex flex-col gap-1">
          <label class="label text-fg-3" for="p-name">{t('prod.new.name')}</label>
          <input id="p-name" name="canonicalName" required value={product.canonicalName}
            class="input" style="padding:0 8px;" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="label text-fg-3" for="p-cat">{t('prod.new.category')}</label>
          <select id="p-cat" name="category" class="input" style="padding:0 8px;">
            <option value="">—</option>
            {#each categories as c}<option value={c} selected={product.category === c}>{tcat(c)}</option>{/each}
          </select>
        </div>
        <div class="flex flex-col gap-1">
          <label class="label text-fg-3" for="p-unit">{t('prod.new.unit')}</label>
          <input id="p-unit" name="canonicalUnit" value={product.canonicalUnit ?? ''}
            class="input" style="padding:0 8px;" placeholder="kg" />
        </div>
        <div></div>
        <div class="flex flex-col gap-1">
          <label class="label text-fg-3" for="p-pack">{t('prod.detail.unitsPerPack')}</label>
          <input id="p-pack" name="unitsPerPack" type="number" step="any" min="0"
            value={product.unitsPerPack ?? ''}
            class="input" style="padding:0 8px;" placeholder="10" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="label text-fg-3" for="p-base">{t('prod.detail.baseUnit')}</label>
          <input id="p-base" name="baseUnit" value={product.baseUnit ?? ''}
            class="input" style="padding:0 8px;" placeholder="kg" />
        </div>
      </div>
      {#if form?.error}
        <p class="body text-neg" style="font-size:12px;">{form.error}</p>
      {/if}
      <button type="submit" class="btn btn-primary self-start" style="font-size:12.5px;">
        {t('prod.detail.save')}
      </button>
    </form>
  </SectionCard>

  <SectionCard title={t('prod.facts.title')} sub={t('prod.facts.sub')}>
    <form method="post" action="?/saveFacts" class="flex flex-col gap-3">
      <div class="flex flex-wrap gap-1">
        {#each data.allergens as code (code)}
          <label class="chip" style={pickedAllergens.has(code) ? 'border-color:var(--mep-acc);color:var(--mep-acc);' : ''}>
            <input type="checkbox" name="allergens" value={code} checked={pickedAllergens.has(code)}
              onchange={() => toggleAllergen(code)} style="margin-right:5px;" />
            {t(`rec.allergen.${code}`)}
          </label>
        {/each}
      </div>
      {#if product.allergensSource}
        <span class="body text-fg-3" style="font-size:11px;">{t(`prod.facts.source.${product.allergensSource}`)}</span>
      {/if}
      <div class="flex flex-wrap gap-2 items-end">
        <span class="label text-fg-3" style="width:100%;">{t('rec.nut.per100')}</span>
        <label class="flex flex-col gap-1">
          <span class="label text-fg-3">{t('rec.nut.kcal')}</span>
          <input class="input" style="padding:0 8px;max-width:110px;" name="kcal100" inputmode="decimal" value={product.kcal100 ?? ''} />
        </label>
        <label class="flex flex-col gap-1">
          <span class="label text-fg-3">{t('rec.nut.protein')}</span>
          <input class="input" style="padding:0 8px;max-width:110px;" name="protein100" inputmode="decimal" value={product.protein100 ?? ''} />
        </label>
        <label class="flex flex-col gap-1">
          <span class="label text-fg-3">{t('rec.nut.carbs')}</span>
          <input class="input" style="padding:0 8px;max-width:110px;" name="carbs100" inputmode="decimal" value={product.carbs100 ?? ''} />
        </label>
        <label class="flex flex-col gap-1">
          <span class="label text-fg-3">{t('rec.nut.fat')}</span>
          <input class="input" style="padding:0 8px;max-width:110px;" name="fat100" inputmode="decimal" value={product.fat100 ?? ''} />
        </label>
      </div>
      <button type="submit" class="btn btn-primary" style="font-size:13px;align-self:flex-start;">{t('prod.facts.save')}</button>
    </form>
  </SectionCard>

  <SectionCard title={t('prod.detail.linkedSuppliers')} noPad>
    {#if linkedSuppliers.length === 0 && blockedSuppliers.length === 0}
      <p class="body text-center py-10">{t('prod.detail.noSuppliers')}</p>
    {:else}
      <div class="flex flex-col gap-2 p-4">
        {#each (blockedSuppliers.length > 0 ? blockedSuppliers : linkedSuppliers) as s (s.supplierId)}
          <div class="flex items-center justify-between border border-divider rounded-lg px-3 py-2">
            <span class="body" style="font-size:13px;">{s.supplierName}</span>
            <form id="unlink-form-{s.supplierId}" method="post" action="?/unlinkSupplier">
              <input type="hidden" name="supplierId" value={s.supplierId} />
              <button type="button" class="btn btn-ghost text-neg" style="height:26px;font-size:12px;"
                onclick={() => requestUnlink(s.supplierId, s.supplierName)}>
                {t('prod.detail.unlink')}
              </button>
            </form>
          </div>
        {/each}
      </div>
    {/if}
  </SectionCard>

  <SectionCard title={t('prod.detail.aliases')} noPad>
    {#if aliases.length === 0}
      <p class="body text-center py-10">{t('prod.detail.noAliases')}</p>
    {:else}
      <table class="tbl">
        <thead>
          <tr>
            <th>{t('prod.detail.aliasText')}</th>
            <th>{t('prod.col.suppliers')}</th>
            <th>{t('prod.detail.aliasSku')}</th>
            <th>{t('prod.detail.aliasSource')}</th>
          </tr>
        </thead>
        <tbody>
          {#each aliases as a (a.id)}
            <tr class="row">
              <td>{a.rawText ?? '—'}</td>
              <td class="body text-fg-3" style="font-size:12px;">{a.supplierName ?? '—'}</td>
              <td class="body text-fg-3" style="font-size:12px;">{a.supplierSku ?? '—'}</td>
              <td class="body text-fg-3" style="font-size:12px;">{a.source}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </SectionCard>

  <SectionCard title={t('prod.yoy.title')} noPad>
    {#if priceByYear.length === 0}
      <p class="body text-center py-10">{t('prod.yoy.empty')}</p>
    {:else}
      <table class="tbl">
        <thead>
          <tr>
            <th>{t('prod.yoy.year')}</th>
            <th class="num">{t('prod.yoy.price')}</th>
            <th class="num">{t('prod.yoy.prevPrice')}</th>
            <th class="num">{t('prod.yoy.change')}</th>
          </tr>
        </thead>
        <tbody>
          {#each priceByYear as row (row.year)}
            <tr class="row">
              <td>{row.year}</td>
              <td class="num">{row.price != null ? fmt(row.price) : '—'}</td>
              <td class="num">{row.prevPrice != null ? fmt(row.prevPrice) : '—'}</td>
              <td class="num" class:text-neg={row.changePct != null && row.changePct > 0}
                class:text-pos={row.changePct != null && row.changePct < 0}>
                {formatYoyPct(row.changePct, locale.current)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </SectionCard>

  <SectionCard title={t('prod.detail.supplierPrices')} noPad>
    {#if supplierPrices.length < 2}
      <p class="body text-center py-6">{t('prod.detail.noSupplierPrices')}</p>
    {:else}
      <table class="tbl">
        <thead>
          <tr>
            <th>{t('prod.col.suppliers')}</th>
            <th class="num">{t('tbl.unitPrice')}</th>
            <th>{t('tbl.unit')}</th>
            <th>{t('inv.filter.from')}</th>
            <th class="num"></th>
          </tr>
        </thead>
        <tbody>
          {#each supplierPrices as row, i (row.supplierId ?? row.supplierName)}
            <tr class="row">
              <td class:text-pos={i === 0}>{row.supplierName || '—'}</td>
              <td class="num">{fmt(row.price)}</td>
              <td class="body text-fg-3 text-[12px]">{row.basis.startsWith('unit:') ? row.basis.slice(5) || '—' : `/${row.basis}`}</td>
              <td class="body text-fg-3 text-[12px]">{row.asOf}</td>
              <td class="num" class:text-pos={i === 0} class:text-neg={i > 0}>
                {i === 0 ? t('prod.detail.cheapest') : ti('prod.detail.vsCheapest', { pct: row.vsCheapestPct.toFixed(1).replace('.', ',') })}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </SectionCard>

  <SectionCard title={t('prod.detail.priceHistory')} noPad>
    {#if priceHistory.length === 0}
      <p class="body text-center py-10">{t('prod.detail.noPriceHistory')}</p>
    {:else}
      <table class="tbl">
        <thead>
          <tr>
            <th>{t('inv.filter.from')}</th>
            <th>{t('prod.col.suppliers')}</th>
            <th class="num">{t('tbl.qty')}</th>
            <th>{t('tbl.unit')}</th>
            <th class="num">{t('tbl.unitPrice')}</th>
            <th class="num">{t('prod.detail.normalizedPrice')}</th>
          </tr>
        </thead>
        <tbody>
          {#each priceHistory as row, i (i)}
            <tr class="row">
              <td>{row.invoiceDate ?? '—'}</td>
              <td class="body text-fg-3" style="font-size:12px;">{row.supplierName ?? '—'}</td>
              <td class="num">{row.quantity ?? '—'}</td>
              <td>{row.unit ?? '—'}</td>
              <td class="num">{row.unitPrice != null ? fmt(row.unitPrice) : '—'}</td>
              <td class="num">{row.normalizedUnitPrice != null ? fmt(row.normalizedUnitPrice) : '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </SectionCard>

  <SectionCard title={t('prod.detail.dangerZone')}>
    <form id="delete-product-form" method="post" action="?/delete">
      <button type="button" class="btn btn-ghost text-neg" style="font-size:12.5px;gap:5px;"
        disabled={!canDelete}
        title={canDelete ? '' : t('prod.detail.deleteBlockedHint')}
        onclick={() => (confirmDeleteOpen = true)}>
        <Trash2 size={13} />
        {t('prod.detail.delete')}
      </button>
      {#if !canDelete}
        <p class="body text-fg-3" style="font-size:12px;margin-top:6px;">{t('prod.detail.deleteBlockedHint')}</p>
      {/if}
    </form>
  </SectionCard>

</div>

<ConfirmDialog
  bind:open={confirmUnlinkOpen}
  message={t('prod.detail.unlinkConfirm').replace('{supplier}', unlinkSupplierName)}
  danger={true}
  onconfirm={executeUnlink}
  oncancel={() => { unlinkSupplierId = null; }}
/>

<ConfirmDialog
  bind:open={confirmDeleteOpen}
  message={t('prod.detail.deleteConfirm')}
  danger={true}
  onconfirm={executeDelete}
/>
