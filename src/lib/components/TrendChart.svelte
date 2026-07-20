<script lang="ts">
	import { onMount } from 'svelte';
	import { t, ti } from '$lib/i18n';

	let {
		initialRange = '30d',
		initialGranularity = 'weekly',
	}: { initialRange?: string; initialGranularity?: string } = $props();

	type Segment = { category: string | null; amount: number };
	type Bucket  = { label: string; total: number; pct: number; is_current: boolean; segments: Segment[] };

	// svelte-ignore state_referenced_locally — intentional: seed once from prop defaults
	let activeRange       = $state(initialRange);
	// svelte-ignore state_referenced_locally — intentional: seed once from prop defaults
	let activeGranularity = $state(initialGranularity);
	let buckets     = $state<Bucket[]>([]);
	let categories  = $state<(string | null)[]>([]);
	let loading     = $state(true);

	const RANGES       = ['7d', '30d', '90d', '1y', 'all'] as const;
	const GRANULARITIES = ['daily', 'weekly', 'monthly'] as const;

	const CAT_COLORS = [
		'var(--mep-acc)',
		'var(--mep-pos)',
		'var(--mep-info)',
		'var(--mep-neg)',
		'var(--mep-warn)',
		'var(--mep-fg-3)',
	];

	function catColor(index: number) {
		return CAT_COLORS[index % CAT_COLORS.length];
	}

	async function fetchData(range: string, granularity: string) {
		loading = true;
		const resp = await fetch(`/api/trend?range=${range}&granularity=${granularity}`);
		if (resp.ok) {
			const data = await resp.json();
			buckets    = data.buckets ?? [];
			categories = data.categories ?? [];
		}
		loading = false;
	}

	async function setRange(range: string) {
		activeRange = range;
		await fetchData(activeRange, activeGranularity);
	}

	async function setGranularity(granularity: string) {
		activeGranularity = granularity;
		await fetchData(activeRange, activeGranularity);
	}

	// SVG layout (pixel-based, viewBox width=500 for easy math)
	const SVG_W    = 500;
	const SVG_H    = 140;
	const LABEL_H  = 18;
	const PAD_L    = 44; // wider left padding for Y-axis labels
	const PAD_R    = 8;
	const GAP_PCT  = 0.15; // fraction of slot used as gap

	const maxTotal = $derived(buckets.length ? Math.max(...buckets.map(b => b.total), 1) : 1);

	const gridLines = $derived.by(() => {
		return [0, 1, 2, 3, 4].map(i => {
			const fraction = i / 4;
			const y   = SVG_H * (1 - fraction);
			const val = maxTotal * fraction;
			const label = val >= 1000 ? Math.round(val / 1000) + 'k' : Math.round(val).toString();
			return { y, label, showLabel: i > 0 };
		});
	});

	const barRects = $derived.by(() => {
		if (!buckets.length) return { segs: [], labels: [] };
		const n     = buckets.length;
		const slotW = (SVG_W - PAD_L - PAD_R) / n;

		const segs: Array<{ x: number; y: number; w: number; h: number; color: string }> = [];
		const labels: Array<{ x: number; label: string; bold: boolean }> = [];

		for (let bi = 0; bi < n; bi++) {
			const bucket = buckets[bi];
			const slotX  = PAD_L + bi * slotW;
			const barX   = slotX + slotW * (GAP_PCT / 2);
			const barW   = slotW * (1 - GAP_PCT);
			labels.push({ x: slotX + slotW / 2, label: bucket.label, bold: bucket.is_current });

			let yOffset = 0;
			for (let ci = 0; ci < categories.length; ci++) {
				const cat = categories[ci];
				const seg = bucket.segments.find(s => s.category === cat);
				const amt = seg?.amount ?? 0;
				if (amt <= 0) continue;
				const h = (amt / maxTotal) * SVG_H;
				const y = SVG_H - yOffset - h;
				yOffset += h;
				segs.push({ x: barX, y, w: barW, h, color: catColor(ci) });
			}

			if (yOffset === 0 && bucket.total > 0) {
				const h = (bucket.total / maxTotal) * SVG_H;
				segs.push({ x: barX, y: SVG_H - h, w: barW, h, color: catColor(0) });
			}
		}

		return { segs, labels };
	});

	onMount(() => { fetchData(activeRange, activeGranularity); });

	const rangeLabel = $derived($ti(`chart.gran.${activeGranularity}.sub`, { n: buckets.length }));
