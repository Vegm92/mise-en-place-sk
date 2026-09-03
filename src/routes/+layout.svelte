<script lang="ts">
  import '../app.css';
  import { onMount, untrack } from 'svelte';
  import { locale, initLocale, setMessages } from '$lib/i18n';
  import { setLocaleContext, setMessagesContext } from '$lib/i18n-context';
  import { registerPWA } from '$lib/pwa';
  const { data, children } = $props();

  untrack(() => setMessages('es', data.messages));
  setLocaleContext({ get current() { return data.locale; } });
  setMessagesContext({ get current() { return data.contextMessages; } });

  onMount(() => {
    registerPWA();
    initLocale(data.locale, data.explicit);
  });

  $effect(() => {
    document.documentElement.lang = locale.current;
  });
</script>

{@render children()}
