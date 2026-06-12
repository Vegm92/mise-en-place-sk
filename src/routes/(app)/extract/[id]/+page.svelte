<script lang="ts">
  import { untrack, onMount, tick } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import type { PageData } from './$types';
  import { str } from '$lib/formatters';
  import ConfidenceDot from '$lib/components/mep/ConfidenceDot.svelte';
  import FieldInput from '$lib/components/mep/FieldInput.svelte';
  import { ChevronLeft, RefreshCw, Check, Sparkle, Plus, Trash, AlertTriangle } from 'lucide-svelte';
  import { t } from '$lib/i18n';

  import type { ActionData } from './$types';
  const { data, form }: { data: PageData; form: ActionData } = $props();

  let lowConfAck = $state(false);
  let showLowConfModal = $state(false);
  let showContentDuplicateModal = $state(false);

  $effect(() => {
    const f = form as Record<string, unknown> | null;
    if (f?.lowConfidenceBlocked) showLowConfModal = true;
    if (f?.contentDuplicate) showContentDuplicateModal = true;
  });

  type LineItem = {
    description?: string | null;
    quantity?: number | string | null;
    unit?: string | null;
    unit_price?: number | string | null;
    total_price?: number | string | null;
    tax_rate?: number | null;
    confidence?: number | null;
  };

  let lineItems = $state<LineItem[]>(untrack(() => {
    const raw = data.data?.line_items;
    const items = Array.isArray(raw) ? (raw as LineItem[]) : [];
    return items.length > 0 ? items : [];
  }));

  function addRow() {
    lineItems = [...lineItems, { description: '', quantity: '', unit: '', unit_price: '', total_price: '' }];
  }
  function removeRow(i: number) {
    lineItems = lineItems.filter((_, j) => j !== i);
  }

  const fieldConf = $derived((data.fieldConfidences ?? {}) as Record<string, number>);

  const HEADER_FIELDS = ['supplier_name', 'invoice_number', 'invoice_date', 'due_date', 'total_amount'] as const;

  const uncertainHeaderFields = $derived(
    HEADER_FIELDS.filter(f => fieldConf[f] != null && fieldConf[f] < 0.85)
  );
  const uncertainLineCount = $derived(
    lineItems.filter(item => item.confidence != null && item.confidence < 0.85).length
  );
  const uncertainCount = $derived(uncertainHeaderFields.length + uncertainLineCount);

  const firstUncertainField = $derived(
    HEADER_FIELDS.find(f => fieldConf[f] != null && fieldConf[f] < 0.85) ?? null
  );

  onMount(() => {
    // Focus first uncertain field when review form is visible
    if (data.extractionStatus === 'done' && firstUncertainField) {
      const input = document.querySelector<HTMLElement>(`input[name="${firstUncertainField}"]`);
      if (input) {
        input.scrollIntoView({ block: 'center', behavior: 'smooth' });
        input.focus();
      }
    }

    // Poll for extraction completion when job is in flight
    let timer: ReturnType<typeof setInterval> | null = null;
    if (data.extractionStatus === 'queued' || data.extractionStatus === 'extracting') {
      timer = setInterval(async () => {
        try {
          const resp = await fetch(`/api/extraction-status/${data.id}`);
          if (!resp.ok) return;
          const body = await resp.json() as { status: string };
          if (body.status === 'done' || body.status === 'failed') {
            if (timer) clearInterval(timer);
            await invalidateAll();
          }
        } catch {
          // network error — keep polling
        }
      }, 3000);
    }

    return () => { if (timer) clearInterval(timer); };
  });

  const confidence = $derived(
    typeof data.data?.confidence === 'number' ? (data.data.confidence as number) : 0
  );
  const confidenceBadgeKey = $derived(
    data.confidenceLevel === 'high' ? 'extract.badge.high' :
    data.confidenceLevel === 'medium' ? 'extract.badge.med' : 'extract.badge.low'
  );

  const needsReview = (val: unknown) => !val && val !== 0;

  const lineTotal = $derived.by(() =>
    lineItems.reduce((s, item) => {
      const n = parseFloat(String(item.total_price ?? ''));
      return s + (isNaN(n) ? 0 : n);
    }, 0)
  );

  const extractedTotal = $derived.by(() => {
    const amt = data.data?.total_amount;
    if (typeof amt === 'number') return amt as number;
    const n = parseFloat(String(amt ?? ''));
    return isNaN(n) ? 0 : n;
  });

  const taxBreakdown = $derived.by(() => {
    const raw = data.data?.tax_breakdown;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return raw as Array<{ rate: number; base: number; tax_amount: number }>;
  });
  const taxTotal = $derived(
    taxBreakdown ? taxBreakdown.reduce((s, b) => s + ((b as { tax_amount: number }).tax_amount ?? 0), 0) : 0
  );
  const totalCalc = $derived(lineTotal + taxTotal);
  const discrepancy = $derived(Math.abs(totalCalc - extractedTotal));
  const hasDiscrepancy = $derived(discrepancy > 0.01 && extractedTotal > 0);
  const filename = $derived(data.filenames?.[0] ?? 'factura.pdf');
  const supplierName = $derived(str(data.data?.supplier_name) || '—');
  const invoiceNumber = $derived(str(data.data?.invoice_number) || '—');

  function fmt(n: number) { return n.toFixed(2).replace('.', ',') + ' €'; }
  function fmtN(n: number) { return n.toFixed(2).replace('.', ','); }
