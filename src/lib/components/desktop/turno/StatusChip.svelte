<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    value,
    note,
    tone = 'fg3',
    chart,
    wide = false,
    last = false,
  }: {
    label: string;
    value: string;
    note: string;
    tone?: 'neg' | 'warn' | 'caution' | 'info' | 'acc' | 'pos' | 'fg3';
    chart?: Snippet;
    wide?: boolean;
    last?: boolean;
  } = $props();

  const TONE: Record<string, string> = {
    neg:  'var(--mep-neg)',
    warn: 'var(--mep-warn)',
    caution: 'var(--mep-caution)',
    info: 'var(--mep-info)',
    acc:  'var(--mep-acc)',
    pos:  'var(--mep-pos)',
    fg3:  'var(--mep-fg-3)',
  };
</script>

<div
  style="display:flex;flex-direction:column;gap:4px;padding-right:20px;min-width:{wide ? 236 : 154}px;
         border-right:{last ? 'none' : '1px solid var(--mep-divider)'};"
>
  <span class="label">{label}</span>
  <div style="display:flex;align-items:center;gap:10px;">
    <span class="num title">{value}</span>
    {@render chart?.()}
  </div>
  <span class="num" style="font-size:11px;font-weight:500;color:{TONE[tone]};">{note}</span>
</div>
