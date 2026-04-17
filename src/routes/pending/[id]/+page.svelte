<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { PageData } from './$types';

  const { data }: { data: PageData } = $props();

  const isProcessing = !data.pending.rawLlmJson && data.pending.status === 'PENDING_REVIEW';
  let pollInterval: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    if (!isProcessing) return;
    pollInterval = setInterval(async () => {
      try {
        const resp = await fetch(`/api/inference-status/${data.pending.id}`);
        if (!resp.ok) return;
        const json = await resp.json();
        if (json.status !== 'PENDING_REVIEW' || json.isReady) {
          clearInterval(pollInterval);
          pollInterval = undefined;
          location.replace(`/pending/${data.pending.id}`);
        }
      } catch {
        // keep polling
      }
    }, 2000);
  });

  onDestroy(() => {
    if (pollInterval !== undefined) clearInterval(pollInterval);
  });

  type LineItemRow = {
    id: string;
    rawDescription: string;
    description: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    totalPrice: string;
    fuzzyScore: number;
    suggestedName: string | null;
    priceWarning: boolean;
  };

  let supplierName = $state<string>(data.pending.inferredSupplierName ?? '');
  let invoiceNumber = $state<string>(data.pending.invoiceNumber ?? '');
  let invoiceDate = $state<string>(data.pending.invoiceDate ?? '');
  let totalAmount = $state<string>(String(data.pending.totalAmount ?? ''));

  let rows = $state<LineItemRow[]>(
    data.lineItems.map((li: {
      id: string;
      rawDescription: string;
      suggestedName: string | null;
      quantity: number | string | null;
      unit: string | null;
      unitPrice: number | string | null;
      fuzzyScore: number;
      priceWarning: boolean;
    }) => ({
      id: li.id,
      rawDescription: li.rawDescription,
      description: li.suggestedName ?? li.rawDescription,
      quantity: String(li.quantity ?? ''),
      unit: li.unit ?? '',
      unitPrice: String(li.unitPrice ?? ''),
      totalPrice: computeTotal(li.quantity, li.unitPrice),
      fuzzyScore: li.fuzzyScore,
      suggestedName: li.suggestedName,
      priceWarning: li.priceWarning,
    }))
  );

  function computeTotal(qty: number | string | null, price: number | string | null): string {
    const q = parseFloat(String(qty ?? ''));
    const p = parseFloat(String(price ?? ''));
    if (isNaN(q) || isNaN(p)) return '';
    return (q * p).toFixed(2);
  }

  function recomputeRow(idx: number) {
    const row = rows[idx];
    row.totalPrice = computeTotal(row.quantity, row.unitPrice);
    rows = [...rows];
  }
</script>

