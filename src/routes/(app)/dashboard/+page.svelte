<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import TrendChart from '$lib/components/TrendChart.svelte';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';

	let { data }: { data: PageData } = $props();

	let remindersDismissed = $state(false);

	onMount(() => {
		remindersDismissed = sessionStorage.getItem('reminders-dismissed') === '1';
	});

	function dismissReminders() {
		remindersDismissed = true;
		sessionStorage.setItem('reminders-dismissed', '1');
	}

	function budgetStatus(pct: number, threshold: number): 'over' | 'near-limit' | 'on-track' {
		if (pct >= 100) return 'over';
		if (pct >= threshold) return 'near-limit';
		return 'on-track';
	}
	function statusColor(s: string) {
		return s === 'over' ? '#e05555' : s === 'near-limit' ? '#c8843a' : 'var(--color-primary)';
	}
	function momLabel(pct: number | null) {
		if (pct === null) return '—';
		return (pct >= 0 ? '+' : '') + pct + '%';
	}
	function momColor(pct: number | null) {
		if (pct === null) return 'var(--color-muted-foreground)';
		return pct > 10 ? '#e05555' : pct < -5 ? '#3a8c5c' : 'var(--color-foreground)';
	}

	const badgeClass: Record<string, string> = {
		pending:  'bg-[var(--color-amber-bg)] text-[var(--color-amber)] border-transparent',
		paid:     'bg-green-50 text-green-700 border-transparent',
		overdue:  'bg-red-50 text-red-700 border-transparent',
		due_soon: 'bg-[var(--color-amber-bg)] text-[var(--color-amber)] border-transparent',
		paid_up:  'bg-green-50 text-green-700 border-transparent',
	};

	// Shared layout tokens — both grids use identical cols + gap so column edges align
	const G = 'grid-cols-7 gap-3 max-[1000px]:grid-cols-4 max-[640px]:grid-cols-2';
</script>

<!-- ── KPI STRIP ── same grid-cols + gap as main so column edges align -->
<div class="grid {G} mb-3">
	<Card.Root class={data.overdue.count > 0 ? 'bg-red-50 border-red-200' : ''}>
		<Card.Content class="py-3 px-4">
			<p class="text-[.56rem] font-bold tracking-[.07em] uppercase text-muted-foreground mb-[.15rem]">Overdue</p>
			<p class="text-[1.1rem] font-bold leading-none {data.overdue.count > 0 ? 'text-destructive' : ''}">{data.overdue.count}</p>
			<p class="text-[.6rem] text-muted-foreground mt-[.12rem]">past due</p>
		</Card.Content>
	</Card.Root>
	<Card.Root class={data.due_week.count > 0 ? 'bg-[var(--color-amber-bg)] border-yellow-200' : ''}>
		<Card.Content class="py-3 px-4">
			<p class="text-[.56rem] font-bold tracking-[.07em] uppercase text-muted-foreground mb-[.15rem]">Due this week</p>
			<p class="text-[1.1rem] font-bold leading-none {data.due_week.count > 0 ? 'text-[var(--color-amber)]' : ''}">{Math.round(data.due_week.amount)}</p>
			<p class="text-[.6rem] text-muted-foreground mt-[.12rem]">EUR · {data.due_week.count} inv.</p>
		</Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Content class="py-3 px-4">
			<p class="text-[.56rem] font-bold tracking-[.07em] uppercase text-muted-foreground mb-[.15rem]">Pending</p>
			<p class="text-[1.1rem] font-bold leading-none">{Math.round(data.pending.amount)}</p>
			<p class="text-[.6rem] text-muted-foreground mt-[.12rem]">EUR · {data.pending.count} inv.</p>
		</Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Content class="py-3 px-4">
			<p class="text-[.56rem] font-bold tracking-[.07em] uppercase text-muted-foreground mb-[.15rem]">Paid this month</p>
			<p class="text-[1.1rem] font-bold leading-none">{Math.round(data.paid_month.amount)}</p>
			<p class="text-[.6rem] text-muted-foreground mt-[.12rem]">EUR · {data.paid_month.count} inv.</p>
		</Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Content class="py-3 px-4">
			<p class="text-[.56rem] font-bold tracking-[.07em] uppercase text-muted-foreground mb-[.15rem]">MoM spend</p>
			<p class="text-[1.1rem] font-bold leading-none" style="color:{momColor(data.mom.pct_change)}">{momLabel(data.mom.pct_change)}</p>
			<p class="text-[.6rem] text-muted-foreground mt-[.12rem]">vs last month</p>
		</Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Content class="py-3 px-4">
			<p class="text-[.56rem] font-bold tracking-[.07em] uppercase text-muted-foreground mb-[.15rem]">Avg invoice</p>
			<p class="text-[1.1rem] font-bold leading-none">{data.avg_invoice != null ? Math.round(data.avg_invoice) : '—'}</p>
			<p class="text-[.6rem] text-muted-foreground mt-[.12rem]">EUR</p>
		</Card.Content>
	</Card.Root>
	<Card.Root>
		<Card.Content class="py-3 px-4">
			<p class="text-[.56rem] font-bold tracking-[.07em] uppercase text-muted-foreground mb-[.15rem]">Suppliers</p>
			<p class="text-[1.1rem] font-bold leading-none">{data.supplier_count}</p>
			<p class="text-[.6rem] text-muted-foreground mt-[.12rem]">active</p>
		</Card.Content>
	</Card.Root>
