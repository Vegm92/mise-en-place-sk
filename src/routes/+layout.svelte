<script lang="ts">
  import '../app.css';
  import { onMount, untrack } from 'svelte';
  import { toStore } from 'svelte/store';
  import { locale, initLocale, setMessages } from '$lib/i18n';
  import { setLocaleContext, setMessagesContext } from '$lib/i18n-context';
  import { registerPWA } from '$lib/pwa';
  const { data, children } = $props();

  untrack(() => setMessages('es', data.messages));
  setLocaleContext(toStore(() => data.locale));
  setMessagesContext(toStore(() => data.contextMessages));

  onMount(() => {
    registerPWA();
    initLocale(data.locale, data.explicit);
    return locale.subscribe(l => {
      document.documentElement.lang = l;
    });
  });
</script>

{@render children()}
