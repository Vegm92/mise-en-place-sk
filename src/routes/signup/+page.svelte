<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { t, initLocale } from '$lib/i18n';

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

	const errorMessage = $derived(
		termsMissing                         ? $t('signup.err.terms') :
		form?.error === 'missing'            ? $t('login.err.missing') :
		form?.error === 'password_too_short' ? $t('signup.err.passwordShort') :
		form?.error === 'terms_required'     ? $t('signup.err.terms') :
		form?.error === 'already_registered' ? $t('signup.err.exists') :
		form?.error === 'generic'            ? $t('signup.err.generic') :
		form?.error === 'rate_limited'       ? $t('signup.err.rateLimited') :
		urlError     === 'oauth'             ? $t('signup.err.oauth') :
		null
	);
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
							minlength="8"
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

					<button type="submit" class="btn btn-primary" style="height:36px;justify-content:center;margin-top:4px;">
						{$t('signup.submit')}
					</button>
				</form>

				<p style="text-align:center;font-size:12px;color:var(--mep-fg-4);margin:20px 0 0;">
					{$t('signup.haveAccount')} <a href="/login" style="color:var(--mep-acc);">{$t('signup.signInLink')}</a>
				</p>
			{/if}
		</div>

	</div>
</div>
