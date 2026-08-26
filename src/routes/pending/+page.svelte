<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { t, initLocale } from '$lib/i18n';

	const { data }: { data: PageData } = $props();

	onMount(() => {
		initLocale();
	});
</script>

<svelte:head>
	<title>{$t('waitroom.title')} · Mise en Place</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mep" data-accent="slate" data-density="default"
	style="min-height:100vh;display:flex;align-items:center;justify-content:center;
	       padding:24px;background:var(--mep-bg);">

	<div style="width:100%;max-width:420px;">

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
			<div style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;
			            color:var(--mep-acc);margin-bottom:14px;">
				{$t('waitroom.badge')}
			</div>

			<h1 style="font-size:19px;font-weight:600;color:var(--mep-fg);margin:0 0 8px;letter-spacing:-0.2px;">
				{$t('waitroom.title')}
			</h1>
			<p style="font-size:13.5px;line-height:1.6;color:var(--mep-fg-2);margin:0 0 20px;">
				{$t('waitroom.body')}
			</p>

			{#if data.queuePosition !== null}
				<div style="display:flex;align-items:baseline;gap:8px;padding:14px 16px;border-radius:10px;
				            background:var(--mep-surface);border:1px solid var(--mep-divider);margin-bottom:20px;">
					<span style="font-size:26px;font-weight:700;color:var(--mep-acc);line-height:1;">
						{data.queuePosition}
					</span>
					<span style="font-size:12.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.06em;">
						{$t('waitroom.position')}
					</span>
				</div>
			{/if}

			<div style="font-size:12.5px;color:var(--mep-fg-3);margin-bottom:20px;">
				{$t('waitroom.signedInAs')} <strong style="color:var(--mep-fg-2);">{data.email}</strong>
			</div>

			<form method="POST" action="/logout" style="width:100%;">
				<button type="submit" class="btn btn-secondary"
					style="height:36px;width:100%;justify-content:center;text-decoration:none;font-size:13px;">
					{$t('waitroom.signOut')}
				</button>
			</form>

			<div style="text-align:center;margin-top:14px;">
				<a href="/waitlist" style="font-size:12.5px;color:var(--mep-acc);">
					{$t('waitroom.waitlist')}
				</a>
			</div>
		</div>

		<p style="text-align:center;font-size:12px;color:var(--mep-fg-3);margin-top:18px;">
			<a href="/privacy" style="color:var(--mep-fg-3);">{$t('waitroom.privacy')}</a>
			·
			<a href="/terms" style="color:var(--mep-fg-3);">{$t('waitroom.terms')}</a>
		</p>

	</div>
</div>
