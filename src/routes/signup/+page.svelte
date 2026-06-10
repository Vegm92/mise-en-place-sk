<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { page } from '$app/stores';

	const { data, form }: { data: PageData; form: ActionData } = $props();

	const urlError = $derived($page.url.searchParams.get('error'));

	const errorMessage = $derived(
		form?.error === 'missing'            ? 'Email and password are required.' :
		form?.error === 'password_too_short' ? 'Password must be at least 8 characters.' :
		form?.error === 'already_registered' ? 'An account with this email already exists. Try signing in.' :
		form?.error === 'generic'            ? 'Sign-up failed. Please try again.' :
		urlError     === 'oauth'             ? 'Google sign-up failed. Please try again.' :
		null
	);
</script>

<svelte:head>
	<title>Create account · Mise en Place</title>
</svelte:head>

<div class="mep" data-accent="amber" data-density="default"
	style="min-height:100vh;display:flex;align-items:center;justify-content:center;
	       padding:24px;background:var(--mep-bg);">

	<div style="width:100%;max-width:380px;">

		<!-- Logo -->
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

		<!-- Card -->
		<div class="card" style="padding:28px;">

			{#if form?.success}
				<!-- Success state -->
				<div style="text-align:center;padding:8px 0;">
					<div style="font-size:32px;margin-bottom:12px;">📧</div>
					<h1 style="font-size:17px;font-weight:600;color:var(--mep-fg);margin:0 0 8px;">Check your email</h1>
					<p style="font-size:13px;color:var(--mep-fg-3);margin:0 0 16px;line-height:1.5;">
						We've sent a verification link to your email address.
						Click it to activate your account and get started.
					</p>
					<p style="font-size:12px;color:var(--mep-fg-4);">
						Already verified? <a href="/login" style="color:var(--mep-acc);">Sign in</a>
					</p>
				</div>
			{:else}
				<h1 style="font-size:17px;font-weight:600;color:var(--mep-fg);margin:0 0 4px;">Create your account</h1>
				<p style="font-size:13px;color:var(--mep-fg-3);margin:0 0 20px;">Start your 30-day free trial</p>

				{#if errorMessage}
					<div style="background:var(--mep-neg-soft);border:1px solid var(--mep-neg);color:var(--mep-neg);
					            border-radius:var(--mep-r-input);padding:10px 12px;font-size:13px;margin-bottom:16px;">
						{errorMessage}
					</div>
				{/if}

				<form method="POST" action="?/signUp" style="display:flex;flex-direction:column;gap:14px;">
					<div style="display:flex;flex-direction:column;gap:6px;">
						<label for="email" style="font-size:12px;font-weight:500;color:var(--mep-fg-2);">Email</label>
						<input
							id="email"
							name="email"
							type="email"
							required
							autocomplete="email"
							placeholder="you@restaurant.com"
							class="input"
							style="height:36px;"
						/>
					</div>

					<div style="display:flex;flex-direction:column;gap:6px;">
						<label for="password" style="font-size:12px;font-weight:500;color:var(--mep-fg-2);">Password</label>
						<input
							id="password"
							name="password"
							type="password"
							required
							autocomplete="new-password"
							minlength="8"
							placeholder="At least 8 characters"
							class="input"
							style="height:36px;"
						/>
					</div>

					<button type="submit" class="btn btn-primary" style="height:36px;justify-content:center;margin-top:4px;">
						Create account
					</button>
				</form>

				<!-- Divider -->
				<div style="display:flex;align-items:center;gap:10px;margin:18px 0;">
					<div style="flex:1;height:1px;background:var(--mep-divider);"></div>
					<span style="font-size:11px;color:var(--mep-fg-4);text-transform:uppercase;letter-spacing:0.05em;">or</span>
					<div style="flex:1;height:1px;background:var(--mep-divider);"></div>
				</div>

				<!-- Google OAuth -->
				<form method="POST" action="?/signUpWithGoogle">
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
						Continue with Google
					</button>
				</form>

				<p style="text-align:center;font-size:12px;color:var(--mep-fg-4);margin:20px 0 0;">
					Already have an account? <a href="/login" style="color:var(--mep-acc);">Sign in</a>
				</p>
			{/if}
		</div>

	</div>
</div>
