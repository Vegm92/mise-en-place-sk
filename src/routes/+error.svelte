<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { t, initLocale } from '$lib/i18n';
	import Logo from '$lib/components/mep/Logo.svelte';

	onMount(() => {
		initLocale();
	});
</script>

<svelte:head>
	<title>{$page.status} · Mise en Place</title>
</svelte:head>

<div class="mep" data-accent="tinta" data-density="default"
	style="min-height:100vh;display:flex;align-items:center;justify-content:center;
	       padding:24px;background:var(--mep-bg);">

	<div style="width:100%;max-width:380px;">

		<div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:32px;">
			<Logo size={22} wordmark />
		</div>

		<div class="card" style="padding:28px;text-align:center;">
			<h1 style="font-size:32px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.02em;margin:0 0 8px;">
				{$page.status}
			</h1>
			<p style="font-size:13.5px;line-height:1.6;color:var(--mep-fg-2);margin:0 0 20px;">
				{$page.status === 404 && $page.error?.message === 'Not Found'
					? $t('error.notFound')
					: ($page.error?.message ?? $t('error.unexpected'))}
			</p>
			<a href="/" class="btn btn-primary" style="justify-content:center;text-decoration:none;">
				{$t('error.goHome')}
			</a>
		</div>

	</div>
</div>
