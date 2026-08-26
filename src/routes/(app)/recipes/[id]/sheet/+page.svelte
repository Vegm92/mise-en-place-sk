<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { t, ti } from '$lib/i18n';
  import ScrollStrip from '$lib/components/mep/ScrollStrip.svelte';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Printer from '@lucide/svelte/icons/printer';
  import Download from '@lucide/svelte/icons/download';
  import Mail from '@lucide/svelte/icons/mail';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';

  const { data, form }: { data: PageData; form: ActionData } = $props();
  const doc = $derived(data.doc);

  const subtitle = $derived(
    doc.sectionKey
      ? $ti('rec.sheet.subtitle', {
          section: $t(doc.sectionKey), portions: doc.portions, status: $t(doc.statusKey),
        })
      : $ti('rec.sheet.subtitleNoSection', { portions: doc.portions, status: $t(doc.statusKey) })
  );
</script>

<svelte:head>
  <title>{doc.name}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    @media print {
      .app-header, aside, .sheet-toolbar { display: none !important; }
      main { overflow: visible !important; }
      .rec-sheet { border: none !important; box-shadow: none !important; margin: 0 !important; width: auto !important; }
    }
  </style>
</svelte:head>

<div class="sheet-toolbar flex items-center justify-between gap-3 flex-wrap" style="margin-bottom:14px;">
  <a href="/recipes/{data.recipeId}" class="btn btn-ghost flex items-center gap-1" style="font-size:11px;">
    <ArrowLeft size={13} />{$t('rec.back')}
  </a>
  <div class="flex items-center gap-2 flex-wrap">
    <a href="/recipes/{data.recipeId}/csv" data-sveltekit-reload
      class="btn btn-secondary flex items-center gap-1" style="font-size:11px;">
      <Download size={13} />{$t('rec.sheet.csv')}
    </a>
    <button type="button" class="btn btn-secondary flex items-center gap-1" style="font-size:11px;"
      onclick={() => window.print()}>
      <Printer size={13} />{$t('rec.sheet.print')}
    </button>
    <form method="post" action="?/sendSheet" class="flex items-center gap-1">
      <input class="input" style="padding:0 8px;max-width:210px;" type="email" name="to"
        required value={data.defaultEmail} aria-label={$t('rec.sheet.emailTo')} />
      <button type="submit" class="btn btn-primary flex items-center gap-1" style="font-size:11px;">
        <Mail size={13} />{$t('rec.sheet.emailSend')}
      </button>
    </form>
  </div>
</div>

