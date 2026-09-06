<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { locale, initLocale, toggleLocale } from '$lib/i18n';

  const {
    pageTitle,
    back,
    title,
    meta,
    prevails,
    children,
    footer,
  }: {
    pageTitle: string;
    back: string;
    title: string;
    meta: string;
    prevails: string;
    children: Snippet;
    footer: Snippet;
  } = $props();

  onMount(() => { initLocale(); });
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<div class="mep legal" data-accent="tinta" data-density="default">
  <article>
    <div class="topbar">
      <a class="back" href="/">{back}</a>
      <button type="button" class="lang-toggle" onclick={toggleLocale}>{locale.current === 'es' ? 'EN' : 'ES'}</button>
    </div>

    <h1>{title}</h1>
    <p class="meta">{meta}</p>
    <p class="meta">{prevails}</p>

    <hr />

    {@render children()}

    <hr />
    <p class="footer-links">{@render footer()}</p>
  </article>
</div>

<style>
  .legal {
    min-height: 100vh;
    background: var(--mep-bg);
    color: var(--mep-fg);
  }
  .legal article {
    max-width: 720px;
    margin: 0 auto;
    padding: 48px 24px 80px;
    line-height: 1.7;
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .lang-toggle {
    font-size: 13px;
    color: var(--mep-fg-3);
    background: none;
    border: none;
    cursor: pointer;
  }
  .back {
    font-size: 13px;
    color: var(--mep-fg-3);
    text-decoration: none;
  }
  .back:hover { color: var(--mep-fg-2); }
  h1 {
    margin-top: 24px;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--mep-fg);
  }
  .meta { color: var(--mep-fg-3); font-size: 14px; }
  hr {
    border: none;
    border-top: 1px solid var(--mep-divider);
    margin: 24px 0;
  }
  .footer-links { font-size: 13px; color: var(--mep-fg-3); margin-top: 16px; }
  .legal article :global(h2) {
    margin-top: 28px;
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--mep-fg);
  }
  .legal article :global(p) { color: var(--mep-fg-2); }
  .legal article :global(ul) { color: var(--mep-fg-2); padding-left: 20px; }
  .legal article :global(li) { margin: 4px 0; }
  .legal article :global(strong) { color: var(--mep-fg); font-weight: 600; }
  .legal article :global(a) { color: var(--mep-acc); }
  .footer-links :global(a) { color: var(--mep-fg-3); }
  .legal article :global(table) {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    margin-top: 8px;
  }
  .legal article :global(th),
  .legal article :global(td) {
    padding: 8px 12px;
    text-align: left;
    border: 1px solid var(--mep-border);
    color: var(--mep-fg-2);
  }
  .legal article :global(thead tr) { background: var(--mep-surface-2); }
  .legal article :global(th) { color: var(--mep-fg); font-weight: 600; }
</style>
