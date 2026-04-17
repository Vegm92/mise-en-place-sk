<script lang="ts">
	import type { PageData } from './$types';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';

	let { data }: { data: PageData } = $props();
</script>

<Card.Root>
	<Card.Header class="py-[.7rem] px-4 border-b flex-row items-center justify-between space-y-0">
		<Card.Title class="text-[.72rem] font-bold tracking-[.06em] uppercase text-muted-foreground">Export invoices</Card.Title>
		<a href="/invoices" class="text-[.72rem] text-primary no-underline hover:underline">← Invoices</a>
	</Card.Header>
	<Card.Content class="px-4 py-[.9rem]">
		<form method="GET" action="/invoices/export/download">
			<div class="grid grid-cols-2 gap-4 max-[600px]:grid-cols-1">
				<div class="col-span-2 max-[600px]:col-span-1">
					<Label class="text-[.72rem] mb-1" for="date_from">Date range</Label>
					<div class="flex gap-[.6rem] items-center">
						<input id="date_from" type="date" name="date_from"
							   class="flex-1 h-9 rounded-md border border-border bg-card px-3 text-[.875rem] font-[inherit] text-foreground focus:outline-none focus:border-primary" />
						<span class="text-muted-foreground text-[.8rem]">→</span>
						<input type="date" name="date_to"
							   class="flex-1 h-9 rounded-md border border-border bg-card px-3 text-[.875rem] font-[inherit] text-foreground focus:outline-none focus:border-primary" />
					</div>
					<p class="text-[.63rem] text-muted-foreground mt-1">Leave blank to include all dates</p>
				</div>

				<div>
					<Label class="text-[.72rem] mb-1" for="supplier_id">Supplier</Label>
					<select id="supplier_id" name="supplier_id"
							class="w-full h-9 rounded-md border border-border bg-card px-2 text-[.875rem] font-[inherit] text-foreground focus:outline-none focus:border-primary">
						<option value="">All suppliers</option>
						{#each data.suppliers as s (s.id)}
							<option value={s.id}>{s.name}</option>
						{/each}
					</select>
				</div>

				<div>
					<Label class="text-[.72rem] mb-1" for="status-all">Status</Label>
					<div class="flex gap-[.4rem] flex-wrap">
						{#each [['','All'],['paid','Paid'],['pending','Pending']] as [val, lbl]}
							<label class="flex items-center gap-1 text-[.75rem] font-medium cursor-pointer">
								<input type="radio" name="status" value={val} checked={val === ''} class="accent-primary" />
								{lbl}
							</label>
						{/each}
					</div>
				</div>

				<div class="col-span-2 flex gap-[.6rem] items-center max-[600px]:col-span-1">
					<a href="/invoices" class="h-9 flex items-center border border-border rounded-md px-4 text-[.875rem] text-secondary-foreground bg-card no-underline hover:bg-secondary">Cancel</a>
					<Button type="submit">Download CSV</Button>
				</div>
			</div>
		</form>
	</Card.Content>
</Card.Root>