</script>

<!-- Chart area -->
<div style="padding:4px 0 0;position:relative;">
	<div style="display:flex;justify-content:space-between;align-items:center;gap:4px;margin-bottom:6px;">
		<span class="body" style="font-size:12px;">{rangeLabel}</span>
		<div style="display:flex;gap:4px;">
			{#each GRANULARITIES as g}
				<button
					type="button"
					onclick={() => setGranularity(g)}
					style="
						font-size:11px;font-weight:600;padding:3px 8px;border-radius:var(--mep-r-pill);
						border:1px solid {activeGranularity === g ? 'var(--mep-acc)' : 'var(--mep-border-strong)'};
						background:{activeGranularity === g ? 'var(--mep-acc-soft)' : 'transparent'};
						color:{activeGranularity === g ? 'var(--mep-acc)' : 'var(--mep-fg-3)'};
						cursor:pointer;
					"
				>{$t(`chart.gran.${g}`)}</button>
			{/each}
		</div>
	</div>
	<div style="display:flex;justify-content:flex-end;gap:4px;margin-bottom:8px;">
		{#each RANGES as r}
			<button
				type="button"
				onclick={() => setRange(r)}
				style="
					font-size:11px;font-weight:600;padding:3px 8px;border-radius:var(--mep-r-pill);
					border:1px solid {activeRange === r ? 'var(--mep-acc)' : 'var(--mep-border-strong)'};
					background:{activeRange === r ? 'var(--mep-acc-soft)' : 'transparent'};
					color:{activeRange === r ? 'var(--mep-acc)' : 'var(--mep-fg-3)'};
					cursor:pointer;
				"
			>{$t(`chart.range.${r}`)}</button>
		{/each}
	</div>
	{#if loading}
		<div style="height:{SVG_H + LABEL_H}px;display:flex;align-items:center;justify-content:center;">
			<span class="label">Loading…</span>
		</div>
	{:else if !buckets.length || buckets.every(b => b.total === 0)}
		<div style="height:{SVG_H + LABEL_H}px;display:flex;align-items:center;justify-content:center;">
			<span class="label">{$t('chart.noSpendData')}</span>
		</div>
	{:else}
		<svg
			viewBox="0 0 {SVG_W} {SVG_H + LABEL_H}"
			width="100%"
			height={SVG_H + LABEL_H}
			style="display:block;overflow:visible;"
		>
			<!-- Gridlines + Y-axis labels -->
			{#each gridLines as gl}
				<line
					x1={PAD_L} y1={gl.y}
					x2={SVG_W - PAD_R} y2={gl.y}
					stroke="var(--mep-divider)" stroke-width="1"
				/>
				{#if gl.showLabel}
					<text
						x={PAD_L - 5} y={gl.y + 3.5}
						text-anchor="end"
						font-size="8"
						fill="var(--mep-fg-3)"
						font-family="inherit"
					>{gl.label}</text>
				{/if}
			{/each}

			<!-- Bars -->
			{#each barRects.segs as seg}
				<rect
					x={seg.x} y={seg.y}
					width={seg.w} height={Math.max(seg.h, 2)}
					fill={seg.color}
					rx="2"
				/>
			{/each}

			<!-- X-axis labels -->
			{#each barRects.labels as lbl}
				<text
					x={lbl.x}
					y={SVG_H + LABEL_H - 2}
					text-anchor="middle"
					font-size="9"
					fill={lbl.bold ? 'var(--mep-fg)' : 'var(--mep-fg-3)'}
					font-weight={lbl.bold ? '600' : '400'}
					font-family="inherit"
				>{lbl.label}</text>
			{/each}
		</svg>
	{/if}
</div>

<!-- Legend -->
{#if categories.length > 0}
	<div style="padding:8px 16px 14px;display:flex;flex-wrap:wrap;gap:8px;">
		{#each categories as cat, ci}
			<div style="display:flex;align-items:center;gap:5px;">
				<span class="swatch" style="background:{catColor(ci)};"></span>
				<span class="body" style="font-size:11px;">{cat ?? 'Uncategorised'}</span>
			</div>
		{/each}
	</div>
{/if}
