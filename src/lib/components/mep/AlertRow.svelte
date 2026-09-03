<script lang="ts">
  import TrendingUp from '@lucide/svelte/icons/trending-up';
  import Tag from '@lucide/svelte/icons/tag';
  import Clock from '@lucide/svelte/icons/clock';
  import Info from '@lucide/svelte/icons/info';
  import Share from '@lucide/svelte/icons/share';
  import Copy from '@lucide/svelte/icons/copy';
  import { t, tiv } from '$lib/i18n';

  let {
    alert,
  }: {
    alert: {
      sev: 'high' | 'med' | 'low';
      kind: 'price' | 'budget' | 'due' | 'info';
      text: string;
      detail?: string;
      when?: string;
      messageKey?: string;
      messageVars?: Record<string, string | number>;
    };
  } = $props();

  const palettes = {
    high: { bg: 'var(--mep-neg-soft)', icon: 'var(--mep-neg)' },
    med:  { bg: 'var(--mep-warn-soft)', icon: 'var(--mep-warn)' },
    low:  { bg: 'var(--mep-caution-soft)', icon: 'var(--mep-caution)' },
  };

  const icons = { price: TrendingUp, budget: Tag, due: Clock, info: Info };

  const p = $derived(palettes[alert.sev]);
  const Icon = $derived(icons[alert.kind] ?? Info);
  const displayText = $derived(alert.messageKey ? tiv(alert.messageKey, alert.messageVars ?? {}) : alert.text);

  let shareBusy = $state(false);
  let shareUrl = $state<string | null>(null);
  let shareCopied = $state(false);
  let shareFailed = $state(false);

  async function shareAlert() {
    if (shareBusy) return;
    shareBusy = true;
    shareFailed = false;
    try {
      const res = await fetch('/api/alert-share', { method: 'POST' });
      if (!res.ok) throw new Error('share request failed');
      const body = await res.json() as { url: string };
      shareUrl = `${window.location.origin}${body.url}`;
    } catch {
      shareFailed = true;
    } finally {
      shareBusy = false;
    }
  }

  async function copyShareUrl() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      shareCopied = true;
      setTimeout(() => { shareCopied = false; }, 2000);
    } catch {
      shareCopied = false;
    }
  }
</script>

<div style="padding:10px 12px;border-radius:8px;background:{p.bg};display:flex;align-items:flex-start;gap:10px;">
  <div style="color:{p.icon};margin-top:1px;flex-shrink:0;">
    <Icon size={15} />
  </div>
  <div style="min-width:0;flex:1;">
    <div style="font-size:12.5px;color:var(--mep-fg);font-weight:500;line-height:1.35;">{displayText}</div>
    {#if alert.detail}
      <div style="font-size:11.5px;color:var(--mep-fg-2);margin-top:3px;">{alert.detail}</div>
    {/if}
    {#if alert.kind === 'price'}
      <div style="margin-top:6px;">
        {#if shareUrl}
          <button
            type="button"
            onclick={copyShareUrl}
            aria-label={t('ashare.linkLabel')}
            style="display:inline-flex;align-items:center;gap:4px;background:none;border:none;cursor:pointer;
                   color:var(--mep-fg-3);font-size:11px;padding:0;"
          >
            <Copy size={12} />
            {shareCopied ? t('dshare.copied') : t('dshare.copy')}
          </button>
        {:else}
          <button
            type="button"
            onclick={shareAlert}
            disabled={shareBusy}
            aria-label={t('ashare.button')}
            style="display:inline-flex;align-items:center;gap:4px;background:none;border:none;cursor:pointer;
                   color:var(--mep-fg-3);font-size:11px;padding:0;"
          >
            <Share size={12} />
            {t('ashare.button')}
          </button>
        {/if}
        {#if shareFailed}
          <span style="font-size:11px;color:var(--mep-neg);margin-left:6px;">{t('dshare.error')}</span>
        {/if}
      </div>
    {/if}
  </div>
  {#if alert.when}
    <div style="font-size:11px;color:var(--mep-fg-3);white-space:nowrap;margin-top:2px;">{alert.when}</div>
  {/if}
</div>
