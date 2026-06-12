<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import type { PageData } from './$types';
  import { str } from '$lib/formatters';
  import ConfidenceDot from '$lib/components/mep/ConfidenceDot.svelte';
  import { Check, Clock, Sparkle, Plus, Trash, X, Upload, AlertTriangle, RefreshCw } from 'lucide-svelte';
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

  // ── Queue polling — the single feedback mechanism ─────────────────────────
  // While anything is queued/extracting, poll the batch status endpoint and
  // reload server data when any item's status changes. No simulated progress.
  onMount(() => {
    const timer = setInterval(async () => {
      if (!data.anyInFlight) return;
      try {
        const resp = await fetch(`/api/batch-status/${data.batchId}`);
        if (!resp.ok) return;
        const body = await resp.json() as { items: Array<{ id: string; status: string }> };
        const current = new Map(data.queue.map(q => [q.id, q.status]));
        const changed = body.items.some(i => current.has(i.id) && current.get(i.id) !== i.status);
        if (changed) await invalidateAll();
      } catch {
        // network error — keep polling
      }
    }, 2500);
    return () => clearInterval(timer);
  });

  // ── Review form state ──────────────────────────────────────────────────────
  type LineItem = {
    description?: string | null;
    quantity?: number | string | null;
    unit?: string | null;
    unit_price?: number | string | null;
    total_price?: number | string | null;
    tax_rate?: number | null;
    confidence?: number | null;
  };

  // Synced from server data (not initialized once): the active review item
  // changes in place as the user confirms invoices.
  let lineItems = $state<LineItem[]>([]);
  let lineItemsSource: unknown = null;
  $effect(() => {
    const raw = data.review?.data?.line_items;
    if (raw === lineItemsSource) return; // keep user edits across unrelated reruns
    lineItemsSource = raw;
    lineItems = Array.isArray(raw) ? [...(raw as LineItem[])] : [];
  });

  function addRow() {
    lineItems = [...lineItems, { description: '', quantity: '', unit: '', unit_price: '', total_price: '' }];
  }
  function removeRow(i: number) {
    lineItems = lineItems.filter((_, j) => j !== i);
  }

  const review = $derived(data.review);
  const fieldConf = $derived((review?.fieldConfidences ?? {}) as Record<string, number>);

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

  // Focus the first uncertain field when a new review item appears.
  let focusedItemId: string | null = null;
  $effect(() => {
    if (!review || !firstUncertainField || focusedItemId === review.itemId) return;
    focusedItemId = review.itemId;
    const fieldName = firstUncertainField;
    tick().then(() => {
      const input = document.querySelector<HTMLElement>(`input[name="${fieldName}"]`);
      if (input) {
        input.scrollIntoView({ block: 'center', behavior: 'smooth' });
        input.focus();
      }
    });
  });

  const confidence = $derived(
    typeof review?.data?.confidence === 'number' ? (review.data.confidence as number) : 0
  );
  const confidenceBadgeKey = $derived(
    review?.confidenceLevel === 'high' ? 'extract.badge.high' :
    review?.confidenceLevel === 'medium' ? 'extract.badge.med' : 'extract.badge.low'
  );

  const needsReview = (val: unknown) => !val && val !== 0;

  const lineTotal = $derived.by(() =>
    lineItems.reduce((s, item) => {
      const n = parseFloat(String(item.total_price ?? ''));
      return s + (isNaN(n) ? 0 : n);
    }, 0)
  );
  const extractedTotal = $derived.by(() => {
    const amt = review?.data?.total_amount;
    if (typeof amt === 'number') return amt as number;
    const n = parseFloat(String(amt ?? ''));
    return isNaN(n) ? 0 : n;
  });
  const taxBreakdown = $derived.by(() => {
    const raw = review?.data?.tax_breakdown;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return raw as Array<{ rate: number; base: number; tax_amount: number }>;
  });
  const taxTotal = $derived(
    taxBreakdown ? taxBreakdown.reduce((s, b) => s + ((b as { tax_amount: number }).tax_amount ?? 0), 0) : 0
  );
  const totalCalc = $derived(lineTotal + taxTotal);
  const discrepancy = $derived(Math.abs(totalCalc - extractedTotal));
  const hasDiscrepancy = $derived(discrepancy > 0.01 && extractedTotal > 0);
  const supplierName = $derived(str(review?.data?.supplier_name) || '—');
  const invoiceNumber = $derived(str(review?.data?.invoice_number) || '—');

  function fmt(n: number) { return n.toFixed(2).replace('.', ',') + ' €'; }

  // ── Add more files ─────────────────────────────────────────────────────────
  let addFiles = $state<File[]>([]);
  let addSubmitting = $state(false);
  let addMoreOpen = $state(false);

  function pushFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    const next = [...addFiles];
    for (const f of Array.from(newFiles)) {
      if (!next.some(e => e.name === f.name && e.size === f.size)) next.push(f);
    }
    addFiles = next;
  }
  function onFileInputChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    pushFiles(input.files);
    input.value = '';
  }
  async function submitAddFiles() {
    if (addFiles.length === 0 || addSubmitting) return;
    addSubmitting = true;
    const fd = new FormData();
    for (const f of addFiles) fd.append('files', f);
    try {
      const resp = await fetch('?/add', { method: 'POST', body: fd, redirect: 'follow' });
      const result = await resp.json() as { type: string; location?: string };
      if (result.type === 'redirect' && result.location) location.replace(result.location);
      else { addFiles = []; addSubmitting = false; await invalidateAll(); }
    } catch { addSubmitting = false; }
  }

  const extractingItem = $derived(data.queue.find(q => q.status === 'extracting') ?? data.queue.find(q => q.status === 'queued'));
  const doneCount = $derived(data.queue.filter(q => q.status === 'done' || q.status === 'confirmed').length);
