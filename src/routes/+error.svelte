<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { t, initLocale } from '$lib/i18n';

	onMount(() => {
		initLocale();
	});
</script>

<svelte:head>
	<title>{$page.status} · Mise en Place</title>
</svelte:head>

<div class="mep" data-accent="amber" data-density="default"
	style="min-height:100vh;display:flex;align-items:center;justify-content:center;
	       padding:24px;background:var(--mep-bg);">

	<div style="width:100%;max-width:380px;">

		<div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:32px;">
			<svg width="22" height="22" viewBox="0 0 24 24" style="color:var(--mep-acc);flex-shrink:0;" aria-hidden="true">
				<rect x="2.5"  y="3.5" width="3" height="17" rx="1.5" fill="currentColor"/>
				<rect x="10.5" y="3.5" width="3" height="13" rx="1.5" fill="currentColor"/>
				<rect x="18.5" y="3.5" width="3" height="9"  rx="1.5" fill="currentColor"/>
			</svg>
			<span style="font-size:16px;font-weight:600;letter-spacing:-0.2px;color:var(--mep-fg);">
				Mise en Place
			</span>
		</div>

		<div class="card" style="padding:28px;text-align:center;">
			<h1 style="font-size:32px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.02em;margin:0 0 8px;">
				{$page.status}
			</h1>
			<p style="font-size:13.5px;line-height:1.6;color:var(--mep-fg-2);margin:0 0 20px;">
				{$page.error?.message ?? $t('error.unexpected')}
			</p>
			<a href="/" class="btn btn-primary" style="justify-content:center;text-decoration:none;">
				{$t('error.goHome')}
			</a>
		</div>

	</div>
</div>
