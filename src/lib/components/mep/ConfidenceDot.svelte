<script lang="ts">
  import { confColor } from '$lib/status';

  const { confidence, size = 7 }: { confidence: number | null | undefined; size?: number } = $props();
</script>

{#if confidence != null}
  <span
    style="width:{size}px;height:{size}px;border-radius:50%;background:{confColor(confidence)};display:inline-block;flex-shrink:0;"
    title="{Math.round(confidence * 100)}% confianza"
  ></span>
{/if}
