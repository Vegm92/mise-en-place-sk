<script lang="ts">
  import { untrack } from 'svelte';
  import { t, ti } from '$lib/i18n';
  import { fmtEur } from '$lib/formatters';
  import { EU_ALLERGENS, RECIPE_LINE_KINDS, fromRate, netFromGross, wasteFactor } from '$lib/recipes';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Check from '@lucide/svelte/icons/check';
  import Plus from '@lucide/svelte/icons/plus';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';

  type Line = {
    id: number; kind: string; name: string; productId: number | null; childRecipeId: number | null;
    netQuantity: number; unit: string | null; unitCost: string | null; wastePct: number;
    allergens: string[]; kcal100: string | null; protein100: string | null;
    carbs100: string | null; fat100: string | null; note: string | null;
  };

  type Cost = {
    grossQty: number; costCents: number; sharePct: number; unitRateUnits: number | null;
    priceSource: string; priceAsOf: string | null; supplierName: string | null; warnings: string[];
  };

  let {
    line = null,
    cost = null,
    units,
    catalog,
    linkableRecipes,
  }: {
    line?: Line | null;
    cost?: Cost | null;
    units: readonly string[];
    catalog: { id: number; name: string; baseUnit: string | null }[];
    linkableRecipes: { id: number; name: string; yieldQty: number | null; yieldUnit: string | null }[];
  } = $props();

  const isNew = $derived(line === null);

  let kind          = $state(untrack(() => line?.kind ?? 'free'));
  let name          = $state(untrack(() => line?.name ?? ''));
  let productId     = $state(untrack(() => line?.productId ?? 0));
  let childRecipeId = $state(untrack(() => line?.childRecipeId ?? 0));
  let net           = $state(untrack(() => line?.netQuantity ?? 0));
  let waste         = $state(untrack(() => line?.wastePct ?? 0));
  let unit          = $state(untrack(() => line?.unit ?? 'kg'));
  let unitCost      = $state(untrack(() => line?.unitCost ?? ''));
  let note          = $state(untrack(() => line?.note ?? ''));
  let kcal100       = $state(untrack(() => line?.kcal100 ?? ''));
  let protein100    = $state(untrack(() => line?.protein100 ?? ''));
  let carbs100      = $state(untrack(() => line?.carbs100 ?? ''));
  let fat100        = $state(untrack(() => line?.fat100 ?? ''));
  let picked        = $state(untrack(() => new Set<string>(line?.allergens ?? [])));
  let open          = $state(false);

  const round4 = (n: number) => Number(n.toFixed(4));
  const factor = $derived(wasteFactor(waste));
  const gross = $derived(round4(net / factor));

  function setGross(value: number) {
    net = round4(netFromGross(value, waste));
  }

  function toggleAllergen(code: string) {
    const next = new Set(picked);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    picked = next;
  }

  const resolvedRate = $derived(
    cost?.unitRateUnits === null || cost?.unitRateUnits === undefined
      ? null
      : fromRate(cost.unitRateUnits)
  );

  const WARN_KEY: Record<string, string> = {
    'missing-price': 'rec.warn.line.missingPrice',
    'unit-mismatch': 'rec.warn.line.unitMismatch',
    cycle: 'rec.warn.line.cycle',
    'missing-child': 'rec.warn.line.missingChild',
    'child-no-yield': 'rec.warn.line.childNoYield',
  };
  const shownWarnings = $derived((cost?.warnings ?? []).filter((w) => w in WARN_KEY));
</script>