</script>

<div style="height:100%;display:flex;flex-direction:column;overflow:hidden;">

  {#if data.extractionStatus === 'queued' || data.extractionStatus === 'extracting'}
    <div style="padding:48px 32px;display:flex;flex-direction:column;align-items:center;gap:20px;max-width:480px;margin:0 auto;text-align:center;">
      <div style="width:48px;height:48px;border:3px solid var(--mep-acc);border-top-color:transparent;border-radius:50%;animation:spin 0.9s linear infinite;"></div>
      <div>
        <div style="font-size:16px;font-weight:600;color:var(--mep-fg);margin-bottom:6px;">Extrayendo factura…</div>
        <div style="font-size:13px;color:var(--mep-fg-3);line-height:1.5;">La IA está procesando tu documento. Esto suele tardar entre 15 y 45 segundos.</div>
      </div>
      <form method="POST" action="?/discard">
        <button type="submit" class="btn btn-ghost" style="height:34px;font-size:13px;">{$t('extract.discard')}</button>
      </form>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>

  {:else if data.error}
    <div style="padding:32px;display:flex;flex-direction:column;gap:12px;max-width:560px;">
      <div class="card p-4" style="background:var(--mep-neg-soft);border-color:var(--mep-neg);">
        <strong class="body-strong" style="color:var(--mep-neg);display:block;margin-bottom:6px;">{$t('extract.error')}</strong>
        <p style="font-size:13px;color:var(--mep-neg);">{$t(data.error ?? '')}</p>
      </div>
      <div style="display:flex;gap:8px;">
        <a href="/confirm/{data.id}" class="btn btn-primary" style="height:34px;text-decoration:none;font-size:13px;">
          {$t('extract.retry')}
        </a>
        <form method="POST" action="?/discard">
          <button type="submit" class="btn btn-ghost" style="height:34px;font-size:13px;">{$t('extract.discard')}</button>
        </form>
      </div>
    </div>

  {:else}

  <div style="flex:1;padding:20px 28px;display:flex;flex-direction:column;gap:16px;min-height:0;overflow:hidden;">

    <!-- First-run onboarding callout -->
    {#if !data.hasCompletedOnboarding}
      <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:6px;background:var(--mep-acc-soft);border-left:3px solid var(--mep-acc);flex-shrink:0;">
        <Sparkle size={13} style="flex-shrink:0;color:var(--mep-acc);" />
        <span style="font-size:12.5px;color:var(--mep-acc);">
          Esto es lo que encontró la IA. Revisa los campos y corrige cualquier error — solo tarda unos segundos.
          Cuando estés listo, pulsa <strong>Confirmar y guardar</strong>.
        </span>
      </div>
    {/if}

    <!-- Header bar -->
    <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
      <a href="/confirm/{data.id}" class="btn btn-ghost" style="width:32px;height:32px;padding:0;justify-content:center;text-decoration:none;flex-shrink:0;">
        <ChevronLeft size={15} />
      </a>
      <div style="flex:1;min-width:0;">
        {#if data.totalInvoices > 1}
          <div style="font-size:11.5px;color:var(--mep-fg-3);">{$t('extract.invoiceOf').replace('{i}', String(data.invoiceIndex)).replace('{n}', String(data.totalInvoices))}</div>
        {/if}
        <div style="font-size:16px;font-weight:600;color:var(--mep-fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          {invoiceNumber} · {supplierName}
        </div>
        <div style="display:flex;align-items:center;gap:4px;margin-top:2px;">
          <Sparkle size={10} style="color:var(--mep-acc);flex-shrink:0;" />
          <span style="font-size:11px;color:var(--mep-acc);">{$t('extract.aiExtracted')} · {$t(confidenceBadgeKey)}</span>
        </div>
      </div>
      <a href="/extract/{data.id}" class="btn btn-ghost" style="width:32px;height:32px;padding:0;justify-content:center;text-decoration:none;flex-shrink:0;" title={$t('extract.reextract')}>
        <RefreshCw size={14} />
      </a>
      <form method="POST" action="?/discard" style="flex-shrink:0;">
        <button type="submit" class="btn btn-secondary" style="height:34px;font-size:13px;padding:0 14px;">{$t('extract.discard')}</button>
      </form>
      <button type="submit" form="save-form" class="btn btn-primary" style="height:34px;font-size:13px;gap:6px;flex-shrink:0;padding:0 16px;">
        <Check size={14} /> {$t('extract.confirmSave')}
      </button>
    </div>

    <!-- Two-column grid -->
    <div style="display:grid;grid-template-columns:0.85fr 1.15fr;gap:20px;flex:1;min-height:0;overflow:hidden;">

      <!-- Left: doc viewer -->
      <div class="card" style="padding:0;overflow:hidden;display:flex;flex-direction:column;">
        <div style="padding:12px 16px;border-bottom:1px solid var(--mep-divider);display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <div style="flex:1;font-size:12px;color:var(--mep-fg-2);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            {filename} <span style="color:var(--mep-fg-3);font-weight:400;">· página 1</span>
          </div>
        </div>
        <div style="flex:1;overflow:hidden;background:var(--mep-surface-2);">
          <iframe
            src="/api/upload/{data.id}/{encodeURIComponent(filename)}"
            title="Document preview"
            style="width:100%;height:100%;border:none;display:block;"
          ></iframe>
        </div>
      </div>

      <!-- Right: data panel (form) -->
      <form id="save-form" method="POST" action="?/save" style="display:contents;">
        <input type="hidden" name="confidence" value={str(confidence)} />
        <input type="hidden" name="low_confidence_ack" value={lowConfAck ? 'true' : 'false'} />

        <div class="card" style="padding:0;display:flex;flex-direction:column;overflow:hidden;">

          <!-- Cabecera -->
          <div data-coach="invoice-fields" style="padding:18px 20px;border-bottom:1px solid var(--mep-divider);flex-shrink:0;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <div class="subtitle">{$t('extract.header')}</div>
              <span style="font-size:11px;color:var(--mep-fg-3);">{$t('extract.tabNav')}</span>
            </div>

            {#if uncertainCount > 0}
              <div style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--mep-warn);background:var(--mep-warn-soft);padding:6px 10px;border-radius:6px;margin-bottom:10px;">
                <AlertTriangle size={12} />
                {uncertainCount} campo{uncertainCount !== 1 ? 's' : ''} {$t('extract.lowConfFields')}
              </div>
            {/if}

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px 18px;">

              <!-- Proveedor | N.º factura -->
              <div>
                <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
                  {$t('field.supplier')}
                  <ConfidenceDot confidence={fieldConf.supplier_name} />
                </div>
                <input type="text" name="supplier_name" value={str(data.data?.supplier_name)}
                  aria-describedby={needsReview(data.data?.supplier_name) ? 'err-supplier_name' : undefined}
                  style="width:100%;font-size:13.5px;font-weight:500;color:var(--mep-fg);padding:8px 10px;border-radius:6px;background:var(--mep-surface-2);border:{needsReview(data.data?.supplier_name) ? '1px solid var(--mep-warn)' : '1px solid transparent'};border-bottom:{needsReview(data.data?.supplier_name) ? '2px solid var(--mep-warn)' : fieldConf.supplier_name != null && fieldConf.supplier_name < 0.85 ? '2px solid var(--mep-warn)' : '1px solid var(--mep-divider)'};outline:none;font-family:var(--mep-font);" />
                {#if needsReview(data.data?.supplier_name)}
                  <div id="err-supplier_name" style="font-size:11px;color:var(--mep-warn);margin-top:4px;display:flex;align-items:center;gap:4px;">
                    <AlertTriangle size={10} /> {$t('extract.fieldEmpty')}
                  </div>
                {/if}
              </div>
              <div>
                <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
                  {$t('field.invoiceNum')}
                  <ConfidenceDot confidence={fieldConf.invoice_number} />
                </div>
                <input type="text" name="invoice_number" value={str(data.data?.invoice_number)}
                  class="num"
                  style="width:100%;font-size:13.5px;font-weight:500;color:var(--mep-fg);padding:8px 10px;border-radius:6px;background:var(--mep-surface-2);border:{needsReview(data.data?.invoice_number) ? '1px solid var(--mep-warn)' : '1px solid transparent'};border-bottom:{needsReview(data.data?.invoice_number) ? '2px solid var(--mep-warn)' : fieldConf.invoice_number != null && fieldConf.invoice_number < 0.85 ? '2px solid var(--mep-warn)' : '1px solid var(--mep-divider)'};outline:none;font-family:var(--mep-font);" />
              </div>

              <!-- Fecha factura | Vencimiento -->
              <div>
                <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
                  {$t('field.invoiceDate')}
                  <ConfidenceDot confidence={fieldConf.invoice_date} />
                </div>
                <input type="text" name="invoice_date" value={str(data.data?.invoice_date)} placeholder="YYYY-MM-DD"
                  class="num"
                  style="width:100%;font-size:13.5px;font-weight:500;color:var(--mep-fg);padding:8px 10px;border-radius:6px;background:var(--mep-surface-2);border:{needsReview(data.data?.invoice_date) ? '1px solid var(--mep-warn)' : '1px solid transparent'};border-bottom:{needsReview(data.data?.invoice_date) ? '2px solid var(--mep-warn)' : fieldConf.invoice_date != null && fieldConf.invoice_date < 0.85 ? '2px solid var(--mep-warn)' : '1px solid var(--mep-divider)'};outline:none;font-family:var(--mep-font);" />
              </div>
              <div>
                <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
                  {$t('extract.due')}
                  <ConfidenceDot confidence={fieldConf.due_date} />
                </div>
                <input type="text" name="due_date" value={str(data.data?.due_date)} placeholder="YYYY-MM-DD"
                  class="num"
                  style="width:100%;font-size:13.5px;font-weight:500;color:var(--mep-fg);padding:8px 10px;border-radius:6px;background:var(--mep-surface-2);border:1px solid transparent;border-bottom:{fieldConf.due_date != null && fieldConf.due_date < 0.85 ? '2px solid var(--mep-warn)' : '1px solid var(--mep-divider)'};outline:none;font-family:var(--mep-font);" />
              </div>

              <!-- Moneda | Total -->
              <div>
                <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px;">{$t('extract.currency')}</div>
                <div class="num" style="font-size:13.5px;font-weight:500;color:var(--mep-fg);padding:8px 10px;border-radius:6px;background:var(--mep-surface-2);border:1px solid transparent;border-bottom:1px solid var(--mep-divider);">EUR</div>
              </div>
              <div>
                <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
                  {$t('tbl.total')}
                  <ConfidenceDot confidence={fieldConf.total_amount} />
                </div>
                <input type="text" name="total_amount" value={str(data.data?.total_amount)}
                  class="num"
                  aria-describedby={hasDiscrepancy ? 'err-total_amount' : undefined}
                  style="width:100%;font-size:13.5px;font-weight:{hasDiscrepancy ? 600 : 500};color:var(--mep-fg);padding:8px 10px;border-radius:6px;background:var(--mep-surface-2);border:{hasDiscrepancy ? '1px solid var(--mep-warn)' : '1px solid transparent'};border-bottom:{hasDiscrepancy ? '2px solid var(--mep-warn)' : fieldConf.total_amount != null && fieldConf.total_amount < 0.85 ? '2px solid var(--mep-warn)' : '1px solid var(--mep-divider)'};outline:none;font-family:var(--mep-font);" />
                {#if hasDiscrepancy}
                  <div id="err-total_amount" style="font-size:11px;color:var(--mep-warn);margin-top:4px;display:flex;align-items:center;gap:4px;">
                    <AlertTriangle size={10} /> {$t('extract.mismatch')} ({fmt(totalCalc)})
                  </div>
                {/if}
              </div>

              <!-- Notes -->
              <div style="grid-column:span 2;">
                <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px;">{$t('extract.notesInternal')} <span style="text-transform:none;letter-spacing:0;">{$t('extract.optional')}</span></div>
                <textarea name="notes" maxlength={250} rows={2}
                  placeholder={$t('extract.notesPh')}
                  style="width:100%;font-size:13px;color:var(--mep-fg);padding:8px 10px;border-radius:6px;background:var(--mep-surface-2);border:1px solid transparent;border-bottom:1px solid var(--mep-divider);outline:none;font-family:var(--mep-font);resize:vertical;"></textarea>
              </div>
            </div>
          </div>

          <!-- Line items -->
          <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;">
            <div style="padding:14px 20px 8px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
              <div class="subtitle">
                {$t('extract.lineItems')} <span class="num" style="color:var(--mep-fg-3);font-weight:400;">· {lineItems.length}</span>
              </div>
              <button type="button" class="btn btn-ghost" style="height:26px;font-size:12px;padding:0 8px;gap:5px;" onclick={addRow}>
                <Plus size={12} /> {$t('extract.addLine')}
              </button>
            </div>
            <div style="overflow:auto;flex:1;">
              <table class="tbl" style="table-layout:fixed;width:100%;">
                <thead>
                  <tr>
                    <th style="width:38%;">{$t('tbl.desc')}</th>
                    <th class="num" style="width:60px;">{$t('tbl.qty')}</th>
                    <th style="width:52px;">{$t('tbl.unit')}</th>
                    <th class="num" style="width:86px;">{$t('tbl.unitPrice')}</th>
                    <th class="num" style="width:86px;">{$t('tbl.total')}</th>
                    <th style="width:28px;"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each lineItems as item, i}
                    {@const rowFlagged = needsReview(item.description) || needsReview(item.total_price)}
                    {@const itemConf = typeof item.confidence === 'number' ? item.confidence : null}
                    {@const confLow = itemConf != null && itemConf < 0.85}
                    <tr style="background:{rowFlagged || confLow ? 'var(--mep-warn-soft)' : 'transparent'};">
                      <td style="padding:7px 10px;">
                        <div style="display:flex;align-items:center;gap:5px;">
                          <input type="text" name="line_descriptions" value={str(item.description)}
                            style="flex:1;min-width:0;font-size:12.5px;font-weight:500;color:var(--mep-fg);background:transparent;border:none;outline:none;font-family:var(--mep-font);" />
                          <ConfidenceDot confidence={itemConf} size={6} />
                          {#if rowFlagged}
                            <span style="color:var(--mep-warn);display:inline-flex;flex-shrink:0;" title={$t('extract.badge.low')}>
                              <AlertTriangle size={11} />
                            </span>
                          {/if}
                        </div>
                      </td>
                      <td class="num" style="padding:7px 10px;">
                        <input type="text" name="line_quantities" value={str(item.quantity)}
                          class="num"
                          style="width:100%;font-size:12px;color:var(--mep-fg);background:transparent;border:none;outline:none;text-align:right;font-family:var(--mep-font);" />
                      </td>
                      <td style="padding:7px 10px;">
                        <input type="text" name="line_units" value={str(item.unit)}
                          style="width:100%;font-size:12px;color:var(--mep-fg-2);background:transparent;border:none;outline:none;font-family:var(--mep-font);" />
                      </td>
                      <td class="num" style="padding:7px 10px;">
                        <input type="text" name="line_unit_prices" value={str(item.unit_price)}
                          class="num"
                          style="width:100%;font-size:12px;color:var(--mep-fg);background:transparent;border:none;outline:none;text-align:right;font-family:var(--mep-font);" />
                      </td>
                      <td class="num" style="padding:7px 10px;">
                        <input type="text" name="line_total_prices" value={str(item.total_price)}
                          class="num"
                          style="width:100%;font-size:12px;font-weight:500;color:var(--mep-fg);background:transparent;border:none;outline:none;text-align:right;font-family:var(--mep-font);" />
                      </td>
                      <td style="padding:7px 10px;">
                        <input type="hidden" name="line_tax_rates" value={str(item.tax_rate ?? '')} />
                        <button type="button" class="btn btn-ghost" style="width:22px;height:22px;padding:0;justify-content:center;" onclick={() => removeRow(i)}>
                          <Trash size={11} />
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Totals footer -->
          <div style="padding:16px 20px;border-top:1px solid var(--mep-divider);background:var(--mep-surface-2);display:grid;grid-template-columns:1fr 1fr;gap:20px;flex-shrink:0;">
            <!-- Discrepancy -->
            <div>
              {#if hasDiscrepancy}
                <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--mep-warn);font-weight:500;">
                  <AlertTriangle size={12} />
                  {$t('extract.discrepancy')} · {fmt(discrepancy)}
                </div>
                <div style="font-size:11.5px;color:var(--mep-fg-2);margin-top:4px;line-height:1.4;">
                  {$t('extract.discrepancyDesc')}
                </div>
              {:else if lineItems.length > 0}
                <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--mep-pos);font-weight:500;">
                  <Check size={12} />
                  {$t('extract.totalsMatch')}
                </div>
                <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:4px;">
                  {$t('extract.totalsMatchDesc')}
                </div>
              {:else}
                <div style="font-size:12px;color:var(--mep-fg-3);">{$t('extract.noLinesVerify')}</div>
              {/if}
            </div>

            <!-- Totals breakdown -->
            <div style="display:flex;flex-direction:column;gap:2px;">
              <div style="display:flex;justify-content:space-between;padding:2px 0;">
                <span style="font-size:12.5px;color:var(--mep-fg-2);">{$t('extract.taxBase')}</span>
                <span class="num" style="font-size:12.5px;font-weight:500;color:var(--mep-fg);">{fmt(lineTotal)}</span>
              </div>
              {#if taxBreakdown}
                {#each taxBreakdown as b}
                  <div style="display:flex;justify-content:space-between;padding:2px 0;">
                    <span style="font-size:12.5px;color:var(--mep-fg-2);">{$t('extract.vat')} ({(b.rate * 100).toFixed(0)}%)</span>
                    <span class="num" style="font-size:12.5px;font-weight:500;color:var(--mep-fg);">{fmt(b.tax_amount)}</span>
                  </div>
                {/each}
              {:else if taxTotal > 0}
                <div style="display:flex;justify-content:space-between;padding:2px 0;">
                  <span style="font-size:12.5px;color:var(--mep-fg-2);">{$t('extract.vat')}</span>
                  <span class="num" style="font-size:12.5px;font-weight:500;color:var(--mep-fg);">{fmt(taxTotal)}</span>
                </div>
              {/if}
              <div style="display:flex;justify-content:space-between;padding:2px 0;">
                <span style="font-size:12.5px;color:var(--mep-fg);">{$t('extract.calcTotal')}</span>
                <span class="num" style="font-size:14px;font-weight:600;color:var(--mep-fg);">{fmt(totalCalc)}</span>
              </div>
              {#if hasDiscrepancy}
                <div style="display:flex;justify-content:space-between;padding:2px 0;">
                  <span style="font-size:12.5px;color:var(--mep-fg-3);">{$t('extract.extractedTotal')}</span>
                  <span class="num" style="font-size:12.5px;font-weight:500;color:var(--mep-fg-3);text-decoration:line-through;">{fmt(extractedTotal)}</span>
                </div>
              {/if}
            </div>
          </div>

        </div>
      </form>

    </div>
  </div>
  {/if}

</div>

<!-- Content-duplicate block modal -->
{#if showContentDuplicateModal}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    style="position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:24px;"
    role="presentation"
    onclick={() => showContentDuplicateModal = false}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      style="background:var(--mep-bg);border:1px solid var(--mep-border-strong);border-radius:14px;padding:28px 24px;max-width:400px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,0.2);"
      role="dialog"
      aria-modal="true"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <AlertTriangle size={18} style="color:var(--mep-neg);flex-shrink:0;" />
        <strong style="font-size:15px;font-weight:600;color:var(--mep-fg);">Factura duplicada</strong>
      </div>
      <p style="font-size:13px;color:var(--mep-fg-2);line-height:1.6;margin:0 0 20px;">
        Esta factura ya existe en el sistema — el proveedor, la fecha, el importe y todas las líneas
        coinciden exactamente con una factura ya guardada. No se puede guardar una copia idéntica.
      </p>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button type="button" class="btn btn-secondary" style="height:36px;font-size:13px;"
          onclick={() => showContentDuplicateModal = false}>
          Volver a revisar
        </button>
        <a href="/" class="btn btn-primary" style="height:36px;font-size:13px;display:flex;align-items:center;">
          Ir al inicio
        </a>
      </div>
    </div>
  </div>
{/if}

<!-- Low-confidence review gate modal -->
{#if showLowConfModal}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    style="position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:24px;"
    role="presentation"
    onclick={() => showLowConfModal = false}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      style="background:var(--mep-bg);border:1px solid var(--mep-border-strong);border-radius:14px;padding:28px 24px;max-width:400px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,0.2);"
      role="dialog"
      aria-modal="true"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <AlertTriangle size={18} style="color:var(--mep-warn);flex-shrink:0;" />
        <strong style="font-size:15px;font-weight:600;color:var(--mep-fg);">Campos con baja confianza</strong>
      </div>
      <p style="font-size:13px;color:var(--mep-fg-2);line-height:1.6;margin:0 0 16px;">
        La IA detectó <strong>{uncertainCount}</strong> campo{uncertainCount !== 1 ? 's' : ''} con confianza baja.
        Por favor, revísalos cuidadosamente antes de guardar la factura — los datos financieros incorrectos afectan a tus informes.
      </p>
      {#if uncertainHeaderFields.length > 0}
        <ul style="font-size:12.5px;color:var(--mep-fg-3);margin:0 0 16px;padding-left:16px;">
          {#each uncertainHeaderFields as f}
            <li>{$t(`field.${f === 'supplier_name' ? 'supplier' : f === 'invoice_number' ? 'invoiceNum' : f === 'invoice_date' ? 'invoiceDate' : f === 'due_date' ? 'dueDate' : 'totalAmount'}`)}</li>
          {/each}
        </ul>
      {/if}
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px;">
        <button
          type="button"
          class="btn btn-secondary"
          style="height:36px;font-size:13px;"
          onclick={() => showLowConfModal = false}
        >
          Volver a revisar
        </button>
        <button
          type="button"
          class="btn btn-primary"
          style="height:36px;font-size:13px;"
          onclick={async () => {
            lowConfAck = true;
            showLowConfModal = false;
            await tick();
            (document.getElementById('save-form') as HTMLFormElement)?.requestSubmit();
          }}
        >
          He revisado todos los campos
        </button>
      </div>
    </div>
  </div>
{/if}
