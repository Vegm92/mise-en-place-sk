<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { onMount } from 'svelte';
	import { t, initLocale } from '$lib/i18n';
	import AuthShell from '$lib/components/mep/AuthShell.svelte';

	const { data, form }: { data: PageData; form: ActionData } = $props();

	onMount(() => {
		initLocale();
	});
</script>

<svelte:head>
	<title>{t('reset.title')} · Mise en Place</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<AuthShell title={t('reset.title')} subtitle={data.hasToken ? t('reset.sub') : undefined}>
	{#if !data.hasToken}
		<div style="background:var(--mep-neg-soft);border:1px solid var(--mep-neg);color:var(--mep-neg);
		            border-radius:var(--mep-r-input);padding:10px 12px;font-size:13px;margin-bottom:16px;">
			{t('reset.err.expired')}
		</div>
		<a href="/forgot-password" class="btn btn-primary" style="height:36px;width:100%;justify-content:center;text-decoration:none;">
			{t('reset.requestNew')}
		</a>
	{:else}
		{#if form?.error}
			<div style="background:var(--mep-neg-soft);border:1px solid var(--mep-neg);color:var(--mep-neg);
			            border-radius:var(--mep-r-input);padding:10px 12px;font-size:13px;margin-bottom:16px;">
				{t(`reset.err.${form.error}`)}
			</div>
		{/if}

		<form method="POST" style="display:flex;flex-direction:column;gap:14px;">
			<input type="hidden" name="email" value={data.email} />
			<input type="hidden" name="token" value={data.token} />
			<div style="display:flex;flex-direction:column;gap:6px;">
				<label for="password" style="font-size:12px;font-weight:500;color:var(--mep-fg-2);">{t('reset.newPassword')}</label>
				<input
					id="password"
					name="password"
					type="password"
					required
					minlength="12"
					autocomplete="new-password"
					placeholder={t('signup.passwordPlaceholder')}
					class="input"
					style="height:36px;"
				/>
			</div>

			<div style="display:flex;flex-direction:column;gap:6px;">
				<label for="confirm" style="font-size:12px;font-weight:500;color:var(--mep-fg-2);">{t('reset.confirmPassword')}</label>
				<input
					id="confirm"
					name="confirm"
					type="password"
					required
					minlength="12"
					autocomplete="new-password"
					class="input"
					style="height:36px;"
				/>
			</div>

			<button type="submit" class="btn btn-primary" style="height:36px;justify-content:center;margin-top:4px;">
				{t('reset.submit')}
			</button>
		</form>
	{/if}
</AuthShell>