<style>
  .page-title {
    font-size: 1.1rem;
    font-weight: 700;
    margin-bottom: 1.25rem;
    color: var(--text-primary);
  }

  .banner {
    border-radius: 8px;
    padding: .75rem 1rem;
    font-size: .875rem;
    margin-bottom: 1rem;
    font-weight: 500;
  }

  .banner-warn {
    background: var(--amber-bg);
    border: 1px solid #fde047;
    color: var(--amber);
  }

  .banner-danger {
    background: #fee2e2;
    border: 1px solid #fca5a5;
    color: var(--danger);
  }

  .card {
    background: var(--bg-card);
    border-radius: 12px;
    border: 1px solid var(--border);
    padding: 1.5rem;
    margin-bottom: 1rem;
  }

  .card-title {
    font-size: .875rem;
    font-weight: 700;
    margin-bottom: 1.1rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: .06em;
  }

  .field-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: .3rem;
  }

  .field.full {
    grid-column: 1 / -1;
  }

  .field-label {
    font-size: .78rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .field-input {
    padding: .45rem .65rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: .875rem;
    font-family: inherit;
    background: var(--bg-page);
    color: var(--text-primary);
    width: 100%;
  }

  .field-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .table-wrap {
    overflow-x: auto;
    margin-top: .25rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: .82rem;
  }

  th {
    text-align: left;
    padding: .45rem .65rem;
    background: var(--bg-page);
    font-weight: 700;
    font-size: .72rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: .05em;
    white-space: nowrap;
  }

  td {
    padding: .45rem .65rem;
    border-top: 1px solid var(--border);
    vertical-align: middle;
  }

  td input {
    width: 100%;
    padding: .3rem .45rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: .82rem;
    font-family: inherit;
    background: var(--bg-page);
    color: var(--text-primary);
  }

  td input:focus {
    outline: none;
    border-color: var(--accent);
  }

  td input[readonly] {
    background: var(--bg-page);
    color: var(--text-muted);
    cursor: default;
    border-color: transparent;
  }

  .raw-desc {
    font-size: .75rem;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
    display: block;
  }

  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: .3rem;
    margin-top: .25rem;
  }

  .badge-match {
    display: inline-block;
    font-size: .65rem;
    font-weight: 700;
    padding: .12rem .4rem;
    border-radius: 99px;
    background: #dcfce7;
    color: #166534;
    white-space: nowrap;
  }

  .badge-price {
    display: inline-block;
    font-size: .65rem;
    font-weight: 700;
    padding: .12rem .4rem;
    border-radius: 99px;
    background: #fee2e2;
    color: var(--danger);
    white-space: nowrap;
  }

  .actions {
    display: flex;
    gap: .75rem;
    align-items: center;
    margin-top: 1.25rem;
    flex-wrap: wrap;
  }

  .processing-overlay {
    position: fixed; inset: 0;
    background: rgba(20,20,30,.6);
    z-index: 100;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: .75rem;
  }
  .spinner {
    width: 40px; height: 40px;
    border: 3px solid rgba(255,255,255,.2);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin .7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .processing-main { font-size: .9375rem; font-weight: 600; color: #fff; }
  .processing-sub  { font-size: .8rem; color: rgba(255,255,255,.6); }

  @media (max-width: 640px) {
    .field-grid { grid-template-columns: 1fr; }
    .field.full { grid-column: 1 / -1; }
  }
</style>

{#if isProcessing}
  <div class="processing-overlay">
    <div class="spinner"></div>
    <p class="processing-main">Procesando factura con IA...</p>
    <p class="processing-sub">Esto puede tardar unos segundos.</p>
  </div>
{/if}

<div>
  <h1 class="page-title">Revisar Factura Pendiente</h1>

  {#if data.isManualReview}
    <div class="banner banner-warn">
      La IA no pudo leer bien la factura. Por favor revisa los datos manualmente.
    </div>
  {/if}

  {#if data.pending.isDuplicate}
    <div class="banner banner-danger">
      Posible factura duplicada detectada.
    </div>
  {/if}

  <div class="card">
    <div class="card-title">Datos de la Factura</div>
    <div class="field-grid">
      <div class="field full">
        <label class="field-label" for="supplierName">Proveedor</label>
        <input
          id="supplierName"
          class="field-input"
          type="text"
          bind:value={supplierName}
          form="commit-form"
          name="supplierName"
        />
      </div>
      <div class="field">
        <label class="field-label" for="invoiceNumber">Numero de Factura</label>
        <input
          id="invoiceNumber"
          class="field-input"
          type="text"
          bind:value={invoiceNumber}
          form="commit-form"
          name="invoiceNumber"
        />
      </div>
      <div class="field">
        <label class="field-label" for="invoiceDate">Fecha de Factura</label>
        <input
          id="invoiceDate"
          class="field-input"
          type="text"
          bind:value={invoiceDate}
          form="commit-form"
          name="invoiceDate"
          placeholder="YYYY-MM-DD"
        />
      </div>
      <div class="field">
        <label class="field-label" for="totalAmount">Importe Total</label>
        <input
          id="totalAmount"
          class="field-input"
          type="text"
          bind:value={totalAmount}
          form="commit-form"
          name="totalAmount"
        />
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Lineas de Factura</div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Descripcion original</th>
            <th>Descripcion</th>
            <th>Cant.</th>
            <th>Unidad</th>
            <th>P. unitario</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row, i}
            <tr>
              <td>
                <span class="raw-desc" title={row.rawDescription}>{row.rawDescription}</span>
                <div class="badges">
                  {#if row.fuzzyScore >= 0.8 && row.suggestedName}
                    <span class="badge-match">Match: {row.suggestedName}</span>
                  {/if}
                  {#if row.priceWarning}
                    <span class="badge-price">⚠ Precio anómalo</span>
                  {/if}
                </div>
              </td>
              <td>
                <input
                  type="text"
                  form="commit-form"
                  name="line_descriptions[]"
                  bind:value={row.description}
                />
              </td>
              <td>
                <input
                  type="text"
                  form="commit-form"
                  name="line_quantities[]"
                  bind:value={row.quantity}
                  oninput={() => recomputeRow(i)}
                />
              </td>
              <td>
                <input
                  type="text"
                  form="commit-form"
                  name="line_units[]"
                  bind:value={row.unit}
                />
              </td>
              <td>
                <input
                  type="text"
                  form="commit-form"
                  name="line_unit_prices[]"
                  bind:value={row.unitPrice}
                  oninput={() => recomputeRow(i)}
                />
              </td>
              <td>
                <input
                  type="text"
                  form="commit-form"
                  name="line_total_prices[]"
                  value={row.totalPrice}
                  readonly
                />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <form id="commit-form" method="POST" action="?/commit"></form>

  <div class="actions">
    <button type="submit" form="commit-form" class="btn-primary">
      Aprobar y Guardar
    </button>
    <form method="POST" action="?/reject">
      <button type="submit" class="btn-secondary">Rechazar</button>
    </form>
  </div>
</div>
