<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { t, initLocale } from '$lib/i18n';
	import Turnstile from '$lib/components/Turnstile.svelte';

	const { data, form }: { data: PageData; form: ActionData } = $props();

	let termsAccepted = $state(false);
	let termsMissing = $state(false);
	let termsEl = $state<HTMLInputElement>();

	function guardGoogleConsent(event: SubmitEvent) {
		if (termsAccepted) return;
		event.preventDefault();
		termsMissing = true;
		termsEl?.focus();
		termsEl?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	}

	onMount(() => {
		initLocale();
	});

	const urlError = $derived($page.url.searchParams.get('error'));

	const errorMessage = $derived.by(() => {
		if (termsMissing) return $t('signup.err.terms');
		const formError = form?.error;
		if (formError === 'missing') return $t('login.err.missing');
		if (formError === 'password_too_short') return $t('signup.err.passwordShort');
		if (formError === 'password_too_long') return $t('signup.err.passwordLong');
		if (formError === 'bot_suspected') return $t('signup.err.bot');
		if (formError === 'terms_required') return $t('signup.err.terms');
		if (formError === 'already_registered') return $t('signup.err.exists');
		if (formError === 'generic') return $t('signup.err.generic');
		if (formError === 'rate_limited') return $t('signup.err.rateLimited');
		if (urlError === 'oauth') return $t('signup.err.oauth');
		return null;
	});
</script>

<svelte:head>
	<title>{$t('signup.metaTitle')} · Mise en Place</title>
	<meta name="description" content={$t('signup.metaDesc')} />
</svelte:head>

<div class="mep" data-accent="amber" data-density="default"
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

			{#if form?.success}
				<div style="text-align:center;padding:8px 0;">
					<div style="font-size:32px;margin-bottom:12px;">📧</div>
					<h1 style="font-size:17px;font-weight:600;color:var(--mep-fg);margin:0 0 8px;">{$t('signup.checkEmail')}</h1>
					<p style="font-size:13px;color:var(--mep-fg-3);margin:0 0 4px;line-height:1.5;">
						{$t('signup.checkEmailBody')}
					</p>
					{#if form.email}
						<p style="font-size:13px;font-weight:600;color:var(--mep-fg);margin:0 0 16px;">{form.email}</p>
					{/if}

					<form method="POST" action="?/resend" style="margin:0 0 12px;">
						<input type="hidden" name="email" value={form.email ?? ''} />
						<button type="submit" class="btn btn-secondary" style="height:34px;justify-content:center;width:100%;">
							{$t('signup.resend')}
						</button>
					</form>
					{#if form.resent === true}
						<p style="font-size:12px;color:var(--mep-pos);margin:0 0 12px;">{$t('signup.resent')}</p>
					{:else if form.resent === false}
						<p style="font-size:12px;color:var(--mep-warn);margin:0 0 12px;">{$t('signup.resendWait')}</p>
					{/if}

					<p style="font-size:12px;color:var(--mep-fg-4);">
						{$t('signup.alreadyVerified')} <a href="/login" style="color:var(--mep-acc);">{$t('signup.signInLink')}</a>
					</p>
				</div>
			{:else}
				<h1 style="font-size:17px;font-weight:600;color:var(--mep-fg);margin:0 0 4px;">{$t('signup.heading')}</h1>
				<p style="font-size:13px;color:var(--mep-fg-3);margin:0 0 20px;">{$t('signup.subheading')}</p>

				{#if errorMessage}
					<div style="background:var(--mep-neg-soft);border:1px solid var(--mep-neg);color:var(--mep-neg);
					            border-radius:var(--mep-r-input);padding:10px 12px;font-size:13px;margin-bottom:16px;">
						{errorMessage}
					</div>
				{/if}

				<form method="POST" action="?/signUp" style="display:flex;flex-direction:column;gap:14px;">
					<div style="display:flex;flex-direction:column;gap:6px;">
						<label for="email" style="font-size:12px;font-weight:500;color:var(--mep-fg-2);">{$t('login.email')}</label>
						<input
							id="email"
							name="email"
							type="email"
							required
							autocomplete="email"
							placeholder={$t('signup.emailPlaceholder')}
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
							autocomplete="new-password"
							minlength="12"
							placeholder={$t('signup.passwordPlaceholder')}
							class="input"
							style="height:36px;"
						/>
					</div>

					<label for="terms" style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--mep-fg-3);line-height:1.5;cursor:pointer;">
						<input
							id="terms"
							name="terms"
							type="checkbox"
							required
							bind:this={termsEl}
							bind:checked={termsAccepted}
							onchange={() => { if (termsAccepted) termsMissing = false; }}
							style="margin-top:2px;flex-shrink:0;outline:{termsMissing ? '2px solid var(--mep-neg)' : 'none'};outline-offset:2px;"
						/>
						<span>
							{$t('signup.acceptPre')}
							<a href="/terms"   style="color:var(--mep-acc);">{$t('footer.terms')}</a> {$t('signup.acceptMid')}
							<a href="/privacy" style="color:var(--mep-acc);">{$t('set.privacyLink')}</a>.
						</span>
					</label>

					<Turnstile />

					<button type="submit" class="btn btn-primary" style="height:36px;justify-content:center;margin-top:4px;">
						{$t('signup.submit')}
					</button>
				</form>

				<div style="display:flex;align-items:center;gap:10px;margin:18px 0;">
					<div style="flex:1;height:1px;background:var(--mep-divider);"></div>
					<span style="font-size:11px;color:var(--mep-fg-4);text-transform:uppercase;letter-spacing:0.05em;">{$t('login.or')}</span>
					<div style="flex:1;height:1px;background:var(--mep-divider);"></div>
				</div>

				<form method="POST" action="?/signUpWithGoogle" onsubmit={guardGoogleConsent}>
					<input type="hidden" name="providerId" value="google" />
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
					{$t('signup.haveAccount')} <a href="/login" style="color:var(--mep-acc);">{$t('signup.signInLink')}</a>
				</p>
			{/if}
		</div>

	</div>
</div>
