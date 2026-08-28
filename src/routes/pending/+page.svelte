<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { t, ti, locale, initLocale } from '$lib/i18n';
	import Check from '@lucide/svelte/icons/check';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Clock from '@lucide/svelte/icons/clock';
	import Mail from '@lucide/svelte/icons/mail';
	import Logo from '$lib/components/mep/Logo.svelte';

	const { data }: { data: PageData } = $props();

	onMount(() => {
		initLocale();
	});

	const createdLabel = $derived.by(() => {
		if (!data.createdAt) return null;
		const d = new Date(data.createdAt);
		if (isNaN(d.getTime())) return null;
		const day = d.toLocaleDateString($locale, { day: 'numeric', month: 'short' });
		const time = d.toLocaleTimeString($locale, { hour: '2-digit', minute: '2-digit' });
		return `${day} · ${time}`;
	});

	const seatsPct = $derived(
		data.seatsTaken === null
			? null
			: Math.max(2, Math.min(100, Math.round((data.seatsTaken / data.seatsTotal) * 100))),
	);

	const steps = $derived([
		{ key: 'done', title: $t('waitroom.step.created'), meta: createdLabel },
		{
			key: 'now',
			title: $t('waitroom.step.queue'),
			meta: data.queuePosition !== null && data.queueTotal !== null
				? $ti('waitroom.step.queueMeta', { position: data.queuePosition, total: data.queueTotal })
				: null,
		},
		{ key: 'next', title: $t('waitroom.step.open'), meta: $t('waitroom.step.openMeta') },
	]);
</script>

