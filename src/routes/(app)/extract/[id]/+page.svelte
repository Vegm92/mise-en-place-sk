<script lang="ts">
  import { untrack, onMount } from 'svelte';
  import type { PageData } from './$types';
  import { str } from '$lib/formatters';
  import { confColor } from '$lib/status';
  import ConfidenceDot from '$lib/components/mep/ConfidenceDot.svelte';
  import FieldInput from '$lib/components/mep/FieldInput.svelte';
  import { ChevronLeft, RefreshCw, Check, Sparkle, Plus, Trash, AlertTriangle } from 'lucide-svelte';

  const { data }: { data: PageData } = $props();

  type LineItem = {
    description?: string | null;
    quantity?: number | string | null;
    unit?: string | null;
    unit_price?: number | string | null;
    total_price?: number | string | null;
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
  const confidenceLabel = $derived(
    data.confidenceLevel === 'high' ? 'alta confianza' :
    data.confidenceLevel === 'medium' ? 'confianza media' : 'confianza baja'
  );

  const needsReview = (val: unknown) => !val && val !== 0;

  const lineTotal = $derived.by(() =>
    lineItems.reduce((s, item) => {
      const n = parseFloat(String(item.total_price ?? ''));
      return s + (isNaN(n) ? 0 : n);
    }, 0)
  );

  const extractedTotal = $derived.by(() => {
    const t = data.data?.total_amount;
    if (typeof t === 'number') return t as number;
    const n = parseFloat(String(t ?? ''));
    return isNaN(n) ? 0 : n;
  });

  const discrepancy = $derived(Math.abs(lineTotal - extractedTotal));
  const hasDiscrepancy = $derived(discrepancy > 0.01 && extractedTotal > 0);
  const ivaAmt = $derived(lineTotal * 0.1);
  const totalCalc = $derived(lineTotal + ivaAmt);
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
        <strong class="body-strong" style="color:var(--mep-neg);display:block;margin-bottom:6px;">Error de extracción</strong>
        <p style="font-size:13px;color:var(--mep-neg);">{data.error}</p>
      </div>
      <div style="display:flex;gap:8px;">
        <a href="/extract/{data.id}" class="btn btn-primary" style="height:34px;text-decoration:none;font-size:13px;">
          Reintentar
        </a>
        <form method="POST" action="?/discard">
          <button type="submit" class="btn btn-ghost" style="height:34px;font-size:13px;">Descartar</button>
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
          <div style="font-size:11.5px;color:var(--mep-fg-3);">Factura {data.invoiceIndex} de {data.totalInvoices}</div>
        {/if}
        <div style="font-size:16px;font-weight:600;color:var(--mep-fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          Revisar {invoiceNumber} · {supplierName}
        </div>
      </div>
      <span class="badge" style="background:var(--mep-acc-soft);color:var(--mep-acc);display:inline-flex;align-items:center;gap:5px;flex-shrink:0;">
        <Sparkle size={11} />
        Extraído por IA · {confidenceLabel}
      </span>
      <a href="/extract/{data.id}" class="btn btn-ghost" style="height:30px;font-size:12.5px;gap:5px;text-decoration:none;flex-shrink:0;">
        <RefreshCw size={13} /> Reextraer
      </a>
      <form method="POST" action="?/discard" style="flex-shrink:0;">
        <button type="submit" class="btn btn-secondary" style="height:30px;font-size:13px;">Descartar</button>
      </form>
      <button type="submit" form="save-form" class="btn btn-primary" style="height:30px;font-size:13px;gap:5px;flex-shrink:0;">
        <Check size={14} /> Confirmar y guardar
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
        <div style="flex:1;overflow:auto;padding:18px;background:var(--mep-surface-2);background-image:radial-gradient(circle, var(--mep-divider) 1px, transparent 1px);background-size:12px 12px;">
          <!-- Faux Spanish invoice -->
          <div style="background:#fff;color:#16181b;width:100%;max-width:480px;margin:0 auto;padding:24px 28px;box-shadow:0 10px 30px rgba(0,0,0,0.10),0 2px 6px rgba(0,0,0,0.06);border-radius:4px;font-family:var(--mep-font);font-size:10px;">
            <div style="display:flex;justify-content:space-between;border-bottom:2px solid #16181b;padding-bottom:14px;margin-bottom:14px;">
              <div>
                <div style="font-size:15px;font-weight:700;letter-spacing:-0.4px;">{supplierName}</div>
                <div style="font-size:9px;color:#555;margin-top:4px;line-height:1.5;">Proveedor registrado</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:0.06em;">Factura</div>
                <div class="num" style="font-size:13px;font-weight:600;">{invoiceNumber}</div>
                <div class="num" style="font-size:9px;color:#555;margin-top:4px;">{str(data.data?.invoice_date) || '—'}</div>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;font-size:9px;">
              <div>
                <div style="color:#888;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;">Cliente</div>
                <div style="font-weight:600;">Casa Lúa S.L.</div>
                <div style="color:#555;">C/ Almirante 12 · 28004 Madrid</div>
              </div>
              <div>
                <div style="color:#888;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;">Forma de pago</div>
                <div>Transferencia</div>
                <div style="color:#555;margin-top:4px;">Vencimiento: <span class="num">{str(data.data?.due_date) || '—'}</span></div>
              </div>
            </div>

            {#if lineItems.length > 0}
              <table style="width:100%;border-collapse:collapse;font-size:9px;">
                <thead>
                  <tr style="background:#f3f1ec;">
                    <th style="text-align:left;padding:5px 6px;font-weight:500;">Descripción</th>
                    <th class="num" style="text-align:right;padding:5px 6px;font-weight:500;">Cant.</th>
                    <th style="text-align:left;padding:5px 6px;font-weight:500;">Ud.</th>
                    <th class="num" style="text-align:right;padding:5px 6px;font-weight:500;">P. Unit.</th>
                    <th class="num" style="text-align:right;padding:5px 6px;font-weight:500;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {#each lineItems.slice(0, 8) as item}
                    <tr style="border-bottom:1px solid #eee;">
                      <td style="padding:4px 6px;">{str(item.description) || '—'}</td>
                      <td class="num" style="text-align:right;padding:4px 6px;">{str(item.quantity) || '—'}</td>
                      <td style="padding:4px 6px;color:#555;">{str(item.unit) || ''}</td>
                      <td class="num" style="text-align:right;padding:4px 6px;">{str(item.unit_price) || '—'}</td>
                      <td class="num" style="text-align:right;padding:4px 6px;">{str(item.total_price) || '—'}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
              {#if lineItems.length > 8}
                <div style="text-align:center;font-size:8px;color:#888;padding:8px 0;font-style:italic;">… continúa</div>
              {/if}
            {/if}

            <div style="border-top:1px solid #ccc;padding-top:8px;margin-top:8px;">
              <div style="display:flex;justify-content:space-between;font-size:9px;margin-bottom:2px;">
                <span>Base imponible</span><span class="num">{fmt(lineTotal)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:9px;margin-bottom:4px;">
                <span>IVA (10%)</span><span class="num">{fmt(ivaAmt)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:600;padding-top:6px;border-top:1px solid #16181b;">
                <span>TOTAL</span><span class="num">{fmt(extractedTotal > 0 ? extractedTotal : totalCalc)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: data panel (form) -->
      <form id="save-form" method="POST" action="?/save" style="display:contents;">
        <input type="hidden" name="confidence" value={str(confidence)} />

        <div class="card" style="padding:0;display:flex;flex-direction:column;overflow:hidden;">

          <!-- Cabecera -->
          <div style="padding:14px 16px;border-bottom:1px solid var(--mep-divider);flex-shrink:0;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <div class="subtitle">Cabecera</div>
              <span style="font-size:11px;color:var(--mep-fg-3);">Tab para navegar entre campos</span>
            </div>

            {#if uncertainCount > 0}
              <div style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--mep-warn);background:var(--mep-warn-soft);padding:6px 10px;border-radius:6px;margin-bottom:10px;">
                <AlertTriangle size={12} />
                {uncertainCount} campo{uncertainCount !== 1 ? 's' : ''} con confianza baja — revisa antes de confirmar
              </div>
            {/if}

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 14px;">

              <FieldInput
                label="Proveedor"
                name="supplier_name"
                value={str(data.data?.supplier_name)}
                confidence={fieldConf.supplier_name}
                empty={needsReview(data.data?.supplier_name)}
              />
              <FieldInput
                label="N.º factura"
                name="invoice_number"
                value={str(data.data?.invoice_number)}
                confidence={fieldConf.invoice_number}
                empty={needsReview(data.data?.invoice_number)}
                num
              />

              <FieldInput
                label="Fecha factura"
                name="invoice_date"
                value={str(data.data?.invoice_date)}
                confidence={fieldConf.invoice_date}
                empty={needsReview(data.data?.invoice_date)}
                placeholder="YYYY-MM-DD"
                num
              />
              <FieldInput
                label="Vencimiento"
                name="due_date"
                value={str(data.data?.due_date)}
                confidence={fieldConf.due_date}
                placeholder="YYYY-MM-DD"
                num
              />

              <FieldInput
                label="Moneda"
                name="currency"
                value="EUR"
                num
                readonly
              />
              <FieldInput
                label="Total"
                name="total_amount"
                value={str(data.data?.total_amount)}
                confidence={fieldConf.total_amount}
                warnMsg={hasDiscrepancy ? `No coincide con suma calculada (${fmt(totalCalc)}). Revisar.` : undefined}
                num
              />

              <!-- Notes -->
              <div style="grid-column:span 2;">
                <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px;">Notas internas <span style="text-transform:none;letter-spacing:0;">(opcional)</span></div>
                <textarea name="notes" maxlength={250} rows={2}
                  placeholder="Observaciones sobre esta factura…"
                  style="width:100%;font-size:13px;color:var(--mep-fg);padding:5px 8px;border-radius:5px;background:var(--mep-surface-2);border:1px solid transparent;border-bottom:1px solid var(--mep-divider);outline:none;font-family:var(--mep-font);resize:vertical;"></textarea>
              </div>
            </div>
          </div>

          <!-- Line items -->
          <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;">
            <div style="padding:12px 16px 6px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
              <div class="subtitle">
                Líneas <span class="num" style="color:var(--mep-fg-3);font-weight:400;">· {lineItems.length}</span>
              </div>
              <button type="button" class="btn btn-ghost" style="height:26px;font-size:12px;padding:0 8px;gap:5px;" onclick={addRow}>
                <Plus size={12} /> Añadir línea
              </button>
            </div>
            <div style="overflow:auto;flex:1;">
              <table class="tbl" style="table-layout:fixed;width:100%;">
                <thead>
                  <tr>
                    <th style="width:38%;">Descripción</th>
                    <th class="num" style="width:60px;">Cant.</th>
                    <th style="width:52px;">Unidad</th>
                    <th class="num" style="width:86px;">P. unitario</th>
                    <th class="num" style="width:86px;">Total</th>
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
                          <ConfidenceDot confidence={itemConf} size={6} />
                          {#if rowFlagged}
                            <span style="color:var(--mep-warn);display:inline-flex;flex-shrink:0;" title="Confianza baja">
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
                  Discrepancia · {fmt(discrepancy)}
                </div>
                <div style="font-size:11.5px;color:var(--mep-fg-2);margin-top:4px;line-height:1.4;">
                  El total extraído no cuadra con la suma de las líneas + IVA. Revisa antes de confirmar.
                </div>
              {:else if lineItems.length > 0}
                <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--mep-pos);font-weight:500;">
                  <Check size={12} />
                  Totales cuadran
                </div>
                <div style="font-size:11.5px;color:var(--mep-fg-3);margin-top:4px;">
                  La suma de líneas coincide con el total extraído.
                </div>
              {:else}
                <div style="font-size:12px;color:var(--mep-fg-3);">Sin líneas — añade artículos para verificar totales.</div>
              {/if}
            </div>

            <!-- Totals breakdown -->
            <div style="display:flex;flex-direction:column;gap:2px;">
              <div style="display:flex;justify-content:space-between;padding:2px 0;">
                <span style="font-size:12.5px;color:var(--mep-fg-2);">Base imponible</span>
                <span class="num" style="font-size:12.5px;font-weight:500;color:var(--mep-fg);">{fmt(lineTotal)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:2px 0;">
                <span style="font-size:12.5px;color:var(--mep-fg-2);">IVA (10%)</span>
                <span class="num" style="font-size:12.5px;font-weight:500;color:var(--mep-fg);">{fmt(ivaAmt)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:2px 0;">
                <span style="font-size:12.5px;color:var(--mep-fg);">Total calculado</span>
                <span class="num" style="font-size:14px;font-weight:600;color:var(--mep-fg);">{fmt(totalCalc)}</span>
              </div>
              {#if hasDiscrepancy}
                <div style="display:flex;justify-content:space-between;padding:2px 0;">
                  <span style="font-size:12.5px;color:var(--mep-fg-3);">Total extraído</span>
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
