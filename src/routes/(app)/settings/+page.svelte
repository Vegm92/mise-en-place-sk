<script lang="ts">
	import type { PageData } from './$types';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	let { data }: { data: PageData } = $props();
</script>

<div class="max-w-[480px] flex flex-col gap-4">
	<Card.Root class="p-6">
		<p class="text-[.875rem] text-secondary-foreground">
			Currency is fixed to <strong>EUR (€)</strong>. Budget warning threshold can be adjusted below.
		</p>
	</Card.Root>

	<Card.Root class="p-6">
		<p class="text-[.75rem] font-bold uppercase tracking-[.05em] text-secondary-foreground mb-4">Budget Warning Threshold</p>
		<form method="post" action="?/saveThreshold" class="flex items-center gap-3">
			<Input type="number" name="value" min="1" max="99" value={data.threshold} class="w-[90px] h-9" />
			<span class="text-[.875rem] text-secondary-foreground">%</span>
			<Button type="submit">Save</Button>
		</form>
		<p class="text-[.8125rem] text-secondary-foreground mt-[.35rem]">
			Supplier cards and budget bars show a warning when spend reaches this % of the monthly budget.
		</p>
	</Card.Root>
</div>
