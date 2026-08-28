<script lang="ts">
	const { size = 22 }: { size?: number } = $props();
</script>

<svg class="mep-logo" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
	<rect x="2.5" y="3.5" width="3" height="17" rx="1.5" fill="currentColor" />
	<rect x="10.5" y="3.5" width="3" height="13" rx="1.5" fill="currentColor" />
	<rect x="18.5" y="3.5" width="3" height="9" rx="1.5" fill="currentColor" />
</svg>

<style>
	.mep-logo {
		color: var(--mep-acc);
		flex-shrink: 0;
	}
</style>
