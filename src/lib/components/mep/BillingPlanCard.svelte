<script lang="ts">
	import { t, ti } from '$lib/i18n';
	import Check from '@lucide/svelte/icons/check';
	import { PROVISIONAL_PRICE, TIER_COPY, type TierId } from '$lib/billing-plans';

	const { tier, available, switchable, isRecommended }: {
		tier: {
			tier: string;
			name: string;
			monthlyInvoiceQuota: number | null;
			isCurrent: boolean;
		};
		available: boolean;
		switchable: boolean;
		isRecommended: boolean;
	} = $props();

	const copy = $derived(TIER_COPY[tier.tier as TierId]);
	const price = $derived(PROVISIONAL_PRICE[tier.tier as TierId]);
	const idempotencyKey = crypto.randomUUID();
</script>

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
				border-bottom:2px dotted var(--mep-border-strong);line-height:1.1;">{price} €</span>
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

	<form method="POST" action={switchable ? '?/portal' : '?/checkout'}>
		<input type="hidden" name="tier" value={tier.tier} />
		<input type="hidden" name="idempotency_key" value={idempotencyKey} />
		<button type="submit" class={isRecommended ? 'btn btn-primary' : 'btn btn-secondary'}
			disabled={tier.isCurrent || !available}
			style="height:36px;justify-content:center;width:100%;opacity:{(tier.isCurrent || !available) ? 0.5 : 1};">
			{tier.isCurrent ? $t('billing.currentPlan') : $ti(switchable ? 'billing.switchTo' : 'billing.choose', { name: tier.name })}
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
