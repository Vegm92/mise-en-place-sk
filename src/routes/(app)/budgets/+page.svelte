<script lang="ts">
	import type { PageData } from './$types';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	let { data }: { data: PageData } = $props();
</script>

<div class="max-w-[560px]">
	<Card.Root>
		<Card.Header class="py-[.7rem] px-4 border-b">
			<Card.Title class="text-[.72rem] font-bold tracking-[.06em] uppercase text-muted-foreground">Monthly Category Budgets</Card.Title>
		</Card.Header>
		<Card.Content class="px-4 py-[.9rem]">
			<form method="post" action="?/save">
				{#each data.categories as category}
					<div class="flex items-center gap-4 py-[.6rem] border-b border-border last:border-0">
						<span class="flex-1 text-[.875rem] font-medium">{category}</span>
						<div class="flex items-center gap-[.3rem]">
							<span class="text-[.875rem] text-secondary-foreground shrink-0">€</span>
							<Input type="number" step="0.01" min="0" placeholder="No limit"
								   name={category} value={data.budgets[category] ?? ''}
								   class="w-[130px] h-9 text-[.875rem]" />
						</div>
					</div>
				{/each}
				<div class="mt-4">
					<Button type="submit">Save budgets</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
