<script lang="ts">
	import { onMount } from 'svelte';
	import { t, initLocale } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	const { data, form }: { data: PageData; form: ActionData } = $props();
	const confirmed = $derived(form?.ok === true);
	const failed = $derived(form?.ok === false || !data.ok);

	onMount(() => {
		initLocale();
	});
</script>

<svelte:head>
	<title>{$t('verifyEmail.heading')} · Mise en Place</title>
</svelte:head>

<div class="mep" data-accent="tinta" data-density="default"
	style="min-height:100vh;display:flex;align-items:center;justify-content:center;
	       padding:24px;background:var(--mep-bg);">
	<div style="width:100%;max-width:380px;">
		<div class="card" style="padding:28px;text-align:center;">
			<h1 style="font-size:17px;font-weight:600;color:var(--mep-fg);margin:0 0 8px;">{$t('verifyEmail.heading')}</h1>
			{#if failed}
				<p style="font-size:13px;color:var(--mep-fg-3);margin:0 0 16px;line-height:1.5;">{$t('verifyEmail.invalidBody')}</p>
				<a href="/signup" style="color:var(--mep-acc);font-size:13px;">{$t('verifyEmail.backToSignup')}</a>
			{:else if !confirmed}
				<p style="font-size:13px;color:var(--mep-fg-3);margin:0 0 20px;line-height:1.5;">{$t('verifyEmail.confirmBody')}</p>
				<form method="POST">
					<button type="submit" class="btn btn-primary" style="height:36px;width:100%;justify-content:center;">
						{$t('verifyEmail.confirmButton')}
					</button>
				</form>
			{/if}
		</div>
	</div>
</div>
