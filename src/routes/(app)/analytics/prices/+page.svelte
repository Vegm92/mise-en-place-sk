<script lang="ts">
	import type { PageData } from './$types';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';

	let { data }: { data: PageData } = $props();

	function truncate(str: string, len: number) {
		return str.length > len ? str.slice(0, len) + '…' : str;
	}
	function fmtPrice(n: number) { return n.toFixed(2); }
</script>

<!-- KPI strip -->
<div class="grid grid-cols-2 gap-3 mb-6 max-md:grid-cols-1">
	<Card.Root class="py-4 px-[1.1rem]">
		<p class="text-[.65rem] font-bold tracking-[.07em] uppercase text-muted-foreground mb-[.3rem]">Biggest Increase</p>
		{#if data.top_increases.length}
			{@const t = data.top_increases[0]}
			<p class="text-base font-bold text-destructive">↑ {t.change_pct}%</p>
			<p class="text-[.72rem] text-muted-foreground">{truncate(t.description, 32)}</p>
			<p class="text-[.72rem] text-muted-foreground">{t.supplier_name}</p>
		{:else}
			<p class="text-[.85rem] font-bold text-muted-foreground">—</p>
			<p class="text-[.72rem] text-muted-foreground">Not enough data yet</p>
		{/if}
	</Card.Root>
	<Card.Root class="py-4 px-[1.1rem]">
		<p class="text-[.65rem] font-bold tracking-[.07em] uppercase text-muted-foreground mb-[.3rem]">Biggest Decrease</p>
		{#if data.top_decreases.length}
			{@const t = data.top_decreases[0]}
			<p class="text-base font-bold text-green-700">↓ {Math.abs(t.change_pct ?? 0).toFixed(1)}%</p>
			<p class="text-[.72rem] text-muted-foreground">{truncate(t.description, 32)}</p>
			<p class="text-[.72rem] text-muted-foreground">{t.supplier_name}</p>
		{:else}
			<p class="text-[.85rem] font-bold text-muted-foreground">—</p>
			<p class="text-[.72rem] text-muted-foreground">Not enough data yet</p>
		{/if}
	</Card.Root>
</div>

<!-- Filter -->
<form method="get" action="/analytics/prices" class="flex gap-2 flex-wrap items-end mb-3">
	<div>
		<Label class="text-[.72rem] mb-1">Supplier</Label>
		<select name="supplier_id" class="h-8 rounded-md border border-border bg-card px-2 text-[.8rem] font-[inherit] text-foreground focus:outline-none focus:border-primary">
			<option value="">All suppliers</option>
			{#each data.suppliers as s}
				<option value={s.id} selected={data.selected_supplier === s.id}>{s.name}</option>
			{/each}
		</select>
	</div>
	<Button type="submit" class="h-8 text-[.8rem]">Filter</Button>
	{#if data.selected_supplier}
		<a href="/analytics/prices" class="h-8 flex items-center border border-border rounded-md px-3 text-[.8rem] text-secondary-foreground bg-card no-underline hover:bg-secondary">Clear</a>
	{/if}
</form>

<!-- Table -->
<Card.Root>
	<Card.Header class="py-[.7rem] px-4 border-b flex-row items-center justify-between space-y-0">
		<Card.Title class="text-[.72rem] font-bold tracking-[.06em] uppercase text-muted-foreground">Price History</Card.Title>
		<span class="text-[.72rem] text-muted-foreground">{data.items.length} item{data.items.length !== 1 ? 's' : ''}</span>
	</Card.Header>
	<div class="overflow-x-auto">
		{#if data.items.length}
			<table class="w-full border-collapse text-[.82rem] min-w-[560px]">
				<thead>
					<tr>
						{#each ['Description','Supplier','Unit','Latest Price','Prev Price','Change','Last Seen'] as h}
							<th class="text-left py-2 px-3 bg-secondary text-[.68rem] font-bold uppercase tracking-[.04em] text-secondary-foreground whitespace-nowrap">{h}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each data.items as item}
						<tr class="hover:bg-[#faf8fc]">
							<td class="py-[.55rem] px-3 border-t border-border font-semibold">{item.description}</td>
							<td class="py-[.55rem] px-3 border-t border-border text-muted-foreground text-[.78rem]">{item.supplier_name}</td>
							<td class="py-[.55rem] px-3 border-t border-border text-muted-foreground text-[.75rem]">{item.unit ?? '—'}</td>
							<td class="py-[.55rem] px-3 border-t border-border font-semibold">{fmtPrice(item.latest_price)} <span class="text-[.72rem] text-muted-foreground">EUR</span></td>
							<td class="py-[.55rem] px-3 border-t border-border text-muted-foreground">{item.prev_price != null ? fmtPrice(item.prev_price) : '—'}</td>
							<td class="py-[.55rem] px-3 border-t border-border">
								{#if item.change_pct != null}
									{#if item.change_pct > 0}
										<span class="text-destructive font-bold">↑ {item.change_pct}%</span>
									{:else if item.change_pct < 0}
										<span class="text-green-700 font-bold">↓ {Math.abs(item.change_pct).toFixed(1)}%</span>
									{:else}
										<span class="text-muted-foreground">→ 0%</span>
									{/if}
								{:else}
									<span class="text-muted-foreground">—</span>
								{/if}
							</td>
							<td class="py-[.55rem] px-3 border-t border-border text-muted-foreground text-[.75rem] whitespace-nowrap">{item.latest_date ?? '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p class="text-center py-16 text-muted-foreground text-[.9rem]">No line item prices recorded yet. Upload some invoices to start tracking.</p>
		{/if}
	</div>
</Card.Root>
