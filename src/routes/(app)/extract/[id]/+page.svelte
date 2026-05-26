<script lang="ts">
  import { untrack, onMount } from 'svelte';
  import type { PageData } from './$types';
  import { str } from '$lib/formatters';
  import { confColor } from '$lib/status';
  import ConfidenceDot from '$lib/components/mep/ConfidenceDot.svelte';
  import FieldInput from '$lib/components/mep/FieldInput.svelte';
  import { ChevronLeft, RefreshCw, Check, Sparkle, Plus, Trash, AlertTriangle } from 'lucide-svelte';
  import { t } from '$lib/i18n';

  const { data }: { data: PageData } = $props();

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
    if (firstUncertainField) {
      const input = document.querySelector<HTMLElement>(`input[name="${firstUncertainField}"]`);
      if (input) {
        input.scrollIntoView({ block: 'center', behavior: 'smooth' });
        input.focus();
      }
    }
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

  {#if data.error}
    <div style="padding:32px;display:flex;flex-direction:column;gap:12px;max-width:560px;">
      <div class="card p-4" style="background:var(--mep-neg-soft);border-color:var(--mep-neg);">
        <strong class="body-strong" style="color:var(--mep-neg);display:block;margin-bottom:6px;">{$t('extract.error')}</strong>
        <p style="font-size:13px;color:var(--mep-neg);">{data.error}</p>
      </div>
      <div style="display:flex;gap:8px;">
        <a href="/extract/{data.id}" class="btn btn-primary" style="height:34px;text-decoration:none;font-size:13px;">
          {$t('extract.retry')}
        </a>
        <form method="POST" action="?/discard">
          <button type="submit" class="btn btn-ghost" style="height:34px;font-size:13px;">{$t('extract.discard')}</button>
        </form>
      </div>
    </div>
  {:else}

  <div style="flex:1;padding:20px 24px;display:flex;flex-direction:column;gap:14px;min-height:0;overflow:hidden;">

    <!-- Header bar -->
    <div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">
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
      </div>
      <span class="badge" style="background:var(--mep-acc-soft);color:var(--mep-acc);display:inline-flex;align-items:center;gap:5px;flex-shrink:0;">
        <Sparkle size={11} />
        {$t('extract.aiExtracted')} · {$t(confidenceBadgeKey)}
      </span>
      <a href="/extract/{data.id}" class="btn btn-ghost" style="height:30px;font-size:12.5px;gap:5px;text-decoration:none;flex-shrink:0;">
        <RefreshCw size={13} /> {$t('extract.reextract')}
      </a>
      <form method="POST" action="?/discard" style="flex-shrink:0;">
        <button type="submit" class="btn btn-secondary" style="height:30px;font-size:13px;">{$t('extract.discard')}</button>
      </form>
      <button type="submit" form="save-form" class="btn btn-primary" style="height:30px;font-size:13px;gap:5px;flex-shrink:0;">
        <Check size={14} /> {$t('extract.confirmSave')}
      </button>
    </div>

    <!-- Two-column grid -->
    <div style="display:grid;grid-template-columns:0.85fr 1.15fr;gap:14px;flex:1;min-height:0;overflow:hidden;">

      <!-- Left: doc viewer -->
      <div class="card" style="padding:0;overflow:hidden;display:flex;flex-direction:column;">
        <div style="padding:10px 14px;border-bottom:1px solid var(--mep-divider);display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <div style="flex:1;font-size:12px;color:var(--mep-fg-2);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            {filename} <span style="color:var(--mep-fg-3);font-weight:400;">· página 1</span>
          </div>
          <button type="button" class="btn btn-ghost" style="width:26px;height:26px;padding:0;justify-content:center;font-size:14px;">−</button>
          <span class="num" style="font-size:11.5px;color:var(--mep-fg-3);">100%</span>
          <button type="button" class="btn btn-ghost" style="width:26px;height:26px;padding:0;justify-content:center;font-size:14px;">+</button>
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

        <div class="card" style="padding:0;display:flex;flex-direction:column;overflow:hidden;">

          <!-- Cabecera -->
          <div style="padding:14px 16px;border-bottom:1px solid var(--mep-divider);flex-shrink:0;">
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

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 14px;">

              <!-- Proveedor | N.º factura -->
              <div>
                <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
                  {$t('field.supplier')}
                  {#if fieldConf.supplier_name != null}
                    <span style="width:7px;height:7px;border-radius:50%;background:{confColor(fieldConf.supplier_name)};display:inline-block;flex-shrink:0;" title="{Math.round((fieldConf.supplier_name ?? 1) * 100)}{$t('extract.confTooltip')}"></span>
                  {/if}
                </div>
                <input type="text" name="supplier_name" value={str(data.data?.supplier_name)}
                  style="width:100%;font-size:13.5px;font-weight:500;color:var(--mep-fg);padding:5px 8px;border-radius:5px;background:var(--mep-surface-2);border:{needsReview(data.data?.supplier_name) ? '1px solid var(--mep-warn)' : '1px solid transparent'};border-bottom:{needsReview(data.data?.supplier_name) ? '2px solid var(--mep-warn)' : fieldConf.supplier_name != null && fieldConf.supplier_name < 0.85 ? '2px solid var(--mep-warn)' : '1px solid var(--mep-divider)'};outline:none;font-family:var(--mep-font);" />
                {#if needsReview(data.data?.supplier_name)}
                  <div style="font-size:11px;color:var(--mep-warn);margin-top:4px;display:flex;align-items:center;gap:4px;">
                    <AlertTriangle size={10} /> {$t('extract.fieldEmpty')}
                  </div>
                {/if}
              </div>
              <div>
                <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
                  {$t('field.invoiceNum')}
                  {#if fieldConf.invoice_number != null}
                    <span style="width:7px;height:7px;border-radius:50%;background:{confColor(fieldConf.invoice_number)};display:inline-block;flex-shrink:0;" title="{Math.round((fieldConf.invoice_number ?? 1) * 100)}{$t('extract.confTooltip')}"></span>
                  {/if}
                </div>
                <input type="text" name="invoice_number" value={str(data.data?.invoice_number)}
                  class="num"
                  style="width:100%;font-size:13.5px;font-weight:500;color:var(--mep-fg);padding:5px 8px;border-radius:5px;background:var(--mep-surface-2);border:{needsReview(data.data?.invoice_number) ? '1px solid var(--mep-warn)' : '1px solid transparent'};border-bottom:{needsReview(data.data?.invoice_number) ? '2px solid var(--mep-warn)' : fieldConf.invoice_number != null && fieldConf.invoice_number < 0.85 ? '2px solid var(--mep-warn)' : '1px solid var(--mep-divider)'};outline:none;font-family:var(--mep-font);" />
              </div>

              <!-- Fecha factura | Vencimiento -->
              <div>
                <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
                  {$t('field.invoiceDate')}
                  {#if fieldConf.invoice_date != null}
                    <span style="width:7px;height:7px;border-radius:50%;background:{confColor(fieldConf.invoice_date)};display:inline-block;flex-shrink:0;" title="{Math.round((fieldConf.invoice_date ?? 1) * 100)}{$t('extract.confTooltip')}"></span>
                  {/if}
                </div>
                <input type="text" name="invoice_date" value={str(data.data?.invoice_date)} placeholder="YYYY-MM-DD"
                  class="num"
                  style="width:100%;font-size:13.5px;font-weight:500;color:var(--mep-fg);padding:5px 8px;border-radius:5px;background:var(--mep-surface-2);border:{needsReview(data.data?.invoice_date) ? '1px solid var(--mep-warn)' : '1px solid transparent'};border-bottom:{needsReview(data.data?.invoice_date) ? '2px solid var(--mep-warn)' : fieldConf.invoice_date != null && fieldConf.invoice_date < 0.85 ? '2px solid var(--mep-warn)' : '1px solid var(--mep-divider)'};outline:none;font-family:var(--mep-font);" />
              </div>
              <div>
                <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
                  {$t('extract.due')}
                  {#if fieldConf.due_date != null}
                    <span style="width:7px;height:7px;border-radius:50%;background:{confColor(fieldConf.due_date)};display:inline-block;flex-shrink:0;" title="{Math.round((fieldConf.due_date ?? 1) * 100)}{$t('extract.confTooltip')}"></span>
                  {/if}
                </div>
                <input type="text" name="due_date" value={str(data.data?.due_date)} placeholder="YYYY-MM-DD"
                  class="num"
                  style="width:100%;font-size:13.5px;font-weight:500;color:var(--mep-fg);padding:5px 8px;border-radius:5px;background:var(--mep-surface-2);border:1px solid transparent;border-bottom:{fieldConf.due_date != null && fieldConf.due_date < 0.85 ? '2px solid var(--mep-warn)' : '1px solid var(--mep-divider)'};outline:none;font-family:var(--mep-font);" />
              </div>

              <!-- Moneda | Total -->
              <div>
                <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px;">{$t('extract.currency')}</div>
                <div class="num" style="font-size:13.5px;font-weight:500;color:var(--mep-fg);padding:5px 8px;border-radius:5px;background:var(--mep-surface-2);border:1px solid transparent;border-bottom:1px solid var(--mep-divider);">EUR</div>
              </div>
              <div>
                <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
                  {$t('tbl.total')}
                  {#if fieldConf.total_amount != null}
                    <span style="width:7px;height:7px;border-radius:50%;background:{confColor(fieldConf.total_amount)};display:inline-block;flex-shrink:0;" title="{Math.round((fieldConf.total_amount ?? 1) * 100)}{$t('extract.confTooltip')}"></span>
                  {/if}
                </div>
                <input type="text" name="total_amount" value={str(data.data?.total_amount)}
                  class="num"
                  style="width:100%;font-size:13.5px;font-weight:{hasDiscrepancy ? 600 : 500};color:var(--mep-fg);padding:5px 8px;border-radius:5px;background:var(--mep-surface-2);border:{hasDiscrepancy ? '1px solid var(--mep-warn)' : '1px solid transparent'};border-bottom:{hasDiscrepancy ? '2px solid var(--mep-warn)' : fieldConf.total_amount != null && fieldConf.total_amount < 0.85 ? '2px solid var(--mep-warn)' : '1px solid var(--mep-divider)'};outline:none;font-family:var(--mep-font);" />
                {#if hasDiscrepancy}
                  <div style="font-size:11px;color:var(--mep-warn);margin-top:4px;display:flex;align-items:center;gap:4px;">
                    <AlertTriangle size={10} /> {$t('extract.mismatch')} ({fmt(totalCalc)})
                  </div>
                {/if}
              </div>

              <!-- Notes -->
              <div style="grid-column:span 2;">
                <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px;">{$t('extract.notesInternal')} <span style="text-transform:none;letter-spacing:0;">{$t('extract.optional')}</span></div>
                <textarea name="notes" maxlength={250} rows={2}
                  placeholder={$t('extract.notesPh')}
                  style="width:100%;font-size:13px;color:var(--mep-fg);padding:5px 8px;border-radius:5px;background:var(--mep-surface-2);border:1px solid transparent;border-bottom:1px solid var(--mep-divider);outline:none;font-family:var(--mep-font);resize:vertical;"></textarea>
              </div>
            </div>
          </div>

          <!-- Line items -->
          <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;">
            <div style="padding:12px 16px 6px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
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
                      <td style="padding:4px 8px;">
                        <div style="display:flex;align-items:center;gap:5px;">
                          <input type="text" name="line_descriptions" value={str(item.description)}
                            style="flex:1;min-width:0;font-size:12.5px;font-weight:500;color:var(--mep-fg);background:transparent;border:none;outline:none;font-family:var(--mep-font);" />
                          {#if itemConf != null}
                            <span style="width:6px;height:6px;border-radius:50%;background:{confColor(itemConf)};display:inline-block;flex-shrink:0;" title="{Math.round(itemConf * 100)}{$t('extract.confTooltip')}"></span>
                          {/if}
                          {#if rowFlagged}
                            <span style="color:var(--mep-warn);display:inline-flex;flex-shrink:0;" title={$t('extract.badge.low')}>
                              <AlertTriangle size={11} />
                            </span>
                          {/if}
                        </div>
                      </td>
                      <td class="num" style="padding:4px 8px;">
                        <input type="text" name="line_quantities" value={str(item.quantity)}
                          class="num"
                          style="width:100%;font-size:12px;color:var(--mep-fg);background:transparent;border:none;outline:none;text-align:right;font-family:var(--mep-font);" />
                      </td>
                      <td style="padding:4px 8px;">
                        <input type="text" name="line_units" value={str(item.unit)}
                          style="width:100%;font-size:12px;color:var(--mep-fg-2);background:transparent;border:none;outline:none;font-family:var(--mep-font);" />
                      </td>
                      <td class="num" style="padding:4px 8px;">
                        <input type="text" name="line_unit_prices" value={str(item.unit_price)}
                          class="num"
                          style="width:100%;font-size:12px;color:var(--mep-fg);background:transparent;border:none;outline:none;text-align:right;font-family:var(--mep-font);" />
                      </td>
                      <td class="num" style="padding:4px 8px;">
                        <input type="text" name="line_total_prices" value={str(item.total_price)}
                          class="num"
                          style="width:100%;font-size:12px;font-weight:500;color:var(--mep-fg);background:transparent;border:none;outline:none;text-align:right;font-family:var(--mep-font);" />
                      </td>
                      <td style="padding:4px 8px;">
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
          <div style="padding:12px 16px;border-top:1px solid var(--mep-divider);background:var(--mep-surface-2);display:grid;grid-template-columns:1fr 1fr;gap:16px;flex-shrink:0;">
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
