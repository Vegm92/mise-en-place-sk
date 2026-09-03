<script lang="ts">
	import { t, ti } from '$lib/i18n';
	import Check from '@lucide/svelte/icons/check';
	import type { PageData } from './$types';

	const { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{t('billing.confirm.title')} · Mise en Place</title>
</svelte:head>

<div style="min-height:100%;background:var(--mep-bg);display:flex;align-items:center;justify-content:center;padding:40px 24px;">
	<div
		style="max-width:420px;width:100%;text-align:center;background:var(--mep-surface);border:1px solid var(--mep-border-strong);border-radius:16px;padding:40px 28px;"
	>
		<div
			style="width:56px;height:56px;margin:0 auto 20px;border-radius:28px;background:var(--mep-pos-soft);color:var(--mep-pos);display:flex;align-items:center;justify-content:center;"
		>
			<Check size={30} />
		</div>

		<h1 style="font-size:20px;font-weight:600;color:var(--mep-fg);margin:0 0 8px;letter-spacing:-0.3px;">
			{t('billing.confirm.title')}
		</h1>

		<p style="font-size:14px;color:var(--mep-fg-2);line-height:1.6;margin:0 0 20px;">
			{t('billing.confirm.body')}
		</p>

		{#if data.planNameKey}
			<div
				style="display:inline-flex;align-items:center;gap:8px;background:var(--mep-acc-soft);color:var(--mep-acc);border-radius:99px;padding:6px 16px;font-size:13px;font-weight:500;margin-bottom:20px;"
			>
				{t('billing.confirm.plan')}: <strong>{t(data.planNameKey)}</strong>
			</div>
		{/if}

		{#if data.email}
			<p style="font-size:12.5px;color:var(--mep-fg-3);margin:0 0 24px;">
				{ti('billing.confirm.receiptSent', { email: data.email })}
			</p>
		{/if}

		<div style="display:flex;gap:10px;justify-content:center;margin-bottom:18px;">
			<a href="/dashboard" class="btn btn-primary" style="height:38px;justify-content:center;text-decoration:none;">
				{t('billing.confirm.goDashboard')}
			</a>
			<a href="/billing" class="btn btn-ghost" style="height:38px;justify-content:center;text-decoration:none;">
				{t('billing.confirm.viewBilling')}
			</a>
		</div>

		<p style="font-size:12px;color:var(--mep-fg-4);margin:0;">
			{t('billing.confirm.redirecting')}
		</p>
	</div>
</div>