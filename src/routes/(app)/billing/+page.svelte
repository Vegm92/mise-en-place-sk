<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { t, ti } from '$lib/i18n';
	import BillingStatusCard from '$lib/components/mep/BillingStatusCard.svelte';
	import BillingPlanCard from '$lib/components/mep/BillingPlanCard.svelte';
	import BillingFeatureMatrix from '$lib/components/mep/BillingFeatureMatrix.svelte';
	import { ANNUAL_FREE_MONTHS, TIER_MAX_LOCATIONS, tierPrice, type BillingInterval, type TierId } from '$lib/billing-plans';

	const { data, form }: { data: PageData; form: ActionData } = $props();

	let interval = $state<BillingInterval>('month');

	const maxLocations = $derived(
		data.currentTier === 'trial'
			? data.trialTier.maxLocations
			: (data.tiers.find(t => t.tier === data.currentTier)?.maxLocations ?? 1)
	);
	const upgrade = $derived(data.tiers.find(t => t.maxLocations > maxLocations) ?? null);

	const upgradeMessage = $derived.by(() => {
		if (!data.upgradeFor) return null;
		const key = `billing.upgrade.${data.upgradeFor}`;
		const text = t(key);
		return text === key ? null : text;
	});
</script>

<svelte:head>
	<title>{t('billing.title')} · Mise en Place</title>
</svelte:head>

<div style="min-height:100%;background:var(--mep-bg);">
<div style="max-width:900px;margin:0 auto;padding:40px 24px 64px;">
	<h2 style="font-size:20px;font-weight:600;color:var(--mep-fg);margin-bottom:4px;">{t('billing.title')}</h2>
	<p style="font-size:14px;color:var(--mep-fg-3);margin-bottom:28px;">{data.restaurantName}</p>

	{#if upgradeMessage}
		<div style="background:var(--mep-acc-soft);border:1px solid var(--mep-acc);color:var(--mep-acc);
		            border-radius:var(--mep-r-input);padding:12px 16px;font-size:14px;margin-bottom:24px;">
			{upgradeMessage}
		</div>
	{/if}

	{#if form?.error}
		<div style="background:var(--mep-neg-soft);border:1px solid var(--mep-neg);color:var(--mep-neg);
		            border-radius:var(--mep-r-input);padding:12px 16px;font-size:14px;margin-bottom:24px;">
			{t(form.error)}
		</div>
	{/if}

	{#if data.checkoutSuccess}
		<div style="background:var(--mep-pos-soft);border:1px solid var(--mep-pos);color:var(--mep-pos);
		            border-radius:var(--mep-r-input);padding:12px 16px;font-size:14px;margin-bottom:24px;">
			{t('billing.activated')}
		</div>
	{/if}

	<BillingStatusCard
		status={data.status}
		planName={t(data.currentTierNameKey)}
		price={data.currentTier === 'trial' ? null : tierPrice(data.currentTier as TierId, data.currentInterval)}
		interval={data.currentInterval}
		quotaUsed={data.quotaUsed}
		quotaLimit={data.quotaLimit}
		locationsUsed={data.locationsUsed}
		lockedLocations={data.lockedLocations}
		{maxLocations}
		upgradeName={upgrade ? t(upgrade.nameKey) : null}
		upgradeMaxLocations={upgrade?.maxLocations ?? 0}
		trialEndsAt={data.trialEndsAt}
		currentPeriodEnd={data.currentPeriodEnd}
		cancelAtPeriodEnd={data.cancelAtPeriodEnd}
		hasSubscription={data.hasSubscription}
		stripeConfigured={data.stripeConfigured}
	/>

	{#if !data.stripeConfigured}
		<p style="font-size:13px;color:var(--mep-fg-4);margin-bottom:28px;">
			{t('billing.notConfigured')}
		</p>
	{:else}
		<div style="margin-bottom:16px;">
			<div style="font-size:16px;font-weight:600;color:var(--mep-fg);">{t('billing.plans')}</div>
			<div style="font-size:13px;color:var(--mep-fg-2);margin-top:3px;">{ti('billing.plansSub', { n: TIER_MAX_LOCATIONS.business })}</div>
		</div>

		{#if data.annualAvailable}
			<div role="group" aria-label={t('billing.interval.label')} class="mb-4 inline-flex gap-1 rounded-input border border-border bg-surface p-1">
				<button type="button" aria-pressed={interval === 'month'} onclick={() => (interval = 'month')}
					class="h-8 rounded-input px-3 text-sm font-medium {interval === 'month' ? 'bg-acc text-acc-fg' : 'text-fg-2'}">
					{t('billing.interval.month')}
				</button>
				<button type="button" aria-pressed={interval === 'year'} onclick={() => (interval = 'year')}
					class="h-8 rounded-input px-3 text-sm font-medium {interval === 'year' ? 'bg-acc text-acc-fg' : 'text-fg-2'}">
					{t('billing.interval.year')}
					<span class="ml-1 text-xs {interval === 'year' ? 'text-acc-fg' : 'text-acc'}">{ti('billing.interval.yearSave', { n: ANNUAL_FREE_MONTHS })}</span>
				</button>
			</div>
		{/if}

		<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;align-items:stretch;margin-bottom:28px;">
			{#each data.tiers as tier (tier.tier)}
				<BillingPlanCard {tier} {interval} available={tier.available && (interval === 'month' || data.annualAvailable)} switchable={data.hasSubscription} isRecommended={tier.tier === 'pro'} />
			{/each}
		</div>

		<BillingFeatureMatrix trialTier={data.trialTier} tiers={data.tiers} />
	{/if}
</div>
</div>
