<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import {
		Chart, BarController, BarElement,
		CategoryScale, LinearScale, Tooltip,
	} from 'chart.js';

	Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

	let { initialScale = 'monthly' }: { initialScale?: string } = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	let chart: Chart | undefined;
	let activeScale = $state(untrack(() => initialScale));

	type Bucket = { label: string; total: number; pct: number; is_current: boolean };

	async function fetchAndRender(scale: string) {
		const resp = await fetch(`/api/trend?scale=${scale}`);
		if (!resp.ok) return;
		const { buckets }: { scale: string; buckets: Bucket[] } = await resp.json();

		const labels = buckets.map((b) => b.label);
		const values = buckets.map((b) => b.total);
		const colors = buckets.map((b) => b.is_current ? '#4A9FD8' : '#E5E7EB');

		if (chart) {
			chart.data.labels = labels;
			(chart.data.datasets[0] as { data: number[]; backgroundColor: string[] }).data = values;
			(chart.data.datasets[0] as { data: number[]; backgroundColor: string[] }).backgroundColor = colors;
			chart.update('none');
		} else if (canvas) {
			chart = new Chart(canvas, {
				type: 'bar',
				data: {
					labels,
					datasets: [{
						data: values,
						backgroundColor: colors,
						borderRadius: 3,
						borderSkipped: false,
					}],
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: { display: false },
						tooltip: {
							callbacks: {
								label: (ctx) => ` €${Math.round(ctx.parsed.y ?? 0).toLocaleString()}`,
							},
						},
					},
					scales: {
						x: { grid: { display: false }, ticks: { font: { size: 10 } } },
						y: { display: false },
					},
				},
			});
		}
	}

	async function setScale(scale: string) {
		activeScale = scale;
		await fetchAndRender(scale);
	}

	onMount(() => { fetchAndRender(activeScale); });
	onDestroy(() => { chart?.destroy(); });
</script>

<div class="py-3 px-4 border-b border-[#E5E7EB] flex items-center justify-between">
	<span class="text-[11px] font-bold tracking-[0.06em] uppercase text-[#888888]">Spend</span>
	<div class="flex gap-1">
		{#each ['daily','weekly','monthly','yearly'] as s}
			<button
				type="button"
				onclick={() => setScale(s)}
				class="text-[11px] font-semibold px-2 py-[3px] rounded-[4px] border cursor-pointer transition-colors
				       {activeScale === s
				         ? 'bg-[#4A9FD8] text-white border-[#4A9FD8]'
				         : 'bg-transparent text-[#888888] border-[#E5E7EB] hover:bg-[#F9FAFB]'}"
			>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
		{/each}
	</div>
</div>
<div class="px-4 py-3" style="height:148px;position:relative">
	<canvas bind:this={canvas}></canvas>
</div>
