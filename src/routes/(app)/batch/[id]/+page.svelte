<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { enhance } from '$app/forms';
  import type { PageData } from './$types';
  import { str } from '$lib/formatters';
  import ConfidenceDot from '$lib/components/mep/ConfidenceDot.svelte';
  import FlowSteps from '$lib/components/mep/FlowSteps.svelte';
  import FileTypeBadge from '$lib/components/FileTypeBadge.svelte';
  import Check from '@lucide/svelte/icons/check';
  import Clock from '@lucide/svelte/icons/clock';
  import Sparkle from '@lucide/svelte/icons/sparkle';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash from '@lucide/svelte/icons/trash';
  import X from '@lucide/svelte/icons/x';
  import Upload from '@lucide/svelte/icons/upload';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import PanelLeft from '@lucide/svelte/icons/panel-left';
  import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
  import Maximize2 from '@lucide/svelte/icons/maximize-2';
  import ChevronsLeft from '@lucide/svelte/icons/chevrons-left';
  import ChevronsRight from '@lucide/svelte/icons/chevrons-right';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import FileText from '@lucide/svelte/icons/file-text';
  import { t, ti, tp } from '$lib/i18n';

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

  const invalidDateKey = $derived(
    (form as Record<string, unknown> | null)?.errorKey === 'error.invalidDate'
      ? ((form as Record<string, unknown>).errorField === 'due_date' ? 'error.invalidDueDate' : 'error.invalidInvoiceDate')
      : null
  );

  const RAIL_OPEN_W = 234;
  const RAIL_SHUT_W = 54;
  const PREVIEW_MIN_W = 190;
  const PREVIEW_MAX_W = 680;
  const PREVIEW_DEFAULT_W = 318;
  const PREVIEW_SHUT_W = 40;
  const PREF_QUEUE = 'mep-review-queue-open';
  const PREF_PREVIEW = 'mep-review-preview-open';
  const PREF_PREVIEW_W = 'mep-review-preview-w';

  // svelte-ignore state_referenced_locally — intentional: the rail starts folded once a review is on screen
  let queueOpen = $state(!data.review);
  let previewOpen = $state(true);
  let previewW = $state(PREVIEW_DEFAULT_W);
  let previewFull = $state(false);
  let dragging = $state(false);

  function clampPreview(w: number): number {
    return Math.min(PREVIEW_MAX_W, Math.max(PREVIEW_MIN_W, Math.round(w)));
  }
  function persist(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
    }
  }

  onMount(() => {
    try {
      const q = localStorage.getItem(PREF_QUEUE);
      if (q !== null) queueOpen = q === '1';
      const p = localStorage.getItem(PREF_PREVIEW);
      if (p !== null) previewOpen = p === '1';
      const w = Number(localStorage.getItem(PREF_PREVIEW_W));
      if (Number.isFinite(w) && w > 0) previewW = clampPreview(w);
    } catch {
    }
  });

  function toggleQueue() {
    queueOpen = !queueOpen;
    persist(PREF_QUEUE, queueOpen ? '1' : '0');
  }
  function togglePreview() {
    previewOpen = !previewOpen;
    persist(PREF_PREVIEW, previewOpen ? '1' : '0');
  }
  function resetPreviewWidth() {
    previewW = PREVIEW_DEFAULT_W;
    persist(PREF_PREVIEW_W, String(previewW));
  }

  let dragOriginX = 0;
  let dragOriginW = 0;
  function onSplitDown(e: PointerEvent) {
    dragging = true;
    dragOriginX = e.clientX;
    dragOriginW = previewW;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onSplitMove(e: PointerEvent) {
    if (!dragging) return;
    previewW = clampPreview(dragOriginW + (e.clientX - dragOriginX));
  }
  function onSplitUp(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    persist(PREF_PREVIEW_W, String(previewW));
  }
  function onSplitKey(e: KeyboardEvent) {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === 'ArrowLeft') previewW = clampPreview(previewW - step);
    else if (e.key === 'ArrowRight') previewW = clampPreview(previewW + step);
    else if (e.key === 'Home') previewW = PREVIEW_DEFAULT_W;
    else return;
    e.preventDefault();
    persist(PREF_PREVIEW_W, String(previewW));
  }

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
      }
    }, 2500);
    return () => clearInterval(timer);
  });

  type LineItem = {
    description?: string | null;
    quantity?: number | string | null;
    unit?: string | null;
    unit_price?: number | string | null;
    total_price?: number | string | null;
    tax_rate?: number | null;
    confidence?: number | null;
    product_code?: string | null;
  };

  let lineItems = $state<LineItem[]>([]);
  let lineItemsSource: unknown = null;
  function normalizeLine(item: LineItem): LineItem {
    return {
      ...item,
      description: str(item.description),
      quantity: str(item.quantity),
      unit: str(item.unit),
      unit_price: priceStr(item.unit_price),
      total_price: priceStr(item.total_price),
    };
  }
  $effect(() => {
    const raw = data.review?.data?.line_items;
    if (raw === lineItemsSource) return;
    lineItemsSource = raw;
    lineItems = Array.isArray(raw) ? (raw as LineItem[]).map(normalizeLine) : [];
  });

  // svelte-ignore state_referenced_locally — reading the initial value is the point
  let lowConfAckItemId: string | null = data.review?.itemId ?? null;

  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data once
  let supplierNameInput = $state(str(data.review?.data?.supplier_name));
  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data once
  let invoiceNumberInput = $state(str(data.review?.data?.invoice_number));
  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data once
  let invoiceDateInput = $state(str(data.review?.data?.invoice_date));
  const NET_30_DAYS = 30;
  function addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function net30Suggestion(dueDate: string, invoiceDate: string): string {
    if (dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) return dueDate;
    return addDays(invoiceDate, NET_30_DAYS);
  }

  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data once
  let dueDateInput = $state(net30Suggestion(str(data.review?.data?.due_date), str(data.review?.data?.invoice_date)));
  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data once
  let dueDateSuggested = $state(!str(data.review?.data?.due_date) && !!dueDateInput);
  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data once
  let totalAmountInput = $state(priceStr(str(data.review?.data?.total_amount)));
  let notesInput = $state('');

  $effect(() => {
    const id = data.review?.itemId ?? null;
    if (id === lowConfAckItemId) return;
    lowConfAckItemId = id;
    lowConfAck = false;
    showLowConfModal = false;
    showContentDuplicateModal = false;
    previewFull = false;
    taxPanelOpen = false;
    uncertainCursor = 0;
    const rd = data.review?.data;
    supplierNameInput = str(rd?.supplier_name);
    invoiceNumberInput = str(rd?.invoice_number);
    invoiceDateInput = str(rd?.invoice_date);
    const rawDueDate = str(rd?.due_date);
    dueDateInput = net30Suggestion(rawDueDate, invoiceDateInput);
    dueDateSuggested = !rawDueDate && !!dueDateInput;
    totalAmountInput = priceStr(str(rd?.total_amount));
    notesInput = '';
  });

  function addRow() {
    lineItems = [...lineItems, { description: '', quantity: '', unit: '', unit_price: '', total_price: '' }];
  }
  function removeRow(i: number) {
    lineItems = lineItems.filter((_, j) => j !== i);
  }

  const review = $derived(data.review);
  const idempotencyKey = $derived.by(() => { void review?.itemId; return crypto.randomUUID(); });
  const fieldConf = $derived((review?.fieldConfidences ?? {}) as Record<string, number>);

  const HEADER_FIELDS = ['supplier_name', 'invoice_number', 'invoice_date', 'due_date', 'total_amount'] as const;
  const flagged = (field: string) => fieldConf[field] != null && fieldConf[field] < 0.85;
  const uncertainHeaderFields = $derived(HEADER_FIELDS.filter(f => flagged(f)));
  const uncertainLineIndexes = $derived(
    lineItems.map((item, i) => (item.confidence != null && item.confidence < 0.85 ? i : -1)).filter(i => i >= 0)
  );
  const uncertainLineCount = $derived(uncertainLineIndexes.length);
  const uncertainCount = $derived(uncertainHeaderFields.length + uncertainLineCount);
  const firstUncertainField = $derived(uncertainHeaderFields[0] ?? null);

  let uncertainCursor = 0;
  function jumpToUncertain() {
    const targets = [
      ...uncertainHeaderFields.map(f => `input[name="${f}"]`),
      ...uncertainLineIndexes.map(i => `[data-line="${i}"] input`),
    ];
    if (targets.length === 0) return;
    const selector = targets[uncertainCursor % targets.length];
    uncertainCursor += 1;
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus();
  }

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

  function submitSave() {
    (document.getElementById('save-form') as HTMLFormElement | null)?.requestSubmit();
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && previewFull) {
      previewFull = false;
      return;
    }
    if (e.key === 'F2') {
      if (!review) return;
      e.preventDefault();
      jumpToUncertain();
      return;
    }
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    if (e.key === 'Enter') {
      if (!review) return;
      e.preventDefault();
      submitSave();
    } else if (e.key === '\\') {
      e.preventDefault();
      togglePreview();
    } else if (e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      toggleQueue();
    }
  }

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
    const n = parseFloat(totalAmountInput);
    return isNaN(n) ? 0 : n;
  });
  type TaxBand = { rate?: number | null; base?: number | null; tax_amount?: number | null; type?: 'iva' | 'rec' };
  const taxBreakdown = $derived.by(() => {
    const raw = review?.data?.tax_breakdown;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return raw as TaxBand[];
  });
  const taxTotal = $derived(
    taxBreakdown ? taxBreakdown.reduce((s, b) => s + (b.tax_amount ?? 0), 0) : 0
  );
  const taxBase = $derived.by(() => {
    if (!taxBreakdown) return 0;
    const perType = new Map<string, number>();
    for (const b of taxBreakdown) {
      const key = b.type ?? '';
      perType.set(key, (perType.get(key) ?? 0) + (b.base ?? 0));
    }
    return Math.max(0, ...perType.values());
  });
  const taxBaseMatchesLines = $derived(taxBase > 0 && Math.abs(taxBase - lineTotal) <= 0.01);
  let taxPanelOpen = $state(false);

  function ratePct(rate: number | null | undefined): string {
    if (typeof rate !== 'number' || !Number.isFinite(rate)) return '—';
    const pct = rate > 1 ? rate : rate * 100;
    return `${Number(pct.toFixed(2))}`.replace('.', ',') + '%';
  }
  const totalCalc = $derived(lineTotal + taxTotal);
  const discrepancy = $derived(Math.abs(totalCalc - extractedTotal));
  const hasDiscrepancy = $derived(discrepancy > 0.01 && extractedTotal > 0);
  const supplierName = $derived(str(review?.data?.supplier_name) || '—');
  const invoiceNumber = $derived(str(review?.data?.invoice_number) || '—');

  function fmt(n: number) { return n.toFixed(2).replace('.', ',') + ' €'; }

  function priceStr(v: number | string | null | undefined): string {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return isNaN(n) ? str(v) : n.toFixed(2);
  }

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
      if (result.type === 'redirect' && result.location) {
        addFiles = [];
        addSubmitting = false;
        await goto(result.location, { invalidateAll: true });
      } else { addFiles = []; addSubmitting = false; await invalidateAll(); }
    } catch { addSubmitting = false; }
  }

  const extractingItem = $derived(data.queue.find(q => q.status === 'extracting') ?? data.queue.find(q => q.status === 'queued'));
  const doneCount = $derived(data.queue.filter(q => q.status === 'done' || q.status === 'confirmed').length);
  const previewSrc = $derived(review ? `/api/upload/${review.itemId}/${encodeURIComponent(review.filename)}` : '');
  const railWidth = $derived(queueOpen ? RAIL_OPEN_W : RAIL_SHUT_W);
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class:rev-dragging={dragging} style="height:100%;display:flex;flex-direction:column;overflow:hidden;">

  <div style="padding:12px 20px 0;flex-shrink:0;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
    <FlowSteps active={data.anyInFlight ? 1 : 2} size="sm" />
  </div>

  <div class="rev-shell" style="padding:12px 20px 16px;">

    <div class="card rev-col rev-col-fixed rev-sizing" style="width:{railWidth}px;padding:8px 0 6px;">
      <div class="rev-rail-head" style="display:flex;align-items:center;gap:6px;padding:0 {queueOpen ? 10 : 8}px 8px;{queueOpen ? '' : 'flex-direction:column;'}">
        <button
          type="button"
          class="rev-icon-btn"
          onclick={toggleQueue}
          aria-expanded={queueOpen}
          title={`${queueOpen ? $t('review.collapseQueue') : $t('review.expandQueue')} · ⌘B`}
          aria-label={queueOpen ? $t('review.collapseQueue') : $t('review.expandQueue')}
        >
          {#if queueOpen}<PanelLeftClose size={15} />{:else}<PanelLeft size={15} />{/if}
        </button>
        {#if queueOpen}
          <span class="body-strong" style="flex:1;min-width:0;">{$t('review.queue')}</span>
        {/if}
        <span class="num" title={$t('upload.queue')} style="font-size:11px;font-weight:600;padding:2px 7px;border-radius:999px;background:var(--mep-acc-soft);color:var(--mep-acc);">{doneCount}/{data.queue.length}</span>
      </div>

      <div class="rev-rail-list" style="flex:1;overflow-y:auto;min-height:0;padding:0 {queueOpen ? 6 : 5}px;">
        {#each data.queue as q (q.id)}
          {@const isActive = q.id === data.review?.itemId || q.status === 'extracting'}
          <div
            class="rev-rail-btn"
            class:active={isActive}
            title={`${q.name} · ${q.type} · ${q.size}`}
            style={queueOpen ? '' : 'justify-content:center;padding:7px 0;'}
          >
            <FileTypeBadge
              kind={q.type === 'PDF' ? 'pdf' : 'other'}
              label={q.type}
              opacity={q.status === 'confirmed' ? 0.55 : 1}
            />
            {#if queueOpen}
              <div style="flex:1;min-width:0;">
                <div style="font-size:12.5px;font-weight:500;color:{q.status === 'confirmed' ? 'var(--mep-fg-3)' : 'var(--mep-fg)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{q.name}</div>
                <div class="num" style="font-size:11px;color:var(--mep-fg-3);">
                  {q.status === 'confirmed' ? $t('confirm.extractDone')
                    : q.status === 'done' ? $t('batch.queue.ready')
                    : q.status === 'extracting' ? $t('confirm.extractActive')
                    : q.status === 'queued' ? $t('confirm.inQueue')
                    : q.status === 'failed' ? $t('extract.error')
                    : `${q.type} · ${q.size}`}
                </div>
              </div>
            {/if}
            <div style="flex-shrink:0;display:flex;align-items:center;gap:6px;{queueOpen ? '' : 'position:absolute;'}">
              {#if q.status === 'confirmed'}
                <div style="width:18px;height:18px;border-radius:9px;background:var(--mep-pos-soft);color:var(--mep-pos);display:flex;align-items:center;justify-content:center;"><Check size={11} /></div>
              {:else if q.status === 'done'}
                {#if queueOpen}
                  <div style="width:18px;height:18px;border-radius:9px;background:var(--mep-acc-soft);color:var(--mep-acc);display:flex;align-items:center;justify-content:center;"><Check size={11} /></div>
                {/if}
              {:else if q.status === 'extracting'}
                <svg width="18" height="18" viewBox="0 0 16 16" style="animation:mepspin 1.1s linear infinite;color:var(--mep-acc);">
                  <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-opacity="0.2" stroke-width="2" />
                  <path d="M14 8a6 6 0 00-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              {:else if q.status === 'queued'}
                {#if queueOpen}
                  <div style="width:18px;height:18px;border-radius:9px;border:1px dashed var(--mep-border);color:var(--mep-fg-3);display:flex;align-items:center;justify-content:center;"><Clock size={10} /></div>
                {/if}
              {:else if q.status === 'failed'}
                <span style="color:var(--mep-neg);display:inline-flex;"><AlertTriangle size={13} /></span>
              {:else if queueOpen}
                <form method="POST" action="?/remove">
                  <input type="hidden" name="itemId" value={q.id} />
                  <button type="submit" class="rev-icon-btn" style="width:22px;height:22px;" title={$t('confirm.remove')} aria-label={$t('confirm.remove')}>
                    <X size={12} />
                  </button>
                </form>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      <div class="rev-rail-foot" style="padding:8px {queueOpen ? 12 : 6}px 2px;border-top:1px solid var(--mep-divider);display:flex;flex-direction:column;gap:8px;align-items:{queueOpen ? 'stretch' : 'center'};">
        {#if queueOpen}
          <button type="button" class="btn btn-ghost" style="font-size:12.5px;color:var(--mep-acc);padding:0;justify-content:flex-start;height:24px;"
            onclick={() => addMoreOpen = !addMoreOpen}>
            {addMoreOpen ? $t('confirm.hideAdd') : $t('confirm.showAdd')}
          </button>
          {#if addMoreOpen}
            <label style="display:flex;align-items:center;gap:8px;padding:10px;border-radius:8px;border:1.5px dashed var(--mep-border-strong);cursor:pointer;font-size:12px;color:var(--mep-fg-3);background:var(--mep-surface-2);">
              <Upload size={14} />
              {$t('confirm.addMoreTitle')}
              <input type="file" class="hidden" accept=".pdf,.jpg,.jpeg,.png,.xml" multiple onchange={onFileInputChange} />
            </label>
            {#each addFiles as f, i}
              <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--mep-fg);">
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{f.name}</span>
                <button type="button" class="rev-icon-btn" style="width:20px;height:20px;" title={$t('confirm.remove')} aria-label={$t('confirm.remove')} onclick={() => addFiles = addFiles.filter((_, j) => j !== i)}><X size={11} /></button>
              </div>
            {/each}
            {#if addFiles.length > 0}
              <button disabled={addSubmitting} class="btn btn-primary" style="height:32px;justify-content:center;font-size:12.5px;" onclick={submitAddFiles}>
                {addSubmitting ? $t('confirm.adding') : $tp('confirm.addFile', addFiles.length)}
              </button>
            {/if}
          {/if}
          <form method="POST" action="?/discardBatch">
            <button type="submit" class="btn btn-secondary" style="width:100%;height:30px;justify-content:center;font-size:12px;">
              {$t('confirm.discard')}
            </button>
          </form>
        {:else}
          <label class="rev-icon-btn" title={$t('confirm.addMoreTitle')} aria-label={$t('confirm.addMoreTitle')}>
            <Upload size={14} />
            <input type="file" class="hidden" accept=".pdf,.jpg,.jpeg,.png,.xml" multiple onchange={(e) => { onFileInputChange(e); submitAddFiles(); }} />
          </label>
          <form method="POST" action="?/discardBatch">
            <button type="submit" class="rev-icon-btn" title={$t('confirm.discard')} aria-label={$t('confirm.discard')}>
              <Trash size={14} />
            </button>
          </form>
        {/if}
      </div>
    </div>

    {#if review}
      {#key review.itemId}

      <form id="discard-item-form" method="POST" action="?/discardItem" style="display:none;" use:enhance>
        <input type="hidden" name="itemId" value={review.itemId} />
      </form>

      <div class="card rev-col rev-col-fixed rev-sizing rev-preview-frame" style="width:{previewOpen ? previewW : PREVIEW_SHUT_W}px;padding:0;">
        {#if previewOpen}
          <div class="rev-bar rev-bar-head" style="padding:8px 8px 8px 12px;gap:6px;">
            <span style="display:inline-flex;color:var(--mep-fg-3);flex-shrink:0;"><FileText size={13} /></span>
            <div title={review.filename} style="flex:1;min-width:0;font-size:12px;color:var(--mep-fg-2);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              {review.filename}
            </div>
            <a href={previewSrc} target="_blank" rel="noopener" class="rev-icon-btn" title={$t('review.openInTab')} aria-label={$t('review.openInTab')}>
              <ExternalLink size={13} />
            </a>
            <button type="button" class="rev-icon-btn" onclick={() => previewFull = true} title={$t('review.fullscreen')} aria-label={$t('review.fullscreen')}>
              <Maximize2 size={13} />
            </button>
            <button type="button" class="rev-icon-btn" onclick={togglePreview} title={`${$t('review.hidePreview')} · ⌘\\`} aria-label={$t('review.hidePreview')}>
              <ChevronsLeft size={14} />
            </button>
          </div>
          <div style="flex:1;min-height:0;overflow:hidden;background:var(--mep-surface-2);">
            <iframe
              src={previewSrc}
              title={$t('a11y.documentPreview')}
              style="width:100%;height:100%;border:none;display:block;"
            ></iframe>
          </div>
          <div style="padding:6px 10px;border-top:1px solid var(--mep-divider);display:flex;align-items:center;gap:5px;font-size:10.5px;color:var(--mep-acc);">
            <Sparkle size={10} /> {$t('extract.aiExtracted')} · {$t(confidenceBadgeKey)}
          </div>
        {:else}
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 0;">
            <button type="button" class="rev-icon-btn" onclick={togglePreview} title={`${$t('review.showPreview')} · ⌘\\`} aria-label={$t('review.showPreview')}>
              <ChevronsRight size={14} />
            </button>
            <button type="button" class="rev-icon-btn" onclick={() => previewFull = true} title={$t('review.fullscreen')} aria-label={$t('review.fullscreen')}>
              <FileText size={14} />
            </button>
          </div>
        {/if}
      </div>

      {#if previewOpen}
        <button
          type="button"
          class="rev-split"
          onpointerdown={onSplitDown}
          onpointermove={onSplitMove}
          onpointerup={onSplitUp}
          onpointercancel={onSplitUp}
          onkeydown={onSplitKey}
          ondblclick={resetPreviewWidth}
          aria-label={$t('review.resizePreview')}
          title={`${$t('review.resizePreview')} · ${$t('review.resetWidth')}`}
        ></button>
      {/if}

      <form id="save-form" method="POST" action="?/save" class="rev-col rev-col-fill" style="display:contents;" use:enhance>
        <input type="hidden" name="itemId" value={review.itemId} />
        <input type="hidden" name="idempotency_key" value={idempotencyKey} />
        <input type="hidden" name="confidence" value={str(confidence)} />
        <input type="hidden" name="low_confidence_ack" value={lowConfAck ? 'true' : 'false'} />

        <div class="card rev-col rev-col-fill" data-coach="invoice-fields" style="padding:0;">

          <div class="rev-bar rev-bar-head">
            <div class="rev-bar-title">
              <div style="font-size:14px;font-weight:600;color:var(--mep-fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                {invoiceNumber} · {supplierName}
              </div>
            </div>
            {#if uncertainCount > 0}
              <button type="button" class="badge badge-pending" style="cursor:pointer;flex-shrink:0;" onclick={jumpToUncertain}
                title={`${$t('review.jumpUncertain')} · F2`}>
                <AlertTriangle size={11} /> {uncertainCount}
              </button>
            {:else}
              <span class="badge badge-confirmed" style="flex-shrink:0;" title={$t('review.allChecked')}>
                <Check size={11} />
              </span>
            {/if}
            <button type="submit" form="discard-item-form" class="btn btn-secondary" style="height:32px;font-size:12.5px;padding:0 12px;flex-shrink:0;">{$t('extract.discard')}</button>
            <button type="submit" form="save-form" class="btn btn-primary" style="height:32px;font-size:12.5px;gap:6px;flex-shrink:0;padding:0 12px;">
              <Check size={13} /> {$t('extract.confirmSave')}
              <kbd class="rev-kbd" style="background:transparent;border-color:currentColor;color:inherit;opacity:0.7;">⌘↵</kbd>
            </button>
          </div>

          <div class="rev-scroll">

            <div class="rev-section">
              {#if invalidDateKey}
                <div role="alert" class="rev-note rev-note-neg">
                  <AlertTriangle size={12} style="flex-shrink:0;" />
                  <span style="flex:1;">{$t(invalidDateKey)}</span>
                </div>
              {/if}
              {#if review.duplicateOfId}
                <div class="rev-note rev-note-neg">
                  <AlertTriangle size={12} style="flex-shrink:0;" />
                  <span style="flex:1;">{$t('batch.possibleDupWarning')}</span>
                  <a href="/invoice/{review.duplicateOfId}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;flex-shrink:0;">
                    {$t('batch.viewExisting')}
                  </a>
                </div>
              {:else if review.similarInvoiceId}
                <div class="rev-note rev-note-warn">
                  <AlertTriangle size={12} style="flex-shrink:0;" />
                  <span style="flex:1;">{$t('batch.similarDupWarning')}</span>
                  <a href="/invoice/{review.similarInvoiceId}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;flex-shrink:0;">
                    {$t('batch.viewExisting')}
                  </a>
                </div>
              {/if}
              {#if uncertainCount > 0}
                <button type="button" class="rev-note rev-note-warn" onclick={jumpToUncertain} title={`${$t('review.jumpUncertain')} · F2`}>
                  <AlertTriangle size={12} style="flex-shrink:0;" />
                  <span style="flex:1;">{uncertainCount} {$tp('batch.field', uncertainCount)} {$t('extract.lowConfFields')}</span>
                </button>
              {/if}

              <div class="rev-grid">
                <div>
                  <div class="rev-field-label">
                    {$t('field.supplier')}
                    <ConfidenceDot confidence={fieldConf.supplier_name} />
                  </div>
                  <input type="text" name="supplier_name" bind:value={supplierNameInput}
                    class="rev-input" class:flagged={needsReview(supplierNameInput) || flagged('supplier_name')} />
                </div>
                <div>
                  <div class="rev-field-label">
                    {$t('field.invoiceNum')}
                    <ConfidenceDot confidence={fieldConf.invoice_number} />
                    {#if review?.data?.document_type === 'factura' || review?.data?.document_type === 'albaran'}
                      <span style="font-size:9.5px;font-weight:600;text-transform:none;letter-spacing:0;padding:1px 6px;border-radius:8px;background:var(--mep-surface-2);color:var(--mep-fg-3);">
                        {$t(`field.documentType.${review.data.document_type}`)}
                      </span>
                    {/if}
                  </div>
                  <input type="text" name="invoice_number" bind:value={invoiceNumberInput}
                    class="rev-input num" class:flagged={flagged('invoice_number')} />
                </div>
                <div>
                  <div class="rev-field-label">
                    {$t('field.invoiceDate')}
                    <ConfidenceDot confidence={fieldConf.invoice_date} />
                  </div>
                  <input type="text" name="invoice_date" bind:value={invoiceDateInput} placeholder="YYYY-MM-DD"
                    class="rev-input num" class:flagged={flagged('invoice_date')} />
                </div>
                <div>
                  <div class="rev-field-label">
                    {$t('extract.due')}
                    <ConfidenceDot confidence={fieldConf.due_date} />
                  </div>
                  <input type="text" name="due_date" bind:value={dueDateInput} placeholder="YYYY-MM-DD"
                    oninput={() => { dueDateSuggested = false; }}
                    class="rev-input num" class:flagged={flagged('due_date')} />
                  {#if dueDateSuggested}
                    <div style="font-size:11px;color:var(--mep-fg-3);margin-top:4px;">{$t('field.dueDateSuggested')}</div>
                  {/if}
                </div>
                <div>
                  <div class="rev-field-label">
                    {$t('tbl.total')}
                    <ConfidenceDot confidence={fieldConf.total_amount} />
                  </div>
                  <input type="text" name="total_amount" bind:value={totalAmountInput}
                    aria-describedby={hasDiscrepancy ? 'err-total_amount' : undefined}
                    class="rev-input num" class:mismatch={hasDiscrepancy} class:flagged={!hasDiscrepancy && flagged('total_amount')} />
                  {#if hasDiscrepancy}
                    <div id="err-total_amount" style="font-size:11px;color:var(--mep-warn);margin-top:4px;display:flex;align-items:center;gap:4px;">
                      <AlertTriangle size={10} /> {$t('extract.mismatch')} ({fmt(totalCalc)})
                    </div>
                  {/if}
                </div>
                <div class="rev-grid-wide">
                  <div class="rev-field-label">{$t('extract.notesInternal')} <span style="text-transform:none;letter-spacing:0;">{$t('extract.optional')}</span></div>
                  <textarea name="notes" maxlength={250} rows={2} bind:value={notesInput}
                    placeholder={$t('extract.notesPh')} class="rev-input"></textarea>
                </div>
              </div>
            </div>

            <div class="rev-sticky-head">
              <div class="body-strong">
                {$t('extract.lineItems')} <span class="num" style="color:var(--mep-fg-3);font-weight:400;">· {lineItems.length}</span>
              </div>
              <button type="button" class="btn btn-ghost" style="height:26px;font-size:12px;padding:0 8px;gap:5px;" onclick={addRow}>
                <Plus size={12} /> {$t('extract.addLine')}
              </button>
            </div>

            {#if lineItems.length === 0}
              <div class="rev-section" style="font-size:12.5px;color:var(--mep-fg-3);">{$t('review.noLines')}</div>
            {:else}
              <table class="tbl rev-lines" style="table-layout:fixed;width:100%;">
                <thead>
                  <tr>
                    <th class="num" style="width:38px;" title={$t('review.lineNumber')}>#</th>
                    <th>{$t('tbl.desc')}</th>
                    <th class="num" style="width:74px;">{$t('tbl.qty')}</th>
                    <th style="width:80px;">{$t('tbl.unit')}</th>
                    <th class="num" style="width:96px;">{$t('tbl.unitPrice')}</th>
                    <th class="num" style="width:100px;">{$t('tbl.total')}</th>
                    <th style="width:36px;"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each lineItems as item, i}
                    {@const itemConf = typeof item.confidence === 'number' ? item.confidence : null}
                    {@const confLow = itemConf != null && itemConf < 0.85}
                    <tr data-line={i} style="background:{confLow ? 'var(--mep-warn-soft)' : 'transparent'};">
                      <td class="num" style="color:var(--mep-fg-4);font-size:11px;">{i + 1}</td>
                      <td>
                        <div style="display:flex;align-items:center;gap:5px;">
                          <input type="text" name="line_descriptions" bind:value={lineItems[i].description}
                            class="rev-cell" style="font-size:12.5px;font-weight:500;" />
                          <ConfidenceDot confidence={itemConf} size={6} />
                        </div>
                      </td>
                      <td class="num">
                        <input type="text" name="line_quantities" bind:value={lineItems[i].quantity} class="rev-cell num" style="text-align:right;" />
                      </td>
                      <td>
                        <input type="text" name="line_units" bind:value={lineItems[i].unit} class="rev-cell" style="color:var(--mep-fg-2);" />
                      </td>
                      <td class="num">
                        <input type="text" name="line_unit_prices" bind:value={lineItems[i].unit_price} class="rev-cell num" style="text-align:right;" />
                      </td>
                      <td class="num">
                        <input type="text" name="line_total_prices" bind:value={lineItems[i].total_price} class="rev-cell num" style="text-align:right;font-weight:500;" />
                      </td>
                      <td>
                        <input type="hidden" name="line_tax_rates" value={str(item.tax_rate ?? '')} />
                        <input type="hidden" name="line_supplier_skus" value={str(item.product_code ?? '')} />
                        <button type="button" class="rev-icon-btn" style="width:22px;height:22px;" title={$t('review.removeLine')} aria-label={$t('review.removeLine')} onclick={() => removeRow(i)}>
                          <Trash size={11} />
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}


          </div>

          {#if taxBreakdown && taxPanelOpen}
            <div class="rev-tax-panel">
              <div class="rev-tax-panel-head">
                <span class="body-strong">{$t('review.taxes')}</span>
                {#if !taxBaseMatchesLines}
                  <span class="rev-tax-stale" title={$t('review.taxBaseStaleHint')}>
                    <AlertTriangle size={11} /> {$t('review.taxBaseStale')}
                  </span>
                {/if}
              </div>
              <table class="tbl rev-tax-tbl">
                <thead>
                  <tr>
                    <th>{$t('review.taxRate')}</th>
                    <th class="num">{$t('review.taxBandBase')}</th>
                    <th class="num">{$t('review.taxAmount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each taxBreakdown as band}
                    <tr>
                      <td>
                        <span class="num" style="font-weight:500;">{ratePct(band.rate)}</span>
                        {#if band.type === 'rec'}
                          <span class="badge badge-neutral" style="margin-left:6px;" title={$t('review.taxRecFull')}>{$t('review.taxRec')}</span>
                        {:else if band.type === 'iva'}
                          <span class="badge badge-neutral" style="margin-left:6px;">{$t('review.taxIva')}</span>
                        {/if}
                      </td>
                      <td class="num">{fmt(band.base ?? 0)}</td>
                      <td class="num" style="font-weight:500;">{fmt(band.tax_amount ?? 0)}</td>
                    </tr>
                  {/each}
                </tbody>
                <tfoot>
                  <tr>
                    <td style="color:var(--mep-fg-3);">{$t('tbl.total')}</td>
                    <td class="num" style="color:var(--mep-fg-3);">{fmt(taxBase)}</td>
                    <td class="num" style="font-weight:600;">{fmt(taxTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          {/if}

          <div class="rev-bar rev-bar-foot">
            {#if hasDiscrepancy}
              <div class="rev-foot-status" style="color:var(--mep-warn);font-weight:500;">
                <AlertTriangle size={12} /> {$t('extract.discrepancy')} · {fmt(discrepancy)}
              </div>
            {:else if lineItems.length > 0}
              <div class="rev-foot-status" style="color:var(--mep-pos);font-weight:500;">
                <Check size={12} /> {$t('extract.totalsMatch')}
              </div>
            {:else}
              <div class="rev-foot-status" style="color:var(--mep-fg-3);">{$t('extract.noLinesVerify')}</div>
            {/if}

            <div class="rev-shortcuts" title={$t('review.shortcuts')}>
              <span><kbd class="rev-kbd">⌘↵</kbd> {$t('review.shortcutSave')}</span>
              <span><kbd class="rev-kbd">⌘\</kbd> {$t('review.shortcutPreview')}</span>
              <span><kbd class="rev-kbd">⌘B</kbd> {$t('review.shortcutQueue')}</span>
              <span><kbd class="rev-kbd">F2</kbd> {$t('review.shortcutJump')}</span>
            </div>

            <div class="rev-foot-totals">
              {#if taxTotal > 0}
                <span style="font-size:11.5px;color:var(--mep-fg-3);">{$t('extract.taxBase')} <span class="num" style="color:var(--mep-fg-2);">{fmt(lineTotal)}</span></span>
                {#if taxBreakdown}
                  <button type="button" class="rev-tax-toggle" onclick={() => taxPanelOpen = !taxPanelOpen}
                    aria-expanded={taxPanelOpen}
                    title={taxPanelOpen ? $t('review.hideTaxes') : $t('review.showTaxes')}>
                    {$t('extract.vat')} <span class="num">{fmt(taxTotal)}</span>
                    {#if !taxBaseMatchesLines}<AlertTriangle size={10} />{/if}
                    <span class="rev-tax-caret" class:open={taxPanelOpen}><ChevronsRight size={11} /></span>
                  </button>
                {:else}
                  <span style="font-size:11.5px;color:var(--mep-fg-3);">{$t('extract.vat')} <span class="num" style="color:var(--mep-fg-2);">{fmt(taxTotal)}</span></span>
                {/if}
              {/if}
              <span style="font-size:12px;color:var(--mep-fg-2);">{$t('extract.calcTotal')}</span>
              <span class="num" style="font-size:15px;font-weight:600;color:var(--mep-fg);">{fmt(totalCalc)}</span>
            </div>
          </div>

        </div>
      </form>
      {/key}

    {:else if data.failedItem}
      <div class="rev-col rev-col-fill" style="display:flex;flex-direction:column;gap:12px;max-width:560px;overflow:visible;">
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
      <div class="card rev-col rev-col-fill" style="align-items:center;justify-content:center;gap:18px;padding:40px 32px;text-align:center;">
        <div style="width:44px;height:44px;border:3px solid var(--mep-acc);border-top-color:transparent;border-radius:50%;animation:mepspin 0.9s linear infinite;"></div>
        <div>
          <div style="font-size:15px;font-weight:600;color:var(--mep-fg);margin-bottom:6px;">
            {$ti('batch.extracting', { name: extractingItem?.name ?? $t('misc.invoice') })}
          </div>
          <div style="font-size:13px;color:var(--mep-fg-3);line-height:1.5;">
            {$ti('batch.progress', { done: doneCount, total: data.queue.length })}
          </div>
        </div>
      </div>

    {:else}
      <div class="card rev-col rev-col-fill" style="align-items:center;justify-content:center;gap:16px;padding:40px 32px;text-align:center;">
        <div style="width:48px;height:48px;border-radius:24px;background:var(--mep-acc-soft);color:var(--mep-acc);display:flex;align-items:center;justify-content:center;">
          <Sparkle size={20} />
        </div>
        <div>
          <div style="font-size:15px;font-weight:600;color:var(--mep-fg);margin-bottom:4px;">
            {$tp('batch.readyToExtract', data.openCount)}
          </div>
          <div style="font-size:13px;color:var(--mep-fg-3);">{$t('batch.processParallel')}</div>
        </div>
        <form method="POST" action="?/extract">
          <button type="submit" class="btn btn-primary" style="height:40px;justify-content:center;font-weight:500;gap:6px;padding:0 20px;">
            <Sparkle size={14} />
            {$tp('confirm.extract', data.openCount)}
          </button>
        </form>
      </div>
    {/if}
  </div>
</div>

{#if previewFull && review}
  <div class="rev-lightbox" role="presentation" onclick={() => previewFull = false}>
    <div class="rev-lightbox-bar">
      <span class="rev-lightbox-title">{review.filename}</span>
      <button type="button" class="btn btn-secondary" style="height:32px;font-size:12.5px;gap:6px;" onclick={() => previewFull = false}>
        <X size={13} /> {$t('review.closeFullscreen')}
      </button>
    </div>
    <div class="rev-lightbox-frame" role="presentation" onclick={(e) => e.stopPropagation()}>
      <iframe src={previewSrc} title={$t('a11y.documentPreview')} style="width:100%;height:100%;border:none;display:block;"></iframe>
    </div>
  </div>
{/if}

{#if showContentDuplicateModal}
  <div
    style="position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:24px;"
    role="presentation"
    onclick={() => showContentDuplicateModal = false}
  >
    <div
      style="background:var(--mep-bg);border:1px solid var(--mep-border-strong);border-radius:14px;padding:28px 24px;max-width:400px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,0.2);"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <AlertTriangle size={18} style="color:var(--mep-neg);flex-shrink:0;" />
        <strong style="font-size:15px;font-weight:600;color:var(--mep-fg);">{$t('batch.dupTitle')}</strong>
      </div>
      <p style="font-size:13px;color:var(--mep-fg-2);line-height:1.6;margin:0 0 20px;">
        {$t('batch.dupBody')}
      </p>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
        <button type="button" class="btn btn-secondary" style="height:36px;font-size:13px;"
          onclick={() => showContentDuplicateModal = false}>
          {$t('batch.backToReview')}
        </button>
        <button type="submit" form="discard-item-form" class="btn btn-primary" style="height:36px;font-size:13px;"
          onclick={() => showContentDuplicateModal = false}>
          {$t('extract.discard')}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showLowConfModal}
  <div
    style="position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:24px;"
    role="presentation"
    onclick={() => showLowConfModal = false}
  >
    <div
      style="background:var(--mep-bg);border:1px solid var(--mep-border-strong);border-radius:14px;padding:28px 24px;max-width:400px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,0.2);"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <AlertTriangle size={18} style="color:var(--mep-warn);flex-shrink:0;" />
        <strong style="font-size:15px;font-weight:600;color:var(--mep-fg);">{$t('batch.lowConfTitle')}</strong>
      </div>
      <p style="font-size:13px;color:var(--mep-fg-2);line-height:1.6;margin:0 0 16px;">
        {$t('batch.lowConfPre')} <strong>{uncertainCount}</strong> {$tp('batch.field', uncertainCount)} {$t('batch.lowConfPost')}
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
          {$t('batch.backToReview')}
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
          {$t('batch.reviewedAll')}
        </button>
      </div>
    </div>
  </div>
{/if}
