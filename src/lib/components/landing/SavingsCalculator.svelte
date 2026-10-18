<script lang="ts">
  import { getLocale, getT, getTi } from '$lib/i18n-context';
  import { fmtEurCompact } from '$lib/formatters';
  import {
    DEFAULT_DRIFT,
    DEFAULT_MONTHLY_SPEND,
    DRIFT_PRESETS,
    formatPct,
    formatSpendInput,
    parseMonthlySpend,
    planShareOfStake,
    stakeAt,
  } from '$lib/savings-calculator';
  import { ICP_TIER, type LandingTier } from '$lib/landing-plans';

  let { tiers }: { tiers: LandingTier[] } = $props();

  const locale = getLocale();
  const t = getT();
  const ti = getTi();
  const uid = $props.id();

  let spendText = $state(formatSpendInput(DEFAULT_MONTHLY_SPEND, locale.current));
  let drift = $state<number>(DEFAULT_DRIFT);
  let planId = $state(ICP_TIER);

  const stake = $derived(stakeAt(parseMonthlySpend(spendText), drift));
  const plan = $derived(tiers.find((tier) => tier.id === planId) ?? tiers[tiers.length - 1]);
  const share = $derived(plan ? planShareOfStake(plan.price, stake.monthly) : null);
</script>

<div class="grid gap-6 rounded-card border border-border bg-surface p-5 shadow-card sm:p-7 md:grid-cols-2 md:gap-10">
  <div class="flex flex-col gap-6">
    <div>
      <label for="{uid}-spend" class="block text-sm font-semibold text-fg">{t('waitlist.calc.spendLabel')}</label>
      <input
        id="{uid}-spend"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        aria-describedby="{uid}-spend-hint"
        bind:value={spendText}
        class="num mt-2 h-12 w-full rounded-input border border-border-input bg-surface px-3.5 font-mono text-lg text-fg"
      />
      <p id="{uid}-spend-hint" class="mt-1.5 text-[13px] text-fg-3">{t('waitlist.calc.spendHint')}</p>
    </div>

    <fieldset aria-describedby="{uid}-drift-hint">
      <legend class="text-sm font-semibold text-fg">{t('waitlist.calc.driftLabel')}</legend>
      <div class="mt-2 flex gap-2">
        {#each DRIFT_PRESETS as preset}
          <label class="flex-1 cursor-pointer">
            <input type="radio" name="{uid}-drift" value={preset} bind:group={drift} class="peer sr-only" />
            <span class="num flex h-11 items-center justify-center rounded-input border border-border-strong font-mono text-[15px] font-semibold text-fg-2 peer-checked:border-acc peer-checked:bg-acc peer-checked:text-acc-fg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-acc">
              {formatPct(preset, locale.current)}
            </span>
          </label>
        {/each}
      </div>
      <p id="{uid}-drift-hint" class="mt-1.5 text-[13px] text-fg-3">{t('waitlist.calc.driftHint')}</p>
    </fieldset>

    <div>
      <label for="{uid}-plan" class="block text-sm font-semibold text-fg">{t('waitlist.calc.planLabel')}</label>
      <select id="{uid}-plan" bind:value={planId} class="btn btn-secondary mt-2 h-11 w-full justify-between text-[15px]">
        {#each tiers as tier}
          <option value={tier.id}>{t(`billing.plan.${tier.id}`)} · {fmtEurCompact(tier.price, locale.current)}{t('waitlist.pricingPerMonth')}</option>
        {/each}
      </select>
    </div>
  </div>

  <div class="flex flex-col justify-between gap-5 rounded-card bg-surface-2 p-5" aria-live="polite">
    <dl class="grid grid-cols-2 gap-4 md:grid-cols-1">
      <div>
        <dt class="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-3 font-mono">{t('waitlist.calc.monthly')}</dt>
        <dd class="num m-0 mt-1 text-[28px] font-semibold leading-none tracking-[-0.02em] text-fg sm:text-[34px]">{fmtEurCompact(stake.monthly, locale.current)}</dd>
      </div>
      <div>
        <dt class="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-3 font-mono">{t('waitlist.calc.yearly')}</dt>
        <dd class="num m-0 mt-1 text-[28px] font-semibold leading-none tracking-[-0.02em] text-acc sm:text-[34px]">{fmtEurCompact(stake.yearly, locale.current)}</dd>
      </div>
    </dl>
    <p class="m-0 text-[15px] leading-[1.5] text-fg">
      {#if plan && share !== null}
        {ti('waitlist.calc.share', {
          plan: t(`billing.plan.${plan.id}`),
          price: fmtEurCompact(plan.price, locale.current),
          share: formatPct(share, locale.current),
        })}
      {:else}
        {t('waitlist.calc.shareEmpty')}
      {/if}
    </p>
    <p class="m-0 text-[12.5px] leading-[1.5] text-fg-3">{t('waitlist.calc.method')}</p>
  </div>
</div>
