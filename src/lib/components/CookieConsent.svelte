<script lang="ts">
  import { page } from '$app/state';
  import { getT } from '$lib/i18n-context';
  import type { ConsentState } from '$lib/cookie-consent';

  const { state }: { state: ConsentState } = $props();

  const t = getT();
  const nextPath = $derived(page.url.pathname + page.url.search);
</script>

{#if state === 'unset'}
  <aside class="mep-cookie-banner" aria-label={t('cookies.banner.label')}>
    <div class="mep-cookie-inner">
      <div class="mep-cookie-copy">
        <p class="mep-cookie-title">{t('cookies.banner.title')}</p>
        <p class="mep-cookie-body">
          {t('cookies.banner.body')}
          <a href="/cookies">{t('cookies.banner.more')}</a>
        </p>
      </div>
      <form method="POST" action="/cookie-consent" class="mep-cookie-actions">
        <input type="hidden" name="next" value={nextPath} />
        <button type="submit" name="choice" value="denied" class="btn btn-secondary">
          {t('cookies.banner.reject')}
        </button>
        <button type="submit" name="choice" value="granted" class="btn btn-primary">
          {t('cookies.banner.accept')}
        </button>
      </form>
    </div>
  </aside>
{/if}

<style>
  .mep-cookie-banner {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 60;
    background: var(--mep-surface);
    border-top: 1px solid var(--mep-border-strong);
    box-shadow: var(--mep-shadow-pop);
  }
  .mep-cookie-inner {
    max-width: 1080px;
    margin: 0 auto;
    padding: 16px 20px;
    display: flex;
    align-items: center;
    gap: 24px;
  }
  .mep-cookie-copy { flex: 1; min-width: 0; }
  .mep-cookie-title {
    margin: 0 0 4px;
    font-size: 13px;
    font-weight: 600;
    color: var(--mep-fg);
  }
  .mep-cookie-body {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--mep-fg-2);
  }
  .mep-cookie-body a { color: var(--mep-acc); }
  .mep-cookie-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }
  .mep-cookie-actions .btn { height: 36px; padding: 0 16px; }

  @media (max-width: 640px) {
    .mep-cookie-inner { flex-direction: column; align-items: stretch; gap: 12px; }
    .mep-cookie-actions .btn { flex: 1; justify-content: center; }
  }
</style>
