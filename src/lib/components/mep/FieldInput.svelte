<script lang="ts">
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import ConfidenceDot from './ConfidenceDot.svelte';
  import { t } from '$lib/i18n';

  type Props = {
    label: string;
    name: string;
    value: string;
    confidence?: number | null;
    empty?: boolean;
    warnMsg?: string;
    num?: boolean;
    placeholder?: string;
    readonly?: boolean;
  };

  const { label, name, value, confidence, empty = false, warnMsg, num = false, placeholder, readonly = false }: Props = $props();

  const hasWarn = $derived(empty || !!warnMsg);

  const borderStyle = $derived(
    hasWarn ? '1px solid var(--mep-warn)' : '1px solid transparent'
  );
  const borderBottomStyle = $derived(
    hasWarn ? '2px solid var(--mep-warn)' :
    confidence != null && confidence < 0.85 ? '2px solid var(--mep-warn)' :
    '1px solid var(--mep-divider)'
  );
</script>

<div>
  <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
    {label}
    <ConfidenceDot {confidence} />
  </div>

  {#if readonly}
    <div
      class={num ? 'num' : ''}
      style="font-size:13.5px;font-weight:500;color:var(--mep-fg);padding:5px 8px;border-radius:5px;background:var(--mep-surface-2);border:1px solid transparent;border-bottom:1px solid var(--mep-divider);"
    >{value}</div>
  {:else}
    <input
      type="text"
      {name}
      {value}
      {placeholder}
      class={num ? 'num' : ''}
      style="width:100%;font-size:13.5px;font-weight:{hasWarn ? 600 : 500};color:var(--mep-fg);padding:5px 8px;border-radius:5px;background:var(--mep-surface-2);border:{borderStyle};border-bottom:{borderBottomStyle};outline:none;font-family:var(--mep-font);"
    />
  {/if}

  {#if empty}
    <div style="font-size:11px;color:var(--mep-warn);margin-top:4px;display:flex;align-items:center;gap:4px;">
      <AlertTriangle size={10} /> {$t('extract.fieldEmpty')}
    </div>
  {:else if warnMsg}
    <div style="font-size:11px;color:var(--mep-warn);margin-top:4px;display:flex;align-items:center;gap:4px;">
      <AlertTriangle size={10} /> {warnMsg}
    </div>
  {/if}
</div>
