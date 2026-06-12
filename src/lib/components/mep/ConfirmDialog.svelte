<script lang="ts">
  import { t } from '$lib/i18n';
  import { AlertTriangle } from 'lucide-svelte';

  let {
    open = $bindable(false),
    message = '',
    danger = false,
    confirmLabel = '',
    cancelLabel = '',
    onconfirm,
    oncancel,
  }: {
    open?: boolean;
    message?: string;
    danger?: boolean;
    confirmLabel?: string;
    cancelLabel?: string;
    onconfirm?: () => void;
    oncancel?: () => void;
  } = $props();

  function handleConfirm() {
    open = false;
    onconfirm?.();
  }

  function handleCancel() {
    open = false;
    oncancel?.();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    style="position:fixed;inset:0;z-index:300;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:24px;"
    role="presentation"
    onclick={handleCancel}
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      style="background:var(--mep-bg);border:1px solid var(--mep-border-strong);border-radius:14px;padding:28px 24px;max-width:380px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,0.2);"
      role="dialog"
      aria-modal="true"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Escape') handleCancel(); }}
    >
      {#if danger}
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <AlertTriangle size={18} style="color:var(--mep-neg);flex-shrink:0;" />
          <strong style="font-size:15px;font-weight:600;color:var(--mep-fg);">{$t('action.irreversible')}</strong>
        </div>
      {/if}
      <p style="font-size:13.5px;color:var(--mep-fg-2);line-height:1.6;margin:0 0 20px;">{message}</p>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button type="button" class="btn btn-secondary" style="height:36px;font-size:13px;"
          onclick={handleCancel}>
          {cancelLabel || $t('action.cancel')}
        </button>
        <button type="button"
          class="btn btn-primary"
          style="height:36px;font-size:13px;{danger ? 'background:var(--mep-neg);' : ''}"
          onclick={handleConfirm}>
          {confirmLabel || $t('action.confirm')}
        </button>
      </div>
    </div>
  </div>
{/if}