<svelte:head>
	<title>{$t('waitroom.title')} · Mise en Place</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mep auth-frame" data-accent="tinta" data-density="default">

	<aside class="auth-aside">
		<div class="auth-lockup">
			<Logo size={21} />
			<span class="auth-brand">Mise en Place</span>
		</div>

		<div class="auth-spacer"></div>

		<div class="auth-copy">
			<div class="auth-eyebrow">{$t('waitroom.aside.eyebrow')}</div>
			<div class="auth-aside-title">{$t('waitroom.aside.title')}</div>
			<div class="auth-aside-body">{$t('waitroom.aside.body')}</div>
		</div>

		<ol class="auth-steps">
			{#each steps as step, i (step.key)}
				<li class="auth-step">
					<div class="auth-step-rail">
						<span class="auth-step-dot" class:is-done={step.key === 'done'} class:is-now={step.key === 'now'}>
							{#if step.key === 'done'}<Check size={12} />{:else if step.key === 'now'}<Clock size={12} />{/if}
						</span>
						{#if i < steps.length - 1}
							<span class="auth-step-line" class:is-done={step.key === 'done'}></span>
						{/if}
					</div>
					<div class="auth-step-body" class:is-last={i === steps.length - 1}>
						<div class="auth-step-title" class:is-now={step.key === 'now'} class:is-next={step.key === 'next'}>
							{step.title}
						</div>
						{#if step.meta}
							<div class="auth-step-meta" class:is-now={step.key === 'now'}>{step.meta}</div>
						{/if}
					</div>
				</li>
			{/each}
		</ol>

		<div class="auth-spacer"></div>

		<p class="auth-aside-note">{$t('waitroom.aside.note')}</p>
	</aside>

	<main class="auth-main">
		<div class="auth-col">

			<div class="auth-head">
				<span class="badge badge-pending auth-mono auth-status">
					<Clock size={10} /> {$t('waitroom.waiting')}
				</span>
				<h1 class="auth-h1">{$t('waitroom.headline')}</h1>
				<p class="auth-sub">{$t('waitroom.body')}</p>
			</div>

			{#if data.queuePosition !== null}
				<div class="card auth-queue">
					<div class="auth-queue-head">
						<div class="auth-queue-figure">
							<span class="num auth-mono auth-queue-num">{data.queuePosition}</span>
							<span class="auth-mono auth-queue-unit">{$t('waitroom.position')}</span>
						</div>
						{#if data.queueTotal !== null}
							<div class="auth-mono auth-queue-total">
								{$ti('waitroom.ofTotal', { total: data.queueTotal })}
							</div>
						{/if}
					</div>

					{#if seatsPct !== null}
						<div>
							<div class="auth-bar">
								<div class="auth-bar-fill" style="width:{seatsPct}%;"></div>
							</div>
							<div class="auth-mono auth-bar-label">
								{$ti('waitroom.seats', { taken: data.seatsTaken ?? 0, total: data.seatsTotal })}
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<div class="auth-account">
				<span class="auth-account-icon"><Mail size={14} /></span>
				<div class="auth-account-body">
					<div class="auth-mono auth-account-label">{$t('waitroom.signedInAs')}</div>
					<div class="auth-account-email">{data.email}</div>
				</div>
			</div>

			<div class="auth-actions">
				<a href="/waitlist" class="auth-submit auth-submit-link">
					{$t('waitroom.waitlist')}
					<ChevronRight size={14} />
				</a>
				<form method="POST" action="/logout">
					<button type="submit" class="auth-ghost auth-ghost-block">{$t('waitroom.signOut')}</button>
				</form>
			</div>

			<div class="auth-footer-links">
				<a href="/privacy">{$t('waitroom.privacy')}</a>
				<span aria-hidden="true">·</span>
				<a href="/terms">{$t('waitroom.terms')}</a>
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

	.auth-head { display: flex; flex-direction: column; gap: 6px; }
	.auth-status {
		align-self: flex-start;
		font-size: 10.5px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.auth-h1 {
		font-size: 25px;
		font-weight: 600;
		letter-spacing: -0.7px;
		color: var(--mep-fg);
		margin: 6px 0 0;
		text-wrap: pretty;
	}
	.auth-sub {
		font-size: 13.5px;
		line-height: 1.55;
		color: var(--mep-fg-2);
		margin: 0;
		text-wrap: pretty;
	}

	.auth-queue { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
	.auth-queue-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
	.auth-queue-figure { display: flex; align-items: baseline; gap: 8px; }
	.auth-queue-num {
		font-size: 40px;
		font-weight: 700;
		line-height: 0.95;
		letter-spacing: -1.6px;
		color: var(--mep-acc);
	}
	.auth-queue-unit {
		font-size: 12px;
		color: var(--mep-fg-3);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.auth-queue-total { font-size: 11.5px; color: var(--mep-fg-3); text-align: right; }
	.auth-bar-label { margin-top: 7px; font-size: 11px; color: var(--mep-fg-3); }

	.auth-account-body { flex: 1; min-width: 0; }
	.auth-account-label {
		font-size: 10.5px;
		color: var(--mep-fg-3);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.auth-account-email {
		font-size: 13px;
		font-weight: 500;
		color: var(--mep-fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.auth-actions { display: flex; flex-direction: column; gap: 9px; }
	.auth-submit-link { text-decoration: none; }
	.auth-ghost-block { width: 100%; }

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
	.auth-aside-note {
		margin: 0;
		font-size: 11.5px;
		line-height: 1.55;
		color: var(--mep-fg-3);
		max-width: 380px;
	}

	.auth-steps {
		list-style: none;
		margin: 30px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.auth-step { display: grid; grid-template-columns: 22px 1fr; gap: 12px; }
	.auth-step-rail { display: flex; flex-direction: column; align-items: center; gap: 4px; }
	.auth-step-dot {
		width: 22px;
		height: 22px;
		border-radius: 11px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--mep-fg-4);
		border: 1.5px dashed var(--mep-border-strong);
	}
	.auth-step-dot.is-done { background: var(--mep-pos); color: var(--mep-pos-fg); border: 0; }
	.auth-step-dot.is-now  { background: var(--mep-acc); color: var(--mep-acc-fg); border: 0; }
	.auth-step-line { flex: 1; width: 1.5px; min-height: 26px; background: var(--mep-divider); }
	.auth-step-line.is-done { background: var(--mep-pos-soft); }
	.auth-step-body { padding-bottom: 20px; }
	.auth-step-body.is-last { padding-bottom: 0; }
	.auth-step-title { font-size: 13.5px; font-weight: 500; color: var(--mep-fg); }
	.auth-step-title.is-now { font-weight: 600; }
	.auth-step-title.is-next { color: var(--mep-fg-3); }
	.auth-step-meta {
		font-family: var(--mep-fs-mono);
		font-size: 11.5px;
		color: var(--mep-fg-3);
		margin-top: 2px;
	}
	.auth-step-meta.is-now { color: var(--mep-acc); }

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

	.auth-mono { font-family: var(--mep-fs-mono); }

	.auth-bar {
		height: 5px;
		border-radius: 3px;
		background: var(--mep-hover);
		overflow: hidden;
	}
	.auth-bar-fill { height: 100%; background: var(--mep-acc); border-radius: 3px; }

	.auth-account {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		border-radius: 8px;
		background: var(--mep-surface);
		border: 1px solid var(--mep-border);
	}
	.auth-account-icon {
		width: 30px;
		height: 30px;
		border-radius: 15px;
		background: var(--mep-acc-soft);
		color: var(--mep-acc);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

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
		.auth-spacer, .auth-steps, .auth-aside-note, .auth-aside-body { display: none; }
		.auth-lockup :global(.mep-logo) { width: 18px; height: 18px; }
		.auth-aside-title { font-size: 21px; letter-spacing: -0.6px; }
		.auth-copy { gap: 8px; }
		.auth-main { padding: 32px 24px 28px; }
		.auth-col { gap: 18px; }
	}
</style>
