<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { t, initLocale } from '$lib/i18n';

	const { data, form }: { data: PageData; form: ActionData } = $props();

	onMount(() => {
		initLocale();
	});

	const error = $derived(form?.error ?? $page.url.searchParams.get('error'));
	const resetDone = $derived($page.url.searchParams.get('reset') === '1');
</script>

<svelte:head>
	<title>{$t('login.signIn')} · Mise en Place</title>
	<meta name="description" content={$t('login.metaDesc')} />
</svelte:head>

<div class="mep" data-accent="amber" data-density="default"
	style="min-height:100vh;display:flex;align-items:center;justify-content:center;
	       padding:24px;background:var(--mep-bg);">

	<div style="width:100%;max-width:380px;">

		<div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:32px;">
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="color:var(--mep-acc);flex-shrink:0;">
				<rect x="2.5"  y="3.5" width="3" height="17" rx="1.2" stroke="currentColor" stroke-width="1.6"/>
				<rect x="10.5" y="3.5" width="3" height="13" rx="1.2" stroke="currentColor" stroke-width="1.6"/>
				<rect x="18.5" y="3.5" width="3" height="9"  rx="1.2" stroke="currentColor" stroke-width="1.6"/>
			</svg>
			<span style="font-size:16px;font-weight:600;letter-spacing:-0.2px;color:var(--mep-fg);">
				Mise en Place
			</span>
		</div>

		<div class="card" style="padding:28px;">
			<h1 style="font-size:17px;font-weight:600;color:var(--mep-fg);margin:0 0 4px;">{$t('login.welcome')}</h1>
			<p style="font-size:13px;color:var(--mep-fg-3);margin:0 0 20px;">{$t('login.sub')}</p>

			{#if resetDone}
				<div style="background:var(--mep-pos-soft);border:1px solid var(--mep-pos);color:var(--mep-pos);
				            border-radius:var(--mep-r-input);padding:10px 12px;font-size:13px;margin-bottom:16px;">
					{$t('login.passwordReset')}
				</div>
			{/if}

			{#if error}
				<div style="background:var(--mep-neg-soft);border:1px solid var(--mep-neg);color:var(--mep-neg);
				            border-radius:var(--mep-r-input);padding:10px 12px;font-size:13px;margin-bottom:16px;">
					{$t(`login.err.${error}`)}
				</div>
			{/if}

			<form method="POST" action="?/signIn" style="display:flex;flex-direction:column;gap:14px;">
				<input type="hidden" name="redirectTo" value={data.redirectTo} />

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

				<div style="display:flex;flex-direction:column;gap:6px;">
					<label for="password" style="font-size:12px;font-weight:500;color:var(--mep-fg-2);">{$t('login.password')}</label>
					<input
						id="password"
						name="password"
						type="password"
						required
						autocomplete="current-password"
						class="input"
						style="height:36px;"
					/>
				</div>

				<button type="submit" class="btn btn-primary" style="height:36px;justify-content:center;margin-top:4px;">
					{$t('login.signIn')}
				</button>

				<a href="/forgot-password" style="text-align:center;font-size:12px;color:var(--mep-fg-3);text-decoration:none;">
					{$t('login.forgotPassword')}
				</a>
			</form>

			<p style="text-align:center;font-size:12px;color:var(--mep-fg-4);margin:20px 0 0;">
				{$t('login.noAccount')} <a href="/signup" style="color:var(--mep-acc);">{$t('login.createOne')}</a>
			</p>
			<p style="text-align:center;font-size:11px;color:var(--mep-fg-4);margin:16px 0 0;">
				<a href="/privacy" style="color:var(--mep-fg-4);">{$t('footer.privacy')}</a> ·
				<a href="/terms"   style="color:var(--mep-fg-4);">{$t('footer.terms')}</a>
			</p>
		</div>

	</div>
</div>
