<script lang="ts">
	import type { PageData } from './$types';

	const { data }: { data: PageData } = $props();

	const trialEnd = $derived(data.trialEndsAt ? new Date(data.trialEndsAt) : null);
	const trialDaysLeft = $derived(
		trialEnd ? Math.ceil((trialEnd.getTime() - Date.now()) / 86_400_000) : 0
	);
	const periodEnd = $derived(data.currentPeriodEnd ? new Date(data.currentPeriodEnd) : null);
	const fmt = (d: Date) => d.toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' });

	const upgradeMessages: Record<string, string> = {
		digest: 'The weekly AI digest is a paid feature. Subscribe to unlock it.',
		prices: 'Price shock & supplier score alerts are a paid feature. Subscribe to unlock them.',
	};
	const upgradeMessage = $derived(data.upgradeFor ? upgradeMessages[data.upgradeFor] ?? null : null);
</script>

<svelte:head>
	<title>Billing · Mise en Place</title>
</svelte:head>

<div class="mep" data-accent="amber" data-density="default"
	style="min-height:100vh;background:var(--mep-bg);">
<div style="max-width:560px;margin:0 auto;padding:40px 24px 64px;">
	<h1 style="font-size:20px;font-weight:600;color:var(--mep-fg);margin-bottom:4px;">Billing</h1>
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
			Subscription activated! Thank you.
		</div>
	{/if}

	<!-- Status card -->
	<div class="card" style="padding:24px;margin-bottom:20px;">
		<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
			<span style="font-size:14px;font-weight:500;">Status</span>
			{#if data.status === 'active'}
				<span style="background:var(--mep-pos-soft);color:var(--mep-pos);padding:2px 10px;border-radius:99px;font-size:12px;font-weight:500;">Active</span>
			{:else if data.status === 'trialing'}
				<span style="background:var(--mep-acc-soft);color:var(--mep-acc);padding:2px 10px;border-radius:99px;font-size:12px;font-weight:500;">
					Trial{trialDaysLeft > 0 ? ` — ${trialDaysLeft}d left` : ' expired'}
				</span>
			{:else if data.status === 'past_due'}
				<span style="background:var(--mep-neg-soft);color:var(--mep-neg);padding:2px 10px;border-radius:99px;font-size:12px;font-weight:500;">Past due</span>
			{:else}
				<span style="background:var(--mep-fg-soft);color:var(--mep-fg-3);padding:2px 10px;border-radius:99px;font-size:12px;font-weight:500;">Canceled</span>
			{/if}
		</div>

		{#if data.status === 'active' && periodEnd}
			<p style="font-size:13px;color:var(--mep-fg-3);margin:0;">
				{data.cancelAtPeriodEnd
					? `Cancels on ${fmt(periodEnd)}`
					: `Renews on ${fmt(periodEnd)}`}
			</p>
		{:else if data.status === 'trialing' && trialEnd && trialDaysLeft > 0}
			<p style="font-size:13px;color:var(--mep-fg-3);margin:0;">
				Free trial ends on {fmt(trialEnd)}. No card required during trial.
			</p>
		{:else if data.status === 'trialing' && trialDaysLeft <= 0}
			<p style="font-size:13px;color:var(--mep-neg);margin:0;">
				Your trial has expired. Subscribe to continue using Mise en Place.
			</p>
		{/if}
	</div>

	<!-- Plan card -->
	{#if data.status !== 'active'}
		<div class="card" style="padding:24px;margin-bottom:20px;">
			<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:8px;">
				<span style="font-size:24px;font-weight:700;">€49</span>
				<span style="font-size:14px;color:var(--mep-fg-3);">/month per restaurant</span>
			</div>
			<ul style="font-size:13px;color:var(--mep-fg-2);list-style:none;padding:0;margin:0 0 20px;display:flex;flex-direction:column;gap:6px;">
				<li>✓ Unlimited invoice uploads</li>
				<li>✓ AI extraction + spend analytics</li>
				<li>✓ Price shock & budget alerts</li>
				<li>✓ Weekly AI digest</li>
				<li>✓ Data export (CSV)</li>
			</ul>
			{#if data.stripeConfigured}
				<form method="POST" action="?/checkout">
					<button type="submit" class="btn btn-primary" style="height:38px;justify-content:center;">
						{data.status === 'trialing' && trialDaysLeft > 0 ? 'Subscribe now' : 'Reactivate subscription'}
					</button>
				</form>
			{:else}
				<p style="font-size:13px;color:var(--mep-fg-4);">
					Billing is not yet configured. Contact support to subscribe.
				</p>
			{/if}
		</div>
	{:else if data.stripeConfigured}
		<form method="POST" action="?/portal">
			<button type="submit" class="btn btn-secondary" style="height:36px;">
				Manage subscription
			</button>
		</form>
	{/if}
</div>
</div>