</div>

<!-- ── MAIN GRID ── col-span 2/3/2 = 7 total, matching KPI grid above -->
<div class="grid {G} items-start">

	<!-- LEFT col-span-2 -->
	<div class="col-span-2 max-[1000px]:col-span-1 max-[640px]:col-span-2 flex flex-col gap-3">
		<Card.Root>
			<Card.Header class="py-[.7rem] px-4 border-b flex-row items-center justify-between space-y-0">
				<Card.Title class="text-[.72rem] font-bold tracking-[.06em] uppercase text-muted-foreground">Recent invoices</Card.Title>
				<a href="/invoices" class="text-[.72rem] text-primary no-underline hover:underline">All →</a>
			</Card.Header>
			<Card.Content class="px-4 py-[.9rem]">
				{#if data.recent_invoices.length}
					{#each data.recent_invoices as inv (inv.id)}
						<div class="flex items-center gap-2 py-[.28rem] border-b border-secondary text-[.74rem] last:border-0">
							<span class="flex-1 font-medium whitespace-nowrap overflow-hidden text-ellipsis">{inv.supplier_name ?? '—'}</span>
							<span class="text-muted-foreground w-[52px] shrink-0 text-[.68rem]">{inv.invoice_date ?? '—'}</span>
							<span class="font-semibold w-[54px] text-right shrink-0">{Math.round(inv.display_amount)}</span>
							<Badge class={badgeClass[inv.status] ?? ''}>{inv.status}</Badge>
						</div>
					{/each}
				{:else}
					<p class="text-muted-foreground text-[.8rem]">No invoices yet.</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="py-[.7rem] px-4 border-b flex-row items-center justify-between space-y-0">
				<Card.Title class="text-[.72rem] font-bold tracking-[.06em] uppercase text-muted-foreground">Budget</Card.Title>
				<a href="/budgets" class="text-[.72rem] text-primary no-underline hover:underline">Edit →</a>
			</Card.Header>
			<Card.Content class="px-4 py-[.9rem]">
				{#if data.total_budget === 0}
					<p class="text-muted-foreground text-[.8rem]">No budgets set. <a href="/budgets" class="text-primary">Set them →</a></p>
				{:else}
					<div class="mb-2">
						<div class="flex justify-between items-center mb-[.2rem]">
							<span class="text-[.66rem] text-muted-foreground">Total · {Math.round(data.total_pct_actual)}% used</span>
							<span class="text-[.62rem] text-yellow-400">⚠ {data.budget_threshold}%</span>
						</div>
						<div class="relative bg-border rounded-sm h-1.5">
							<div class="h-full rounded-sm bg-primary" style="width:{data.total_pct_bar}%"></div>
							<div class="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-yellow-400 rounded-full border-2 border-card" style="left:{data.budget_threshold}%"></div>
						</div>
						<div class="flex justify-between mt-[.15rem]">
							<span class="text-[.62rem] text-muted-foreground">{Math.round(data.total_spent)} spent</span>
							<span class="text-[.62rem] text-muted-foreground">{Math.round(data.total_budget)} limit</span>
						</div>
					</div>
					{#each data.valid_categories as cat}
						{@const spend = data.category_spend_map[cat] ?? 0}
						{@const budget = data.budgets[cat] ?? 0}
						{#if budget > 0}
							{@const pct = Math.min(Math.round(spend / budget * 100), 100)}
							{@const color = statusColor(budgetStatus(spend / budget * 100, data.budget_threshold))}
							<div class="flex items-center gap-2 mb-[.25rem]">
								<span class="w-[78px] text-[.68rem] text-secondary-foreground shrink-0 whitespace-nowrap overflow-hidden text-ellipsis" title={cat}>{cat}</span>
								<div class="flex-1 bg-border rounded-sm h-[5px]"><div class="h-full rounded-sm" style="width:{pct}%;background:{color}"></div></div>
								<span class="w-7 text-[.65rem] font-semibold text-right shrink-0" style="color:{color}">{pct}%</span>
							</div>
						{:else if spend > 0}
							<div class="flex items-center gap-2 mb-[.25rem]">
								<span class="w-[78px] text-[.68rem] text-muted-foreground shrink-0 whitespace-nowrap overflow-hidden text-ellipsis" title={cat}>{cat}</span>
								<div class="flex-1 bg-border rounded-sm h-[5px]"><div class="h-full w-full rounded-sm bg-border"></div></div>
								<span class="w-7 text-[.65rem] font-semibold text-right shrink-0 text-muted-foreground">—</span>
							</div>
						{/if}
					{/each}
				{/if}
			</Card.Content>
		</Card.Root>
	</div>

	<!-- MIDDLE col-span-3 -->
	<div class="col-span-3 max-[1000px]:col-span-2 max-[640px]:col-span-2 flex flex-col gap-3">
		<Card.Root>
			<TrendChart initialScale="monthly" />
		</Card.Root>

		{#if data.category_spend.length}
			<Card.Root>
				<Card.Header class="py-[.7rem] px-4 border-b flex-row items-center justify-between space-y-0">
					<Card.Title class="text-[.72rem] font-bold tracking-[.06em] uppercase text-muted-foreground">Category spend</Card.Title>
					<span class="text-[.68rem] text-muted-foreground">this month</span>
				</Card.Header>
				<Card.Content class="px-4 py-[.9rem]">
					{#each data.category_spend as cat (cat.category)}
						<div class="flex items-center gap-2 mb-[.28rem]">
							<span class="w-20 text-[.68rem] font-semibold shrink-0 whitespace-nowrap overflow-hidden text-ellipsis" style="color:{cat.color}" title={cat.category}>{cat.category}</span>
							<div class="flex-1 bg-border rounded-sm h-1.5"><div class="h-full rounded-sm" style="width:{cat.pct}%;background:{cat.color}"></div></div>
							<span class="w-11 text-[.66rem] font-semibold text-right shrink-0 text-secondary-foreground">€{Math.round(cat.total)}</span>
						</div>
					{/each}
				</Card.Content>
			</Card.Root>
		{/if}

		<Card.Root>
			<Card.Header class="py-[.7rem] px-4 border-b flex-row items-center justify-between space-y-0">
				<Card.Title class="text-[.72rem] font-bold tracking-[.06em] uppercase text-muted-foreground">Suppliers</Card.Title>
				<a href="/suppliers" class="text-[.72rem] text-primary no-underline hover:underline">View all →</a>
			</Card.Header>
			<Card.Content class="px-4 py-[.9rem]">
				{#if data.suppliers.length}
					<div class="grid grid-cols-2 gap-3">
						{#each data.suppliers as s (s.id)}
							<div class="border border-border rounded-md px-3 py-[.6rem] min-w-0">
								<p class="text-[.56rem] font-bold tracking-[.06em] uppercase mb-[.12rem] whitespace-nowrap overflow-hidden text-ellipsis" style="color:{s.color}">{s.category}</p>
								<p class="text-[.8rem] font-semibold mb-2 whitespace-nowrap overflow-hidden text-ellipsis">{s.name}</p>
								<div class="grid grid-cols-2 gap-[.1rem] mb-2">
									<div>
										<p class="text-[.55rem] text-muted-foreground">This month</p>
										<p class="text-[.7rem] font-semibold">{Math.round(s.month_spend)}</p>
									</div>
									<div>
										<p class="text-[.55rem] text-muted-foreground">Open inv.</p>
										<p class="text-[.7rem] font-semibold">{s.open_count}</p>
									</div>
								</div>
								<Badge class={badgeClass[s.badge] ?? ''}>
									{#if s.badge === 'overdue'}Overdue{:else if s.badge === 'due_soon'}Due soon{:else}Paid up{/if}
								</Badge>
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-muted-foreground text-[.8rem]">No suppliers yet.</p>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>

	<!-- RIGHT col-span-2 -->
	<div class="col-span-2 max-[1000px]:col-span-1 max-[640px]:col-span-2 flex flex-col gap-3">
		<Card.Root>
			<Card.Header class="py-[.7rem] px-4 border-b flex-row items-center justify-between space-y-0">
				<Card.Title class="text-[.72rem] font-bold tracking-[.06em] uppercase text-muted-foreground">Invoice aging</Card.Title>
				<span class="text-[.68rem] text-muted-foreground">pending</span>
			</Card.Header>
			<Card.Content class="px-4 py-[.9rem]">
				<div class="grid grid-cols-3 gap-3">
					<div class="bg-secondary border border-border rounded-md p-[.45rem] text-center">
						<p class="text-[1.1rem] font-bold leading-none">{data.aging.fresh}</p>
						<p class="text-[.58rem] text-muted-foreground mt-[.1rem] uppercase tracking-[.05em]">≤7d</p>
					</div>
					<div class="border rounded-md p-[.45rem] text-center {data.aging.mid > 0 ? 'border-yellow-200 bg-[var(--color-amber-bg)]' : 'bg-secondary border-border'}">
						<p class="text-[1.1rem] font-bold leading-none {data.aging.mid > 0 ? 'text-[var(--color-amber)]' : ''}">{data.aging.mid}</p>
						<p class="text-[.58rem] text-muted-foreground mt-[.1rem] uppercase tracking-[.05em]">8–30d</p>
					</div>
					<div class="border rounded-md p-[.45rem] text-center {data.aging.old > 0 ? 'border-red-200 bg-red-50' : 'bg-secondary border-border'}">
						<p class="text-[1.1rem] font-bold leading-none {data.aging.old > 0 ? 'text-destructive' : ''}">{data.aging.old}</p>
						<p class="text-[.58rem] text-muted-foreground mt-[.1rem] uppercase tracking-[.05em]">&gt;30d</p>
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		{#if data.reminders.length && !remindersDismissed}
			<Card.Root class="border-l-[3px] border-l-[var(--color-amber)]">
				<Card.Header class="py-[.7rem] px-4 border-b flex-row items-center justify-between space-y-0">
					<Card.Title class="text-[.72rem] font-bold tracking-[.06em] uppercase text-[var(--color-amber)]">🔔 Reminders</Card.Title>
					<div class="flex items-center gap-2">
						<a href="/reminders" class="text-[.72rem] text-primary no-underline hover:underline">All →</a>
						<button type="button" class="bg-transparent border-none cursor-pointer text-[.78rem] text-muted-foreground p-0 leading-none" onclick={dismissReminders}>✕</button>
					</div>
				</Card.Header>
				<Card.Content class="px-4 py-[.9rem]">
					{#each data.reminders as r (r.id)}
						<div class="flex items-center gap-[.45rem] py-[.26rem] border-b border-secondary text-[.72rem] last:border-0">
							<span class="flex-1 font-semibold whitespace-nowrap overflow-hidden text-ellipsis">{r.supplier_name ?? '—'}</span>
							<span class="font-bold whitespace-nowrap text-[.7rem]">{Math.round(r.display_amount)}</span>
							{#if r.overdue}
								<Badge class={badgeClass.overdue}>{Math.abs(r.days_delta)}d</Badge>
							{:else}
								<Badge class={badgeClass.due_soon}>{r.days_delta}d</Badge>
							{/if}
							<form method="post" action="?/markPaid" class="m-0">
								<input type="hidden" name="invoiceId" value={r.id} />
								<button type="submit" class="text-[.65rem] font-semibold py-[.16rem] px-[.45rem] bg-green-50 text-green-700 border-none rounded cursor-pointer hover:bg-green-100">✓</button>
							</form>
						</div>
					{/each}
				</Card.Content>
			</Card.Root>
		{/if}

		{#if data.missing_invoices.length}
			<Card.Root class="border-l-[3px] border-l-[#e05555]">
				<Card.Header class="py-[.7rem] px-4 border-b flex-row items-center justify-between space-y-0">
					<Card.Title class="text-[.72rem] font-bold tracking-[.06em] uppercase text-[#e05555]">⚠ Missing</Card.Title>
				</Card.Header>
				<Card.Content class="px-4 py-[.9rem]">
					<div class="flex flex-wrap gap-[.3rem]">
						{#each data.missing_invoices as m (m.supplier_name)}
							<div class="bg-red-50 border border-red-200 rounded-md py-1 px-2">
								<p class="text-[.69rem] font-semibold">{m.supplier_name}</p>
								<p class="text-[.6rem] text-muted-foreground mt-[.05rem]">{m.days_late}d late · {m.frequency}</p>
							</div>
						{/each}
					</div>
				</Card.Content>
			</Card.Root>
		{/if}
	</div>
</div>
