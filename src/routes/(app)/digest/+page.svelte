<script lang="ts">
  import type { PageData } from './$types';
  import { t } from '$lib/i18n';
  import X from '@lucide/svelte/icons/x';
  import Newspaper from '@lucide/svelte/icons/newspaper';

  let { data }: { data: PageData } = $props();
</script>

<div style="max-width:680px;margin:0 auto;padding:32px 24px;display:flex;flex-direction:column;gap:20px;">

  <div style="display:flex;align-items:center;gap:10px;">
    <Newspaper size={18} style="color:var(--mep-accent);flex-shrink:0;" />
    <div>
      <h1 style="font-size:16px;font-weight:600;margin:0;line-height:1.2;">{$t('digest.title')}</h1>
      <p style="font-size:12px;color:var(--mep-fg-3);margin:2px 0 0;">{$t('digest.week')} {data.current_week}</p>
    </div>
  </div>

  {#if data.weekly_digest}
    <div style="padding:20px 22px;border-radius:10px;background:var(--mep-card);border:1px solid var(--mep-border);border-left:3px solid var(--mep-accent);position:relative;" data-coach="digest-main">
      {#if !data.weekly_digest.dismissed}
        <form method="POST" action="?/dismissDigest" style="position:absolute;top:12px;right:12px;">
          <button type="submit" style="background:none;border:none;cursor:pointer;color:var(--mep-fg-3);padding:4px;line-height:1;" aria-label={$t('a11y.close')}>
            <X size={13} />
          </button>
        </form>
      {/if}
      <p style="font-size:14px;color:var(--mep-fg-1);line-height:1.65;white-space:pre-wrap;margin:0;">
        {data.weekly_digest.text}
      </p>
      {#if data.weekly_digest.dismissed}
        <p style="margin-top:12px;font-size:12px;color:var(--mep-fg-3);">{$t('digest.dismissed')}</p>
      {/if}
    </div>
  {:else}
    <div style="padding:24px;border-radius:10px;background:var(--mep-card);border:1px solid var(--mep-border);text-align:center;" data-coach="digest-main">
      <p style="font-size:13px;color:var(--mep-fg-3);margin:0;">{$t('digest.unavailable')}</p>
    </div>
  {/if}

</div>
