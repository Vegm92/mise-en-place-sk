<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { locale } from '$lib/i18n';
  import { registerPWA } from '$lib/pwa';
  const { children } = $props();

  onMount(() => {
    registerPWA();
    return locale.subscribe(l => {
      document.documentElement.lang = l;
    });
  });
</script>

{@render children()}
