<script lang="ts">
	import { locale, t, ti } from '$lib/i18n';
	import Wallet from '@lucide/svelte/icons/wallet';

	const {
		status, trialEndsAt, currentPeriodEnd, cancelAtPeriodEnd, hasSubscription, stripeConfigured,
		planName, price, quotaUsed, quotaLimit, locationsUsed, maxLocations, upgradeName, upgradeMaxLocations
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
		maxLocations: number;
		upgradeName: string | null;
		upgradeMaxLocations: number;
	} = $props();

	const trialEnd = $derived(trialEndsAt ? new Date(trialEndsAt) : null);
	const trialDaysLeft = $derived(
		trialEnd ? Math.ceil((trialEnd.getTime() - Date.now()) / 86_400_000) : 0
	);
	const periodEnd = $derived(currentPeriodEnd ? new Date(currentPeriodEnd) : null);
	const fmt = (d: Date) => d.toLocaleDateString($locale, { year: 'numeric', month: 'long', day: 'numeric' });

	const quotaPct = $derived(
		quotaLimit && quotaLimit > 0 ? Math.min(100, Math.round((quotaUsed / quotaLimit) * 100)) : 0
	);
</script>

<div class="card" style="padding:0;overflow:hidden;margin-bottom:28px;">
	<div style="padding:22px 24px;display:flex;align-items:flex-start;justify-content:space-between;gap:24px;flex-wrap:wrap;">
		<div style="display:flex;flex-direction:column;gap:8px;">
			<span class="label">{$t('billing.yourPlan')}</span>
			<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
				<span style="font-size:32px;font-weight:600;letter-spacing:-0.025em;line-height:1;color:var(--mep-fg);">{planName}</span>
				{#if status === 'active'}
					<span style="background:var(--mep-pos-soft);color:var(--mep-pos);padding:3px 10px;border-radius:999px;font-size:12px;font-weight:500;">{$t('billing.active')}</span>
				{:else if status === 'trialing'}
					<span style="background:var(--mep-acc-soft);color:var(--mep-acc);padding:3px 10px;border-radius:999px;font-size:12px;font-weight:500;">
						{$t('billing.trial')}{trialDaysLeft > 0 ? $ti('billing.trialLeft', { n: trialDaysLeft }) : $t('billing.trialExpiredSuffix')}
					</span>
				{:else if status === 'past_due'}
					<span style="background:var(--mep-neg-soft);color:var(--mep-neg);padding:3px 10px;border-radius:999px;font-size:12px;font-weight:500;">{$t('billing.pastDue')}</span>
				{:else if status === 'paused'}
					<span style="background:var(--mep-fg-soft);color:var(--mep-fg-3);padding:3px 10px;border-radius:999px;font-size:12px;font-weight:500;">{$t('billing.paused')}</span>
				{:else}
					<span style="background:var(--mep-fg-soft);color:var(--mep-fg-3);padding:3px 10px;border-radius:999px;font-size:12px;font-weight:500;">{$t('billing.canceled')}</span>
				{/if}
			</div>

			{#if status === 'active' && periodEnd}
				<span style="font-size:13px;color:var(--mep-fg-3);">
					{cancelAtPeriodEnd
						? $ti('billing.cancelsOn', { date: fmt(periodEnd) })
						: $ti('billing.renewsOn', { date: fmt(periodEnd) })}{#if price !== null} · <span class="num">{price} €</span>{$t('billing.perMonthShort')}{/if}
				</span>
				{#if cancelAtPeriodEnd}
					<span style="font-size:13px;color:var(--mep-fg-3);">{$ti('billing.cancelsOnNote', { date: fmt(periodEnd) })}</span>
				{/if}
			{:else if status === 'trialing' && trialEnd && trialDaysLeft > 0}
				<span style="font-size:13px;color:var(--mep-fg-3);">{$ti('billing.trialEndsOn', { date: fmt(trialEnd) })}</span>
			{:else if status === 'trialing' && trialDaysLeft <= 0}
				<span style="font-size:13px;color:var(--mep-neg);">{$t('billing.trialExpiredMsg')}</span>
			{/if}
		</div>

		{#if hasSubscription && stripeConfigured}
			<form method="POST" action="?/portal">
				<button type="submit" class="btn btn-secondary" style="height:34px;">
					<Wallet size={14} /> {$t('billing.manage')}
				</button>
			</form>
		{/if}
	</div>

	<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-top:1px solid var(--mep-divider);background:var(--mep-surface-2);">
		<div style="padding:16px 24px;display:flex;flex-direction:column;gap:8px;border-right:1px solid var(--mep-divider);">
			<span class="label">{$t('billing.invoicesThisMonth')}</span>
			<div style="display:flex;align-items:baseline;gap:6px;">
				<span class="num" style="font-size:20px;font-weight:600;letter-spacing:-0.015em;color:var(--mep-fg);">{quotaUsed}</span>
				<span class="num" style="font-size:13px;color:var(--mep-fg-3);">
					{quotaLimit === null ? $t('billing.unlimited') : $ti('billing.ofQuota', { n: quotaLimit })}
				</span>
			</div>
			{#if quotaLimit !== null}
				<div style="height:4px;border-radius:2px;background:var(--mep-divider);overflow:hidden;">
					<div style="width:{quotaPct}%;height:100%;background:var(--mep-acc);border-radius:2px;"></div>
				</div>
			{/if}
		</div>
		<div style="padding:16px 24px;display:flex;flex-direction:column;gap:8px;">
			<span class="label">{$t('billing.matrix.row.locations')}</span>
			<div style="display:flex;align-items:baseline;gap:6px;">
				<span class="num" style="font-size:20px;font-weight:600;letter-spacing:-0.015em;color:var(--mep-fg);">{locationsUsed}</span>
				<span class="num" style="font-size:13px;color:var(--mep-fg-3);">{$ti('billing.ofQuota', { n: maxLocations })}</span>
			</div>
			{#if upgradeName}
				<span style="font-size:12px;color:var(--mep-fg-3);">
					{$ti('billing.higherTierLocations', { name: upgradeName, n: upgradeMaxLocations })}
				</span>
			{/if}
		</div>
	</div>
</div>
