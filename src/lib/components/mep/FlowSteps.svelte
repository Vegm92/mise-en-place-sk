<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import { t } from '$lib/i18n';

	const { active = 0, size = 'md' }: { active?: number; size?: 'sm' | 'md' } = $props();

	const STEPS = $derived([$t('steps.upload'), $t('steps.extract'), $t('steps.review')]);

	const dot = $derived(size === 'sm' ? 18 : 22);
	const label = $derived(size === 'sm' ? 12 : 13);
	const gap = $derived(size === 'sm' ? 6 : 12);
	const rule = $derived(size === 'sm' ? 14 : 28);
</script>

<div style="display:flex;align-items:center;gap:{gap}px;">
	{#each STEPS as step, i}
		{@const done = i < active}
		{@const current = i === active}
		<div style="display:flex;align-items:center;gap:{size === 'sm' ? 5 : 8}px;">
			<span class="num" style="
				width:{dot}px;height:{dot}px;border-radius:{dot / 2}px;
				background:{current || done ? 'var(--mep-acc)' : 'var(--mep-surface-2)'};
				color:{current || done ? 'var(--mep-acc-fg)' : 'var(--mep-fg-3)'};
				font-size:{size === 'sm' ? 10 : 11}px;font-weight:600;
				display:inline-flex;align-items:center;justify-content:center;
				border:{current || done ? 'none' : '1px solid var(--mep-divider)'};
				flex-shrink:0;
			">
				{#if done}
					<Check size={size === 'sm' ? 10 : 12} />
				{:else}
					{i + 1}
				{/if}
			</span>
			<span style="font-size:{label}px;font-weight:{current ? 600 : 400};color:{current ? 'var(--mep-fg)' : 'var(--mep-fg-3)'};">{step}</span>
		</div>
		{#if i < STEPS.length - 1}
			<div style="width:{rule}px;height:1px;background:var(--mep-divider);flex-shrink:0;"></div>
		{/if}
	{/each}
</div>
