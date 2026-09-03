<script lang="ts">
  import { t } from '$lib/i18n';
  import { isIncidenceKind, incidenceKindBadgeClass, incidenceKindKey, incidenceKindHintKey, incidenceReasonKey, incidenceReasons } from '$lib/status';

  const { kind, reasons = null, hint = false, small = false }: {
    kind: string | null | undefined;
    reasons?: readonly string[] | null;
    hint?: boolean;
    small?: boolean;
  } = $props();

  const known = $derived(incidenceReasons(reasons));
</script>

{#if kind && isIncidenceKind(kind)}
  <span class="{incidenceKindBadgeClass(kind)}{small ? ' text-[11px] px-1.5 py-px' : ''}">{t(incidenceKindKey(kind))}</span>
  {#if hint}
    {#if known.length}
      <ul class="text-[11px] text-fg-2 mt-0.5 m-0 p-0" style="list-style:none;">
        {#each known as reason (reason)}
          <li>{t(incidenceReasonKey(reason))}</li>
        {/each}
      </ul>
    {:else}
      <p class="text-[11px] text-fg-3 mt-0.5 m-0">{t(incidenceKindHintKey(kind))}</p>
    {/if}
  {/if}
{/if}
