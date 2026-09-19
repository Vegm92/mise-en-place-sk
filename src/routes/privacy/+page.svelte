<script lang="ts">
  import { onMount } from 'svelte';
  import { locale, initLocale, toggleLocale } from '$lib/i18n';
  import { privacyMeta, privacySections } from '$lib/content/legal/privacy';

  onMount(() => { initLocale(); });

  const m = $derived(privacyMeta);
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

    {#each privacySections as section (section.id)}
      <h2>{section.heading[loc]}</h2>
      {#if section.id === 'controller'}
        <p>
          <strong>{section.lead[loc]}</strong>{section.text[loc]}
        </p>
      {:else if section.id === 'dataCollected' || section.id === 'legalBasis'}
        <ul>
          {#each section.items as item}
            <li><strong>{item.term[loc]}</strong>{item.text[loc]}</li>
          {/each}
        </ul>
      {:else if section.id === 'subprocessors'}
        <p>{section.intro[loc]}</p>
        <table>
          <thead>
            <tr>
              <th>{section.tableHead.provider[loc]}</th>
              <th>{section.tableHead.fn[loc]}</th>
              <th>{section.tableHead.country[loc]}</th>
            </tr>
          </thead>
          <tbody>
            {#each section.rows as row}
              <tr>
                <td>{row.provider[loc]}</td>
                <td>{row.fn[loc]}</td>
                <td>{row.country[loc]}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else if section.id === 'transfers' || section.id === 'security'}
        <p>{section.text[loc]}</p>
      {:else if section.id === 'retention'}
        <ul>
          {#each section.items as item}
            <li>{item[loc]}</li>
          {/each}
        </ul>
      {:else if section.id === 'rights'}
        <p>{section.introPre[loc]}<a href="mailto:{privacyMeta.contactEmail}">{privacyMeta.contactEmail}</a>{section.introPost[loc]}</p>
        <ul>
          {#each section.items as item}
            <li><strong>{item.term[loc]}</strong>{item.text[loc]}{#if item.emphasis}<em>{item.emphasis[loc]}</em>.{/if}</li>
          {/each}
        </ul>
        <p>{section.outroPre[loc]}<strong>{section.outroStrong[loc]}</strong>{section.outroPost[loc]}</p>
      {:else if section.id === 'cookies'}
        {#each section.paragraphs as paragraph}
          <p>{paragraph[loc]}</p>
        {/each}
        <p>{section.linkPre[loc]}<a href="/cookies">{section.linkText[loc]}</a>{section.linkPost[loc]}</p>
      {:else if section.id === 'contact'}
        <p>
          {section.textPre[loc]}<a href="mailto:{privacyMeta.contactEmail}">{privacyMeta.contactEmail}</a>
        </p>
      {/if}
    {/each}

    <hr />
    <p class="footer-links">
      <a href="/terms">{m.footer.terms[loc]}</a> ·
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
  strong { color: var(--mep-fg); font-weight: 600; }
  a { color: var(--mep-acc); }
  hr {
    border: none;
    border-top: 1px solid var(--mep-divider);
    margin: 24px 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    margin-top: 8px;
  }
  th, td {
    padding: 8px 12px;
    text-align: left;
    border: 1px solid var(--mep-border);
    color: var(--mep-fg-2);
  }
  thead tr { background: var(--mep-surface-2); }
  th { color: var(--mep-fg); font-weight: 600; }
  .footer-links { font-size: 13px; color: var(--mep-fg-3); margin-top: 16px; }
  .footer-links a { color: var(--mep-fg-3); }
</style>
