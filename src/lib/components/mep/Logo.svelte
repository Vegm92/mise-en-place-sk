<script lang="ts">
	const { size = 22, wordmark = false }: { size?: number; wordmark?: boolean } = $props();

	/**
	 * The mark: a lowercase m with descending shoulders — the second arch sits
	 * lower than the first, the same "spend steps down" gesture the three bars
	 * carried (ADR-033, amending ADR-028's artwork). Centred in the 24-unit box;
	 * ink spans x 3.1–20.9, y 4.2–19.8 with the 2.6 stroke.
	 * The email copy in src/lib/server/email.ts must keep this exact path
	 * (asserted by tests/logo-usage-consistency.test.ts).
	 */
	const MARK_D =
		'M4.4 18.5 V9.5 Q4.4 5.5 8.2 5.5 Q12 5.5 12 9.5 V18.5 M12 13 Q12 9.5 15.8 9.5 Q19.6 9.5 19.6 13 V18.5';

	/* Wordmark metrics, measured against real Mona Sans 600 in a browser:
	   the mark's ink height (15.6/24 of the box) equals the l/M ascender
	   (~0.74em), its ink bottom sits on the text baseline (ink bottom is
	   0.175·size above the svg box bottom), and the gap to "ise" matches the
	   font's own letter fit. */
	const fontSize = $derived(Math.round(size * 0.878 * 10) / 10);
	const baselineShift = $derived(Math.round(size * 0.175 * 10) / 10);
	const tailGap = $derived(Math.round(size * 0.079 * 10) / 10);
</script>

{#if wordmark}
	<span class="mep-logo mep-logo-wordmark" role="img" aria-label="Mise en Place" style="font-size:{fontSize}px;">
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			style="vertical-align:-{baselineShift}px;"
			aria-hidden="true"
		><path
				d={MARK_D}
				stroke="currentColor"
				stroke-width="2.6"
				fill="none"
				stroke-linecap="round"
				stroke-linejoin="round"
			/></svg><span aria-hidden="true" style="margin-left:-{tailGap}px;">ise en place</span>
	</span>
{:else}
	<svg class="mep-logo" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
		<path
			d={MARK_D}
			stroke="currentColor"
			stroke-width="2.6"
			fill="none"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
{/if}

<style>
	.mep-logo {
		color: var(--mep-acc);
		flex-shrink: 0;
	}

	.mep-logo-wordmark {
		font-weight: 600;
		letter-spacing: -0.01em;
		white-space: nowrap;
	}
</style>
