<script>
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
</script>

<div class="error-page">
	<h1>{$page.status}</h1>
	<p>{$page.error?.message ?? $t('error.unexpected')}</p>
	<a href="/">{$t('error.goHome')}</a>
</div>

<style>
	.error-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		gap: 1rem;
		font-family: inherit;
	}
	h1 { font-size: 4rem; margin: 0; }
	p  { color: #666; }
	a  { color: inherit; }
</style>
