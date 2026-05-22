<script>
	import { page } from '$app/stores';
</script>

<div class="error-page">
	<h1>{$page.status}</h1>
	<p>{$page.error?.message ?? 'Something went wrong.'}</p>
	<a href="/">Back to dashboard</a>
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
	p  { color: var(--muted, #666); }
	a  { color: inherit; text-decoration: underline; }
</style>
