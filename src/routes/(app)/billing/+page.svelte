<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { t } from '$lib/i18n';
	import BillingStatusCard from '$lib/components/mep/BillingStatusCard.svelte';
	import BillingPlanCard from '$lib/components/mep/BillingPlanCard.svelte';
	import BillingFeatureMatrix from '$lib/components/mep/BillingFeatureMatrix.svelte';
	import { PROVISIONAL_PRICE, type TierId } from '$lib/billing-plans';

	const { data, form }: { data: PageData; form: ActionData } = $props();

	const maxLocations = $derived(
		data.currentTier === 'trial'
			? data.trialTier.maxLocations
			: (data.tiers.find(t => t.tier === data.currentTier)?.maxLocations ?? 1)
	);
	const upgrade = $derived(data.tiers.find(t => t.maxLocations > maxLocations) ?? null);

	const upgradeMessage = $derived.by(() => {
		if (!data.upgradeFor) return null;
		const key = `billing.upgrade.${data.upgradeFor}`;
		const text = $t(key);
		return text === key ? null : text;
	});
</script>

<svelte:head>
	<title>{$t('billing.title')} · Mise en Place</title>
</svelte:head>

<div style="min-height:100%;background:var(--mep-bg);">
<div style="max-width:900px;margin:0 auto;padding:40px 24px 64px;">
	<h1 style="font-size:20px;font-weight:600;color:var(--mep-fg);margin-bottom:4px;">{$t('billing.title')}</h1>
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
			{$t(form.error)}
		</div>
	{/if}

	{#if data.checkoutSuccess}
		<div style="background:var(--mep-pos-soft);border:1px solid var(--mep-pos);color:var(--mep-pos);
		            border-radius:var(--mep-r-input);padding:12px 16px;font-size:14px;margin-bottom:24px;">
			{$t('billing.activated')}
		</div>
	{/if}

	<BillingStatusCard
		status={data.status}
		planName={$t(data.currentTierNameKey)}
		price={PROVISIONAL_PRICE[data.currentTier as TierId] ?? null}
		quotaUsed={data.quotaUsed}
		quotaLimit={data.quotaLimit}
		locationsUsed={data.locationsUsed}
		lockedLocations={data.lockedLocations}
		{maxLocations}
		upgradeName={upgrade ? $t(upgrade.nameKey) : null}
		upgradeMaxLocations={upgrade?.maxLocations ?? 0}
		trialEndsAt={data.trialEndsAt}
		currentPeriodEnd={data.currentPeriodEnd}
		cancelAtPeriodEnd={data.cancelAtPeriodEnd}
		hasSubscription={data.hasSubscription}
		stripeConfigured={data.stripeConfigured}
	/>

	{#if !data.stripeConfigured}
		<p style="font-size:13px;color:var(--mep-fg-4);margin-bottom:28px;">
			{$t('billing.notConfigured')}
		</p>
	{:else}
		<div style="margin-bottom:16px;">
			<div style="font-size:16px;font-weight:600;color:var(--mep-fg);">{$t('billing.plans')}</div>
			<div style="font-size:13px;color:var(--mep-fg-2);margin-top:3px;">{$t('billing.plansSub')}</div>
		</div>

		<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;align-items:stretch;margin-bottom:28px;">
			{#each data.tiers as tier (tier.tier)}
				<BillingPlanCard {tier} available={tier.available} switchable={data.hasSubscription} isRecommended={tier.tier === 'pro'} />
			{/each}
		</div>

		<BillingFeatureMatrix trialTier={data.trialTier} tiers={data.tiers} />
	{/if}
</div>
</div>