</script>

<div style="height:100%;display:flex;flex-direction:column;overflow:hidden;">

  <!-- Two-column grid: queue + active panel -->
  <div style="flex:1;min-height:0;padding:16px 20px 20px;display:grid;grid-template-columns:minmax(260px,0.9fr) 2fr;gap:16px;" class="max-md:!flex max-md:!flex-col max-md:!overflow-y-auto">

    <!-- ── Queue ──────────────────────────────────────────────────────────── -->
    <div class="card" style="padding:16px 0 12px;display:flex;flex-direction:column;min-height:0;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0 16px;margin-bottom:10px;">
        <span class="subtitle">{$t('upload.queue')}</span>
        <span class="num" style="font-size:11px;font-weight:600;padding:2px 7px;border-radius:999px;background:var(--mep-acc-soft);color:var(--mep-acc);">{doneCount}/{data.queue.length}</span>
      </div>

      <div style="flex:1;overflow-y:auto;min-height:0;">
        {#each data.queue as q (q.id)}
          <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-top:1px solid var(--mep-divider);background:{q.id === data.review?.itemId || q.status === 'extracting' ? 'var(--mep-acc-soft)' : 'transparent'};">
            <div style="width:30px;height:38px;border-radius:4px;flex-shrink:0;background:{q.type === 'PDF' ? '#c14a4a' : '#6a8a6a'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:8.5px;font-weight:700;opacity:{q.status === 'confirmed' ? 0.55 : 1};">
              {q.type}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:12.5px;font-weight:500;color:{q.status === 'confirmed' ? 'var(--mep-fg-3)' : 'var(--mep-fg)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{q.name}</div>
              <div class="num" style="font-size:11px;color:var(--mep-fg-3);">
                {q.status === 'confirmed' ? $t('confirm.extractDone')
                  : q.status === 'done' ? 'Lista para revisar'
                  : q.status === 'extracting' ? $t('confirm.extractActive')
                  : q.status === 'queued' ? $t('confirm.inQueue')
                  : q.status === 'failed' ? $t('extract.error')
                  : `${q.type} · ${q.size}`}
              </div>
            </div>
            <div style="flex-shrink:0;display:flex;align-items:center;gap:6px;">
              {#if q.status === 'confirmed'}
                <div style="width:20px;height:20px;border-radius:10px;background:var(--mep-pos-soft);color:var(--mep-pos);display:flex;align-items:center;justify-content:center;"><Check size={12} /></div>
              {:else if q.status === 'done'}
                <div style="width:20px;height:20px;border-radius:10px;background:var(--mep-acc-soft);color:var(--mep-acc);display:flex;align-items:center;justify-content:center;"><Check size={12} /></div>
              {:else if q.status === 'extracting'}
                <svg width="20" height="20" viewBox="0 0 16 16" style="animation:mepspin 1.1s linear infinite;color:var(--mep-acc);">
                  <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-opacity="0.2" stroke-width="2" />
                  <path d="M14 8a6 6 0 00-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              {:else if q.status === 'queued'}
                <div style="width:20px;height:20px;border-radius:10px;border:1px dashed var(--mep-border);color:var(--mep-fg-3);display:flex;align-items:center;justify-content:center;"><Clock size={11} /></div>
              {:else if q.status === 'failed'}
                <span style="color:var(--mep-neg);display:inline-flex;"><AlertTriangle size={14} /></span>
              {:else}
                <form method="POST" action="?/remove">
                  <input type="hidden" name="itemId" value={q.id} />
                  <button type="submit" class="btn btn-ghost" style="width:24px;height:24px;padding:0;justify-content:center;" title={$t('confirm.remove')}>
                    <X size={13} />
                  </button>
                </form>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      <!-- Add more + batch discard -->
      <div style="padding:10px 16px 4px;border-top:1px solid var(--mep-divider);display:flex;flex-direction:column;gap:8px;">
        <button type="button" class="btn btn-ghost" style="font-size:12.5px;color:var(--mep-acc);padding:0;justify-content:flex-start;"
          onclick={() => addMoreOpen = !addMoreOpen}>
          {addMoreOpen ? $t('confirm.hideAdd') : $t('confirm.showAdd')}
        </button>
        {#if addMoreOpen}
          <label style="display:flex;align-items:center;gap:8px;padding:10px;border-radius:8px;border:1.5px dashed var(--mep-border-strong);cursor:pointer;font-size:12px;color:var(--mep-fg-3);background:var(--mep-surface-2);">
            <Upload size={14} />
            {$t('confirm.addMoreTitle')}
            <input type="file" class="hidden" accept=".pdf,.jpg,.jpeg,.png" multiple onchange={onFileInputChange} />
          </label>
          {#each addFiles as f, i}
            <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--mep-fg);">
              <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{f.name}</span>
              <button type="button" onclick={() => addFiles = addFiles.filter((_, j) => j !== i)} style="background:transparent;border:none;cursor:pointer;color:var(--mep-fg-3);">✕</button>
            </div>
          {/each}
          {#if addFiles.length > 0}
            <button disabled={addSubmitting} class="btn btn-primary" style="height:32px;justify-content:center;font-size:12.5px;" onclick={submitAddFiles}>
              {addSubmitting ? $t('confirm.adding') : $t('confirm.addFileN').replace('{n}', String(addFiles.length))}
            </button>
          {/if}
        {/if}
        <form method="POST" action="?/discardBatch">
          <button type="submit" class="btn btn-secondary" style="width:100%;height:30px;justify-content:center;font-size:12px;">
            {$t('confirm.discard')}
          </button>
        </form>
      </div>
    </div>

    <!-- ── Active panel ───────────────────────────────────────────────────── -->
    {#if review}
      {#key review.itemId}
      <div style="display:grid;grid-template-columns:0.85fr 1.15fr;gap:14px;min-height:0;overflow:hidden;" class="max-md:!flex max-md:!flex-col">

        <!-- Out-of-tree form target: the discard button sits visually inside the
             save form's header; nesting real forms is invalid HTML. -->
        <form id="discard-item-form" method="POST" action="?/discardItem" style="display:none;">
          <input type="hidden" name="itemId" value={review.itemId} />
        </form>

        <!-- Doc viewer -->
        <div class="card" style="padding:0;overflow:hidden;display:flex;flex-direction:column;min-height:280px;">
          <div style="padding:10px 14px;border-bottom:1px solid var(--mep-divider);display:flex;align-items:center;gap:8px;flex-shrink:0;">
            <div style="flex:1;font-size:12px;color:var(--mep-fg-2);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              {review.filename}
            </div>
            <span style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--mep-acc);">
              <Sparkle size={10} /> {$t('extract.aiExtracted')} · {$t(confidenceBadgeKey)}
            </span>
          </div>
          <div style="flex:1;overflow:hidden;background:var(--mep-surface-2);">
            <iframe
              src="/api/upload/{review.itemId}/{encodeURIComponent(review.filename)}"
              title="Document preview"
              style="width:100%;height:100%;border:none;display:block;min-height:260px;"
            ></iframe>
          </div>
        </div>

        <!-- Review form -->
        <form id="save-form" method="POST" action="?/save" style="display:contents;">
          <input type="hidden" name="itemId" value={review.itemId} />
          <input type="hidden" name="confidence" value={str(confidence)} />
          <input type="hidden" name="low_confidence_ack" value={lowConfAck ? 'true' : 'false'} />

          <div class="card" style="padding:0;display:flex;flex-direction:column;overflow:hidden;">

            <!-- Header bar -->
            <div style="padding:12px 16px;border-bottom:1px solid var(--mep-divider);display:flex;align-items:center;gap:10px;flex-shrink:0;">
              <div style="flex:1;min-width:0;">
                <div style="font-size:14px;font-weight:600;color:var(--mep-fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                  {invoiceNumber} · {supplierName}
                </div>
              </div>
              <button type="submit" form="discard-item-form" class="btn btn-secondary" style="height:32px;font-size:12.5px;padding:0 12px;flex-shrink:0;">{$t('extract.discard')}</button>
              <button type="submit" form="save-form" class="btn btn-primary" style="height:32px;font-size:12.5px;gap:6px;flex-shrink:0;padding:0 14px;">
                <Check size={13} /> {$t('extract.confirmSave')}
              </button>
            </div>

            <!-- Cabecera fields -->
            <div style="padding:14px 16px;border-bottom:1px solid var(--mep-divider);flex-shrink:0;overflow-y:auto;">
              {#if uncertainCount > 0}
                <div style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--mep-warn);background:var(--mep-warn-soft);padding:6px 10px;border-radius:6px;margin-bottom:10px;">
                  <AlertTriangle size={12} />
                  {uncertainCount} campo{uncertainCount !== 1 ? 's' : ''} {$t('extract.lowConfFields')}
                </div>
              {/if}

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 14px;">
                <div>
                  <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
                    {$t('field.supplier')}
                    <ConfidenceDot confidence={fieldConf.supplier_name} />
                  </div>
                  <input type="text" name="supplier_name" value={str(review.data?.supplier_name)}
                    style="width:100%;font-size:13px;font-weight:500;color:var(--mep-fg);padding:8px 10px;border-radius:6px;background:var(--mep-surface-2);border:1px solid transparent;border-bottom:{needsReview(review.data?.supplier_name) || (fieldConf.supplier_name != null && fieldConf.supplier_name < 0.85) ? '2px solid var(--mep-warn)' : '1px solid var(--mep-divider)'};outline:none;font-family:var(--mep-font);" />
                </div>
                <div>
                  <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
                    {$t('field.invoiceNum')}
                    <ConfidenceDot confidence={fieldConf.invoice_number} />
                  </div>
                  <input type="text" name="invoice_number" value={str(review.data?.invoice_number)} class="num"
                    style="width:100%;font-size:13px;font-weight:500;color:var(--mep-fg);padding:8px 10px;border-radius:6px;background:var(--mep-surface-2);border:1px solid transparent;border-bottom:{fieldConf.invoice_number != null && fieldConf.invoice_number < 0.85 ? '2px solid var(--mep-warn)' : '1px solid var(--mep-divider)'};outline:none;font-family:var(--mep-font);" />
                </div>
                <div>
                  <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
                    {$t('field.invoiceDate')}
                    <ConfidenceDot confidence={fieldConf.invoice_date} />
                  </div>
                  <input type="text" name="invoice_date" value={str(review.data?.invoice_date)} placeholder="YYYY-MM-DD" class="num"
                    style="width:100%;font-size:13px;font-weight:500;color:var(--mep-fg);padding:8px 10px;border-radius:6px;background:var(--mep-surface-2);border:1px solid transparent;border-bottom:{fieldConf.invoice_date != null && fieldConf.invoice_date < 0.85 ? '2px solid var(--mep-warn)' : '1px solid var(--mep-divider)'};outline:none;font-family:var(--mep-font);" />
                </div>
                <div>
                  <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
                    {$t('extract.due')}
                    <ConfidenceDot confidence={fieldConf.due_date} />
                  </div>
                  <input type="text" name="due_date" value={str(review.data?.due_date)} placeholder="YYYY-MM-DD" class="num"
                    style="width:100%;font-size:13px;font-weight:500;color:var(--mep-fg);padding:8px 10px;border-radius:6px;background:var(--mep-surface-2);border:1px solid transparent;border-bottom:{fieldConf.due_date != null && fieldConf.due_date < 0.85 ? '2px solid var(--mep-warn)' : '1px solid var(--mep-divider)'};outline:none;font-family:var(--mep-font);" />
                </div>
                <div>
                  <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px;display:flex;align-items:center;gap:5px;">
                    {$t('tbl.total')}
                    <ConfidenceDot confidence={fieldConf.total_amount} />
                  </div>
                  <input type="text" name="total_amount" value={str(review.data?.total_amount)} class="num"
                    aria-describedby={hasDiscrepancy ? 'err-total_amount' : undefined}
                    style="width:100%;font-size:13px;font-weight:{hasDiscrepancy ? 600 : 500};color:var(--mep-fg);padding:8px 10px;border-radius:6px;background:var(--mep-surface-2);border:{hasDiscrepancy ? '1px solid var(--mep-warn)' : '1px solid transparent'};border-bottom:{hasDiscrepancy ? '2px solid var(--mep-warn)' : fieldConf.total_amount != null && fieldConf.total_amount < 0.85 ? '2px solid var(--mep-warn)' : '1px solid var(--mep-divider)'};outline:none;font-family:var(--mep-font);" />
                  {#if hasDiscrepancy}
                    <div id="err-total_amount" style="font-size:11px;color:var(--mep-warn);margin-top:4px;display:flex;align-items:center;gap:4px;">
                      <AlertTriangle size={10} /> {$t('extract.mismatch')} ({fmt(totalCalc)})
                    </div>
                  {/if}
                </div>
                <div>
                  <div style="font-size:10.5px;color:var(--mep-fg-3);text-transform:uppercase;letter-spacing:0.04em;font-weight:500;margin-bottom:4px;">{$t('extract.notesInternal')} <span style="text-transform:none;letter-spacing:0;">{$t('extract.optional')}</span></div>
                  <textarea name="notes" maxlength={250} rows={1}
                    placeholder={$t('extract.notesPh')}
                    style="width:100%;font-size:12.5px;color:var(--mep-fg);padding:8px 10px;border-radius:6px;background:var(--mep-surface-2);border:1px solid transparent;border-bottom:1px solid var(--mep-divider);outline:none;font-family:var(--mep-font);resize:vertical;"></textarea>
                </div>
              </div>
            </div>

            <!-- Line items -->
            <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:140px;">
              <div style="padding:10px 16px 6px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
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
                      {@const itemConf = typeof item.confidence === 'number' ? item.confidence : null}
                      {@const confLow = itemConf != null && itemConf < 0.85}
                      <tr style="background:{confLow ? 'var(--mep-warn-soft)' : 'transparent'};">
                        <td style="padding:7px 10px;">
                          <div style="display:flex;align-items:center;gap:5px;">
                            <input type="text" name="line_descriptions" value={str(item.description)}
                              style="flex:1;min-width:0;font-size:12.5px;font-weight:500;color:var(--mep-fg);background:transparent;border:none;outline:none;font-family:var(--mep-font);" />
                            <ConfidenceDot confidence={itemConf} size={6} />
                          </div>
                        </td>
                        <td class="num" style="padding:7px 10px;">
                          <input type="text" name="line_quantities" value={str(item.quantity)} class="num"
                            style="width:100%;font-size:12px;color:var(--mep-fg);background:transparent;border:none;outline:none;text-align:right;font-family:var(--mep-font);" />
                        </td>
                        <td style="padding:7px 10px;">
                          <input type="text" name="line_units" value={str(item.unit)}
                            style="width:100%;font-size:12px;color:var(--mep-fg-2);background:transparent;border:none;outline:none;font-family:var(--mep-font);" />
                        </td>
                        <td class="num" style="padding:7px 10px;">
                          <input type="text" name="line_unit_prices" value={str(item.unit_price)} class="num"
                            style="width:100%;font-size:12px;color:var(--mep-fg);background:transparent;border:none;outline:none;text-align:right;font-family:var(--mep-font);" />
                        </td>
                        <td class="num" style="padding:7px 10px;">
                          <input type="text" name="line_total_prices" value={str(item.total_price)} class="num"
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
            <div style="padding:12px 16px;border-top:1px solid var(--mep-divider);background:var(--mep-surface-2);display:flex;justify-content:space-between;align-items:center;gap:16px;flex-shrink:0;">
              {#if hasDiscrepancy}
                <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--mep-warn);font-weight:500;">
                  <AlertTriangle size={12} /> {$t('extract.discrepancy')} · {fmt(discrepancy)}
                </div>
              {:else if lineItems.length > 0}
                <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--mep-pos);font-weight:500;">
                  <Check size={12} /> {$t('extract.totalsMatch')}
                </div>
              {:else}
                <div style="font-size:12px;color:var(--mep-fg-3);">{$t('extract.noLinesVerify')}</div>
              {/if}
              <div style="display:flex;align-items:baseline;gap:10px;">
                <span style="font-size:12px;color:var(--mep-fg-2);">{$t('extract.calcTotal')}</span>
                <span class="num" style="font-size:15px;font-weight:600;color:var(--mep-fg);">{fmt(totalCalc)}</span>
              </div>
            </div>

          </div>
        </form>
      </div>
      {/key}

    {:else if data.failedItem}
      <!-- Failed item panel -->
      <div style="display:flex;flex-direction:column;gap:12px;max-width:560px;">
        <div class="card p-4" style="background:var(--mep-neg-soft);border-color:var(--mep-neg);">
          <strong class="body-strong" style="color:var(--mep-neg);display:block;margin-bottom:6px;">{$t('extract.error')} · {data.failedItem.name}</strong>
          <p style="font-size:13px;color:var(--mep-neg);">{$t(data.failedItem.error)}</p>
        </div>
        <div style="display:flex;gap:8px;">
          <form method="POST" action="?/retry">
            <input type="hidden" name="itemId" value={data.failedItem.itemId} />
            <button type="submit" class="btn btn-primary" style="height:34px;font-size:13px;gap:6px;">
              <RefreshCw size={13} /> {$t('extract.retry')}
            </button>
          </form>
          <form method="POST" action="?/discardItem">
            <input type="hidden" name="itemId" value={data.failedItem.itemId} />
            <button type="submit" class="btn btn-ghost" style="height:34px;font-size:13px;">{$t('extract.discard')}</button>
          </form>
        </div>
      </div>

    {:else if data.anyInFlight}
      <!-- In-flight panel — real status only -->
      <div class="card" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:40px 32px;text-align:center;">
        <div style="width:44px;height:44px;border:3px solid var(--mep-acc);border-top-color:transparent;border-radius:50%;animation:mepspin 0.9s linear infinite;"></div>
        <div>
          <div style="font-size:15px;font-weight:600;color:var(--mep-fg);margin-bottom:6px;">
            Extrayendo {extractingItem?.name ?? 'factura'}…
          </div>
          <div style="font-size:13px;color:var(--mep-fg-3);line-height:1.5;">
            {doneCount} de {data.queue.length} completadas · La IA procesa las facturas una a una.
            Podrás revisar cada una en cuanto esté lista.
          </div>
        </div>
      </div>

    {:else}
      <!-- Ready: nothing extracted yet -->
      <div class="card" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:40px 32px;text-align:center;">
        <div style="width:48px;height:48px;border-radius:24px;background:var(--mep-acc-soft);color:var(--mep-acc);display:flex;align-items:center;justify-content:center;">
          <Sparkle size={20} />
        </div>
        <div>
          <div style="font-size:15px;font-weight:600;color:var(--mep-fg);margin-bottom:4px;">
            {data.openCount === 1 ? $t('confirm.readyToExtract') : `${data.openCount} facturas listas para extraer`}
          </div>
          <div style="font-size:13px;color:var(--mep-fg-3);">Se procesarán una a una; podrás revisar cada resultado.</div>
        </div>
        <form method="POST" action="?/extract">
          <button type="submit" class="btn btn-primary" style="height:40px;justify-content:center;font-weight:500;gap:6px;padding:0 20px;">
            <Sparkle size={14} />
            {data.openCount === 1 ? $t('confirm.extract') : $t('confirm.extractN').replace('{n}', String(data.openCount))}
          </button>
        </form>
      </div>
    {/if}
  </div>
</div>

<style>
  @keyframes mepspin { to { transform: rotate(360deg); } }
</style>

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
