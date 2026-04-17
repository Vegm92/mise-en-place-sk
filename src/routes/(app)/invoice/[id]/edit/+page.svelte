<script lang="ts">
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';

	let { data }: { data: PageData } = $props();

	const { invoice } = $derived(data);

	type Row = { description: string | null; quantity: number | string | null; unit: string | null; unit_price: number | string | null; total_price: number | string | null };
	// untrack: intentional snapshot for editable form — $state must start from server data, not stay reactive
	let items = $state<Row[]>(untrack(() => {
		const li = data.lineItems;
		return li.length > 0
			? li.map((l) => ({ description: l.description, quantity: l.quantity, unit: l.unit, unit_price: l.unit_price, total_price: l.total_price }))
			: [{ description: '', quantity: '', unit: '', unit_price: '', total_price: '' }];
	}));

	function addRow() {
		items = [...items, { description: '', quantity: '', unit: '', unit_price: '', total_price: '' }];
	}
	function removeRow(idx: number) {
		items = items.filter((_, i) => i !== idx);
	}
</script>

<div class="max-w-[700px]">
	<form method="post" action="?/save" class="flex flex-col gap-4">
		<Card.Root class="p-6">
			<p class="text-[.75rem] font-bold uppercase tracking-[.05em] text-secondary-foreground mb-4">Invoice details</p>
			<div class="grid grid-cols-2 gap-4">
				<div class="flex flex-col gap-1">
					<Label class="text-[.72rem]">Supplier</Label>
					<Input type="text" name="supplier_name" value={invoice.supplier_name ?? ''} />
				</div>
				<div class="flex flex-col gap-1">
					<Label class="text-[.72rem]">Invoice number</Label>
					<Input type="text" name="invoice_number" value={invoice.invoice_number ?? ''} />
				</div>
				<div class="flex flex-col gap-1">
					<Label class="text-[.72rem]">Invoice date</Label>
					<Input type="date" name="invoice_date" value={invoice.invoice_date ?? ''} />
				</div>
				<div class="flex flex-col gap-1">
					<Label class="text-[.72rem]">Due date</Label>
					<Input type="date" name="due_date" value={invoice.due_date ?? ''} />
				</div>
				<div class="flex flex-col gap-1">
					<Label class="text-[.72rem]">Total amount</Label>
					<Input type="text" name="total_amount" value={String(invoice.total_amount ?? '')} />
				</div>
				<div class="col-span-2 flex flex-col gap-1">
					<Label class="text-[.72rem]" for="notes">
						Notes <span class="font-normal text-muted-foreground text-[.75em]">(optional · max 250 chars)</span>
					</Label>
					<Textarea id="notes" name="notes" maxlength={250} rows={2} class="resize-y" value={invoice.notes ?? ''} />
				</div>
			</div>
		</Card.Root>

		<Card.Root class="p-6">
			<p class="text-[.75rem] font-bold uppercase tracking-[.05em] text-secondary-foreground mb-4">Line items</p>
			<div class="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 items-end mb-[.35rem]">
				{#each ['Description','Qty','Unit','Unit price','Total',''] as h}
					<span class="text-[.75rem] font-semibold text-secondary-foreground">{h}</span>
				{/each}
			</div>
			{#each items as item, idx (idx)}
				<div class="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 items-end mb-2">
					<Input type="text" name="line_descriptions" value={String(item.description ?? '')} class="h-8 text-sm" />
					<Input type="text" name="line_quantities" value={String(item.quantity ?? '')} class="h-8 text-sm" />
					<Input type="text" name="line_units" value={String(item.unit ?? '')} class="h-8 text-sm" />
					<Input type="text" name="line_unit_prices" value={String(item.unit_price ?? '')} class="h-8 text-sm" />
					<Input type="text" name="line_total_prices" value={String(item.total_price ?? '')} class="h-8 text-sm" />
					<button type="button" class="bg-transparent border-none cursor-pointer text-destructive text-lg px-[.4rem] pb-1" onclick={() => removeRow(idx)}>×</button>
				</div>
			{/each}
			<button type="button" onclick={addRow}
					class="text-[.8125rem] font-medium text-secondary-foreground bg-transparent border border-border rounded-md py-[.4rem] px-3 cursor-pointer mt-1 hover:bg-secondary">
				+ Add line
			</button>
		</Card.Root>

		<div class="flex gap-3">
			<Button type="submit">Save changes</Button>
			<a href="/invoices" class="h-9 flex items-center border border-border rounded-md px-4 text-[.875rem] text-secondary-foreground bg-card no-underline hover:bg-secondary">Cancel</a>
		</div>
	</form>
</div>
