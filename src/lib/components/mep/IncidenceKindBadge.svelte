<script lang="ts">
  import { t } from '$lib/i18n';
  import { isIncidenceKind, incidenceKindBadgeClass, incidenceKindKey, incidenceKindHintKey } from '$lib/status';

  const { kind, hint = false, style }: { kind: string | null | undefined; hint?: boolean; style?: string } = $props();
</script>

{#if kind && isIncidenceKind(kind)}
  <span class={incidenceKindBadgeClass(kind)} {style}>{$t(incidenceKindKey(kind))}</span>
  {#if hint}
    <p class="body text-fg-3" style="font-size:11.5px;margin:2px 0 0;">{$t(incidenceKindHintKey(kind))}</p>
  {/if}
{/if}
