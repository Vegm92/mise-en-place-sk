<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { onMount, untrack } from 'svelte';
	import { locale, t, tcat, initLocale, toggleLocale } from '$lib/i18n';
	import { VENUE_TYPES, VALID_CATEGORIES } from '$lib/constants';
	import Logo from '$lib/components/mep/Logo.svelte';
	const { data, form }: { data: PageData; form: ActionData } = $props();

	const idempotencyKey = crypto.randomUUID();

	let venueType = $state(untrack(() => data.prefillVenueType) ?? '');

	onMount(() => {
		initLocale();
	});

</script>

<svelte:head>
	<title>{t('onboard.metaTitle')} · Mise en Place</title>
</svelte:head>

<div class="mep bg-bg min-h-screen flex items-center justify-center p-6" data-accent="tinta" data-density="default">

	<div class="w-full max-w-[400px]">

		<div class="flex justify-end mb-4">
			<button
				type="button"
				onclick={toggleLocale}
				class="text-[12px] font-semibold text-fg-3 bg-transparent border border-divider rounded-md px-2.5 py-1 cursor-pointer"
			>
				{locale.current === 'es' ? 'EN' : 'ES'}
			</button>
		</div>

		<div class="flex items-center gap-2.5 justify-center mb-8">
			<Logo size={22} wordmark />
		</div>

		<div class="card p-7">
			<h1 class="text-[17px] font-semibold text-fg m-0 mb-1">{t('onboard.title')}</h1>
			<p class="text-[13px] text-fg-3 m-0 mb-6">
				{t('onboard.subtitle')}
			</p>

			{#if form?.error}
				<div class="bg-neg-soft border border-neg text-neg rounded-input px-3 py-2.5 text-[13px] mb-4">
					{form.error}
				</div>
			{/if}

			<form method="POST" class="flex flex-col gap-4">
				<input type="hidden" name="idempotency_key" value={idempotencyKey} />
				<div class="flex flex-col gap-1.5">
					<label for="name" class="text-[12px] font-medium text-fg-2">
						{t('onboard.nameLabel')}
					</label>
					<input
						id="name"
						name="name"
						type="text"
						required
						maxlength="80"
						autocomplete="organization"
						placeholder={t('onboard.namePlaceholder')}
						class="input"
						style="height:36px;"
					/>
				</div>

				<div class="flex flex-col gap-1.5">
					<label for="venueType" class="text-[13px] font-medium text-fg-2">
						{t('onboard.venue.label')}
					</label>
					<select id="venueType" name="venueType" class="input" style="height:36px;" bind:value={venueType}>
						<option value="">{t('onboard.venue.skip')}</option>
						{#each VENUE_TYPES as v (v.value)}
							<option value={v.value}>{t(v.labelKey)}</option>
						{/each}
					</select>
				</div>

				<div class="flex flex-col gap-1.5">
					<label for="topCategory" class="text-[13px] font-medium text-fg-2">
						{t('onboard.category.label')}
					</label>
					<select id="topCategory" name="topCategory" class="input" style="height:36px;">
						<option value="">{t('onboard.category.skip')}</option>
						{#each VALID_CATEGORIES as c (c)}
							<option value={c}>{tcat(c)}</option>
						{/each}
					</select>
				</div>

				{#if data.needsConsent}
					<label for="terms" class="flex items-start gap-2 text-[12px] text-fg-3 leading-[1.5] cursor-pointer">
						<input id="terms" name="terms" type="checkbox" required class="mt-0.5 shrink-0" />
						<span>
							{t('signup.acceptPre')}
							<a href="/terms" class="text-acc">{t('footer.terms')}</a> {t('signup.acceptMid')}
							<a href="/privacy" class="text-acc">{t('set.privacyLink')}</a>.
						</span>
					</label>
				{/if}

				<button type="submit" class="btn btn-primary mt-1" style="height:38px;justify-content:center;">
					{t('onboard.submit')}
				</button>
			</form>
		</div>

	</div>
</div>
