<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { locale, t, ti } from '$lib/i18n';
	import Check from '@lucide/svelte/icons/check';
	import Wallet from '@lucide/svelte/icons/wallet';

	const { data, form }: { data: PageData; form: ActionData } = $props();

	const trialEnd = $derived(data.trialEndsAt ? new Date(data.trialEndsAt) : null);
	const trialDaysLeft = $derived(
		trialEnd ? Math.ceil((trialEnd.getTime() - Date.now()) / 86_400_000) : 0
	);
	const periodEnd = $derived(data.currentPeriodEnd ? new Date(data.currentPeriodEnd) : null);
	const fmt = (d: Date) => d.toLocaleDateString($locale, { year: 'numeric', month: 'long', day: 'numeric' });

	const upgradeMessage = $derived(
		data.upgradeFor === 'digest' ? $t('billing.upgrade.digest')
			: data.upgradeFor === 'prices' ? $t('billing.upgrade.prices')
			: data.upgradeFor === 'trial' ? $t('billing.upgrade.trial')
			: data.upgradeFor === 'inactive' ? $t('billing.upgrade.inactive')
			: null
	);

	const PROVISIONAL_PRICE: Record<string, number> = { starter: 29, pro: 59, business: 129 };

	type TierBullet = { key: string; interpolate?: Record<string, string | number> };
	const TIER_COPY: Record<string, { tagline: string; inherits?: string; bullets: (quota: number | null) => TierBullet[] }> = {
		starter: {
			tagline: 'billing.tier.starter.tagline',
			bullets: (quota) => [
				{ key: 'billing.tier.starter.bullet.quota', interpolate: { n: quota ?? 0 } },
				{ key: 'billing.tier.starter.bullet.spend' },
				{ key: 'billing.tier.starter.bullet.location' },
			],
		},
		pro: {
			tagline: 'billing.tier.pro.tagline',
			inherits: 'billing.tier.pro.inherits',
			bullets: (quota) => [
				{ key: 'billing.tier.pro.bullet.quota', interpolate: { n: quota ?? 0 } },
				{ key: 'billing.tier.pro.bullet.digest' },
				{ key: 'billing.tier.pro.bullet.assistant' },
				{ key: 'billing.tier.pro.bullet.analytics' },
			],
		},
		business: {
			tagline: 'billing.tier.business.tagline',
			inherits: 'billing.tier.business.inherits',
			bullets: () => [
				{ key: 'billing.tier.business.bullet.quota' },
				{ key: 'billing.tier.business.bullet.locations', interpolate: { n: 5 } },
				{ key: 'billing.tier.business.bullet.support' },
			],
		},
	};

	const matrixCols = $derived([
		{ id: 'trial', name: $t('billing.tier.trial.name'), quota: data.trialTier.monthlyInvoiceQuota, maxLocations: data.trialTier.maxLocations, features: data.trialTier.features },
		...data.tiers.map(tr => ({ id: tr.tier, name: tr.name, quota: tr.monthlyInvoiceQuota, maxLocations: tr.maxLocations, features: tr.features })),
	]);

	const matrixGroups = $derived([
		{
			title: $t('billing.matrix.group.digitize'),
			rows: [
				{ label: $t('billing.matrix.row.quota'), cell: (c: typeof matrixCols[number]) => c.quota === null ? $t('billing.unlimited') : String(c.quota) },
			],
		},
		{
			title: $t('billing.matrix.group.intelligence'),
			note: $t('billing.matrix.intelligenceNote'),
			rows: [
				{ label: $t('billing.matrix.row.digest'), cell: (c: typeof matrixCols[number]) => c.features.weeklyDigest },
				{ label: $t('billing.matrix.row.assistant'), cell: (c: typeof matrixCols[number]) => c.features.aiAssistant },
				{ label: $t('billing.matrix.row.priceAnalytics'), cell: (c: typeof matrixCols[number]) => c.features.supplierScores },
			],
		},
		{
			title: $t('billing.matrix.group.operations'),
			rows: [
				{ label: $t('billing.matrix.row.stock'), cell: (c: typeof matrixCols[number]) => c.features.stockTracking },
			],
		},
		{
			title: $t('billing.matrix.group.account'),
			rows: [
				{ label: $t('billing.matrix.row.locations'), cell: (c: typeof matrixCols[number]) => c.maxLocations > 1 ? $ti('billing.upTo', { n: c.maxLocations }) : String(c.maxLocations) },
				{ label: $t('billing.matrix.row.prioritySupport'), cell: (c: typeof matrixCols[number]) => c.features.prioritySupport },
			],
		},
	]);

	const idempotencyKeys: Record<string, string> = {};
	function idemKeyFor(tier: string): string {
		return idempotencyKeys[tier] ??= crypto.randomUUID();
	}
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

	<div class="card" style="padding:24px;margin-bottom:28px;">
		<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:16px;flex-wrap:wrap;">
			<div style="display:flex;align-items:center;gap:12px;">
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
			{#if data.status === 'active' && data.stripeConfigured}
				<form method="POST" action="?/portal">
					<button type="submit" class="btn btn-secondary" style="height:34px;">
						<Wallet size={14} /> {$t('billing.manage')}
					</button>
				</form>
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
			{#each data.tiers as tier}
				{@const copy = TIER_COPY[tier.tier]}
				{@const isRecommended = tier.tier === 'pro'}
				<div class="card" style="padding:20px 20px 22px;display:flex;flex-direction:column;gap:14px;position:relative;
					border-color:{isRecommended ? 'var(--mep-acc)' : (tier.isCurrent ? 'var(--mep-border-strong)' : 'var(--mep-border)')};
					box-shadow:{isRecommended ? '0 0 0 1px var(--mep-acc), var(--mep-shadow-card)' : 'var(--mep-shadow-card)'};
					background:{tier.isCurrent ? 'var(--mep-surface-2)' : 'var(--mep-surface)'};">
					<div style="display:flex;align-items:center;gap:8px;">
						<div style="font-size:16px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.01em;">{tier.name}</div>
						{#if isRecommended}
							<span style="background:var(--mep-acc);color:var(--mep-acc-fg);font-size:11px;font-weight:500;padding:2px 7px;border-radius:var(--mep-r-tag);">{$t('billing.recommended')}</span>
						{/if}
						{#if tier.isCurrent}
							<span style="background:var(--mep-hover);color:var(--mep-fg-2);font-size:11px;font-weight:500;padding:2px 7px;border-radius:var(--mep-r-tag);">{$t('billing.currentPlan')}</span>
						{/if}
					</div>

					<div>
						<div style="display:flex;align-items:baseline;gap:6px;">
							<span class="num" style="font-size:32px;font-weight:600;letter-spacing:-0.025em;color:var(--mep-fg);
								border-bottom:2px dotted var(--mep-border-strong);line-height:1.1;">{PROVISIONAL_PRICE[tier.tier]} €</span>
							<span style="font-size:13px;color:var(--mep-fg-3);">{$t('billing.perMonth')}</span>
						</div>
						<div style="margin-top:8px;">
							<span style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:500;
								letter-spacing:0.02em;text-transform:uppercase;color:var(--mep-fg-3);
								border:1px dashed var(--mep-border-strong);border-radius:var(--mep-r-tag);padding:1px 5px;">
								{$t('billing.provisional')}
							</span>
						</div>
					</div>

					<div style="font-size:13px;color:var(--mep-fg-2);line-height:1.45;min-height:34px;">{$t(copy.tagline)}</div>

					<form method="POST" action="?/checkout">
						<input type="hidden" name="tier" value={tier.tier} />
						<input type="hidden" name="idempotency_key" value={idemKeyFor(tier.tier)} />
						<button type="submit" class={isRecommended ? 'btn btn-primary' : 'btn btn-secondary'} disabled={tier.isCurrent}
							style="height:36px;justify-content:center;width:100%;opacity:{tier.isCurrent ? 0.5 : 1};">
							{tier.isCurrent ? $t('billing.currentPlan') : $ti('billing.choose', { name: tier.name })}
						</button>
					</form>

					<div style="height:1px;background:var(--mep-divider);"></div>

					<div style="display:flex;flex-direction:column;gap:8px;">
						{#if copy.inherits}
							<div style="font-size:12px;font-weight:500;color:var(--mep-fg-2);">{$t(copy.inherits)}</div>
						{/if}
						{#each copy.bullets(tier.monthlyInvoiceQuota) as bullet}
							<div style="display:flex;gap:8px;align-items:flex-start;font-size:13px;color:var(--mep-fg-2);">
								<span style="color:{isRecommended ? 'var(--mep-acc)' : 'var(--mep-fg-3)'};margin-top:1px;flex-shrink:0;">
									<Check size={14} />
								</span>
								<span style="line-height:1.4;">
									{bullet.interpolate ? $ti(bullet.key, bullet.interpolate) : $t(bullet.key)}
								</span>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>

		<div class="card" style="overflow:hidden;">
			<div style="padding:16px 20px 14px;border-bottom:1px solid var(--mep-divider);">
				<div style="font-size:16px;font-weight:600;color:var(--mep-fg);">{$t('billing.matrixTitle')}</div>
				<div style="font-size:13px;color:var(--mep-fg-2);margin-top:3px;">{$t('billing.matrixSub')}</div>
			</div>
			<table class="tbl" style="table-layout:fixed;">
				<thead>
					<tr>
						<th style="width:auto;"></th>
						{#each matrixCols as col}
							<th style="width:110px;text-align:center;text-transform:none;font-size:13px;font-weight:600;
								color:{col.id === 'pro' ? 'var(--mep-acc)' : 'var(--mep-fg)'};letter-spacing:-0.01em;
								background:{col.id === 'pro' ? 'var(--mep-acc-soft)' : 'transparent'};">
								{col.name}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each matrixGroups as group}
						<tr>
							<td colspan={matrixCols.length + 1} style="height:38px;background:var(--mep-surface-2);vertical-align:middle;
								border-top:1px solid var(--mep-divider);">
								<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
									<span class="label" style="color:var(--mep-fg-2);">{group.title}</span>
									{#if group.note}
										<span style="font-size:11.5px;color:var(--mep-fg-3);">{group.note}</span>
									{/if}
								</div>
							</td>
						</tr>
						{#each group.rows as row}
							<tr>
								<td style="font-size:13px;color:var(--mep-fg);">{row.label}</td>
								{#each matrixCols as col}
									{@const value = row.cell(col)}
									<td style="width:110px;text-align:center;vertical-align:middle;
										background:{col.id === 'pro' ? 'var(--mep-acc-soft)' : 'transparent'};">
										{#if value === true}
											<span style="color:var(--mep-acc);display:inline-flex;"><Check size={15} /></span>
										{:else if value === false}
											<span style="color:var(--mep-fg-4);font-size:14px;line-height:1;">–</span>
										{:else}
											<span class="num" style="font-size:12.5px;color:var(--mep-fg-2);font-weight:500;">{value}</span>
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
</div>
