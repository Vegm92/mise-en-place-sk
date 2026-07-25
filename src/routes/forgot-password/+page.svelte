<script lang="ts">
	import type { ActionData } from './$types';
	import { onMount } from 'svelte';
	import { t, initLocale } from '$lib/i18n';
	import AuthShell from '$lib/components/mep/AuthShell.svelte';

	const { form }: { form: ActionData } = $props();

	onMount(() => {
		initLocale();
	});
</script>

<svelte:head>
	<title>{$t('forgot.title')} · Mise en Place</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<AuthShell title={$t('forgot.title')} subtitle={$t('forgot.sub')}>
	{#if form?.sent}
		<div style="background:var(--mep-pos-soft);border:1px solid var(--mep-pos);color:var(--mep-pos);
		            border-radius:var(--mep-r-input);padding:10px 12px;font-size:13px;margin-bottom:16px;">
			{$t('forgot.sent')}
		</div>
	{:else}
		{#if form?.error}
			<div style="background:var(--mep-neg-soft);border:1px solid var(--mep-neg);color:var(--mep-neg);
			            border-radius:var(--mep-r-input);padding:10px 12px;font-size:13px;margin-bottom:16px;">
				{$t(`forgot.err.${form.error}`)}
			</div>
		{/if}

		<form method="POST" style="display:flex;flex-direction:column;gap:14px;">
			<div style="display:flex;flex-direction:column;gap:6px;">
				<label for="email" style="font-size:12px;font-weight:500;color:var(--mep-fg-2);">{$t('login.email')}</label>
				<input
					id="email"
					name="email"
					type="email"
					required
					autocomplete="email"
					value={form?.email ?? ''}
					placeholder={$t('login.emailPlaceholder')}
					class="input"
					style="height:36px;"
				/>
			</div>

			<button type="submit" class="btn btn-primary" style="height:36px;justify-content:center;margin-top:4px;">
				{$t('forgot.submit')}
			</button>
		</form>
	{/if}

	<p style="text-align:center;font-size:12px;color:var(--mep-fg-4);margin:20px 0 0;">
		<a href="/login" style="color:var(--mep-acc);">{$t('forgot.backToLogin')}</a>
	</p>
</AuthShell>
