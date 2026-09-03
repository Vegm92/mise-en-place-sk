<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { untrack } from 'svelte';
  import { t, ti } from '$lib/i18n';
  import { fmtEur } from '$lib/formatters';
  import { DEFAULT_TARGET_FOOD_COST_PCT, DEFAULT_VAT_PCT, recipeTotals } from '$lib/recipes';
  import ScrollStrip from '$lib/components/mep/ScrollStrip.svelte';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import KpiCard from '$lib/components/mep/KpiCard.svelte';
  import FoodCostGauge from '$lib/components/mep/FoodCostGauge.svelte';
  import InfoTooltip from '$lib/components/mep/InfoTooltip.svelte';
  import Slider from '$lib/components/mep/Slider.svelte';
  import ConfirmDialog from '$lib/components/mep/ConfirmDialog.svelte';
  import RecipeLineRow from '$lib/components/mep/RecipeLineRow.svelte';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Copy from '@lucide/svelte/icons/copy';
  import FileText from '@lucide/svelte/icons/file-text';
  import ChefHat from '@lucide/svelte/icons/chef-hat';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';

  const { data, form }: { data: PageData; form: ActionData } = $props();
  const { recipe, items, cost, catalog, linkableRecipes, usedIn, allergens, sections, statuses, units } = $derived(data);

  let confirmDelete = $state(false);
  let portions = $state(untrack(() => recipe.portions));
  let sellingPrice = $state(untrack(() => recipe.sellingPrice ?? ''));
  let vatPct = $state(untrack(() => recipe.vatPct ?? DEFAULT_VAT_PCT));
  let targetPct = $state(untrack(() => Number(recipe.targetFoodCostPct ?? DEFAULT_TARGET_FOOD_COST_PCT)));
  let kind = $state(untrack(() => recipe.kind));

  const costByItem = $derived(new Map((cost?.lines ?? []).map((l) => [l.itemId, l])));

  const live = $derived(recipeTotals({
    totalCostCents: cost?.totalCostCents ?? 0,
    portions: Number(portions) || 1,
    sellingPrice: String(sellingPrice),
    vatPct: String(vatPct),
    targetFoodCostPct: targetPct,
  }));

  const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)} %`);
  const eur = (c: number | null) => (c === null ? '—' : fmtEur(c / 100));

  const railBadge = $derived.by(() => {
    if (live.foodCostPct === null) return null;
    if (live.foodCostPct > targetPct + 5) return { cls: 'badge badge-overdue', key: 'rec.rail.over' };
    if (live.foodCostPct > targetPct) return { cls: 'badge badge-pending', key: 'rec.rail.near' };
    return { cls: 'badge badge-confirmed', key: 'rec.rail.onTarget' };
  });

  const preparationSteps = $derived(
    (recipe.preparation ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
  );
</script>

<svelte:head><title>{recipe.name}</title></svelte:head>

<div class="flex flex-col gap-4">
  <div class="flex items-center justify-between gap-3 flex-wrap">
    <div class="flex flex-col gap-1">
      <a href="/recipes" class="btn btn-ghost flex items-center gap-1" style="font-size:11px;align-self:flex-start;">
        <ArrowLeft size={13} />{t('rec.back')}
      </a>
      <h1 class="title">{data.heading}</h1>
    </div>
    <div class="flex items-center gap-2 flex-wrap">
      <a href="/recipes/{recipe.id}/cocina" class="btn btn-secondary flex items-center gap-1" style="font-size:11px;">
        <ChefHat size={13} />{t('rec.cocina.open')}
      </a>
      <a href="/recipes/{recipe.id}/sheet" class="btn btn-secondary flex items-center gap-1" style="font-size:11px;">
        <FileText size={13} />{t('rec.sheet.open')}
      </a>
      <form method="post" action="?/duplicate">
        <button type="submit" class="btn btn-ghost flex items-center gap-1" style="font-size:11px;">
          <Copy size={13} />{t('rec.f.duplicate')}
        </button>
      </form>
      <button type="button" class="btn btn-ghost flex items-center gap-1" style="font-size:11px;"
        onclick={() => (confirmDelete = true)}>
        <Trash2 size={13} />{t('rec.f.delete')}
      </button>
    </div>
  </div>

  {#if form?.error}
    <p class="body text-neg flex items-center gap-1" style="font-size:11px;">
      <AlertTriangle size={12} />{t(form.error)}
    </p>
  {:else if form?.ok}
    <p class="body text-pos" style="font-size:11px;">{t(form.ok)}</p>
  {/if}

  <div class="rec-grid">
    <div class="rec-head">
      <SectionCard title={t('rec.sec.header')}>
        <form method="post" action="?/updateRecipe" class="flex flex-wrap gap-3 items-end">
          <label class="flex flex-col gap-1" style="flex:2;min-width:200px;">
            <span class="label text-fg-3">{t('rec.f.name')}</span>
            <input class="input" style="padding:0 8px;" name="name" value={recipe.name} required />
          </label>
          <label class="flex flex-col gap-1" style="min-width:130px;">
            <span class="label text-fg-3">{t('rec.f.kind')}</span>
            <select class="input" style="padding:0 8px;" name="kind" bind:value={kind}>
              <option value="plato">{t('rec.kind.plato')}</option>
              <option value="elaboracion">{t('rec.kind.elaboracion')}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1" style="min-width:130px;">
            <span class="label text-fg-3">{t('rec.f.section')}</span>
            <select class="input" style="padding:0 8px;" name="section" value={recipe.section ?? ''}>
              <option value="">—</option>
              {#each sections as s}<option value={s}>{t(`rec.section.${s}`)}</option>{/each}
            </select>
          </label>
          <label class="flex flex-col gap-1" style="min-width:125px;">
            <span class="label text-fg-3">{t('rec.f.status')}</span>
            <select class="input" style="padding:0 8px;" name="status" value={recipe.status}>
              {#each statuses as s}<option value={s}>{t(`rec.status.${s}`)}</option>{/each}
            </select>
          </label>
          <label class="flex flex-col gap-1" style="min-width:96px;">
            <span class="label text-fg-3">{t('rec.f.portions')}</span>
            <input class="input" style="padding:0 8px;" name="portions" inputmode="decimal" bind:value={portions} />
          </label>

          {#if kind === 'elaboracion'}
            <label class="flex flex-col gap-1" style="min-width:96px;">
              <span class="label text-fg-3">{t('rec.f.yield')}</span>
              <input class="input" style="padding:0 8px;" name="yieldQty" inputmode="decimal"
                value={recipe.yieldQty ?? ''} />
            </label>
            <label class="flex flex-col gap-1" style="min-width:84px;">
              <span class="label text-fg-3">{t('rec.line.unit')}</span>
              <select class="input" style="padding:0 8px;" name="yieldUnit" value={recipe.yieldUnit ?? ''}>
                <option value="">—</option>
                {#each units as u}<option value={u}>{u}</option>{/each}
              </select>
            </label>
          {:else}
            <input type="hidden" name="yieldQty" value={recipe.yieldQty ?? ''} />
            <input type="hidden" name="yieldUnit" value={recipe.yieldUnit ?? ''} />
          {/if}

          <label class="flex flex-col gap-1" style="min-width:130px;">
            <span class="label text-fg-3">{t('rec.f.sellingPrice')}</span>
            <input class="input" style="padding:0 8px;" name="sellingPrice" inputmode="decimal" bind:value={sellingPrice} />
          </label>
          <label class="flex flex-col gap-1" style="min-width:92px;">
            <span class="label text-fg-3">{t('rec.f.vat')}</span>
            <input class="input" style="padding:0 8px;" name="vatPct" inputmode="decimal" bind:value={vatPct} />
          </label>
          <input type="hidden" name="targetFoodCostPct" value={targetPct} />

          <label class="flex flex-col gap-1" style="flex:1;min-width:100%;">
            <span class="label text-fg-3">{t('rec.f.preparation')}</span>
            <textarea class="input" style="padding:8px;min-height:96px;height:auto;" name="preparation"
              placeholder={t('rec.f.preparationHint')}>{recipe.preparation ?? ''}</textarea>
          </label>
          <label class="flex flex-col gap-1" style="flex:1;min-width:100%;">
            <span class="label text-fg-3">{t('rec.f.notes')}</span>
            <input class="input" style="padding:0 8px;" name="notes" value={recipe.notes ?? ''} />
          </label>

          <button type="submit" class="btn btn-primary" style="font-size:13px;">{t('rec.f.save')}</button>
        </form>
      </SectionCard>
    </div>

    <aside class="rec-rail">
      <div class="card flex flex-col gap-4" style="padding:16px;">
        <div class="flex items-center justify-between gap-2">
          <span class="subtitle">{t('rec.rail.title')}</span>
          {#if railBadge}<span class={railBadge.cls}>{t(railBadge.key)}</span>{/if}
        </div>

        <FoodCostGauge value={live.foodCostPct} target={targetPct} />

        <div class="flex flex-col">
          <div class="rec-rail-row">
            <span class="body">{t('rec.sum.totalCost')}</span>
            <span class="body-strong num">{eur(live.totalCostCents)}</span>
          </div>
          <div class="rec-rail-row">
            <span class="body">{t('rec.sum.costPerPortion')}</span>
            <span class="body-strong num">{eur(live.costPerPortionCents)}</span>
          </div>
          <div class="rec-rail-row">
            <span class="body flex items-center gap-1">
              {t('rec.sum.netPrice')}
              <InfoTooltip text={t('rec.sum.foodCostHint')} />
            </span>
            <span class="body-strong num">{eur(live.netPriceCents)}</span>
          </div>
          <div class="rec-rail-row">
            <span class="body">{t('rec.sum.margin')}</span>
            <span class="body-strong num" class:text-pos={(live.marginCents ?? 0) > 0}>{eur(live.marginCents)}</span>
          </div>
          <div class="rec-rail-row rec-rail-row-last">
            <span class="body">{t('rec.sum.marginPct')}</span>
            <span class="body-strong num" class:text-pos={(live.marginPct ?? 0) > 0}>{pct(live.marginPct)}</span>
          </div>
        </div>

        <div class="rec-rail-target flex flex-col gap-2">
          <div class="flex items-baseline justify-between gap-2">
            <span class="label text-fg-3">{t('rec.f.targetFoodCost')}</span>
            <span class="body-strong num">{targetPct} %</span>
          </div>
          <Slider bind:value={targetPct} min={10} max={60} />
          <div class="flex items-baseline justify-between gap-2">
            <span class="body">{t('rec.sum.suggested')}</span>
            <span class="title num">{eur(live.suggestedGrossPriceCents)}</span>
          </div>
          <button type="button" class="btn btn-secondary" style="font-size:11px;justify-content:center;"
            disabled={live.suggestedGrossPriceCents === null}
            onclick={() => { if (live.suggestedGrossPriceCents !== null) sellingPrice = (live.suggestedGrossPriceCents / 100).toFixed(2); }}>
            {t('rec.sum.apply')}
          </button>
        </div>
      </div>
    </aside>

    <div class="rec-body flex flex-col gap-4">
      <SectionCard title={t('rec.sec.ingredients')} noPad>
        <ScrollStrip padding="0" leadIn="0" gap="0" label={t('rec.sec.ingredients')}>
          <table class="tbl tbl-stack">
            <thead>
              <tr>
                <th>{t('rec.line.name')}</th>
                <th class="num">{t('rec.line.gross')}</th>
                <th class="num">{t('rec.line.waste')}</th>
                <th class="num">{t('rec.line.net')}</th>
                <th>{t('rec.line.unit')}</th>
                <th class="num">{t('rec.line.unitCost')}</th>
                <th class="num">{t('rec.line.amount')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each items as line (line.id)}
                <RecipeLineRow {line} cost={costByItem.get(line.id) ?? null} {units} {catalog} {linkableRecipes} />
              {/each}
              {#key items.length}
                <RecipeLineRow {units} {catalog} {linkableRecipes} />
              {/key}
            </tbody>
            {#if cost && items.length > 0}
              <tfoot>
                <tr>
                  <td colspan="6" class="body-strong">{t('rec.sum.totalCost')}</td>
                  <td class="num body-strong">{eur(cost.totalCostCents)}</td>
                  <td></td>
                </tr>
              </tfoot>
            {/if}
          </table>
        </ScrollStrip>
        {#if items.length === 0}
          <p class="body text-center py-8">{t('rec.line.none')}</p>
        {/if}
      </SectionCard>

      {#if preparationSteps.length > 0}
        <SectionCard title={t('rec.sec.preparation')}>
          <ol class="flex flex-col gap-2" style="padding-left:18px;list-style:decimal;">
            {#each preparationSteps as step, i (i)}<li class="body">{step}</li>{/each}
          </ol>
        </SectionCard>
      {/if}

      <SectionCard title={t('rec.sec.allergens')} sub={t('rec.allergen.legal')}>
        {#if (cost?.allergens ?? []).length === 0}
          <p class="body text-fg-3" style="font-size:11px;">{t('rec.allergen.none')}</p>
        {:else}
          <div class="flex flex-wrap gap-1">
            {#each allergens as code}
              {#if cost?.allergens.includes(code)}
                <span class="badge badge-pending">{t(`rec.allergen.${code}`)}</span>
              {/if}
            {/each}
          </div>
        {/if}
      </SectionCard>

      <SectionCard title={t('rec.sec.nutrition')}>
        {#if !cost?.nutritionPerPortion}
          <p class="body text-fg-3" style="font-size:11px;">{t('rec.nut.empty')}</p>
        {:else}
          <div class="grid gap-3" style="grid-template-columns:repeat(auto-fit, minmax(120px, 1fr));">
            <KpiCard label={t('rec.nut.kcal')} value={cost.nutritionPerPortion.kcal.toFixed(0)} />
            <KpiCard label={t('rec.nut.protein')} value={`${cost.nutritionPerPortion.protein.toFixed(1)} g`} />
            <KpiCard label={t('rec.nut.carbs')} value={`${cost.nutritionPerPortion.carbs.toFixed(1)} g`} />
            <KpiCard label={t('rec.nut.fat')} value={`${cost.nutritionPerPortion.fat.toFixed(1)} g`} />
          </div>
          <p class="body text-fg-3" style="font-size:11px;margin-top:10px;">
            {ti('rec.nut.coverage', { known: cost.nutritionCoverage.known, total: cost.nutritionCoverage.total })}
            {t('rec.nut.volumeNote')}
          </p>
        {/if}
      </SectionCard>

      {#if usedIn.length > 0}
        <SectionCard title={t('rec.sec.usedIn')}>
          <div class="flex flex-wrap gap-2">
            {#each usedIn as parent (parent.id)}
              <a href="/recipes/{parent.id}" class="chip">{parent.name}</a>
            {/each}
          </div>
        </SectionCard>
      {/if}
    </div>
  </div>
</div>

<form method="post" action="?/delete" id="rec-delete-form"></form>

<ConfirmDialog
  bind:open={confirmDelete}
  danger
  message={t('rec.f.delete')}
  confirmLabel={t('rec.f.delete')}
  cancelLabel={t('rec.back')}
  onconfirm={() => (document.getElementById('rec-delete-form') as HTMLFormElement)?.requestSubmit()}
/>

<style>
  .rec-grid {
    display: grid;
    gap: 16px;
    grid-template-columns: minmax(0, 1fr);
  }
  .rec-rail-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 0;
    border-bottom: 1px solid var(--mep-divider);
  }
  .rec-rail-row-last { border-bottom: 0; }
  .rec-rail-target {
    padding: 14px;
    background: var(--mep-surface-2);
    border: 1px solid var(--mep-divider);
    border-radius: var(--mep-r-input);
  }

  @media (min-width: 768px) {
    .rec-grid {
      grid-template-columns: minmax(0, 1fr) 320px;
      align-items: start;
    }
    .rec-grid > .rec-head { grid-column: 1; grid-row: 1; }
    .rec-grid > .rec-body { grid-column: 1; grid-row: 2; }
    .rec-grid > .rec-rail {
      grid-column: 2;
      grid-row: 1 / span 2;
      position: sticky;
      top: 16px;
    }
  }
</style>
