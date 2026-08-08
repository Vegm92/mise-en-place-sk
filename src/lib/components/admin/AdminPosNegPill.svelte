<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';

  let { ok, labelOk = 'OK', labelBad = 'FAIL' }: { ok: boolean; labelOk?: string; labelBad?: string } = $props();
</script>

<span style="
  display:inline-flex;align-items:center;gap:4px;
  padding:2px 7px;border-radius:4px;
  background:{ok ? 'var(--mep-pos-soft)' : 'var(--mep-neg-soft)'};
  color:{ok ? 'var(--mep-pos)' : 'var(--mep-neg)'};
  font-size:11px;font-weight:500;letter-spacing:0.04em;
  text-transform:uppercase;line-height:16px;
">
  {#if ok}<Check size={10} />{:else}<X size={10} />{/if}
  {ok ? labelOk : labelBad}
</span>
