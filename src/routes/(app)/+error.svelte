<script>
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
</script>

<div class="error-page">
	<h1>{$page.status}</h1>
	<p>{$page.error?.message ?? $t('error.generic')}</p>
	<a href="/">{$t('error.backToPanel')}</a>
</div>

<style>
	.error-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 1rem;
		gap: 1rem;
	}
	h1 { font-size: 3rem; margin: 0; }
	p  { color: var(--mep-fg-3); }
	a  { color: inherit; text-decoration: underline; }
</style>