{#if form?.error}
  <p class="sheet-toolbar body text-neg" style="font-size:11px;margin-bottom:10px;">{$t(form.error)}</p>
{:else if form?.sentTo}
  <p class="sheet-toolbar body text-pos" style="font-size:11px;margin-bottom:10px;">
    {$ti('rec.sheet.emailSent', { to: form.sentTo })}
  </p>
{/if}

<div class="card rec-sheet" style="padding:22px;">
  <div class="flex items-baseline justify-between gap-3 flex-wrap"
    style="border-bottom:1px solid var(--mep-border);padding-bottom:10px;">
    <span class="label text-fg-3">{$t('rec.sheet.eyebrow')}</span>
    <span class="label text-fg-3">{$ti('rec.sheet.generated', { at: doc.generatedAt })}</span>
  </div>

  <h1 class="title" style="margin-top:14px;">{doc.name}</h1>
  <p class="body text-fg-3" style="font-size:11px;">{subtitle}</p>

  {#each doc.warnings as w (w)}
    {#if w !== 'nutrition-partial'}
      <p class="body text-warn flex items-center gap-1" style="font-size:11px;margin-top:8px;">
        <AlertTriangle size={12} />{$t(`rec.warn.sheet.${w}`)}
      </p>
    {/if}
  {/each}

  <div class="grid gap-3" style="grid-template-columns:repeat(4, minmax(0, 1fr));margin-top:16px;">
    {#each doc.kpis as k (k.labelKey)}
      <div class="card" style="padding:11px;">
        <div class="label text-fg-3">{$t(k.labelKey)}</div>
        <div class="subtitle">{k.value}</div>
      </div>
    {/each}
  </div>
  <div class="grid gap-3" style="grid-template-columns:repeat(4, minmax(0, 1fr));margin-top:10px;">
    {#each doc.secondaryKpis as k (k.labelKey)}
      <div class="card" style="padding:11px;">
        <div class="label text-fg-3">{$t(k.labelKey)}</div>
        <div class="body-strong">{k.value}</div>
      </div>
    {/each}
  </div>

  <h2 class="subtitle" style="margin-top:20px;margin-bottom:8px;">{$t('rec.sec.ingredients')}</h2>
  <ScrollStrip padding="0" leadIn="0" gap="0" label={$t('rec.sec.ingredients')}>
    <table class="tbl">
      <thead>
        <tr>
          <th>{$t('rec.line.name')}</th>
          <th class="num">{$t('rec.line.gross')}</th>
          <th class="num">{$t('rec.line.waste')}</th>
          <th class="num">{$t('rec.line.net')}</th>
          <th>{$t('rec.line.unit')}</th>
          <th class="num">{$t('rec.line.unitCost')}</th>
          <th class="num">{$t('rec.line.amount')}</th>
          <th class="num">{$t('rec.line.share')}</th>
          <th>{$t('rec.sec.allergens')}</th>
        </tr>
      </thead>
      <tbody>
        {#each doc.lines as l, i (i)}
          <tr>
            <td>
              {l.name}
              {#if l.isPrep}<span class="chip" style="margin-left:5px;">{$t('rec.kind.elaboracion')}</span>{/if}
              <div class="body text-fg-3" style="font-size:11px;">
                {[$t(l.sourceKey), l.sourceDate, l.supplier].filter(Boolean).join(' · ')}
              </div>
            </td>
            <td class="num">{l.grossQty}</td>
            <td class="num">{l.wastePct}</td>
            <td class="num">{l.netQty}</td>
            <td>{l.unit}</td>
            <td class="num">{l.unitCost}</td>
            <td class="num">{l.amount}</td>
            <td class="num">{l.sharePct}</td>
            <td class="body text-fg-3" style="font-size:11px;">
              {l.allergens.map((a) => $t(`rec.allergen.${a}`)).join(', ')}
            </td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="6" class="body-strong">{$t('rec.sum.totalCost')}</td>
          <td class="num body-strong">{doc.totalAmount}</td>
          <td colspan="2"></td>
        </tr>
      </tfoot>
    </table>
  </ScrollStrip>

  {#if doc.preps.length > 0}
    <h2 class="subtitle" style="margin-top:20px;margin-bottom:8px;">{$t('rec.sheet.preps')}</h2>
    {#each doc.preps as prep (prep.name)}
      <div style="margin-bottom:14px;">
        <div class="body-strong">{prep.name}</div>
        <div class="body text-fg-3" style="font-size:11px;margin-bottom:6px;">
          {$ti('rec.sheet.prepYield', { yield: prep.yieldLabel, total: prep.total })}
        </div>
        <ScrollStrip padding="0" leadIn="0" gap="0" label={prep.name}>
          <table class="tbl">
            <thead>
              <tr>
                <th>{$t('rec.line.name')}</th>
                <th class="num">{$t('rec.line.net')}</th>
                <th>{$t('rec.line.unit')}</th>
                <th class="num">{$t('rec.line.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {#each prep.lines as l, i (i)}
                <tr>
                  <td>{l.name}</td>
                  <td class="num">{l.netQty}</td>
                  <td>{l.unit}</td>
                  <td class="num">{l.amount}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </ScrollStrip>
      </div>
    {/each}
  {/if}

  {#if doc.steps.length > 0}
    <h2 class="subtitle" style="margin-top:20px;margin-bottom:8px;">{$t('rec.sec.preparation')}</h2>
    <ol class="flex flex-col gap-1" style="padding-left:18px;list-style:decimal;">
      {#each doc.steps as step, i (i)}<li class="body">{step}</li>{/each}
    </ol>
  {/if}

  <h2 class="subtitle" style="margin-top:20px;margin-bottom:8px;">{$t('rec.sec.allergens')}</h2>
  {#if doc.allergens.length === 0}
    <p class="body text-fg-3" style="font-size:11px;">{$t('rec.allergen.none')}</p>
  {:else}
    <div class="flex flex-wrap gap-1">
      {#each doc.allergens as code (code)}
        <span class="badge" style="background:var(--mep-warn-soft);color:var(--mep-warn);">
          {$t(`rec.allergen.${code}`)}
        </span>
      {/each}
    </div>
  {/if}
  <p class="body text-fg-3" style="font-size:11px;margin-top:6px;">{$t('rec.allergen.legal')}</p>

  {#if doc.nutrition}
    <h2 class="subtitle" style="margin-top:20px;margin-bottom:8px;">{$t('rec.sec.nutrition')}</h2>
    <table class="tbl">
      <tbody>
        <tr><td>{$t('rec.nut.kcal')}</td><td class="num">{doc.nutrition.kcal}</td></tr>
        <tr><td>{$t('rec.nut.protein')}</td><td class="num">{doc.nutrition.protein}</td></tr>
        <tr><td>{$t('rec.nut.carbs')}</td><td class="num">{doc.nutrition.carbs}</td></tr>
        <tr><td>{$t('rec.nut.fat')}</td><td class="num">{doc.nutrition.fat}</td></tr>
      </tbody>
    </table>
    <p class="body text-fg-3" style="font-size:11px;margin-top:6px;">
      {$ti('rec.nut.coverage', { known: doc.coverage.known, total: doc.coverage.total })}
      {$t('rec.nut.volumeNote')}
    </p>
  {/if}

  <p class="label text-fg-3" style="margin-top:20px;border-top:1px solid var(--mep-border);padding-top:10px;">
    {$t('rec.sheet.internal')}
  </p>
</div>
