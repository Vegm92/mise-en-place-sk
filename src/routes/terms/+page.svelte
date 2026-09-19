<script lang="ts">
  import { onMount } from 'svelte';
  import { locale, initLocale, toggleLocale } from '$lib/i18n';
  import { termsMeta, termsSections } from '$lib/content/legal/terms';

  onMount(() => { initLocale(); });

  const m = $derived(termsMeta);
  const loc = $derived(locale.current);
</script>

<svelte:head>
  <title>{m.pageTitle[loc]}</title>
</svelte:head>

<div class="mep legal" data-accent="tinta" data-density="default">
  <article>
    <div class="topbar">
      <a class="back" href="/">{m.back[loc]}</a>
      <button type="button" class="lang-toggle" onclick={toggleLocale}>{m.toggleLabel[loc]}</button>
    </div>

    <h1>{m.title[loc]}</h1>
    <p class="meta">{m.dateLine[loc]}</p>
    <p class="meta">{m.prevails[loc]}</p>

    <hr />

    {#each termsSections as section (section.id)}
      <h2>{section.heading[loc]}</h2>
      {#if section.id === 'accounts'}
        <ul>
          {#each section.items as item}
            <li>{item[loc]}</li>
          {/each}
        </ul>
      {:else if section.id === 'acceptableUse'}
        <p>{section.intro[loc]}</p>
        <ul>
          {#each section.items as item}
            <li>{item[loc]}</li>
          {/each}
        </ul>
      {:else if section.id === 'billing'}
        <ul>
          {#each section.items as item}
            <li>{item[loc]}</li>
          {/each}
        </ul>
        <p>{section.linkPre[loc]}<a href="/refunds">{section.linkText[loc]}</a>{section.linkPost[loc]}</p>
      {:else if section.id === 'privacy'}
        <p>
          {section.textPre[loc]}<a href="/privacy">{section.linkText[loc]}</a>{section.textPost[loc]}
        </p>
      {:else if section.id === 'termination'}
        <p>
          {section.textPre[loc]}<em>{section.emphasis[loc]}</em>{section.textPost[loc]}
        </p>
      {:else if section.id === 'contact'}
        <p>
          {section.textPre[loc]}<a href="mailto:{termsMeta.contactEmail}">{termsMeta.contactEmail}</a>
        </p>
      {:else}
        <p>{section.text[loc]}</p>
      {/if}
    {/each}

    <hr />
    <p class="footer-links">
      <a href="/privacy">{m.footer.privacy[loc]}</a> ·
      <a href="/cookies">{m.footer.cookies[loc]}</a> ·
      <a href="/refunds">{m.footer.refunds[loc]}</a> ·
      <a href="/legal">{m.footer.legal[loc]}</a> ·
      <a href="/">{m.footer.home[loc]}</a>
    </p>
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
  h2 {
    margin-top: 28px;
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--mep-fg);
  }
  .meta { color: var(--mep-fg-3); font-size: 14px; }
  p { color: var(--mep-fg-2); }
  ul { color: var(--mep-fg-2); padding-left: 20px; }
  li { margin: 4px 0; }
  a { color: var(--mep-acc); }
  hr {
    border: none;
    border-top: 1px solid var(--mep-divider);
    margin: 24px 0;
  }
  .footer-links { font-size: 13px; color: var(--mep-fg-3); margin-top: 16px; }
  .footer-links a { color: var(--mep-fg-3); }
</style>
