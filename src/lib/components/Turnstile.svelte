<script lang="ts">
	import { PUBLIC_TURNSTILE_SITE_KEY } from '$app/env/public';

	const siteKey = PUBLIC_TURNSTILE_SITE_KEY ?? '';
	let widget: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (!siteKey || !widget) return;
		const w = window as Window & { turnstile?: { render: (el: HTMLElement) => void } };
		if (w.turnstile) {
			w.turnstile.render(widget);
			return;
		}
		if (document.querySelector('script[data-turnstile-loader]')) return;
		const script = document.createElement('script');
		script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
		script.async = true;
		script.defer = true;
		script.dataset.turnstileLoader = '1';
		document.head.appendChild(script);
	});
</script>

{#if siteKey}
	<div bind:this={widget} class="cf-turnstile" data-sitekey={siteKey}></div>
{/if}
