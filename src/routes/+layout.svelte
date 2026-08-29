<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { toStore } from 'svelte/store';
  import { locale, initLocale } from '$lib/i18n';
  import { setLocaleContext } from '$lib/i18n-context';
  import { registerPWA } from '$lib/pwa';
  const { data, children } = $props();

  setLocaleContext(toStore(() => data.locale));

  onMount(() => {
    registerPWA();
    initLocale(data.locale, data.explicit);
    return locale.subscribe(l => {
      document.documentElement.lang = l;
    });
  });
</script>

{@render children()}
