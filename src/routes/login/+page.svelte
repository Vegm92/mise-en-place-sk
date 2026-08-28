<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { t, ti, initLocale } from '$lib/i18n';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import TicketMock from '$lib/components/auth/TicketMock.svelte';
	import Logo from '$lib/components/mep/Logo.svelte';

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

<div class="mep auth-frame" data-accent="tinta" data-density="default">

	<aside class="auth-aside">
		<div class="auth-lockup">
			<Logo size={21} />
			<span class="auth-brand">Mise en Place</span>
		</div>

		<div class="auth-spacer"></div>

		<div class="auth-copy">
			<div class="auth-eyebrow">{$t('login.aside.eyebrow')}</div>
			<div class="auth-aside-title">{$t('login.aside.title')}</div>
			<div class="auth-aside-body">{$t('login.aside.body')}</div>
		</div>

		<div class="auth-proof">
			<TicketMock readLabel={$t('login.ticket.read')} metaLabel={$t('login.ticket.meta')} />
		</div>

		<div class="auth-spacer"></div>

		{#if data.seatsTaken !== null}
			<div class="auth-seats">
				<span class="auth-seats-dot"></span>
				{$ti('login.aside.seats', { taken: data.seatsTaken, total: data.seatsTotal })}
			</div>
		{/if}
	</aside>

	<main class="auth-main">
		<div class="auth-col">

			<div class="auth-head">
				<h1 class="auth-h1">{$t('login.welcome')}</h1>
				<p class="auth-sub">{$t('login.sub')}</p>
			</div>

			{#if resetDone}
				<div class="auth-note auth-note-pos">{$t('login.passwordReset')}</div>
			{/if}

			{#if verified}
				<div class="auth-note auth-note-pos">{$t('login.verified')}</div>
			{/if}

			{#if error}
				<div class="auth-note auth-note-neg" role="alert">
					<span class="auth-note-icon"><TriangleAlert size={14} /></span>
					<span>{$t(`login.err.${error}`)}</span>
				</div>
			{/if}

			<form method="POST" action="?/signIn" class="auth-form">
				<input type="hidden" name="redirectTo" value={data.redirectTo} />

				<div class="auth-field">
					<span class="auth-field-head">
						<label for="email" class="auth-field-label">{$t('login.email')}</label>
					</span>
					<input
						id="email"
						name="email"
						type="email"
						required
						autocomplete="email"
						value={form?.email ?? ''}
						placeholder={$t('login.emailPlaceholder')}
						aria-invalid={error ? 'true' : undefined}
						class="auth-input"
					/>
				</div>

				<div class="auth-field">
					<span class="auth-field-head">
						<label for="password" class="auth-field-label">{$t('login.password')}</label>
						<a href="/forgot-password" class="auth-field-link">{$t('login.forgotShort')}</a>
					</span>
					<input
						id="password"
						name="password"
						type="password"
						required
						autocomplete="current-password"
						aria-invalid={error ? 'true' : undefined}
						class="auth-input"
					/>
				</div>

				<button type="submit" class="auth-submit">
					{$t('login.signIn')}
					<ChevronRight size={14} />
				</button>
			</form>

			<div class="auth-rule">
				<span></span>
				<span class="auth-mono auth-rule-label">{$t('login.orAlt')}</span>
				<span></span>
			</div>

			<form method="POST" action="?/signInWithGoogle">
				<input type="hidden" name="providerId" value="google" />
				<input type="hidden" name="redirectTo" value={data.redirectTo} />
				<button type="submit" class="auth-ghost auth-ghost-block">
					<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
						<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
						<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
						<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
						<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
					</svg>
					{$t('login.google')}
				</button>
			</form>

			<div class="auth-tail">
				<p class="auth-signup">
					{$t('login.noAccount')}
					<a href="/signup" class="auth-signup-link">{$t('login.createOne')}</a>
				</p>
				<div class="auth-footer-links">
					<a href="/privacy">{$t('footer.privacy')}</a>
					<span aria-hidden="true">·</span>
					<a href="/terms">{$t('footer.terms')}</a>
				</div>
			</div>

		</div>
	</main>
</div>

<style>
	.auth-brand {
		font-size: 15.5px;
		font-weight: 600;
		letter-spacing: -0.3px;
		color: var(--mep-fg);
	}

	.auth-seats-dot {
		width: 6px;
		height: 6px;
		border-radius: 3px;
		background: var(--mep-pos);
		box-shadow: 0 0 0 3px var(--mep-pos-soft);
		flex-shrink: 0;
	}

	.auth-head { display: flex; flex-direction: column; gap: 5px; }
	.auth-h1 {
		font-size: 25px;
		font-weight: 600;
		letter-spacing: -0.7px;
		color: var(--mep-fg);
		margin: 0;
	}
	.auth-sub { font-size: 13.5px; color: var(--mep-fg-2); margin: 0; }

	.auth-note-icon { color: var(--mep-neg); display: flex; margin-top: 1px; flex-shrink: 0; }

	.auth-form { display: flex; flex-direction: column; gap: 14px; }
	.auth-ghost-block { width: 100%; }

	.auth-tail { display: flex; flex-direction: column; gap: 14px; align-items: center; }
	.auth-signup { font-size: 12.5px; color: var(--mep-fg-2); margin: 0; }
	.auth-signup-link { color: var(--mep-acc); font-weight: 600; text-decoration: none; }
	.auth-signup-link:hover { text-decoration: underline; }

	.auth-frame {
		min-height: 100vh;
		display: flex;
		background: var(--mep-bg);
	}

	.auth-aside {
		width: 46%;
		flex-shrink: 0;
		padding: 44px 48px;
		background: var(--mep-surface-2);
		background-image: linear-gradient(180deg, var(--mep-acc-soft) 0%, transparent 46%);
		border-right: 1px solid var(--mep-border);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.auth-lockup { display: flex; align-items: center; gap: 10px; }
	.auth-spacer { flex: 1; min-height: 28px; }

	.auth-copy { display: flex; flex-direction: column; gap: 12px; }
	.auth-eyebrow {
		font-family: var(--mep-fs-mono);
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--mep-acc);
	}
	.auth-aside-title {
		font-size: 27px;
		font-weight: 600;
		letter-spacing: -0.9px;
		line-height: 1.16;
		color: var(--mep-fg);
		text-wrap: pretty;
	}
	.auth-aside-body {
		font-size: 13.5px;
		line-height: 1.6;
		color: var(--mep-fg-2);
		max-width: 420px;
		text-wrap: pretty;
	}

	.auth-proof { margin-top: 26px; }
	.auth-mono { font-family: var(--mep-fs-mono); }

	.auth-seats {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11.5px;
		color: var(--mep-fg-3);
	}

	.auth-main {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 48px 56px;
	}
	.auth-col {
		width: 100%;
		max-width: 372px;
		display: flex;
		flex-direction: column;
		gap: 22px;
	}

	.auth-note {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		padding: 11px 13px;
		border-radius: 8px;
		font-size: 12.5px;
		line-height: 1.5;
	}
	.auth-note-pos {
		background: var(--mep-pos-soft);
		border: 1px solid var(--mep-pos);
		color: var(--mep-pos);
	}
	.auth-note-neg {
		background: var(--mep-neg-soft);
		border: 1px solid var(--mep-neg);
		color: var(--mep-fg);
	}

	.auth-field { display: flex; flex-direction: column; gap: 7px; }
	.auth-field-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	.auth-field-label {
		font-family: var(--mep-fs-mono);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--mep-fg-3);
	}
	.auth-field-link {
		font-size: 11.5px;
		font-weight: 500;
		color: var(--mep-acc);
		text-decoration: none;
	}
	.auth-field-link:hover { text-decoration: underline; }

	.auth-input {
		height: 46px;
		padding: 0 14px;
		width: 100%;
		box-sizing: border-box;
		font-family: inherit;
		font-size: 14px;
		color: var(--mep-fg);
		background: var(--mep-surface);
		border: 1px solid var(--mep-border-strong);
		border-radius: 8px;
		outline: none;
		transition: border-color 120ms, box-shadow 120ms;
	}
	.auth-input::placeholder { color: var(--mep-fg-4); }
	.auth-input:focus { border-color: var(--mep-acc); box-shadow: 0 0 0 3px var(--mep-acc-ring); }
	.auth-input[aria-invalid='true'] { border-color: var(--mep-neg); }

	.auth-submit {
		height: 46px;
		border: 0;
		border-radius: 8px;
		cursor: pointer;
		background: var(--mep-acc);
		color: var(--mep-acc-fg);
		font-family: inherit;
		font-size: 14px;
		font-weight: 600;
		letter-spacing: -0.1px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		transition: background 150ms ease-out;
	}
	.auth-submit:hover { background: var(--mep-acc-hover); }

	.auth-ghost {
		height: 44px;
		border-radius: 8px;
		cursor: pointer;
		background: var(--mep-surface);
		color: var(--mep-fg);
		border: 1px solid var(--mep-border-strong);
		font-family: inherit;
		font-size: 13.5px;
		font-weight: 500;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 9px;
		transition: background 150ms ease-out;
	}
	.auth-ghost:hover { background: var(--mep-hover); }

	.auth-rule { display: flex; align-items: center; gap: 12px; }
	.auth-rule > span:first-child,
	.auth-rule > span:last-child { flex: 1; height: 1px; background: var(--mep-divider); }
	.auth-rule-label {
		font-size: 10.5px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--mep-fg-3);
	}

	.auth-footer-links {
		display: flex;
		gap: 14px;
		justify-content: center;
		font-size: 11.5px;
		color: var(--mep-fg-3);
	}
	.auth-footer-links a { color: inherit; text-decoration: none; }
	.auth-footer-links a:hover { text-decoration: underline; }
	.auth-footer-links span { opacity: 0.4; }

	@media (max-width: 900px) {
		.auth-frame { flex-direction: column; }
		.auth-aside {
			width: 100%;
			padding: 28px 24px 24px;
			border-right: 0;
			border-bottom: 1px solid var(--mep-border);
			gap: 20px;
		}
		.auth-spacer, .auth-proof, .auth-seats, .auth-aside-body { display: none; }
		.auth-lockup :global(.mep-logo) { width: 18px; height: 18px; }
		.auth-aside-title { font-size: 21px; letter-spacing: -0.6px; }
		.auth-copy { gap: 8px; }
		.auth-main { padding: 32px 24px 28px; }
		.auth-col { gap: 18px; }
	}
</style>