<tr class="row">
  <td class="tbl-stack-lead rl-cell">
    <form method="post" action={isNew ? '?/addItem' : '?/updateItem'} id={isNew ? 'rec-add' : `rec-line-${line!.id}`}>
      {#if !isNew}<input type="hidden" name="itemId" value={line!.id} />{/if}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="netQuantity" value={net} />
      <input type="hidden" name="wastePct" value={waste} />
      <input type="hidden" name="unit" value={unit} />
      {#if kind === 'product'}<input type="hidden" name="productId" value={productId} />{/if}
      {#if kind === 'recipe'}<input type="hidden" name="childRecipeId" value={childRecipeId} />{/if}
      {#each [...picked] as code}<input type="hidden" name="allergens" value={code} />{/each}
      <input type="hidden" name="kcal100" value={kcal100} />
      <input type="hidden" name="protein100" value={protein100} />
      <input type="hidden" name="carbs100" value={carbs100} />
      <input type="hidden" name="fat100" value={fat100} />
      <input type="hidden" name="note" value={note} />
      <input type="hidden" name="unitCost" value={unitCost} />
    </form>

    <div class="flex flex-col gap-1">
      <div class="rl-seg" role="group" aria-label={t('rec.line.kind')}>
        {#each RECIPE_LINE_KINDS as k}
          <button type="button" class="rl-seg-btn" class:rl-seg-on={kind === k} aria-pressed={kind === k}
            onclick={() => { kind = k; if (k !== 'product') productId = 0; if (k !== 'recipe') childRecipeId = 0; }}>
            {t(`rec.line.kind.${k}`)}
          </button>
        {/each}
      </div>

      {#if kind === 'product'}
        <select class="input" style="padding:0 8px;min-width:170px;" bind:value={productId}
          aria-label={t('rec.line.product')}
          onchange={() => { const p = catalog.find((c) => c.id === productId); if (p) { name = p.name; if (p.baseUnit && units.includes(p.baseUnit)) unit = p.baseUnit; } }}>
          <option value={0}>—</option>
          {#each catalog as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
        </select>
      {:else if kind === 'recipe'}
        <select class="input" style="padding:0 8px;min-width:170px;" bind:value={childRecipeId}
          aria-label={t('rec.line.child')}
          onchange={() => { const r = linkableRecipes.find((c) => c.id === childRecipeId); if (r) { name = r.name; if (r.yieldUnit && units.includes(r.yieldUnit)) unit = r.yieldUnit; } }}>
          <option value={0}>—</option>
          {#each linkableRecipes as r (r.id)}
            <option value={r.id}>{r.name}{r.yieldQty ? ` (${r.yieldQty} ${r.yieldUnit ?? ''})` : ''}</option>
          {/each}
        </select>
      {/if}

      <input class="input" style="padding:0 8px;min-width:170px;" bind:value={name} form={isNew ? 'rec-add' : `rec-line-${line!.id}`}
        name="name" required placeholder={t('rec.line.name')} aria-label={t('rec.line.name')} />

      {#if cost || picked.size > 0}
        <span class="flex items-center gap-1 flex-wrap">
          {#if cost}
            <span class="body text-fg-3" style="font-size:11px;">
              {[t(`rec.src.${cost.priceSource}`), cost.priceAsOf, cost.supplierName].filter(Boolean).join(' · ')}
            </span>
          {/if}
          {#if picked.size > 0}
            <span class="badge badge-pending" title={[...picked].map((c) => t(`rec.allergen.${c}`)).join(', ')}>
              {ti('rec.line.allergenCount', { n: picked.size })}
            </span>
          {/if}
        </span>
      {/if}

      {#each shownWarnings as w}
        <span class="body text-warn flex items-center gap-1" style="font-size:11px;">
          <AlertTriangle size={11} />{t(WARN_KEY[w] ?? '')}
        </span>
      {/each}
    </div>
  </td>

  <td class="num rl-cell" data-label={t('rec.line.gross')}>
    <input class="input" type="number" step="0.0001" min="0" style="padding:0 6px;max-width:76px;text-align:right;"
      value={gross} aria-label={t('rec.line.gross')}
      oninput={(e) => setGross(Number((e.currentTarget as HTMLInputElement).value))} />
  </td>

  <td class="num rl-cell" data-label={t('rec.line.waste')}>
    <input class="input" type="number" step="0.01" min="0" max="99.99" style="padding:0 6px;max-width:62px;text-align:right;"
      bind:value={waste} aria-label={t('rec.line.waste')} />
  </td>

  <td class="num rl-cell" data-label={t('rec.line.net')}>
    <input class="input" type="number" step="0.0001" min="0" style="padding:0 6px;max-width:76px;text-align:right;"
      bind:value={net} aria-label={t('rec.line.net')} />
  </td>

  <td class="rl-cell" data-label={t('rec.line.unit')}>
    <select class="input" style="padding:0 6px;max-width:66px;" bind:value={unit} aria-label={t('rec.line.unit')}>
      {#each units as u}<option value={u}>{u}</option>{/each}
    </select>
  </td>

  <td class="num rl-cell" data-label={t('rec.line.unitCost')}>
    <input class="input" type="text" inputmode="decimal" style="padding:0 6px;max-width:80px;text-align:right;"
      bind:value={unitCost} aria-label={t('rec.line.unitCost')}
      placeholder={kind === 'free' ? '' : (resolvedRate ?? '')} />
  </td>

  <td class="num rl-cell" data-label={t('rec.line.amount')}>
    {cost ? fmtEur(cost.costCents / 100) : '—'}
  </td>

  <td class="rl-cell">
    <div class="flex items-center gap-1">
      <button type="button" class="btn btn-ghost" style="padding:0 6px;" onclick={() => (open = !open)}
        aria-expanded={open} aria-label={t('rec.line.macros')} title={t('rec.line.macros')}>
        <ChevronDown size={13} />
      </button>
      <button type="submit" class="btn btn-primary" style="padding:0 8px;" form={isNew ? 'rec-add' : `rec-line-${line!.id}`}
        title={isNew ? t('rec.line.add') : t('rec.line.save')} aria-label={isNew ? t('rec.line.add') : t('rec.line.save')}>
        {#if isNew}<Plus size={13} />{:else}<Check size={13} />{/if}
      </button>
      {#if !isNew}
        <button type="submit" class="btn btn-ghost" style="padding:0 6px;" form="rec-del-{line!.id}"
          title={t('rec.line.delete')} aria-label={t('rec.line.delete')}>
          <Trash2 size={13} />
        </button>
      {/if}
    </div>
    {#if !isNew}
      <form method="post" action="?/deleteItem" id="rec-del-{line!.id}">
        <input type="hidden" name="itemId" value={line!.id} />
      </form>
    {/if}
  </td>
</tr>

{#if open}
  <tr>
    <td colspan="8">
      <div class="flex flex-col gap-3 p-3" style="background:var(--mep-surface-2);">
        <div class="flex flex-col gap-2">
          <span class="label text-fg-3">{t('rec.sec.allergens')}</span>
          <div class="flex flex-wrap gap-1">
            {#each EU_ALLERGENS as code}
              <button type="button" class="rl-seg-btn rl-allergen" class:rl-seg-on={picked.has(code)}
                aria-pressed={picked.has(code)} onclick={() => toggleAllergen(code)}>
                {t(`rec.allergen.${code}`)}
              </button>
            {/each}
          </div>
        </div>
        <div class="flex flex-wrap gap-2 items-end">
          <span class="label text-fg-3" style="width:100%;">{t('rec.nut.per100')}</span>
          <label class="flex flex-col gap-1">
            <span class="label text-fg-3">{t('rec.nut.kcal')}</span>
            <input class="input" style="padding:0 6px;max-width:92px;" inputmode="decimal" bind:value={kcal100} />
          </label>
          <label class="flex flex-col gap-1">
            <span class="label text-fg-3">{t('rec.nut.protein')}</span>
            <input class="input" style="padding:0 6px;max-width:92px;" inputmode="decimal" bind:value={protein100} />
          </label>
          <label class="flex flex-col gap-1">
            <span class="label text-fg-3">{t('rec.nut.carbs')}</span>
            <input class="input" style="padding:0 6px;max-width:92px;" inputmode="decimal" bind:value={carbs100} />
          </label>
          <label class="flex flex-col gap-1">
            <span class="label text-fg-3">{t('rec.nut.fat')}</span>
            <input class="input" style="padding:0 6px;max-width:92px;" inputmode="decimal" bind:value={fat100} />
          </label>
          <label class="flex flex-col gap-1" style="flex:1;min-width:170px;">
            <span class="label text-fg-3">{t('rec.line.note')}</span>
            <input class="input" style="padding:0 6px;" bind:value={note} />
          </label>
        </div>
      </div>
    </td>
  </tr>
{/if}

<style>
  .rl-cell { padding-left: 8px; padding-right: 8px; }
  .rl-seg {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    background: var(--mep-hover);
    border-radius: var(--mep-r-input);
    align-self: flex-start;
  }
  .rl-seg-btn {
    font-family: inherit;
    font-size: 11px;
    font-weight: 500;
    height: 22px;
    padding: 0 8px;
    border: 0;
    border-radius: var(--mep-r-tag);
    background: transparent;
    color: var(--mep-fg-3);
    cursor: pointer;
    white-space: nowrap;
  }
  .rl-seg-btn:hover { color: var(--mep-fg); }
  .rl-seg-on {
    background: var(--mep-surface);
    color: var(--mep-acc);
    box-shadow: var(--mep-shadow-card);
  }
  .rl-allergen {
    border: 1px solid var(--mep-border);
    background: var(--mep-surface);
  }
  .rl-allergen.rl-seg-on {
    border-color: var(--mep-acc);
    background: var(--mep-acc-soft);
  }
</style>
