<script lang="ts">
  import { scrollReveal, revealAfter } from '$lib/waitlist/reveal';

  let { whatsappReply }: { whatsappReply: string } = $props();

  let progress = $state(0);
  const paperP = $derived(Math.min(1, progress / 0.55));
  const photoP = $derived(revealAfter(progress, 0.45));
  const textP = $derived(revealAfter(progress, 0.75));
</script>

<div style="position:relative;width:100%;aspect-ratio:4/3;border-radius:16px;overflow:hidden;
            background:linear-gradient(135deg,var(--mep-surface-2) 0%,var(--mep-surface) 100%);
            border:1px solid var(--mep-divider);padding:28px;
            display:flex;align-items:center;justify-content:center;"
  use:scrollReveal={(p: number) => progress = p}>
  <div style="position:absolute;top:22px;left:22px;width:54%;height:78%;
              background:var(--mep-surface);border:1px solid var(--mep-divider);
              border-radius:4px;box-shadow:0 14px 40px rgba(0,0,0,0.12);
              transform:rotate({-2 - 4 * paperP}deg) translateY({14 * (1 - paperP)}px);
              opacity:{paperP};transition:transform 120ms linear,opacity 120ms linear;
              padding:14px 16px;
              display:flex;flex-direction:column;gap:6px;overflow:hidden;">
    <div style="font-size:11px;font-weight:700;color:var(--mep-fg);font-family:var(--mep-fs-mono);">
      CÁRNICAS IBÉRICO ARANDA
    </div>
    <div style="font-size:9.5px;color:var(--mep-fg-3);font-family:var(--mep-fs-mono);">CIF B81234567 · Madrid</div>
    <div style="height:1px;background:var(--mep-divider);margin:4px 0;"></div>
    <div style="display:flex;justify-content:space-between;font-size:9.5px;color:var(--mep-fg-2);font-family:var(--mep-fs-mono);">
      <span>FACTURA</span><span>N.º 2026-A-0471</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:9.5px;color:var(--mep-fg-3);font-family:var(--mep-fs-mono);">
      <span>Fecha</span><span>19/05/2026</span>
    </div>
    <div style="height:1px;background:var(--mep-divider);margin:4px 0;"></div>
    {#each ['Solomillo ibérico','Costillas cerdo','Carrillera','Chorizo cular','Lomo embuchado'] as prod, pi}
      <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--mep-fg-2);font-family:var(--mep-fs-mono);">
        <span>{prod}</span><span>{(20 + pi * 14).toFixed(2)} €</span>
      </div>
    {/each}
    <div style="flex:1;"></div>
    <div style="height:1px;background:var(--mep-divider);"></div>
    <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;color:var(--mep-fg);font-family:var(--mep-fs-mono);">
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
      <div style="font-size:11px;margin-top:5px;font-family:var(--mep-fs-mono);">albaran_aranda.jpg · 1.2 MB</div>
    </div>
    <div style="max-width:90%;background:#ffffff;color:#0a2618;
                border-radius:12px 12px 12px 4px;padding:8px 12px;font-size:12.5px;
                box-shadow:0 8px 20px rgba(0,0,0,0.12);font-weight:500;
                opacity:{textP};transform:translateY({(1 - textP) * 10}px);
                transition:opacity 120ms linear,transform 120ms linear;">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
        <span style="width:12px;height:12px;border-radius:6px;background:var(--mep-acc);
                     color:var(--mep-acc-fg);display:flex;align-items:center;
                     justify-content:center;font-size:8px;font-weight:700;">M</span>
        <span style="font-size:11px;font-weight:600;">Mise en Place</span>
      </div>
      {whatsappReply}
      <div style="font-size:10.5px;color:#5a8a6f;margin-top:3px;font-family:var(--mep-fs-mono);">14:02</div>
    </div>
  </div>
</div>
