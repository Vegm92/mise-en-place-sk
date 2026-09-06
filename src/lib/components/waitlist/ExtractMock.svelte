<script lang="ts">
  import { scrollReveal, stagger, revealAfter } from '$lib/waitlist/reveal';

  let {
    copy,
  }: {
    copy: { mockExtractedIn: string; mockConfirmed: string; mockLinesVat: string };
  } = $props();

  const extractLines = [
    { ok: true,  desc: 'Solomillo de ternera ibérica', qty: '4,20 kg', total: '119,28' },
    { ok: true,  desc: 'Costillas de cerdo ibérico',   qty: '3,50 kg', total: '51,10'  },
    { ok: true,  desc: 'Carrillera de ternera',        qty: '2,80 kg', total: '34,72'  },
    { ok: false, desc: 'Chorizo cular ibérico',        qty: '1,20 kg', total: '27,36'  },
    { ok: true,  desc: 'Lomo embuchado',               qty: '0,80 kg', total: '29,20'  },
  ];

  let progress = $state(0);
</script>

<div class="card w-full overflow-hidden flex flex-col" style="padding:0;"
  use:scrollReveal={(p: number) => progress = p}>
  <div class="px-4 py-3 border-b border-divider flex items-center gap-2.5">
    <div class="w-[22px] h-[22px] rounded-[5px] bg-acc-soft text-acc flex items-center justify-center shrink-0">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.8 3.6L14 5.5l-3 2.9.7 4.1L8 10.4l-3.7 1.9.7-4.1-3-2.9 4.2-.9z" fill="currentColor"/></svg>
    </div>
    <div class="flex-1 min-w-0">
      <div class="text-[13px] font-semibold text-fg">Cárnicas Ibérico Aranda</div>
      <div class="mono text-[11.5px] text-fg-3">
        2026-A-0471 · 19/05/2026 · {copy.mockExtractedIn}
      </div>
    </div>
    <span class="text-[10.5px] font-medium px-[7px] py-0.5 rounded bg-pos-soft text-pos inline-flex items-center gap-1">
      {copy.mockConfirmed}
    </span>
  </div>
  {#each extractLines as line, li}
    {@const rowP = stagger(progress, li, extractLines.length)}
    <div class="grid items-center text-[12.5px] px-4 py-2"
         class:border-b={li < extractLines.length - 1}
         class:border-divider={li < extractLines.length - 1}
         style="grid-template-columns:14px 1fr 70px 60px;gap:10px;
                opacity:{rowP};transform:translateY({(1 - rowP) * 10}px);
                transition:opacity 150ms linear,transform 150ms linear;">
      <div class="w-3 h-3 rounded-full shrink-0 flex items-center justify-center text-[8px]"
           class:bg-pos-soft={line.ok} class:text-pos={line.ok}
           class:bg-warn-soft={!line.ok} class:text-warn={!line.ok}>
        {line.ok ? '✓' : '!'}
      </div>
      <span class="text-fg-2 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        {line.desc}
      </span>
      <span class="mono text-fg-3 text-right">{line.qty}</span>
      <span class="mono text-fg font-medium text-right">{line.total} €</span>
    </div>
  {/each}
  <div class="px-4 py-2.5 bg-surface-2 border-t border-divider flex items-center justify-between"
       style="opacity:{revealAfter(progress, 0.85)};transition:opacity 150ms linear;">
    <span class="text-[12px] text-fg-3">{copy.mockLinesVat}</span>
    <span class="mono text-[14px] font-bold text-fg">482,65 €</span>
  </div>
</div>

<style>
  .mono { font-family: var(--mep-fs-mono); }
</style>
