<script lang="ts">
	import { t, ti } from '$lib/i18n';
	import Check from '@lucide/svelte/icons/check';
	import { MATRIX_GROUPS, type MatrixColumn, type MatrixFeatures } from '$lib/billing-plans';

	const { trialTier, tiers }: {
		trialTier: { monthlyInvoiceQuota: number | null; maxLocations: number; maxRecipes: number | null; features: MatrixFeatures };
		tiers: { tier: string; nameKey: string; monthlyInvoiceQuota: number | null; maxLocations: number; maxRecipes: number | null; features: MatrixFeatures }[];
	} = $props();

	const matrixCols = $derived<MatrixColumn[]>([
		{ id: 'trial', name: t('billing.tier.trial.name'), quota: trialTier.monthlyInvoiceQuota, maxLocations: trialTier.maxLocations, maxRecipes: trialTier.maxRecipes, features: trialTier.features },
		...tiers.map(tr => ({ id: tr.tier, name: t(tr.nameKey), quota: tr.monthlyInvoiceQuota, maxLocations: tr.maxLocations, maxRecipes: tr.maxRecipes, features: tr.features })),
	]);
</script>

<div class="card overflow-hidden">
	<div class="px-5 pt-4 pb-3.5 border-b border-divider">
		<div class="text-[16px] font-semibold text-fg">{t('billing.matrixTitle')}</div>
		<div class="text-[13px] text-fg-2 mt-[3px]">{t('billing.matrixSub')}</div>
	</div>
	<table class="tbl" style="table-layout:fixed;">
		<thead>
			<tr>
				<th style="width:auto;"></th>
				{#each matrixCols as col}
					<th class="w-[110px] text-center normal-case text-[13px] font-semibold tracking-[-0.01em]"
						class:text-acc={col.id === 'pro'} class:text-fg={col.id !== 'pro'}
						class:bg-acc-soft={col.id === 'pro'}>
						{col.name}
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each MATRIX_GROUPS as group}
				<tr>
					<td colspan={matrixCols.length + 1} class="h-[38px] bg-surface-2 align-middle border-t border-divider">
						<div class="flex items-center gap-2.5 flex-wrap">
							<span class="label text-fg-2">{t(group.titleKey)}</span>
							{#if group.noteKey}
								<span class="text-[11.5px] text-fg-3">{t(group.noteKey)}</span>
							{/if}
						</div>
					</td>
				</tr>
				{#each group.rows as row}
					<tr>
						<td class="text-[13px] text-fg">{t(row.labelKey)}</td>
						{#each matrixCols as col}
							{@const value = row.cell(col)}
							<td class="w-[110px] text-center align-middle" class:bg-acc-soft={col.id === 'pro'}>
								{#if value === true}
									<span class="text-acc inline-flex"><Check size={15} /></span>
								{:else if value === false}
									<span class="text-fg-4 text-[14px] leading-none">–</span>
								{:else if value === null}
									<span class="num text-[12.5px] text-fg-2 font-medium">{t('billing.unlimited')}</span>
								{:else if typeof value === 'object'}
									<span class="num text-[12.5px] text-fg-2 font-medium">{ti('billing.upTo', { n: value.upTo })}</span>
								{:else}
									<span class="num text-[12.5px] text-fg-2 font-medium">{value}</span>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			{/each}
		</tbody>
	</table>
</div>
