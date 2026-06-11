<script lang="ts">
  import { confColor } from '$lib/status';
  import { t } from '$lib/i18n';

  const { confidence, size = 7 }: { confidence: number | null | undefined; size?: number } = $props();

  function confLevel(c: number): string {
    if (c >= 0.85) return $t('conf.high');
    if (c >= 0.60) return $t('conf.medium');
    return $t('conf.low');
  }
</script>

{#if confidence != null}
  <span
    style="display:inline-flex;align-items:center;gap:3px;flex-shrink:0;"
    title="{Math.round(confidence * 100)}% {$t('extract.confidence')}"
    aria-label="{Math.round(confidence * 100)}% {$t('extract.confidence')} — {confLevel(confidence)}"
  >
    <span
      style="width:{size}px;height:{size}px;border-radius:50%;background:{confColor(confidence)};display:inline-block;flex-shrink:0;"
      aria-hidden="true"
    ></span>
  </span>
{/if}
