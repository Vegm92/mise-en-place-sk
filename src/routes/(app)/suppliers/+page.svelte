<script lang="ts">
	import type { PageData } from './$types';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';

	let { data }: { data: PageData } = $props();

	const badgeClass: Record<string, string> = {
		overdue:  'bg-red-50 text-red-700 border-transparent',
		due_soon: 'bg-[var(--color-amber-bg)] text-[var(--color-amber)] border-transparent',
		paid_up:  'bg-green-50 text-green-700 border-transparent',
	};
</script>

{#if !data.suppliers.length}
	<p class="text-center py-16 text-muted-foreground">No suppliers yet. Upload an invoice to add one.</p>
{:else}
	<div class="grid grid-cols-3 gap-[.85rem] max-[900px]:grid-cols-2 max-[600px]:grid-cols-1">
		{#each data.suppliers as s (s.id)}
			<Card.Root class="p-[1rem_1.1rem] transition-[border-color,box-shadow] hover:border-primary hover:shadow-md">
				<p class="text-[.62rem] font-bold tracking-[.07em] uppercase mb-[.2rem]" style="color:{s.color}">{s.category}</p>
				<p class="text-[.95rem] font-semibold mb-[.65rem]">{s.name}</p>
				<div class="grid grid-cols-3 gap-[.4rem] mb-[.65rem]">
					<div>
						<p class="text-[.62rem] text-muted-foreground">This month</p>
						<p class="text-[.82rem] font-semibold">{Math.round(s.month_spend)}</p>
					</div>
					<div>
						<p class="text-[.62rem] text-muted-foreground">Open inv.</p>
						<p class="text-[.82rem] font-semibold">{s.open_count}</p>
					</div>
					<div>
						<p class="text-[.62rem] text-muted-foreground">Last invoice</p>
						<p class="text-[.82rem] font-semibold">{s.last_invoice_date ?? '—'}</p>
					</div>
				</div>
				<div class="flex items-center justify-between">
					<Badge class={badgeClass[s.badge] ?? ''}>
						{#if s.badge === 'overdue'}Overdue{:else if s.badge === 'due_soon'}Due soon{:else}Paid up{/if}
					</Badge>
					<form method="post" action="?/setCategory">
						<input type="hidden" name="supplier_id" value={s.id} />
						<select name="category"
							class="text-[.75rem] py-[.28rem] px-2 border border-border rounded-md bg-secondary text-secondary-foreground cursor-pointer font-[inherit] focus:outline-none focus:border-primary"
							onchange={(e) => (e.currentTarget as HTMLSelectElement).form?.submit()}>
							<option value="">— set category —</option>
							{#each data.categories as cat}
								<option value={cat} selected={s.category === cat}>{cat}</option>
							{/each}
						</select>
					</form>
				</div>
			</Card.Root>
		{/each}
	</div>
{/if}
