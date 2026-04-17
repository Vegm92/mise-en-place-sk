<script lang="ts">
	import type { PageData } from './$types';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';

	let { data }: { data: PageData } = $props();
</script>

{#if !data.overdue.length && !data.due_soon.length}
	<p class="text-center py-12 text-muted-foreground text-[.9rem]">No pending invoices due in the next 7 days.</p>
{:else}
	<div class="flex gap-3 mb-5 flex-wrap">
		{#if data.overdue.length}
			<div class="bg-red-50 border border-red-200 rounded-lg py-[.55rem] px-[.9rem] text-[.8rem] text-secondary-foreground">
				<strong class="text-destructive">{data.overdue.length}</strong> overdue
			</div>
		{/if}
		<div class="bg-card border border-border rounded-lg py-[.55rem] px-[.9rem] text-[.8rem] text-secondary-foreground">
			<strong>{data.due_soon.length}</strong> due this week
		</div>
		<div class="bg-card border border-border rounded-lg py-[.55rem] px-[.9rem] text-[.8rem] text-secondary-foreground">
			Total pending: <strong>{Math.round(data.total_amount)} EUR</strong>
		</div>
	</div>

	<Card.Root>
		{#if data.overdue.length}
			<div class="text-[.68rem] font-bold tracking-[.07em] uppercase text-muted-foreground px-4 py-2 bg-secondary border-b border-border">Overdue</div>
			{#each data.overdue as r (r.id)}
				<div class="grid grid-cols-[1fr_120px_100px_90px_auto] items-center gap-3 px-4 py-[.65rem] border-b border-secondary hover:bg-[#faf8fc]">
					<div>
						<p class="font-semibold text-[.875rem]">{r.supplier_name ?? '—'}</p>
						<p class="text-[.75rem] text-muted-foreground mt-[.1rem]">{r.invoice_number ?? 'No invoice #'}</p>
					</div>
					<p class="font-bold text-[.875rem] text-right">{Math.round(r.display_amount)} EUR</p>
					<p class="text-[.78rem] text-secondary-foreground text-right">{r.due_date}</p>
					<Badge class="bg-red-50 text-red-700 border-transparent">{Math.abs(r.days_delta)}d overdue</Badge>
					<form method="post" action="?/markPaid">
						<input type="hidden" name="invoiceId" value={r.id} />
						<button type="submit" class="text-[.72rem] font-semibold py-1 px-[.65rem] bg-green-50 text-green-700 border-none rounded cursor-pointer hover:bg-green-100 whitespace-nowrap">✓ Mark paid</button>
					</form>
				</div>
			{/each}
		{/if}

		{#if data.due_soon.length}
			<div class="text-[.68rem] font-bold tracking-[.07em] uppercase text-muted-foreground px-4 py-2 bg-secondary border-b border-border">Due this week</div>
			{#each data.due_soon as r (r.id)}
				<div class="grid grid-cols-[1fr_120px_100px_90px_auto] items-center gap-3 px-4 py-[.65rem] border-b border-secondary last:border-0 hover:bg-[#faf8fc]">
					<div>
						<p class="font-semibold text-[.875rem]">{r.supplier_name ?? '—'}</p>
						<p class="text-[.75rem] text-muted-foreground mt-[.1rem]">{r.invoice_number ?? 'No invoice #'}</p>
					</div>
					<p class="font-bold text-[.875rem] text-right">{Math.round(r.display_amount)} EUR</p>
					<p class="text-[.78rem] text-secondary-foreground text-right">{r.due_date}</p>
					<Badge class="bg-[var(--color-amber-bg)] text-[var(--color-amber)] border-transparent">{r.days_delta}d left</Badge>
					<form method="post" action="?/markPaid">
						<input type="hidden" name="invoiceId" value={r.id} />
						<button type="submit" class="text-[.72rem] font-semibold py-1 px-[.65rem] bg-green-50 text-green-700 border-none rounded cursor-pointer hover:bg-green-100 whitespace-nowrap">✓ Mark paid</button>
					</form>
				</div>
			{/each}
		{/if}
	</Card.Root>
{/if}
