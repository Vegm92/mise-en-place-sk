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

<div class="card" style="width:100%;padding:0;overflow:hidden;display:flex;flex-direction:column;"
  use:scrollReveal={(p: number) => progress = p}>
  <div style="padding:12px 16px;border-bottom:1px solid var(--mep-divider);
              display:flex;align-items:center;gap:10px;">
    <div style="width:22px;height:22px;border-radius:5px;background:var(--mep-acc-soft);
                color:var(--mep-acc);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.8 3.6L14 5.5l-3 2.9.7 4.1L8 10.4l-3.7 1.9.7-4.1-3-2.9 4.2-.9z" fill="currentColor"/></svg>
    </div>
    <div style="flex:1;min-width:0;">
      <div style="font-size:13px;font-weight:600;color:var(--mep-fg);">Cárnicas Ibérico Aranda</div>
      <div style="font-size:11.5px;color:var(--mep-fg-3);font-family:var(--mep-fs-mono);">
        2026-A-0471 · 19/05/2026 · {copy.mockExtractedIn}
      </div>
    </div>
    <span style="font-size:10.5px;font-weight:500;padding:2px 7px;border-radius:4px;
                 background:var(--mep-pos-soft);color:var(--mep-pos);display:inline-flex;align-items:center;gap:4px;">
      {copy.mockConfirmed}
    </span>
  </div>
  {#each extractLines as line, li}
    {@const rowP = stagger(progress, li, extractLines.length)}
    <div style="display:grid;grid-template-columns:14px 1fr 70px 60px;gap:10px;
                padding:8px 16px;border-bottom:{li === extractLines.length - 1 ? '0' : '1px solid var(--mep-divider)'};
                align-items:center;font-size:12.5px;
                opacity:{rowP};transform:translateY({(1 - rowP) * 10}px);
                transition:opacity 150ms linear,transform 150ms linear;">
      <div style="width:12px;height:12px;border-radius:6px;flex-shrink:0;
                  background:{line.ok ? 'var(--mep-pos-soft)' : 'var(--mep-warn-soft)'};
                  color:{line.ok ? 'var(--mep-pos)' : 'var(--mep-warn)'};
                  display:flex;align-items:center;justify-content:center;font-size:8px;">
        {line.ok ? '✓' : '!'}
      </div>
      <span style="color:var(--mep-fg-2);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        {line.desc}
      </span>
      <span style="color:var(--mep-fg-3);text-align:right;font-family:var(--mep-fs-mono);">{line.qty}</span>
      <span style="color:var(--mep-fg);font-weight:500;text-align:right;font-family:var(--mep-fs-mono);">{line.total} €</span>
    </div>
  {/each}
  <div style="padding:10px 16px;background:var(--mep-surface-2);border-top:1px solid var(--mep-divider);
              display:flex;align-items:center;justify-content:space-between;
              opacity:{revealAfter(progress, 0.85)};
              transition:opacity 150ms linear;">
    <span style="font-size:12px;color:var(--mep-fg-3);">{copy.mockLinesVat}</span>
    <span style="font-size:14px;font-weight:700;color:var(--mep-fg);font-family:var(--mep-fs-mono);">482,65 €</span>
  </div>
</div>
