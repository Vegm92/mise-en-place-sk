<script lang="ts">
  import { scrollReveal, revealAfter } from '$lib/waitlist/reveal';

  let { whatsappReply }: { whatsappReply: string } = $props();

  let progress = $state(0);
  const paperP = $derived(Math.min(1, progress / 0.55));
  const photoP = $derived(revealAfter(progress, 0.45));
  const textP = $derived(revealAfter(progress, 0.75));
</script>

<div class="mock-bg relative w-full overflow-hidden rounded-2xl border border-divider p-7 flex items-center justify-center"
     style="aspect-ratio:4/3;"
     use:scrollReveal={(p: number) => progress = p}>
  <div class="mock-paper absolute rounded-[4px] overflow-hidden flex flex-col gap-1.5"
       style="top:22px;left:22px;width:54%;height:78%;padding:14px 16px;
              box-shadow:0 14px 40px rgba(0,0,0,0.12);
              transform:rotate({-2 - 4 * paperP}deg) translateY({14 * (1 - paperP)}px);
              opacity:{paperP};transition:transform 120ms linear,opacity 120ms linear;">
    <div class="mono text-[11px] font-bold text-fg">
      CÁRNICAS IBÉRICO ARANDA
    </div>
    <div class="mono text-[9.5px] text-fg-3">CIF B81234567 · Madrid</div>
    <div class="mock-divider h-px my-1"></div>
    <div class="mono flex justify-between text-[9.5px] text-fg-2">
      <span>ALBARÁN</span><span>N.º 2026-A-0471</span>
    </div>
    <div class="mono flex justify-between text-[9.5px] text-fg-3">
      <span>Fecha</span><span>19/05/2026</span>
    </div>
    <div class="mock-divider h-px my-1"></div>
    {#each ['Solomillo ibérico','Costillas cerdo','Carrillera','Chorizo cular','Lomo embuchado'] as prod, pi}
      <div class="mono flex justify-between text-[9px] text-fg-2">
        <span>{prod}</span><span>{(20 + pi * 14).toFixed(2)} €</span>
      </div>
    {/each}
    <div class="flex-1"></div>
    <div class="mock-divider h-px"></div>
    <div class="mono flex justify-between text-[10px] font-bold text-fg">
      <span>TOTAL</span><span>482,65 €</span>
    </div>
  </div>
  <div style="position:absolute;right:28px;bottom:28px;width:46%;
              display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
    <div style="max-width:90%;background:#dcf8c6;color:#0a2618;
                border-radius:12px 12px 4px 12px;padding:8px;font-size:12px;
                box-shadow:0 8px 20px rgba(0,0,0,0.12);
                opacity:{photoP};transform:translateY({(1 - photoP) * 10}px);
                transition:opacity 120ms linear,transform 120ms linear;">
      <div style="width:100%;height:76px;border-radius:6px;
                  background:linear-gradient(135deg,#c1bfaf 0%,#8a8678 60%,#5f5a4d 100%);
                  display:flex;align-items:center;justify-content:center;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="color:rgba(255,255,255,0.5);">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="12" cy="13" r="4" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      </div>
      <div class="mono text-[11px] mt-[5px]">albaran_aranda.jpg · 1.2 MB</div>
    </div>
    <div style="max-width:90%;background:#ffffff;color:#0a2618;
                border-radius:12px 12px 12px 4px;padding:8px 12px;font-size:12.5px;
                box-shadow:0 8px 20px rgba(0,0,0,0.12);font-weight:500;
                opacity:{textP};transform:translateY({(1 - textP) * 10}px);
                transition:opacity 120ms linear,transform 120ms linear;">
      <div class="flex items-center gap-1.5 mb-[3px]">
        <span class="mock-badge">M</span>
        <span style="font-size:11px;font-weight:600;">Mise en Place</span>
      </div>
      {whatsappReply}
      <div class="mono text-[10.5px] mt-[3px]" style="color:#4a7a5f;">14:02</div>
    </div>
  </div>
</div>

<style>
  .mock-bg {
    background: linear-gradient(135deg, var(--mep-surface-2) 0%, var(--mep-surface) 100%);
  }
  .mono { font-family: var(--mep-fs-mono); }
  .mock-paper {
    background: var(--mep-surface);
    border: 1px solid var(--mep-divider);
  }
  .mock-divider { background: var(--mep-divider); }
  .mock-badge {
    width: 12px; height: 12px; border-radius: 6px;
    background: var(--mep-acc); color: var(--mep-acc-fg);
    display: flex; align-items: center; justify-content: center;
    font-size: 8px; font-weight: 700;
  }
</style>
