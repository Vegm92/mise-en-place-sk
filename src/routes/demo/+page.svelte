<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { locale, initLocale } from '$lib/i18n';
	import Logo from '$lib/components/mep/Logo.svelte';
	import Turnstile from '$lib/components/Turnstile.svelte';
	import { demoCopy } from '$lib/content/demo-funnel';
	import {
		DEMO_LOCATIONS,
		DEMO_ROLES,
		DEMO_SPEND,
		DEMO_TOOLS,
		demoStepFor,
		demoSteps,
	} from '$lib/demo-funnel';

	const { data, form }: { data: PageData; form: ActionData } = $props();

	onMount(() => {
		initLocale();
	});

	const copy = $derived(demoCopy[locale.current]);
	const hasVideo = $derived(data.videoUrl !== null);
	const steps = $derived(demoSteps(hasVideo));
	const current = $derived(
		demoStepFor({ hasVideo, requested: data.requestedStep, submitted: form?.success === true }),
	);
	const currentIndex = $derived(steps.indexOf(current));
	const errorMessage = $derived(form && 'error' in form ? (copy.errors[form.error as keyof typeof copy.errors] ?? copy.errors.invalid) : null);
</script>

<svelte:head>
	<title>{copy.pageTitle}</title>
	<meta name="description" content={copy.metaDescription} />
	<link rel="canonical" href={data.canonicalUrl} />
</svelte:head>

<div class="mep flex min-h-screen flex-col items-center bg-bg px-4 pt-10 pb-60 sm:pb-32" data-accent="tinta" data-density="default">
	<main class="flex w-full max-w-xl flex-col gap-6">
		<a href="/waitlist" class="flex justify-center"><Logo size={22} wordmark /></a>

		<header class="flex flex-col gap-2 text-center">
			<h1 class="title-lg">{copy.headline}</h1>
			<p class="body">{copy.sub}</p>
		</header>

		<ol class="flex items-center justify-center gap-3">
			{#each steps as step, i (step)}
				<li class="flex items-center gap-2" aria-current={i === currentIndex ? 'step' : undefined}>
					<span
						class={[
							'num label flex size-6 items-center justify-center rounded-pill',
							i <= currentIndex ? 'bg-acc text-acc-fg' : 'border border-divider bg-surface-2 text-fg-3',
						]}
					>{i + 1}</span>
					<span class={i === currentIndex ? 'body-strong' : 'body'}>{copy.steps[step]}</span>
				</li>
			{/each}
		</ol>

		<section class="card flex flex-col gap-5 p-6">
			{#if current === 'video' && data.videoUrl}
				<div class="flex flex-col gap-1">
					<h2 class="subtitle">{copy.video.title}</h2>
					<p class="body">{copy.video.body}</p>
				</div>
				<!-- svelte-ignore a11y_media_has_caption -->
				<video class="w-full rounded-card bg-surface-2" controls playsinline preload="metadata" src={data.videoUrl} poster={data.posterUrl}></video>
				<a class="btn btn-primary justify-center" href="?step=questions">{copy.video.cta}</a>
			{:else if current === 'questions'}
				<h2 class="subtitle">{copy.questions.title}</h2>
				<form method="POST" action="?/request" use:enhance class="flex flex-col gap-4">
					<input type="text" name="_hp" tabindex="-1" autocomplete="off" aria-hidden="true" class="mep-visually-hidden" />

					<div class="grid gap-4 sm:grid-cols-2">
						<label class="flex flex-col gap-1">
							<span class="label">{copy.questions.name}</span>
							<input class="input" type="text" name="name" autocomplete="name" maxlength="120" required />
						</label>
						<label class="flex flex-col gap-1">
							<span class="label">{copy.questions.restaurant}</span>
							<input class="input" type="text" name="restaurant" autocomplete="organization" maxlength="160" required />
						</label>
						<label class="flex flex-col gap-1">
							<span class="label">{copy.questions.email}</span>
							<input class="input" type="email" name="email" autocomplete="email" maxlength="254" required />
						</label>
						<label class="flex flex-col gap-1">
							<span class="label">{copy.questions.phone}</span>
							<input class="input" type="tel" name="phone" autocomplete="tel" maxlength="40" />
						</label>
					</div>

					<label class="flex flex-col gap-1">
						<span class="body-strong">{copy.questions.role}</span>
						<select class="input" name="role" required>
							<option value="" disabled selected>{copy.questions.choose}</option>
							{#each DEMO_ROLES as value (value)}
								<option {value}>{copy.roles[value]}</option>
							{/each}
						</select>
					</label>

					<fieldset class="flex flex-col gap-2">
						<legend class="body-strong mb-2">{copy.questions.locations}</legend>
						<div class="flex flex-wrap gap-x-5 gap-y-2">
							{#each DEMO_LOCATIONS as value (value)}
								<label class="body flex items-center gap-2">
									<input type="radio" name="locations" {value} required />
									{copy.locations[value]}
								</label>
							{/each}
						</div>
					</fieldset>

					<fieldset class="flex flex-col gap-2">
						<legend class="body-strong mb-2">{copy.questions.monthlySpend}</legend>
						<div class="grid gap-2 sm:grid-cols-2">
							{#each DEMO_SPEND as value (value)}
								<label class="body flex items-center gap-2">
									<input type="radio" name="monthlySpend" {value} required />
									{copy.spend[value]}
								</label>
							{/each}
						</div>
					</fieldset>

					<label class="flex flex-col gap-1">
						<span class="body-strong">{copy.questions.currentTool}</span>
						<select class="input" name="currentTool" required>
							<option value="" disabled selected>{copy.questions.choose}</option>
							{#each DEMO_TOOLS as value (value)}
								<option {value}>{copy.tools[value]}</option>
							{/each}
						</select>
					</label>

					<Turnstile />

					{#if errorMessage}
						<p class="body text-neg" role="alert">{errorMessage}</p>
					{/if}

					<button type="submit" class="btn btn-primary justify-center">{copy.questions.submit}</button>
					<p class="body text-center text-fg-3">
						{copy.questions.privacy}
						<a class="underline" href="/privacy">{copy.questions.privacyLink}</a>
					</p>
				</form>
			{:else if form?.success && form.fit === 'self_serve'}
				<h2 class="subtitle">{copy.selfServe.title}</h2>
				<p class="body">{copy.selfServe.body}</p>
				<a class="btn btn-primary justify-center" href="/signup">{copy.selfServe.cta}</a>
			{:else if form?.success && form.bookingUrl}
				<h2 class="subtitle">{copy.booking.title}</h2>
				<p class="body">{copy.booking.body}</p>
				<a class="btn btn-primary justify-center" href={form.bookingUrl} target="_blank" rel="noopener noreferrer">{copy.booking.cta}</a>
			{:else}
				<h2 class="subtitle">{copy.received.title}</h2>
				<p class="body">{copy.received.body}</p>
			{/if}
		</section>
	</main>
</div>
