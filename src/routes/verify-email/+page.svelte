<script lang="ts">
	import { onMount } from 'svelte';
	import { t, initLocale } from '$lib/i18n';

	onMount(() => {
		initLocale();
	});
</script>

<svelte:head>
	<title>{$t('verifyEmail.heading')} · Mise en Place</title>
</svelte:head>

<div class="mep" data-accent="amber" data-density="default"
	style="min-height:100vh;display:flex;align-items:center;justify-content:center;
	       padding:24px;background:var(--mep-bg);">
	<div style="width:100%;max-width:380px;">
		<div class="card" style="padding:28px;text-align:center;">
			<h1 style="font-size:17px;font-weight:600;color:var(--mep-fg);margin:0 0 8px;">{$t('verifyEmail.heading')}</h1>
			<p style="font-size:13px;color:var(--mep-fg-3);margin:0 0 16px;line-height:1.5;">{$t('verifyEmail.invalidBody')}</p>
			<a href="/signup" style="color:var(--mep-acc);font-size:13px;">{$t('verifyEmail.backToSignup')}</a>
		</div>
	</div>
</div>
