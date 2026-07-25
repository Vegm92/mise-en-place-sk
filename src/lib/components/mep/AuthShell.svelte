<script lang="ts">
	/**
	 * Centred logo + card chrome shared by the standalone auth pages
	 * (/forgot-password, /reset-password — issue #284). Extracted from the login
	 * page so a recovery screen can't drift away from the sign-in look.
	 */
	import type { Snippet } from 'svelte';

	const { title, subtitle, children }: {
		title: string;
		subtitle?: string;
		children: Snippet;
	} = $props();
</script>

<div class="mep" data-accent="amber" data-density="default"
	style="min-height:100vh;display:flex;align-items:center;justify-content:center;
	       padding:24px;background:var(--mep-bg);">

	<div style="width:100%;max-width:380px;">

		<div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:32px;">
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="color:var(--mep-acc);flex-shrink:0;" aria-hidden="true">
				<rect x="2.5"  y="3.5" width="3" height="17" rx="1.2" stroke="currentColor" stroke-width="1.6"/>
				<rect x="10.5" y="3.5" width="3" height="13" rx="1.2" stroke="currentColor" stroke-width="1.6"/>
				<rect x="18.5" y="3.5" width="3" height="9"  rx="1.2" stroke="currentColor" stroke-width="1.6"/>
			</svg>
			<span style="font-size:16px;font-weight:600;letter-spacing:-0.2px;color:var(--mep-fg);">
				Mise en Place
			</span>
		</div>

		<div class="card" style="padding:28px;">
			<h1 style="font-size:17px;font-weight:600;color:var(--mep-fg);margin:0 0 4px;">{title}</h1>
			{#if subtitle}
				<p style="font-size:13px;color:var(--mep-fg-3);margin:0 0 20px;">{subtitle}</p>
			{/if}

			{@render children()}
		</div>

	</div>
</div>
