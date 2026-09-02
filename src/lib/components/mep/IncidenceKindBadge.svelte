<script lang="ts">
  import { t } from '$lib/i18n';
  import { isIncidenceKind, incidenceKindBadgeClass, incidenceKindKey, incidenceKindHintKey } from '$lib/status';

  const { kind, hint = false, small = false }: { kind: string | null | undefined; hint?: boolean; small?: boolean } = $props();
</script>

{#if kind && isIncidenceKind(kind)}
  <span class="{incidenceKindBadgeClass(kind)}{small ? ' text-[11px] px-1.5 py-px' : ''}">{$t(incidenceKindKey(kind))}</span>
  {#if hint}
    <p class="text-[11px] text-fg-3 mt-0.5 m-0">{$t(incidenceKindHintKey(kind))}</p>
  {/if}
{/if}
