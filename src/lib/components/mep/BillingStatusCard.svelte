<script lang="ts">
	import { locale, t, ti } from '$lib/i18n';
	import Wallet from '@lucide/svelte/icons/wallet';

	const {
		status, trialEndsAt, currentPeriodEnd, cancelAtPeriodEnd, hasSubscription, stripeConfigured,
		planName, price, quotaUsed, quotaLimit, locationsUsed, lockedLocations, maxLocations, upgradeName, upgradeMaxLocations
	}: {
		status: 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled' | 'incomplete';
		trialEndsAt: string | null;
		currentPeriodEnd: string | null;
		cancelAtPeriodEnd: boolean;
		hasSubscription: boolean;
		stripeConfigured: boolean;
		planName: string;
		price: number | null;
		quotaUsed: number;
		quotaLimit: number | null;
		locationsUsed: number;
		lockedLocations: number;
		maxLocations: number;
		upgradeName: string | null;
		upgradeMaxLocations: number;
	} = $props();

	const trialEnd = $derived(trialEndsAt ? new Date(trialEndsAt) : null);
	const trialDaysLeft = $derived(
		trialEnd ? Math.ceil((trialEnd.getTime() - Date.now()) / 86_400_000) : 0
	);
	const periodEnd = $derived(currentPeriodEnd ? new Date(currentPeriodEnd) : null);
	const fmt = (d: Date) => d.toLocaleDateString(locale.current, { year: 'numeric', month: 'long', day: 'numeric' });

	const quotaPct = $derived(
		quotaLimit && quotaLimit > 0 ? Math.min(100, Math.round((quotaUsed / quotaLimit) * 100)) : 0
	);
</script>

<div class="card" style="padding:0;overflow:hidden;margin-bottom:28px;">
	<div style="padding:22px 24px;display:flex;align-items:flex-start;justify-content:space-between;gap:24px;flex-wrap:wrap;">
		<div style="display:flex;flex-direction:column;gap:8px;">
			<span class="label">{t('billing.yourPlan')}</span>
			<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
				<span class="text-[32px] font-semibold tracking-[-0.025em] leading-none text-fg">{planName}</span>
				{#if status === 'active'}
					<span class="bg-pos-soft text-pos py-[3px] px-2.5 rounded-full text-[12px] font-medium">{t('billing.active')}</span>
				{:else if status === 'trialing'}
					<span class="bg-acc-soft text-acc py-[3px] px-2.5 rounded-full text-[12px] font-medium">
						{t('billing.trial')}{trialDaysLeft > 0 ? ti('billing.trialLeft', { n: trialDaysLeft }) : t('billing.trialExpiredSuffix')}
					</span>
				{:else if status === 'past_due'}
					<span class="bg-neg-soft text-neg py-[3px] px-2.5 rounded-full text-[12px] font-medium">{t('billing.pastDue')}</span>
				{:else if status === 'paused'}
					<span class="bg-hover text-fg-2 py-[3px] px-2.5 rounded-full text-[12px] font-medium">{t('billing.paused')}</span>
				{:else}
					<span class="bg-hover text-fg-2 py-[3px] px-2.5 rounded-full text-[12px] font-medium">{t('billing.canceled')}</span>
				{/if}
			</div>

			{#if status === 'active' && periodEnd}
				<span class="text-[13px] text-fg-3">
					{#if cancelAtPeriodEnd}{ti('billing.cancelsOn', { date: fmt(periodEnd) })}{:else}{ti('billing.renewsOn', { date: fmt(periodEnd) })}{#if price !== null}{' · '}<span class="num">{price} €</span>{t('billing.perMonthShort')}{/if}{/if}
				</span>
			{:else if status === 'trialing' && trialEnd && trialDaysLeft > 0}
				<span class="text-[13px] text-fg-3">{ti('billing.trialEndsOn', { date: fmt(trialEnd) })}</span>
			{:else if status === 'trialing' && trialDaysLeft <= 0}
				<span class="text-[13px] text-neg">{t('billing.trialExpiredMsg')}</span>
			{/if}
		</div>

		{#if hasSubscription && stripeConfigured}
			<form method="POST" action="?/portal">
				<button type="submit" class="btn btn-secondary" style="height:34px;">
					<Wallet size={14} /> {t('billing.manage')}
				</button>
			</form>
		{/if}
	</div>

	<div class="grid grid-cols-2 border-t border-divider bg-surface-2">
		<div class="px-6 py-4 flex flex-col gap-2 border-r border-divider">
			<span class="label">{t('billing.invoicesThisMonth')}</span>
			<div style="display:flex;align-items:baseline;gap:6px;">
				<span class="num text-[20px] font-semibold tracking-[-0.015em] text-fg">{quotaUsed}</span>
				<span class="num text-[13px] text-fg-3">
					{quotaLimit === null ? t('billing.unlimited') : ti('billing.ofQuota', { n: quotaLimit })}
				</span>
			</div>
			{#if quotaLimit !== null}
				<div class="h-1 rounded bg-divider overflow-hidden">
					<div class="h-full bg-acc rounded" style="width:{quotaPct}%;"></div>
				</div>
			{/if}
		</div>
		<div class="px-6 py-4 flex flex-col gap-2">
			<span class="label">{t('billing.matrix.row.locations')}</span>
			<div style="display:flex;align-items:baseline;gap:6px;">
				<span class="num text-[20px] font-semibold tracking-[-0.015em] text-fg">{locationsUsed}</span>
				<span class="num text-[13px] text-fg-3">{ti('billing.ofQuota', { n: maxLocations })}</span>
			</div>
			{#if lockedLocations > 0}
				<span class="text-[11px] text-fg-3">
					{ti('billing.locationsLocked', { n: lockedLocations })}
				</span>
			{/if}
			{#if upgradeName}
				<span class="text-[12px] text-fg-3">
					{ti('billing.higherTierLocations', { name: upgradeName, n: upgradeMaxLocations })}
				</span>
			{/if}
		</div>
	</div>
</div>
