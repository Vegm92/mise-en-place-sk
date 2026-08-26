<script lang="ts">
  import type { PageData } from './$types';
  import { t, ti } from '$lib/i18n';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Printer from '@lucide/svelte/icons/printer';
  import FileText from '@lucide/svelte/icons/file-text';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';

  const { data }: { data: PageData } = $props();
  const doc = $derived(data.doc);
</script>

<svelte:head>
  <title>{doc.name}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    @media print {
      .app-header, aside, .cocina-toolbar { display: none !important; }
      main { overflow: visible !important; }
      .cocina-card { border: none !important; box-shadow: none !important; margin: 0 !important; width: auto !important; }
    }
  </style>
</svelte:head>

<div class="cocina-toolbar flex items-center justify-between gap-3 flex-wrap" style="margin-bottom:14px;">
  <a href="/recipes/{data.recipeId}" class="btn btn-ghost flex items-center gap-1" style="font-size:11px;">
    <ArrowLeft size={13} />{$t('rec.back')}
  </a>
  <div class="flex items-center gap-2 flex-wrap">
    <a href="/recipes/{data.recipeId}/sheet" class="btn btn-secondary flex items-center gap-1" style="font-size:11px;">
      <FileText size={13} />{$t('rec.sheet.open')}
    </a>
    <button type="button" class="btn btn-primary flex items-center gap-1" style="font-size:11px;"
      onclick={() => window.print()}>
      <Printer size={13} />{$t('rec.sheet.print')}
    </button>
  </div>
</div>

<div class="card cocina-card" style="overflow:hidden;">

  <div class="cocina-head flex items-end justify-between gap-4 flex-wrap">
    <div class="flex flex-col gap-1">
      {#if doc.sectionKey}
        <span class="label text-fg-3">{$t(doc.sectionKey)}</span>
      {/if}
      <span class="hero">{doc.name}</span>
    </div>
    <div class="flex flex-col items-end" style="flex-shrink:0;">
      <span class="hero num" style="line-height:1;">{doc.portions}</span>
      <span class="label text-fg-3">{$t('rec.cocina.portions')}</span>
    </div>
  </div>

  {#if doc.allergens.length > 0}
    <div class="cocina-allergens flex items-center gap-3 flex-wrap">
      <span class="flex items-center gap-2">
        <AlertTriangle size={16} />
        <span class="label" style="color:var(--mep-warn);">{$t('rec.sec.allergens')}</span>
      </span>
      <div class="flex flex-wrap gap-2">
        {#each doc.allergens as code (code)}
          <span class="cocina-allergen">{$t(`rec.allergen.${code}`)}</span>
        {/each}
      </div>
    </div>
  {:else}
    <div class="cocina-allergens-none">
      <span class="body text-fg-3" style="font-size:11px;">{$t('rec.allergen.none')}</span>
    </div>
  {/if}

  <div class="cocina-body">
    <div class="cocina-ingredients flex flex-col">
      <span class="label text-fg-3" style="margin-bottom:10px;">
        {$ti('rec.cocina.forPortions', { portions: doc.portions })}
      </span>
      {#each doc.lines as line, i (i)}
        <div class="cocina-line flex items-baseline justify-between gap-3">
          <span class="flex flex-col gap-0.5">
            <span class="subtitle" style="font-weight:400;">{line.name}</span>
            {#if line.isPrep && line.childRecipeId !== null}
              <a href="/recipes/{line.childRecipeId}/cocina" class="body" style="font-size:11px;">
                {$t('rec.cocina.seePrep')}
              </a>
            {/if}
          </span>
          <span class="subtitle num" style="white-space:nowrap;">{line.netLabel}</span>
        </div>
      {/each}
      {#if doc.lines.length === 0}
        <p class="body" style="font-size:11px;">{$t('rec.line.none')}</p>
      {/if}
    </div>

    <div class="cocina-steps flex flex-col">
      <span class="label text-fg-3" style="margin-bottom:12px;">{$t('rec.sec.preparation')}</span>
      {#if doc.steps.length === 0}
        <p class="body" style="font-size:13px;">{$t('rec.cocina.noSteps')}</p>
      {:else}
        {#each doc.steps as step, i (i)}
          <div class="cocina-step flex gap-3">
            <span class="cocina-step-n num">{i + 1}</span>
            <span class="subtitle" style="font-weight:400;line-height:1.5;text-wrap:pretty;">{step}</span>
          </div>
        {/each}
      {/if}
    </div>
  </div>

  <div class="cocina-foot flex items-center justify-between gap-4 flex-wrap">
    <div class="flex gap-5 flex-wrap">
      <span class="flex items-baseline gap-1.5">
        <span class="label text-fg-3">{$t('rec.sum.costPerPortion')}</span>
        <span class="body-strong num">{doc.summary.costPerPortion}</span>
      </span>
      <span class="flex items-baseline gap-1.5">
        <span class="label text-fg-3">{$t('rec.col.price')}</span>
        <span class="body-strong num">{doc.summary.grossPrice}</span>
      </span>
      <span class="flex items-baseline gap-1.5">
        <span class="label text-fg-3">{$t('rec.sum.foodCost')}</span>
        <span class="body-strong num text-pos">{doc.summary.foodCost}</span>
      </span>
    </div>
    <span class="body text-fg-3" style="font-size:11px;">{$t('rec.sheet.internal')}</span>
  </div>

</div>

<style>
  .cocina-card { max-width: 860px; }
  .cocina-head {
    padding: 22px 24px 18px;
    border-bottom: 2px solid var(--mep-fg);
  }
  .cocina-allergens {
    padding: 12px 24px;
    background: var(--mep-warn-soft);
    color: var(--mep-warn);
    border-bottom: 1px solid var(--mep-divider);
  }
  .cocina-allergens-none {
    padding: 10px 24px;
    border-bottom: 1px solid var(--mep-divider);
  }
  .cocina-allergen {
    font-size: 13px;
    font-weight: 500;
    padding: 4px 12px;
    border-radius: var(--mep-r-pill);
    background: var(--mep-warn);
    color: var(--mep-warn-fg);
  }
  .cocina-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
  .cocina-ingredients { padding: 20px 24px; border-bottom: 1px solid var(--mep-divider); }
  .cocina-steps { padding: 20px 24px; }
  .cocina-line { padding: 11px 0; border-bottom: 1px solid var(--mep-divider); }
  .cocina-line:last-child { border-bottom: 0; }
  .cocina-step { padding-bottom: 16px; }
  .cocina-step:last-child { padding-bottom: 0; }
  .cocina-step-n {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    border-radius: var(--mep-r-pill);
    background: var(--mep-acc-soft);
    color: var(--mep-acc);
    font-size: 13px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .cocina-foot {
    padding: 14px 24px;
    background: var(--mep-surface-2);
    border-top: 1px solid var(--mep-divider);
  }

  @media (min-width: 768px) {
    .cocina-body { grid-template-columns: 280px minmax(0, 1fr); }
    .cocina-ingredients { border-bottom: 0; border-right: 1px solid var(--mep-divider); }
  }
</style>
