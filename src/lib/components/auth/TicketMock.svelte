<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Sparkles from '@lucide/svelte/icons/sparkles';

	const { readLabel, metaLabel }: { readLabel: string; metaLabel: string } = $props();

	const lines = [
		{ desc: 'Solomillo de ternera', qty: '4,20 kg', total: '119,28' },
		{ desc: 'Costillas de cerdo',   qty: '3,50 kg', total: '51,10'  },
		{ desc: 'Carrillera',           qty: '2,80 kg', total: '34,72'  },
		{ desc: 'Lomo embuchado',       qty: '0,80 kg', total: '29,20'  },
	];
</script>

<div class="card ticket">
	<div class="ticket-head">
		<span class="ticket-glyph"><Sparkles size={11} /></span>
		<span class="ticket-supplier">Cárnicas Ibérico Aranda</span>
		<span class="badge badge-confirmed ticket-badge"><Check size={9} /> {readLabel}</span>
	</div>

	{#each lines as line, i (line.desc)}
		<div class="ticket-row" class:is-last={i === lines.length - 1}>
			<span class="ticket-desc">{line.desc}</span>
			<span class="num mono ticket-qty">{line.qty}</span>
			<span class="num mono ticket-total">{line.total} €</span>
		</div>
	{/each}

	<div class="ticket-foot">
		<span class="mono ticket-meta">{metaLabel}</span>
		<span class="num mono ticket-sum">482,65 €</span>
	</div>
</div>

<style>
	.ticket { padding: 0; overflow: hidden; box-shadow: var(--mep-shadow-pop); }

	.ticket-head {
		padding: 11px 14px;
		border-bottom: 1px solid var(--mep-divider);
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.ticket-glyph {
		width: 20px;
		height: 20px;
		border-radius: var(--mep-r-input);
		background: var(--mep-acc-soft);
		color: var(--mep-acc);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.ticket-supplier {
		flex: 1;
		min-width: 0;
		font-size: 11.5px;
		font-weight: 600;
		color: var(--mep-fg);
	}
	.ticket-badge { font-size: 9.5px; }

	.ticket-row {
		display: grid;
		grid-template-columns: 1fr 62px 58px;
		gap: 8px;
		align-items: center;
		padding: 7px 14px;
		font-size: 11px;
		border-bottom: 1px solid var(--mep-divider);
	}
	.ticket-row.is-last { border-bottom: 0; }
	.ticket-desc { color: var(--mep-fg-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.ticket-qty { text-align: right; color: var(--mep-fg-3); }
	.ticket-total { text-align: right; color: var(--mep-fg); font-weight: 500; }

	.ticket-foot {
		padding: 9px 14px;
		background: var(--mep-surface-2);
		border-top: 1px solid var(--mep-divider);
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.ticket-meta { font-size: 10.5px; color: var(--mep-fg-3); }
	.ticket-sum { font-size: 12.5px; font-weight: 700; color: var(--mep-fg); }

	.mono { font-family: var(--mep-fs-mono); }
</style>
