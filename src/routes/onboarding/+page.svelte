<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { onMount } from 'svelte';
	import { locale, t, initLocale } from '$lib/i18n';
	const { data, form }: { data: PageData; form: ActionData } = $props();

	const idempotencyKey = crypto.randomUUID();

	onMount(() => {
		initLocale();
	});

	function toggleLocale() {
		locale.update(l => l === 'es' ? 'en' : 'es');
	}
</script>

<svelte:head>
	<title>{$t('onboard.metaTitle')} · Mise en Place</title>
</svelte:head>

<div class="mep" data-accent="tinta" data-density="default"
	style="min-height:100vh;display:flex;align-items:center;justify-content:center;
	       padding:24px;background:var(--mep-bg);">

	<div style="width:100%;max-width:400px;">

		<div style="display:flex;justify-content:flex-end;margin-bottom:16px;">
			<button
				type="button"
				onclick={toggleLocale}
				style="font-size:12px;font-weight:600;color:var(--mep-fg-3);background:transparent;border:1px solid var(--mep-divider);border-radius:6px;padding:4px 10px;cursor:pointer;"
			>
				{$locale === 'es' ? 'EN' : 'ES'}
			</button>
		</div>

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
			<h1 style="font-size:17px;font-weight:600;color:var(--mep-fg);margin:0 0 4px;">{$t('onboard.title')}</h1>
			<p style="font-size:13px;color:var(--mep-fg-3);margin:0 0 24px;">
				{$t('onboard.subtitle')}
			</p>

			{#if form?.error}
				<div style="background:var(--mep-neg-soft);border:1px solid var(--mep-neg);color:var(--mep-neg);
				            border-radius:var(--mep-r-input);padding:10px 12px;font-size:13px;margin-bottom:16px;">
					{form.error}
				</div>
			{/if}

			<form method="POST" style="display:flex;flex-direction:column;gap:16px;">
				<input type="hidden" name="idempotency_key" value={idempotencyKey} />
				<div style="display:flex;flex-direction:column;gap:6px;">
					<label for="name" style="font-size:12px;font-weight:500;color:var(--mep-fg-2);">
						{$t('onboard.nameLabel')}
					</label>
					<input
						id="name"
						name="name"
						type="text"
						required
						maxlength="80"
						autocomplete="organization"
						placeholder={$t('onboard.namePlaceholder')}
						class="input"
						style="height:36px;"
					/>
				</div>

				{#if data.needsConsent}
					<label for="terms" style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--mep-fg-3);line-height:1.5;cursor:pointer;">
						<input id="terms" name="terms" type="checkbox" required style="margin-top:2px;flex-shrink:0;" />
						<span>
							{$t('signup.acceptPre')}
							<a href="/terms"   style="color:var(--mep-acc);">{$t('footer.terms')}</a> {$t('signup.acceptMid')}
							<a href="/privacy" style="color:var(--mep-acc);">{$t('set.privacyLink')}</a>.
						</span>
					</label>
				{/if}

				<button type="submit" class="btn btn-primary" style="height:38px;justify-content:center;margin-top:4px;">
					{$t('onboard.submit')}
				</button>
			</form>
		</div>

	</div>
</div>
