<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { t, initLocale } from '$lib/i18n';

	const { data, form }: { data: PageData; form: ActionData } = $props();

	onMount(() => {
		initLocale();
	});

	const KNOWN_ERRORS = new Set(['missing', 'invalid', 'rate_limited', 'oauth']);
	const rawError = $derived(form?.error ?? $page.url.searchParams.get('error'));
	const error = $derived(rawError && !KNOWN_ERRORS.has(rawError) ? 'oauth' : rawError);
	const resetDone = $derived($page.url.searchParams.get('reset') === '1');
	const verified = $derived($page.url.searchParams.get('verified') === '1');
</script>

<svelte:head>
	<title>{$t('login.signIn')} · Mise en Place</title>
	<meta name="description" content={$t('login.metaDesc')} />
</svelte:head>

<div class="mep" data-accent="slate" data-density="default"
	style="min-height:100vh;display:flex;align-items:center;justify-content:center;
	       padding:24px;background:var(--mep-bg);">

	<div style="width:100%;max-width:380px;">

		<div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:32px;">
			<svg width="22" height="22" viewBox="0 0 24 24" style="color:var(--mep-acc);flex-shrink:0;">
				<rect x="2.5"  y="3.5" width="3" height="17" rx="1.5" fill="currentColor"/>
				<rect x="10.5" y="3.5" width="3" height="13" rx="1.5" fill="currentColor"/>
				<rect x="18.5" y="3.5" width="3" height="9"  rx="1.5" fill="currentColor"/>
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

			{#if verified}
				<div style="background:var(--mep-pos-soft);border:1px solid var(--mep-pos);color:var(--mep-pos);
				            border-radius:var(--mep-r-input);padding:10px 12px;font-size:13px;margin-bottom:16px;">
					{$t('login.verified')}
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

			<div style="display:flex;align-items:center;gap:10px;margin:18px 0;">
				<div style="flex:1;height:1px;background:var(--mep-divider);"></div>
				<span style="font-size:11px;color:var(--mep-fg-4);text-transform:uppercase;letter-spacing:0.05em;">{$t('login.or')}</span>
				<div style="flex:1;height:1px;background:var(--mep-divider);"></div>
			</div>

			<form method="POST" action="?/signInWithGoogle">
				<input type="hidden" name="providerId" value="google" />
				<input type="hidden" name="redirectTo" value={data.redirectTo} />
				<button
					type="submit"
					class="btn btn-secondary"
					style="height:36px;width:100%;justify-content:center;gap:10px;"
				>
					<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
						<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
						<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
						<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
						<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
					</svg>
					{$t('login.google')}
				</button>
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
