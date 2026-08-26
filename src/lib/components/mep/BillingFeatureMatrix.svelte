<script lang="ts">
	import { t, ti } from '$lib/i18n';
	import Check from '@lucide/svelte/icons/check';
	import { MATRIX_GROUPS, type MatrixColumn, type MatrixFeatures } from '$lib/billing-plans';

	const { trialTier, tiers }: {
		trialTier: { monthlyInvoiceQuota: number | null; maxLocations: number; features: MatrixFeatures };
		tiers: { tier: string; nameKey: string; monthlyInvoiceQuota: number | null; maxLocations: number; features: MatrixFeatures }[];
	} = $props();

	const matrixCols = $derived<MatrixColumn[]>([
		{ id: 'trial', name: $t('billing.tier.trial.name'), quota: trialTier.monthlyInvoiceQuota, maxLocations: trialTier.maxLocations, features: trialTier.features },
		...tiers.map(tr => ({ id: tr.tier, name: $t(tr.nameKey), quota: tr.monthlyInvoiceQuota, maxLocations: tr.maxLocations, features: tr.features })),
	]);
</script>

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
			{#each MATRIX_GROUPS as group}
				<tr>
					<td colspan={matrixCols.length + 1} style="height:38px;background:var(--mep-surface-2);vertical-align:middle;
						border-top:1px solid var(--mep-divider);">
						<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
							<span class="label" style="color:var(--mep-fg-2);">{$t(group.titleKey)}</span>
							{#if group.noteKey}
								<span style="font-size:11.5px;color:var(--mep-fg-3);">{$t(group.noteKey)}</span>
							{/if}
						</div>
					</td>
				</tr>
				{#each group.rows as row}
					<tr>
						<td style="font-size:13px;color:var(--mep-fg);">{$t(row.labelKey)}</td>
						{#each matrixCols as col}
							{@const value = row.cell(col)}
							<td style="width:110px;text-align:center;vertical-align:middle;
								background:{col.id === 'pro' ? 'var(--mep-acc-soft)' : 'transparent'};">
								{#if value === true}
									<span style="color:var(--mep-acc);display:inline-flex;"><Check size={15} /></span>
								{:else if value === false}
									<span style="color:var(--mep-fg-4);font-size:14px;line-height:1;">–</span>
								{:else if value === null}
									<span class="num" style="font-size:12.5px;color:var(--mep-fg-2);font-weight:500;">{$t('billing.unlimited')}</span>
								{:else if typeof value === 'object'}
									<span class="num" style="font-size:12.5px;color:var(--mep-fg-2);font-weight:500;">{$ti('billing.upTo', { n: value.upTo })}</span>
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
