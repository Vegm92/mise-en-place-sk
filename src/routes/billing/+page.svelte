<script lang="ts">
	import type { PageData } from './$types';
	import { locale, t, ti } from '$lib/i18n';

	const { data }: { data: PageData } = $props();

	const trialEnd = $derived(data.trialEndsAt ? new Date(data.trialEndsAt) : null);
	const trialDaysLeft = $derived(
		trialEnd ? Math.ceil((trialEnd.getTime() - Date.now()) / 86_400_000) : 0
	);
	const periodEnd = $derived(data.currentPeriodEnd ? new Date(data.currentPeriodEnd) : null);
	const fmt = (d: Date) => d.toLocaleDateString($locale, { year: 'numeric', month: 'long', day: 'numeric' });

	const upgradeMessage = $derived(
		data.upgradeFor === 'digest' ? $t('billing.upgrade.digest')
			: data.upgradeFor === 'prices' ? $t('billing.upgrade.prices')
			: null
	);

	// Idempotency key (issue #250) — one per page load so a double-submit can't
	// spin up two Stripe checkout sessions.
	const idempotencyKey = crypto.randomUUID();
</script>

<svelte:head>
	<title>{$t('billing.title')} · Mise en Place</title>
</svelte:head>

<div class="mep" data-accent="amber" data-density="default"
	style="min-height:100vh;background:var(--mep-bg);">
<div style="max-width:560px;margin:0 auto;padding:40px 24px 64px;">
	<h1 style="font-size:20px;font-weight:600;color:var(--mep-fg);margin-bottom:4px;">{$t('billing.title')}</h1>
	<p style="font-size:14px;color:var(--mep-fg-3);margin-bottom:28px;">{data.restaurantName}</p>

	{#if upgradeMessage}
		<div style="background:var(--mep-acc-soft);border:1px solid var(--mep-acc);color:var(--mep-acc);
		            border-radius:var(--mep-r-input);padding:12px 16px;font-size:14px;margin-bottom:24px;">
			{upgradeMessage}
		</div>
	{/if}

	{#if data.checkoutSuccess}
		<div style="background:var(--mep-pos-soft);border:1px solid var(--mep-pos);color:var(--mep-pos);
		            border-radius:var(--mep-r-input);padding:12px 16px;font-size:14px;margin-bottom:24px;">
			{$t('billing.activated')}
		</div>
	{/if}

	<!-- Status card -->
	<div class="card" style="padding:24px;margin-bottom:20px;">
		<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
			<span style="font-size:14px;font-weight:500;">{$t('billing.status')}</span>
			{#if data.status === 'active'}
				<span style="background:var(--mep-pos-soft);color:var(--mep-pos);padding:2px 10px;border-radius:99px;font-size:12px;font-weight:500;">{$t('billing.active')}</span>
			{:else if data.status === 'trialing'}
				<span style="background:var(--mep-acc-soft);color:var(--mep-acc);padding:2px 10px;border-radius:99px;font-size:12px;font-weight:500;">
					{$t('billing.trial')}{trialDaysLeft > 0 ? $ti('billing.trialLeft', { n: trialDaysLeft }) : $t('billing.trialExpiredSuffix')}
				</span>
			{:else if data.status === 'past_due'}
				<span style="background:var(--mep-neg-soft);color:var(--mep-neg);padding:2px 10px;border-radius:99px;font-size:12px;font-weight:500;">{$t('billing.pastDue')}</span>
			{:else}
				<span style="background:var(--mep-fg-soft);color:var(--mep-fg-3);padding:2px 10px;border-radius:99px;font-size:12px;font-weight:500;">{$t('billing.canceled')}</span>
			{/if}
		</div>

		{#if data.status === 'active' && periodEnd}
			<p style="font-size:13px;color:var(--mep-fg-3);margin:0;">
				{data.cancelAtPeriodEnd
					? $ti('billing.cancelsOn', { date: fmt(periodEnd) })
					: $ti('billing.renewsOn', { date: fmt(periodEnd) })}
			</p>
		{:else if data.status === 'trialing' && trialEnd && trialDaysLeft > 0}
			<p style="font-size:13px;color:var(--mep-fg-3);margin:0;">
				{$ti('billing.trialEndsOn', { date: fmt(trialEnd) })}
			</p>
		{:else if data.status === 'trialing' && trialDaysLeft <= 0}
			<p style="font-size:13px;color:var(--mep-neg);margin:0;">
				{$t('billing.trialExpiredMsg')}
			</p>
		{/if}
	</div>

	<!-- Plan card -->
	{#if data.status !== 'active'}
		<div class="card" style="padding:24px;margin-bottom:20px;">
			<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:8px;">
				<span style="font-size:24px;font-weight:700;">€49</span>
				<span style="font-size:14px;color:var(--mep-fg-3);">{$t('billing.perMonth')}</span>
			</div>
			<ul style="font-size:13px;color:var(--mep-fg-2);list-style:none;padding:0;margin:0 0 20px;display:flex;flex-direction:column;gap:6px;">
				<li>✓ {$t('billing.feat.uploads')}</li>
				<li>✓ {$t('billing.feat.extraction')}</li>
				<li>✓ {$t('billing.feat.alerts')}</li>
				<li>✓ {$t('billing.feat.digest')}</li>
				<li>✓ {$t('billing.feat.export')}</li>
			</ul>
			{#if data.stripeConfigured}
				<form method="POST" action="?/checkout">
					<input type="hidden" name="idempotency_key" value={idempotencyKey} />
					<button type="submit" class="btn btn-primary" style="height:38px;justify-content:center;">
						{data.status === 'trialing' && trialDaysLeft > 0 ? $t('billing.subscribeNow') : $t('billing.reactivate')}
					</button>
				</form>
			{:else}
				<p style="font-size:13px;color:var(--mep-fg-4);">
					{$t('billing.notConfigured')}
				</p>
			{/if}
		</div>
	{:else if data.stripeConfigured}
		<form method="POST" action="?/portal">
			<button type="submit" class="btn btn-secondary" style="height:36px;">
				{$t('billing.manage')}
			</button>
		</form>
	{/if}
</div>
</div>
