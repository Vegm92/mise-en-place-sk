<script lang="ts">
	import { locale, t, ti } from '$lib/i18n';
	import Wallet from '@lucide/svelte/icons/wallet';

	const { status, trialEndsAt, currentPeriodEnd, cancelAtPeriodEnd, hasSubscription, stripeConfigured }: {
		status: 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled' | 'incomplete';
		trialEndsAt: string | null;
		currentPeriodEnd: string | null;
		cancelAtPeriodEnd: boolean;
		hasSubscription: boolean;
		stripeConfigured: boolean;
	} = $props();

	const trialEnd = $derived(trialEndsAt ? new Date(trialEndsAt) : null);
	const trialDaysLeft = $derived(
		trialEnd ? Math.ceil((trialEnd.getTime() - Date.now()) / 86_400_000) : 0
	);
	const periodEnd = $derived(currentPeriodEnd ? new Date(currentPeriodEnd) : null);
	const fmt = (d: Date) => d.toLocaleDateString($locale, { year: 'numeric', month: 'long', day: 'numeric' });
</script>

<div class="card" style="padding:24px;margin-bottom:28px;">
	<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:16px;flex-wrap:wrap;">
		<div style="display:flex;align-items:center;gap:12px;">
			<span style="font-size:14px;font-weight:500;">{$t('billing.status')}</span>
			{#if status === 'active'}
				<span style="background:var(--mep-pos-soft);color:var(--mep-pos);padding:2px 10px;border-radius:99px;font-size:12px;font-weight:500;">{$t('billing.active')}</span>
			{:else if status === 'trialing'}
				<span style="background:var(--mep-acc-soft);color:var(--mep-acc);padding:2px 10px;border-radius:99px;font-size:12px;font-weight:500;">
					{$t('billing.trial')}{trialDaysLeft > 0 ? $ti('billing.trialLeft', { n: trialDaysLeft }) : $t('billing.trialExpiredSuffix')}
				</span>
			{:else if status === 'past_due'}
				<span style="background:var(--mep-neg-soft);color:var(--mep-neg);padding:2px 10px;border-radius:99px;font-size:12px;font-weight:500;">{$t('billing.pastDue')}</span>
			{:else if status === 'paused'}
				<span style="background:var(--mep-fg-soft);color:var(--mep-fg-3);padding:2px 10px;border-radius:99px;font-size:12px;font-weight:500;">{$t('billing.paused')}</span>
			{:else}
				<span style="background:var(--mep-fg-soft);color:var(--mep-fg-3);padding:2px 10px;border-radius:99px;font-size:12px;font-weight:500;">{$t('billing.canceled')}</span>
			{/if}
		</div>
		{#if hasSubscription && stripeConfigured}
			<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
				<form method="POST" action="?/portal">
					<button type="submit" class="btn btn-secondary" style="height:34px;">
						<Wallet size={14} /> {$t('billing.manage')}
					</button>
				</form>
			</div>
		{/if}
	</div>

	{#if status === 'active' && periodEnd}
		<p style="font-size:13px;color:var(--mep-fg-3);margin:0;">
			{cancelAtPeriodEnd
				? $ti('billing.cancelsOn', { date: fmt(periodEnd) })
				: $ti('billing.renewsOn', { date: fmt(periodEnd) })}
		</p>
		{#if cancelAtPeriodEnd}
			<p style="font-size:13px;color:var(--mep-fg-3);margin:4px 0 0;">
				{$ti('billing.cancelsOnNote', { date: fmt(periodEnd) })}
			</p>
		{/if}
	{:else if status === 'trialing' && trialEnd && trialDaysLeft > 0}
		<p style="font-size:13px;color:var(--mep-fg-3);margin:0;">
			{$ti('billing.trialEndsOn', { date: fmt(trialEnd) })}
		</p>
	{:else if status === 'trialing' && trialDaysLeft <= 0}
		<p style="font-size:13px;color:var(--mep-neg);margin:0;">
			{$t('billing.trialExpiredMsg')}
		</p>
	{/if}
</div>
