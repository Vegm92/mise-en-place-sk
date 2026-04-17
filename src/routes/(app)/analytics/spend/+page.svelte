<script lang="ts">
	import type { PageData } from './$types';
	import * as Card from '$lib/components/ui/card';

	let { data }: { data: PageData } = $props();
</script>

<div class="flex gap-[.35rem] mb-5 flex-wrap">
	{#each [['month','This Month'],['quarter','Quarter'],['half','6 Months'],['all','All Time']] as [val, label]}
		<a href="?period={val}"
		   class="text-[.75rem] font-semibold py-[.3rem] px-[.7rem] rounded-full border no-underline transition-colors
		          {data.period === val ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:bg-secondary hover:text-secondary-foreground'}">
			{label}
		</a>
	{/each}
</div>

<div class="grid grid-cols-4 gap-3 mb-5 max-md:grid-cols-2">
	{#each [
		{ label: 'Total spend', value: `€${Math.round(data.kpis.total_items_spend ?? 0).toLocaleString()}` },
		{ label: 'Line items', value: data.kpis.total_line_items },
		{ label: 'Unique items', value: data.kpis.unique_items },
		{ label: 'Avg items/invoice', value: data.kpis.avg_invoice_items != null ? data.kpis.avg_invoice_items.toFixed(1) : '—' },
	] as k}
		<Card.Root class="py-[.9rem] px-4">
			<p class="text-[.62rem] font-bold tracking-[.07em] uppercase text-muted-foreground mb-[.3rem]">{k.label}</p>
			<p class="text-[1.2rem] font-bold">{k.value}</p>
		</Card.Root>
	{/each}
</div>

<div class="grid grid-cols-[3fr_2fr] gap-3 items-start max-md:grid-cols-1">
	<Card.Root>
		<Card.Header class="py-[.7rem] px-4 border-b flex-row items-center justify-between space-y-0">
			<Card.Title class="text-[.72rem] font-bold tracking-[.06em] uppercase text-muted-foreground">Top Items by Spend</Card.Title>
		</Card.Header>
		<Card.Content class="px-4 py-[.9rem]">
			{#if !data.top_items.length}
				<p class="text-muted-foreground text-[.85rem]">No line item data for this period.</p>
			{:else}
				{#each data.top_items as item (item.description)}
					<div class="flex items-center gap-3 mb-[.55rem]">
						<span class="w-40 text-[.78rem] shrink-0 whitespace-nowrap overflow-hidden text-ellipsis" title={item.description}>{item.description}</span>
						<div class="flex-1 bg-border rounded-sm h-2"><div class="h-full rounded-sm bg-primary" style="width:{item.pct}%"></div></div>
						<span class="w-[70px] text-right text-[.78rem] font-semibold shrink-0">€{Math.round(item.total_spend)}</span>
					</div>
				{/each}
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header class="py-[.7rem] px-4 border-b flex-row items-center justify-between space-y-0">
			<Card.Title class="text-[.72rem] font-bold tracking-[.06em] uppercase text-muted-foreground">By Category</Card.Title>
		</Card.Header>
		<Card.Content class="px-4 py-[.9rem]">
			{#if !data.category_spend.length}
				<p class="text-muted-foreground text-[.85rem]">No data.</p>
			{:else}
				{#each data.category_spend as cat (cat.category)}
					<div class="flex items-center gap-3 mb-[.55rem]">
						<span class="w-40 text-[.78rem] font-semibold shrink-0 whitespace-nowrap overflow-hidden text-ellipsis" style="color:{cat.color}" title={cat.category}>{cat.category}</span>
						<div class="flex-1 bg-border rounded-sm h-2"><div class="h-full rounded-sm" style="width:{cat.pct}%;background:{cat.color}"></div></div>
						<span class="w-[70px] text-right text-[.78rem] font-semibold shrink-0">€{Math.round(cat.total)}</span>
					</div>
				{/each}
			{/if}
		</Card.Content>
	</Card.Root>
</div>
