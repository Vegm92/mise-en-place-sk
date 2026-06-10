<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { locale } from '$lib/i18n';
  const { children } = $props();

  onMount(() => {
    return locale.subscribe(l => {
      document.documentElement.lang = l;
    });
  });
</script>

{@render children()}
