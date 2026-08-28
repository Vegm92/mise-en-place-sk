<script lang="ts">
	import type { Snippet } from 'svelte';
	import Logo from '$lib/components/mep/Logo.svelte';

	const { title, subtitle, children }: {
		title: string;
		subtitle?: string;
		children: Snippet;
	} = $props();
</script>

<div class="mep" data-accent="tinta" data-density="default"
	style="min-height:100vh;display:flex;align-items:center;justify-content:center;
	       padding:24px;background:var(--mep-bg);">

	<div style="width:100%;max-width:380px;">

		<div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:32px;">
			<Logo size={22} />
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
