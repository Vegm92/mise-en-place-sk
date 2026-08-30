<script lang="ts">
	import { onMount } from 'svelte';
	import { t, ti, tcat, locale, initLocale } from '$lib/i18n';
	import Logo from '$lib/components/mep/Logo.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	onMount(() => {
		initLocale();
	});

	function fmtPct(value: number | null): string {
		if (value === null || !Number.isFinite(value)) return '—';
		let sign = '';
		if (value > 0) sign = '+';
		else if (value < 0) sign = '−';
		return `${sign}${Math.abs(value).toFixed(1).replace('.', $locale === 'es' ? ',' : '.')} %`;
	}

	const spendTone = $derived.by(() => {
		if (data.spendChangePct === null) return null;
		if (data.spendChangePct > 0) return 'up';
		if (data.spendChangePct < 0) return 'down';
		return null;
	});
	const spendKey = $derived.by(() => {
		if (data.spendChangePct === null) return 'pshare.spendUnknown';
		if (data.spendChangePct > 0) return 'pshare.spendUp';
		if (data.spendChangePct < 0) return 'pshare.spendDown';
		return 'pshare.spendFlat';
	});
	const spendColor = $derived.by(() => {
		if (spendTone === 'up') return 'var(--mep-neg)';
		if (spendTone === 'down') return 'var(--mep-pos)';
		return 'var(--mep-fg)';
	});
	function moverColor(deltaPct: number | null): string {
		const d = deltaPct ?? 0;
		if (d > 0) return 'var(--mep-neg)';
		if (d < 0) return 'var(--mep-pos)';
		return 'var(--mep-fg-3)';
	}
</script>

<svelte:head>
	<title>{$t('pshare.pageTitle')}</title>
	<meta name="description" content={$t('pshare.metaDescription')} />
	<meta name="robots" content="noindex, nofollow" />
	<link rel="canonical" href={data.canonicalUrl} />

	<meta property="og:type" content="website" />
	<meta property="og:url" content={data.canonicalUrl} />
	<meta property="og:site_name" content="Mise en Place" />
	<meta property="og:title" content={$t('pshare.pageTitle')} />
	<meta property="og:description" content={$t('pshare.metaDescription')} />
	<meta property="og:image" content="{data.canonicalUrl}/og.png" />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={$t('pshare.pageTitle')} />
	<meta name="twitter:description" content={$t('pshare.metaDescription')} />
	<meta name="twitter:image" content="{data.canonicalUrl}/og.png" />
</svelte:head>

<div class="mep" data-accent="tinta" data-density="default"
	style="min-height:100vh;display:flex;align-items:center;justify-content:center;
	       padding:24px;background:var(--mep-bg);">

	<div style="width:100%;max-width:440px;">

		<div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:24px;">
			<Logo size={22} wordmark />
		</div>

		<div class="card" style="padding:28px;">
			<span style="display:inline-flex;font-size:11px;font-weight:600;letter-spacing:0.02em;
			             text-transform:uppercase;color:var(--mep-fg-3);background:var(--mep-surface-2);
			             border-radius:999px;padding:4px 10px;margin-bottom:14px;">
				{$t('pshare.badge')}
			</span>

			<h1 style="font-size:20px;font-weight:600;color:var(--mep-fg);letter-spacing:-0.01em;margin:0 0 4px;">
				{$ti('pshare.weekLabel', { week: data.week })}
			</h1>
			<p style="font-size:13px;color:var(--mep-fg-3);margin:0 0 20px;">
				{$ti('pshare.dateRange', { start: data.weekStart, end: data.weekEnd })}
			</p>

			{#if data.empty}
				<p style="font-size:13px;color:var(--mep-fg-2);">{$t('pshare.empty')}</p>
			{:else}
				<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:20px;">
					<span class="num" style="font-size:32px;font-weight:600;letter-spacing:-0.02em;
					             color:{spendColor};">
						{fmtPct(data.spendChangePct)}
					</span>
				</div>
				<p style="font-size:13px;color:var(--mep-fg-2);line-height:1.5;margin:0 0 22px;">
					{$ti(spendKey, { pct: fmtPct(data.spendChangePct) })}
				</p>

				{#if data.categoryMovers.length}
					<div style="border-top:1px solid var(--mep-border);padding-top:16px;">
						<h2 style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.02em;
						           color:var(--mep-fg-3);margin:0 0 10px;">
							{$t('pshare.categoriesTitle')}
						</h2>
						<div style="display:flex;flex-direction:column;gap:8px;">
							{#each data.categoryMovers as mover (mover.category)}
								<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
									<span style="font-size:13px;color:var(--mep-fg);">{$tcat(mover.category)}</span>
									<span class="num" style="font-size:13px;font-weight:600;
									             color:{moverColor(mover.deltaPct)};">
										{fmtPct(mover.deltaPct)}
									</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			{/if}

			<a href={data.ctaHref} class="btn btn-primary"
				style="justify-content:center;text-decoration:none;width:100%;margin-top:24px;">
				{$t('pshare.cta')}
			</a>
		</div>

		<p style="text-align:center;font-size:11px;color:var(--mep-fg-4);margin:16px 0 0;line-height:1.5;">
			{$t('pshare.footerNote')}
		</p>

	</div>
</div>
