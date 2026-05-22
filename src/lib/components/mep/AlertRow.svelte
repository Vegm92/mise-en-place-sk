<script lang="ts">
  import { AlertTriangle, Tag, Clock, Info } from 'lucide-svelte';

  type Severity = 'high' | 'med' | 'low';
  type Kind = 'price' | 'budget' | 'due' | 'new';

  let {
    sev,
    kind,
    text,
    detail,
    when,
  }: {
    sev: Severity;
    kind: Kind;
    text: string;
    detail?: string;
    when?: string;
  } = $props();

  const bgClass: Record<Severity, string> = {
    high: 'bg-neg-soft',
    med:  'bg-warn-soft',
    low:  'bg-info-soft',
  };
  const iconColor: Record<Severity, string> = {
    high: 'text-neg',
    med:  'text-warn',
    low:  'text-info',
  };

  const IconComp = { price: AlertTriangle, budget: Tag, due: Clock, new: Info }[kind] ?? Info;
</script>

<div class="flex items-start gap-2.5 p-2.5 rounded-lg {bgClass[sev]}">
  <span class="mt-0.5 {iconColor[sev]} flex-shrink-0">
    <IconComp size={15} />
  </span>
  <div class="flex-1 min-w-0">
    <div class="body-strong" style="font-size:12.5px;line-height:1.35;">{text}</div>
    {#if detail}
      <div class="body" style="font-size:11.5px;margin-top:3px;">{detail}</div>
    {/if}
  </div>
  {#if when}
    <div class="text-fg-3 flex-shrink-0 mt-0.5" style="font-size:11px;white-space:nowrap;">{when}</div>
  {/if}
</div>
