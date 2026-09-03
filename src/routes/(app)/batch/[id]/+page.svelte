<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { enhance } from '$app/forms';
  import type { PageData } from './$types';
  import { str } from '$lib/formatters';
  import { UPLOAD_ACCEPT } from '$lib/upload-formats';
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
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import {
    percentInputValue, percentToFraction, fractionToPercent, isTaxType, bandsFromInputs, bandAmountCents,
    sumTaxCents, taxableBaseCents, lineRateFractions, bandsFromLines,
  } from '$lib/tax';
  import { t, ti, tp } from '$lib/i18n';
  import { PAYMENT_METHODS } from '$lib/constants';
  import { moneyToNullableNumber } from '$lib/money';

  import type { ActionData } from './$types';
  const { data, form }: { data: PageData; form: ActionData } = $props();

  let lowConfAck = $state(false);
  let showLowConfModal = $state(false);
  let showContentDuplicateModal = $state(false);
  let lowConfTriggerEl: HTMLElement | null = null;
  let dupTriggerEl: HTMLElement | null = null;

  $effect(() => {
    const f = form as Record<string, unknown> | null;
    if (f?.lowConfidenceBlocked) {
      lowConfTriggerEl = document.activeElement as HTMLElement | null;
      showLowConfModal = true;
    }
    if (f?.contentDuplicate) {
      dupTriggerEl = document.activeElement as HTMLElement | null;
      showContentDuplicateModal = true;
    }
  });

  function closeLowConfModal() {
    showLowConfModal = false;
    lowConfTriggerEl?.focus();
    lowConfTriggerEl = null;
  }
  function closeContentDuplicateModal() {
    showContentDuplicateModal = false;
    dupTriggerEl?.focus();
    dupTriggerEl = null;
  }
  function focusModalPanel(node: HTMLElement) {
    node.focus();
  }

  const formErrorKey = $derived.by(() => {
    const f = form as Record<string, unknown> | null;
    if (f?.errorKey === 'error.invalidDate') {
      return f.errorField === 'due_date' ? 'error.invalidDueDate' : 'error.invalidInvoiceDate';
    }
    return typeof f?.errorKey === 'string' ? f.errorKey : null;
  });

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
        const body = await resp.json() as { items: Array<{ id: string; status: string }>; stalled: boolean };
        const current = new Map(data.queue.map(q => [q.id, q.status]));
        const changed = body.items.some(i => current.has(i.id) && current.get(i.id) !== i.status);
        if (changed || body.stalled !== (data.stalled !== null)) await invalidateAll();
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
    tax_rate?: number | string | null;
    confidence?: number | null;
    product_code?: string | null;
    product_name?: string | null;
    product_status?: 'exact' | 'fuzzy' | 'new' | null;
  };

  type ProductMatch = {
    description: string;
    productId: number | null;
    productName: string;
    status: 'exact' | 'fuzzy' | 'new';
    score: number | null;
    suggestedTaxRate: number | null;
  };

  // svelte-ignore state_referenced_locally — the batch id in the route param never changes without a remount
  const DRAFT_PREFIX = `mep-batch-draft:${data.batchId}:`;
  function draftKey(itemId: string): string {
    return `${DRAFT_PREFIX}${itemId}`;
  }
  type DraftPayload = {
    supplierNameInput: string;
    invoiceNumberInput: string;
    documentTypeInput: string;
    invoiceDateInput: string;
    dueDateInput: string;
    dueDateSuggested: boolean;
    totalAmountInput: string;
    grossAmountInput: string;
    discountAmountInput: string;
    retentionRateInput: string;
    retentionAmountInput: string;
    notesInput: string;
    paymentMethodInput: string;
    paymentTermsInput: string;
    purchaseOrderInput: string;
    sellerNameInput: string;
    deliveryDateInput: string;
    deliveryAddressInput: string;
    printedNotesInput: string;
    lineItems: LineItem[];
    taxBands: BandRow[];
  };
  function readDraft(itemId: string): DraftPayload | null {
    try {
      const raw = localStorage.getItem(draftKey(itemId));
      return raw ? (JSON.parse(raw) as DraftPayload) : null;
    } catch {
      return null;
    }
  }
  function writeDraft(itemId: string, payload: DraftPayload) {
    try {
      localStorage.setItem(draftKey(itemId), JSON.stringify(payload));
    } catch {
      return;
    }
    if (!draftItemIds.has(itemId)) {
      const next = new Set(draftItemIds);
      next.add(itemId);
      draftItemIds = next;
    }
  }
  function clearDraft(itemId: string) {
    try {
      localStorage.removeItem(draftKey(itemId));
    } catch {
    }
    if (draftItemIds.has(itemId)) {
      const next = new Set(draftItemIds);
      next.delete(itemId);
      draftItemIds = next;
    }
  }
  let draftItemIds = $state<Set<string>>(new Set());
  onMount(() => {
    try {
      const ids = new Set<string>();
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(DRAFT_PREFIX)) ids.add(k.slice(DRAFT_PREFIX.length));
      }
      draftItemIds = ids;
    } catch {
    }
  });

  let lineItems = $state<LineItem[]>([]);
  let lineItemsSource: unknown = null;
  let taxBandsSource: unknown = null;
  $effect(() => {
    const raw = data.review?.data?.tax_breakdown;
    if (raw === taxBandsSource) return;
    taxBandsSource = raw;
    const draft = data.review?.itemId ? readDraft(data.review.itemId) : null;
    taxBands = draft?.taxBands ?? bandRowsFrom(raw);
  });
  function normalizeLine(item: LineItem, match?: ProductMatch): LineItem {
    return {
      ...item,
      product_name: match && match.status !== 'new' ? match.productName : '',
      product_status: match?.status ?? null,
      description: str(item.description),
      quantity: str(item.quantity),
      unit: str(item.unit),
      unit_price: priceStr(item.unit_price),
      total_price: priceStr(item.total_price),
      tax_rate: percentInputValue(item.tax_rate),
    };
  }
  function fillMissingLineRates(items: LineItem[], matches: ProductMatch[]): LineItem[] {
    return items.map((i, idx) => {
      if (percentToFraction(i.tax_rate) !== null) return i;
      const suggested = matches[idx]?.suggestedTaxRate;
      return suggested != null ? { ...i, tax_rate: percentInputValue(suggested) } : i;
    });
  }
  $effect(() => {
    const raw = data.review?.data?.line_items;
    if (raw === lineItemsSource) return;
    lineItemsSource = raw;
    const matches = (data.review?.productMatches ?? []) as ProductMatch[];
    const draft = data.review?.itemId ? readDraft(data.review.itemId) : null;
    lineItems = draft?.lineItems
      ? draft.lineItems.map((item, i) => (item.product_name === undefined ? normalizeLine(item, matches[i]) : item))
      : fillMissingLineRates(Array.isArray(raw) ? (raw as LineItem[]).map((item, i) => normalizeLine(item, matches[i])) : [], matches);
  });

  // svelte-ignore state_referenced_locally — reading the initial value is the point
  let lowConfAckItemId: string | null = data.review?.itemId ?? null;

  // svelte-ignore state_referenced_locally — a pending draft wins over the server's own extraction on first paint
  const initialDraft: DraftPayload | null = data.review ? readDraft(data.review.itemId) : null;

  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data (or a pending draft) once
  let supplierNameInput = $state(initialDraft?.supplierNameInput ?? str(data.review?.data?.supplier_name));
  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data (or a pending draft) once
  let invoiceNumberInput = $state(initialDraft?.invoiceNumberInput ?? str(data.review?.data?.invoice_number));
  function docTypeStr(v: unknown): 'factura' | 'albaran' | '' {
    return v === 'factura' || v === 'albaran' ? v : '';
  }
  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data (or a pending draft) once, user can correct it
  let documentTypeInput = $state(initialDraft?.documentTypeInput ?? docTypeStr(data.review?.data?.document_type));
  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data (or a pending draft) once
  let invoiceDateInput = $state(initialDraft?.invoiceDateInput ?? str(data.review?.data?.invoice_date));
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

  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data (or a pending draft) once
  let dueDateInput = $state(initialDraft?.dueDateInput ?? net30Suggestion(str(data.review?.data?.due_date), str(data.review?.data?.invoice_date)));
  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data (or a pending draft) once
  let dueDateSuggested = $state(initialDraft ? initialDraft.dueDateSuggested : (!str(data.review?.data?.due_date) && !!dueDateInput));
  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data (or a pending draft) once
  let totalAmountInput = $state(initialDraft?.totalAmountInput ?? priceStr(str(data.review?.data?.total_amount)));
  // svelte-ignore state_referenced_locally — intentional: the extraction's own total, never edited
  let originalTotal = $state(priceStr(str(data.review?.data?.total_amount)));
  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data (or a pending draft) once
  let grossAmountInput = $state(initialDraft?.grossAmountInput ?? priceStr(str(data.review?.data?.gross_amount)));
  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data (or a pending draft) once
  let discountAmountInput = $state(initialDraft?.discountAmountInput ?? priceStr(str(data.review?.data?.discount_amount)));
  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data (or a pending draft) once
  let retentionRateInput = $state(initialDraft?.retentionRateInput ?? percentInputValue(data.review?.data?.retention_rate as number | null | undefined));
  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data (or a pending draft) once
  let retentionAmountInput = $state(initialDraft?.retentionAmountInput ?? priceStr(str(data.review?.data?.retention_amount)));
  let notesInput = $state(initialDraft?.notesInput ?? '');
  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data (or a pending draft) once
  let paymentMethodInput = $state(initialDraft?.paymentMethodInput ?? str(data.review?.data?.payment_method));
  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data (or a pending draft) once
  let paymentTermsInput = $state(initialDraft?.paymentTermsInput ?? str(data.review?.data?.payment_terms));
  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data (or a pending draft) once
  let purchaseOrderInput = $state(initialDraft?.purchaseOrderInput ?? str(data.review?.data?.purchase_order));
  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data (or a pending draft) once
  let sellerNameInput = $state(initialDraft?.sellerNameInput ?? str(data.review?.data?.seller_name));
  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data (or a pending draft) once
  let deliveryDateInput = $state(initialDraft?.deliveryDateInput ?? str(data.review?.data?.delivery_date));
  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data (or a pending draft) once
  let deliveryAddressInput = $state(initialDraft?.deliveryAddressInput ?? str(data.review?.data?.delivery_address));
  // svelte-ignore state_referenced_locally — intentional: seed from server-loaded data (or a pending draft) once
  let printedNotesInput = $state(initialDraft?.printedNotesInput ?? str(data.review?.data?.printed_notes));

  $effect(() => {
    const id = data.review?.itemId ?? null;
    if (id === lowConfAckItemId) return;
    lowConfAckItemId = id;
    lowConfAck = false;
    showLowConfModal = false;
    showContentDuplicateModal = false;
    previewFull = false;
    taxPanelOpen = false;
    docStripOpen = false;
    openLine = -1;
    returnField = null;
    lastFocusedField = null;
    uncertainCursor = 0;
    originalTotal = priceStr(str(data.review?.data?.total_amount));
    const rd = data.review?.data;
    const draft = id ? readDraft(id) : null;
    supplierNameInput = draft?.supplierNameInput ?? str(rd?.supplier_name);
    invoiceNumberInput = draft?.invoiceNumberInput ?? str(rd?.invoice_number);
    documentTypeInput = draft?.documentTypeInput ?? docTypeStr(rd?.document_type);
    invoiceDateInput = draft?.invoiceDateInput ?? str(rd?.invoice_date);
    const rawDueDate = str(rd?.due_date);
    dueDateInput = draft?.dueDateInput ?? net30Suggestion(rawDueDate, invoiceDateInput);
    dueDateSuggested = draft ? draft.dueDateSuggested : (!rawDueDate && !!dueDateInput);
    totalAmountInput = draft?.totalAmountInput ?? priceStr(str(rd?.total_amount));
    grossAmountInput = draft?.grossAmountInput ?? priceStr(str(rd?.gross_amount));
    discountAmountInput = draft?.discountAmountInput ?? priceStr(str(rd?.discount_amount));
    retentionRateInput = draft?.retentionRateInput ?? percentInputValue(rd?.retention_rate as number | null | undefined);
    retentionAmountInput = draft?.retentionAmountInput ?? priceStr(str(rd?.retention_amount));
    notesInput = draft?.notesInput ?? '';
    paymentMethodInput = draft?.paymentMethodInput ?? str(rd?.payment_method);
    paymentTermsInput = draft?.paymentTermsInput ?? str(rd?.payment_terms);
    purchaseOrderInput = draft?.purchaseOrderInput ?? str(rd?.purchase_order);
    sellerNameInput = draft?.sellerNameInput ?? str(rd?.seller_name);
    deliveryDateInput = draft?.deliveryDateInput ?? str(rd?.delivery_date);
    deliveryAddressInput = draft?.deliveryAddressInput ?? str(rd?.delivery_address);
    printedNotesInput = draft?.printedNotesInput ?? str(rd?.printed_notes);
  });

  let lastAutosaveItemId: string | null = null;
  $effect(() => {
    const itemId = data.review?.itemId ?? null;
    const snapshot: DraftPayload = {
      supplierNameInput, invoiceNumberInput, documentTypeInput, invoiceDateInput,
      dueDateInput, dueDateSuggested, totalAmountInput, notesInput, lineItems, taxBands,
      paymentMethodInput, paymentTermsInput,
      purchaseOrderInput, sellerNameInput, deliveryDateInput, deliveryAddressInput, printedNotesInput,
      grossAmountInput, discountAmountInput, retentionRateInput, retentionAmountInput,
    };
    if (!itemId) return;
    if (itemId !== lastAutosaveItemId) {
      lastAutosaveItemId = itemId;
      return;
    }
    const timer = setTimeout(() => writeDraft(itemId, snapshot), 400);
    return () => clearTimeout(timer);
  });

  function addRow() {
    lineItems = [...lineItems, { description: '', quantity: '', unit: '', unit_price: '', total_price: '', product_name: '', product_status: null }];
    openLine = lineItems.length - 1;
  }
  function removeRow(i: number) {
    lineItems = lineItems.filter((_, j) => j !== i);
    if (openLine === i) openLine = -1;
    else if (openLine > i) openLine -= 1;
  }

  const review = $derived(data.review);
  const newIdempotencyKeyFor = (_scope: unknown): string => crypto.randomUUID();
  const idempotencyKey = $derived(newIdempotencyKeyFor(review?.itemId));
  const fieldConf = $derived((review?.fieldConfidences ?? {}) as Record<string, number>);
  const productOptions = $derived((review?.productOptions ?? []) as Array<{ id: number; name: string }>);
  const productIdByName = $derived(
    new Map(productOptions.map(o => [o.name.trim().toLowerCase(), o.id] as const))
  );
  const productIdFor = (name: unknown): number | null =>
    productIdByName.get(String(name ?? '').trim().toLowerCase()) ?? null;
  const productUnmatched = (name: unknown): boolean =>
    String(name ?? '').trim() !== '' && productIdFor(name) === null;
  const totalMismatch = $derived(review?.data?.total_mismatch === true);

  const HEADER_FIELDS = ['supplier_name', 'invoice_number', 'invoice_date', 'due_date', 'total_amount'] as const;
  const fieldVisible = $derived(data.fieldVisibility as Record<string, boolean>);
  const flagged = (field: string) => fieldConf[field] != null && fieldConf[field] < 0.85;
  const uncertainHeaderFields = $derived(HEADER_FIELDS.filter(f => (fieldVisible[f] ?? true) && flagged(f)));
  const uncertainLineIndexes = $derived(
    lineItems.map((item, i) => (item.confidence != null && item.confidence < 0.85 ? i : -1)).filter(i => i >= 0)
  );
  const uncertainLineCount = $derived(uncertainLineIndexes.length);
  const uncertainCount = $derived(uncertainHeaderFields.length + uncertainLineCount);
  const firstUncertainField = $derived(uncertainHeaderFields[0] ?? null);

  let uncertainCursor = 0;
  function jumpToUncertain() {
    const targets: Array<{ field?: string; line?: number }> = [
      ...uncertainHeaderFields.map(f => ({ field: f as string })),
      ...uncertainLineIndexes.map(i => ({ line: i })),
    ];
    if (targets.length === 0) return;
    const target = targets[uncertainCursor % targets.length];
    uncertainCursor += 1;
    if (target.line !== undefined) openLine = target.line;
    tick().then(() => {
      const selector = target.field
        ? `input[name="${target.field}"]`
        : `[data-line="${target.line}"] input:not([type="hidden"])`;
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.focus();
    });
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

  async function selectItem(itemId: string) {
    if (itemId === data.review?.itemId) return;
    await goto(`/batch/${data.batchId}?item=${itemId}`, { keepFocus: true, noScroll: true });
  }

  function clearDraftOnSuccess(itemId: string) {
    return () => {
      return async ({ result, update }: { result: { type: string }; update: () => Promise<void> }) => {
        if (result.type === 'redirect') clearDraft(itemId);
        await update();
      };
    };
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && previewFull) {
      closeDocViewer();
      return;
    }
    if (e.key === 'Escape' && showLowConfModal) {
      closeLowConfModal();
      return;
    }
    if (e.key === 'Escape' && showContentDuplicateModal) {
      closeContentDuplicateModal();
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
  const CONFIDENCE_BADGE_KEYS: Record<string, string> = {
    high:   'extract.badge.high',
    medium: 'extract.badge.med',
  };
  const confidenceBadgeKey = $derived(
    CONFIDENCE_BADGE_KEYS[review?.confidenceLevel ?? ''] ?? 'extract.badge.low'
  );

  const QUEUE_STATUS_KEYS: Record<string, string> = {
    confirmed:  'confirm.extractDone',
    done:       'batch.queue.ready',
    extracting: 'confirm.extractActive',
    queued:     'confirm.inQueue',
    failed:     'extract.error',
  };
  function queueItemSubLabel(item: { status: string; type: string; size: string }): string {
    const key = QUEUE_STATUS_KEYS[item.status];
    return key ? t(key) : `${item.type} · ${item.size}`;
  }

  const UNCERTAIN_FIELD_LABEL_KEYS: Record<string, string> = {
    supplier_name:  'field.supplier',
    invoice_number: 'field.invoiceNum',
    invoice_date:   'field.invoiceDate',
    due_date:       'field.dueDate',
  };
  function uncertainFieldLabel(field: string): string {
    return t(UNCERTAIN_FIELD_LABEL_KEYS[field] ?? 'field.totalAmount');
  }

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
  type BandRow = { rate: string; type: string; base: string; amount: string };
  let taxBands = $state<BandRow[]>([]);
  let taxPanelOpen = $state(false);

  function bandRowsFrom(raw: unknown): BandRow[] {
    if (!Array.isArray(raw)) return [];
    return (raw as Array<Record<string, unknown>>).map(b => ({
      rate: percentInputValue(b.rate as number | null | undefined),
      type: isTaxType(b.type) ? b.type : '',
      base: priceStr(b.base as number | null | undefined),
      amount: priceStr(b.tax_amount as number | null | undefined),
    }));
  }

  const bandModels = $derived(bandsFromInputs(taxBands.map(b => ({ ...b }))));
  const taxTotal = $derived(sumTaxCents(bandModels) / 100);
  const taxBase = $derived(taxableBaseCents(bandModels) / 100);
  const taxBaseMatchesLines = $derived(taxBase > 0 && Math.abs(taxBase - lineTotal) <= 0.01);

  const lineRates = $derived(lineRateFractions(lineItems.map(i => ({ totalPrice: i.total_price, rate: i.tax_rate }))));
  const bandRates = $derived(new Set(bandModels.map(b => b.rate)));
  const unbandedRates = $derived(lineRates.filter(r => !bandRates.has(r)));
  const linesCarryRates = $derived(lineRates.length > 0);

  function syncBandAmount(i: number) {
    const cents = bandAmountCents(taxBands[i].base, taxBands[i].rate);
    if (cents !== null) taxBands[i].amount = (cents / 100).toFixed(2);
  }
  function addBand() {
    taxBands = [...taxBands, { rate: '', type: '', base: lineTotal.toFixed(2), amount: '' }];
    taxPanelOpen = true;
  }
  function removeBand(i: number) {
    taxBands = taxBands.filter((_, j) => j !== i);
  }
  function rebuildBandsFromLines() {
    const derived = bandsFromLines(
      lineItems.map(i => ({ totalPrice: i.total_price, rate: i.tax_rate })),
      'iva',
    );
    const kept = taxBands.filter(b => b.type === 'rec');
    taxBands = [
      ...derived.map(b => ({
        rate: percentInputValue(b.rate),
        type: 'iva',
        base: b.base.toFixed(2),
        amount: b.tax_amount.toFixed(2),
      })),
      ...kept,
    ];
    taxPanelOpen = true;
  }

  function ratePctLabel(rate: number | null | undefined): string {
    const pct = fractionToPercent(rate);
    return pct === null ? '—' : String(pct).replace('.', ',') + '%';
  }
  const grossAmount = $derived(moneyToNullableNumber(grossAmountInput));
  const discountAmount = $derived(moneyToNullableNumber(discountAmountInput));
  const retentionRate = $derived(percentToFraction(retentionRateInput));
  const retentionAmount = $derived(moneyToNullableNumber(retentionAmountInput));

  const totalCalc = $derived(lineTotal + taxTotal - (discountAmount ?? 0) - (retentionAmount ?? 0));
  const discrepancy = $derived(Math.abs(totalCalc - extractedTotal));
  const hasDiscrepancy = $derived(discrepancy > 0.01 && extractedTotal > 0);
  const originalTotalNum = $derived.by(() => {
    const n = parseFloat(originalTotal);
    return isNaN(n) ? 0 : n;
  });
  const drift = $derived(totalCalc - originalTotalNum);
  const extractedDrift = $derived(originalTotalNum > 0 && Math.abs(drift) > 0.01);
  const driftLabel = $derived(`${drift > 0 ? '+' : '−'}${fmt(Math.abs(drift))}`);
  const taxNeedsAttention = $derived(
    (taxBands.length > 0 && !taxBaseMatchesLines) || unbandedRates.length > 0
  );
  const bandKinds = $derived(['iva', 'rec'].filter(k => taxBands.some(b => b.type === k)));
  const showBandKinds = $derived(bandKinds.includes('rec'));
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

  let isMobile = $state(false);
  $effect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    isMobile = mq.matches;
    const onChange = () => { isMobile = mq.matches; };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  });

  let docStripOpen = $state(false);
  let openLine = $state(-1);
  let returnField = $state<string | null>(null);

  const RETURN_LABELS: Record<string, string> = {
    supplier_name: 'field.supplier',
    invoice_number: 'field.invoiceNum',
    invoice_date: 'field.invoiceDate',
    due_date: 'extract.due',
    total_amount: 'tbl.total',
  };

  const returnTarget = $derived.by(() => {
    if (!returnField) return null;
    const values: Record<string, string> = {
      supplier_name: supplierNameInput,
      invoice_number: invoiceNumberInput,
      invoice_date: invoiceDateInput,
      due_date: dueDateInput,
      total_amount: totalAmountInput,
    };
    return { labelKey: RETURN_LABELS[returnField], value: values[returnField] ?? '' };
  });

  let lastFocusedField: string | null = null;
  function onFocusIn(e: FocusEvent) {
    const el = e.target as HTMLInputElement | null;
    if (el && el.tagName === 'INPUT' && RETURN_LABELS[el.name]) lastFocusedField = el.name;
  }

  function openDocViewer() {
    returnField = lastFocusedField;
    (document.activeElement as HTMLElement | null)?.blur();
    previewFull = true;
  }

  function closeDocViewer() {
    previewFull = false;
    const name = returnField;
    returnField = null;
    if (!name) return;
    tick().then(() => {
      const input = document.querySelector<HTMLElement>(`input[name="${name}"]`);
      if (!input) return;
      input.scrollIntoView({ block: 'center', behavior: 'smooth' });
      input.focus();
    });
  }

  const previewExt = $derived((review?.filename ?? '').toLowerCase().split('.').pop() ?? '');
  const previewIsImage = $derived(previewExt === 'jpg' || previewExt === 'jpeg' || previewExt === 'png');
  const previewIsPdf = $derived(previewExt === 'pdf');
  const previewFitSrc = $derived(previewIsPdf ? `${previewSrc}#toolbar=0&navpanes=0&view=FitH` : previewSrc);

  const activeDoc = $derived(data.queue.find(q => q.id === (data.review?.itemId ?? data.failedItem?.itemId)) ?? data.queue.find(q => q.status === 'extracting') ?? data.queue[0]);
  const activeDocIndex = $derived(Math.max(1, data.queue.findIndex(q => q.id === activeDoc?.id) + 1));
  const queueRemaining = $derived(data.queue.filter(q => q.status === 'queued' || q.status === 'pending').length);

  function toggleLine(i: number) {
    openLine = openLine === i ? -1 : i;
  }
</script>

<svelte:window onkeydown={onWindowKeydown} onfocusin={onFocusIn} />

<div class:rev-dragging={dragging} style="height:100%;display:flex;flex-direction:column;overflow:hidden;">

  <div class="rev-desktop-only" style="padding:12px 20px 0;flex-shrink:0;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
    <FlowSteps active={data.anyInFlight ? 1 : 2} size="sm" />
  </div>

  <div class="rev-mobile-only rev-strip">
    <button type="button" class="rev-strip-row" onclick={() => docStripOpen = !docStripOpen} aria-expanded={docStripOpen}>
      <FileTypeBadge
        kind={activeDoc?.type === 'PDF' ? 'pdf' : 'other'}
        label={activeDoc?.type ?? ''}
        opacity={1}
      />
      <span class="rev-strip-name">
        <span class="rev-strip-file">{activeDoc?.name ?? ''}</span>
        <span class="num rev-strip-sub">
          {ti('review.docOf', { i: activeDocIndex, n: data.queue.length })}{queueRemaining > 0 ? ` · ${tp('review.inQueue', queueRemaining)}` : ''}
        </span>
      </span>
      <span class="rev-strip-dots">
        {#each data.queue as q (q.id)}
          <span class="rev-strip-dot" class:on={q.id === data.review?.itemId || q.status === 'extracting'} class:done={q.status === 'confirmed'} class:draft={draftItemIds.has(q.id)}></span>
        {/each}
      </span>
      <span class="rev-tax-caret" class:open={docStripOpen}><ChevronsRight size={14} /></span>
    </button>

    {#if docStripOpen}
      <div class="rev-strip-list">
        {#each data.queue as q (q.id)}
          {@const selectable = q.status === 'done' || q.status === 'failed'}
          {@const hasDraft = draftItemIds.has(q.id)}
          <button
            type="button"
            class="rev-strip-item"
            class:active={q.id === data.review?.itemId}
            disabled={!selectable}
            onclick={() => { selectItem(q.id); docStripOpen = false; }}
          >
            <FileTypeBadge
              kind={q.type === 'PDF' ? 'pdf' : 'other'}
              label={q.type}
              opacity={q.status === 'confirmed' ? 0.55 : 1}
            />
            <span style="flex:1;min-width:0;">
              <span class="rev-strip-file">{q.name}</span>
              <span class="rev-strip-sub">
                {queueItemSubLabel(q)}
              </span>
            </span>
            {#if hasDraft}
              <span class="rev-draft-dot" title={t('review.draftPending')} aria-label={t('review.draftPending')}></span>
            {/if}
            {#if q.id === data.review?.itemId}
              <span class="rev-strip-mark">{t('review.reviewing')}</span>
            {:else if q.status === 'confirmed'}
              <span class="text-pos inline-flex"><Check size={14} /></span>
            {:else if q.status === 'failed'}
              <span class="text-neg inline-flex"><AlertTriangle size={14} /></span>
            {/if}
          </button>
        {/each}
        <div class="rev-strip-actions">
          <label class="rev-strip-action">
            <Plus size={15} /> {t('review.addFiles')}
            <input type="file" class="hidden" accept={UPLOAD_ACCEPT} multiple onchange={(e) => { onFileInputChange(e); submitAddFiles(); }} />
          </label>
          <button type="submit" form="discard-batch-form" class="rev-strip-action danger">
            <Trash size={15} /> {t('confirm.discard')}
          </button>
        </div>
      </div>
    {/if}
  </div>

  <form id="discard-batch-form" method="POST" action="?/discardBatch" style="display:none;"></form>

  <div class="rev-shell" style="padding:12px 20px 16px;">

    <div class="card rev-col rev-col-fixed rev-sizing rev-desktop-only" style="width:{railWidth}px;padding:8px 0 6px;">
      <div class="rev-rail-head" style="display:flex;align-items:center;gap:6px;padding:0 {queueOpen ? 10 : 8}px 8px;{queueOpen ? '' : 'flex-direction:column;'}">
        <button
          type="button"
          class="rev-icon-btn"
          onclick={toggleQueue}
          aria-expanded={queueOpen}
          title={`${queueOpen ? t('review.collapseQueue') : t('review.expandQueue')} · ⌘B`}
          aria-label={queueOpen ? t('review.collapseQueue') : t('review.expandQueue')}
        >
          {#if queueOpen}<PanelLeftClose size={15} />{:else}<PanelLeft size={15} />{/if}
        </button>
        {#if queueOpen}
          <span class="body-strong" style="flex:1;min-width:0;">{t('review.queue')}</span>
        {/if}
        <span class="num text-[11px] font-semibold px-[7px] py-0.5 rounded-full bg-acc-soft text-acc" title={t('upload.queue')}>{doneCount}/{data.queue.length}</span>
      </div>

      <div class="rev-rail-list" style="flex:1;overflow-y:auto;min-height:0;padding:0 {queueOpen ? 6 : 5}px;">
        {#each data.queue as q (q.id)}
          {@const isActive = q.id === data.review?.itemId || q.status === 'extracting'}
          {@const selectable = q.status === 'done' || q.status === 'failed'}
          {@const hasDraft = draftItemIds.has(q.id)}
          <svelte:element
            this={selectable ? 'button' : 'div'}
            type={selectable ? 'button' : undefined}
            role={selectable ? 'button' : undefined}
            class="rev-rail-btn"
            class:active={isActive}
            title={`${q.name} · ${q.type} · ${q.size}`}
            style={queueOpen ? '' : 'justify-content:center;padding:7px 0;'}
            onclick={selectable ? () => selectItem(q.id) : undefined}
          >
            <FileTypeBadge
              kind={q.type === 'PDF' ? 'pdf' : 'other'}
              label={q.type}
              opacity={q.status === 'confirmed' ? 0.55 : 1}
            />
            {#if queueOpen}
              <div style="flex:1;min-width:0;">
                <div class="text-[12.5px] font-medium truncate {q.status === 'confirmed' ? 'text-fg-3' : 'text-fg'}">{q.name}</div>
                <div class="num text-[11px] text-fg-3">
                  {queueItemSubLabel(q)}
                </div>
              </div>
            {/if}
            <div style="flex-shrink:0;display:flex;align-items:center;gap:6px;{queueOpen ? '' : 'position:absolute;'}">
              {#if hasDraft}
                <span class="rev-draft-dot" title={t('review.draftPending')} aria-label={t('review.draftPending')}></span>
              {/if}
              {#if q.status === 'confirmed'}
                <div class="w-[18px] h-[18px] rounded-pill bg-pos-soft text-pos flex items-center justify-center"><Check size={11} /></div>
              {:else if q.status === 'done'}
                {#if queueOpen}
                  <div class="w-[18px] h-[18px] rounded-pill bg-acc-soft text-acc flex items-center justify-center"><Check size={11} /></div>
                {/if}
              {:else if q.status === 'extracting'}
                <svg width="18" height="18" viewBox="0 0 16 16" class="text-acc" style="animation:mepspin 1.1s linear infinite;">
                  <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-opacity="0.2" stroke-width="2" />
                  <path d="M14 8a6 6 0 00-6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              {:else if q.status === 'queued'}
                {#if queueOpen}
                  <div class="w-[18px] h-[18px] rounded-pill border border-dashed border-border text-fg-3 flex items-center justify-center"><Clock size={10} /></div>
                {/if}
              {:else if q.status === 'failed'}
                <span class="text-neg inline-flex"><AlertTriangle size={13} /></span>
              {:else if queueOpen}
                <form method="POST" action="?/remove">
                  <input type="hidden" name="itemId" value={q.id} />
                  <button type="submit" class="rev-icon-btn" style="width:22px;height:22px;" title={t('confirm.remove')} aria-label={t('confirm.remove')}>
                    <X size={12} />
                  </button>
                </form>
              {/if}
            </div>
          </svelte:element>
        {/each}
      </div>

      <div class="rev-rail-foot border-t border-divider flex flex-col gap-2 {queueOpen ? 'items-stretch' : 'items-center'}" style="padding:8px {queueOpen ? 12 : 6}px 2px;">
        {#if queueOpen}
          <button type="button" class="btn btn-ghost text-[12.5px] text-acc p-0 justify-start h-6"
            onclick={() => addMoreOpen = !addMoreOpen}>
            {addMoreOpen ? t('confirm.hideAdd') : t('confirm.showAdd')}
          </button>
          {#if addMoreOpen}
            <label class="flex items-center gap-2 p-2.5 rounded-lg border-[1.5px] border-dashed border-border-strong cursor-pointer text-xs text-fg-3 bg-surface-2">
              <Upload size={14} />
              {t('confirm.addMoreTitle')}
              <input type="file" class="hidden" accept={UPLOAD_ACCEPT} multiple onchange={onFileInputChange} />
            </label>
            {#each addFiles as f, i}
              <div class="flex items-center gap-2 text-xs text-fg">
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{f.name}</span>
                <button type="button" class="rev-icon-btn" style="width:20px;height:20px;" title={t('confirm.remove')} aria-label={t('confirm.remove')} onclick={() => addFiles = addFiles.filter((_, j) => j !== i)}><X size={11} /></button>
              </div>
            {/each}
            {#if addFiles.length > 0}
              <button disabled={addSubmitting} class="btn btn-primary" style="justify-content:center;font-size:12.5px;" onclick={submitAddFiles}>
                {addSubmitting ? t('confirm.adding') : tp('confirm.addFile', addFiles.length)}
              </button>
            {/if}
          {/if}
          <form method="POST" action="?/discardBatch">
            <button type="submit" class="btn btn-secondary" style="width:100%;height:30px;justify-content:center;font-size:12px;">
              {t('confirm.discard')}
            </button>
          </form>
        {:else}
          <label class="rev-icon-btn" title={t('confirm.addMoreTitle')} aria-label={t('confirm.addMoreTitle')}>
            <Upload size={14} />
            <input type="file" class="hidden" accept={UPLOAD_ACCEPT} multiple onchange={(e) => { onFileInputChange(e); submitAddFiles(); }} />
          </label>
          <form method="POST" action="?/discardBatch">
            <button type="submit" class="rev-icon-btn" title={t('confirm.discard')} aria-label={t('confirm.discard')}>
              <Trash size={14} />
            </button>
          </form>
        {/if}
      </div>
    </div>

    {#if review}
      {#key review.itemId}

      <form id="discard-item-form" method="POST" action="?/discardItem" style="display:none;" use:enhance={clearDraftOnSuccess(review.itemId)}>
        <input type="hidden" name="itemId" value={review.itemId} />
      </form>

      <div class="card rev-col rev-col-fixed rev-sizing rev-preview-frame rev-desktop-only" style="width:{previewOpen ? previewW : PREVIEW_SHUT_W}px;padding:0;">
        <h2 class="sr-only">{t('a11y.documentPreview')}</h2>
        {#if previewOpen}
          <div class="rev-bar rev-bar-head" style="padding:8px 8px 8px 12px;gap:6px;">
            <span class="inline-flex text-fg-3 shrink-0"><FileText size={13} /></span>
            <div title={review.filename} class="flex-1 min-w-0 text-xs text-fg-2 font-medium truncate">
              {review.filename}
            </div>
            <a href={previewSrc} target="_blank" rel="noopener" class="rev-icon-btn" title={t('review.openInTab')} aria-label={t('review.openInTab')}>
              <ExternalLink size={13} />
            </a>
            <button type="button" class="rev-icon-btn" onclick={() => previewFull = true} title={t('review.fullscreen')} aria-label={t('review.fullscreen')}>
              <Maximize2 size={13} />
            </button>
            <button type="button" class="rev-icon-btn" onclick={togglePreview} title={`${t('review.hidePreview')} · ⌘\\`} aria-label={t('review.hidePreview')}>
              <ChevronsLeft size={14} />
            </button>
          </div>
          <div class="flex-1 min-h-0 overflow-hidden bg-surface-2">
            <iframe
              src={previewSrc}
              title={t('a11y.documentPreview')}
              style="width:100%;height:100%;border:none;display:block;"
            ></iframe>
          </div>
          <div class="px-2.5 py-1.5 border-t border-divider flex items-center gap-[5px] text-[11px] text-acc">
            <Sparkle size={10} /> {t('extract.aiExtracted')} · {t(confidenceBadgeKey)}
          </div>
        {:else}
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 0;">
            <button type="button" class="rev-icon-btn" onclick={togglePreview} title={`${t('review.showPreview')} · ⌘\\`} aria-label={t('review.showPreview')}>
              <ChevronsRight size={14} />
            </button>
            <button type="button" class="rev-icon-btn" onclick={() => previewFull = true} title={t('review.fullscreen')} aria-label={t('review.fullscreen')}>
              <FileText size={14} />
            </button>
          </div>
        {/if}
      </div>

      {#if previewOpen}
        <button
          type="button"
          class="rev-split rev-desktop-only"
          onpointerdown={onSplitDown}
          onpointermove={onSplitMove}
          onpointerup={onSplitUp}
          onpointercancel={onSplitUp}
          onkeydown={onSplitKey}
          ondblclick={resetPreviewWidth}
          aria-label={t('review.resizePreview')}
          title={`${t('review.resizePreview')} · ${t('review.resetWidth')}`}
        ></button>
      {/if}

      <form id="save-form" method="POST" action="?/save" class="rev-col rev-col-fill" style="display:contents;" use:enhance={clearDraftOnSuccess(review.itemId)}>
        <input type="hidden" name="itemId" value={review.itemId} />
        <input type="hidden" name="idempotency_key" value={idempotencyKey} />
        <input type="hidden" name="confidence" value={str(confidence)} />
        <input type="hidden" name="low_confidence_ack" value={lowConfAck ? 'true' : 'false'} />
        <input type="hidden" name="tax_bands_present" value="1" />
        {#each taxBands as band}
          <input type="hidden" name="tax_rates" value={band.rate} />
          <input type="hidden" name="tax_types" value={band.type} />
          <input type="hidden" name="tax_bases" value={band.base} />
          <input type="hidden" name="tax_amounts" value={band.amount} />
        {/each}

        <div class="card rev-col rev-col-fill" data-coach="invoice-fields" style="padding:0;">
          <h2 class="sr-only">{t('a11y.extractedData')}</h2>

          <div class="rev-bar rev-bar-head">
            <div class="rev-bar-title">
              <div class="text-sm font-semibold text-fg truncate">
                {invoiceNumber} · {supplierName}
              </div>
            </div>
            {#if uncertainCount > 0}
              <button type="button" class="badge badge-pending" style="cursor:pointer;flex-shrink:0;" onclick={jumpToUncertain}
                title={`${t('review.jumpUncertain')} · F2`}>
                <AlertTriangle size={11} /> {uncertainCount}
              </button>
            {:else}
              <span class="badge badge-confirmed" style="flex-shrink:0;" title={t('review.allChecked')}>
                <Check size={11} />
              </span>
            {/if}
            <button type="submit" form="discard-item-form" class="btn btn-secondary rev-desktop-only" style="font-size:12.5px;padding:0 12px;flex-shrink:0;">{t('extract.discard')}</button>
            <button type="submit" form="save-form" class="btn btn-primary rev-desktop-only" style="font-size:12.5px;gap:6px;flex-shrink:0;padding:0 12px;">
              <Check size={13} /> {t('extract.confirmSave')}
              <kbd class="rev-kbd" style="background:transparent;border-color:currentColor;color:inherit;opacity:0.7;">⌘↵</kbd>
            </button>
          </div>

          <div class="rev-scroll">

            <div class="rev-section">
              {#if formErrorKey}
                <div role="alert" class="rev-note rev-note-neg">
                  <AlertTriangle size={12} style="flex-shrink:0;" />
                  <span style="flex:1;">{t(formErrorKey)}</span>
                </div>
              {/if}
              {#if review.duplicateOfId}
                <div class="rev-note rev-note-neg">
                  <AlertTriangle size={12} style="flex-shrink:0;" />
                  <span style="flex:1;">{t('batch.possibleDupWarning')}</span>
                  <a href="/invoice/{review.duplicateOfId}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;flex-shrink:0;">
                    {t('batch.viewExisting')}
                  </a>
                </div>
              {:else if review.similarInvoiceId}
                <div class="rev-note rev-note-warn">
                  <AlertTriangle size={12} style="flex-shrink:0;" />
                  <span style="flex:1;">{t('batch.similarDupWarning')}</span>
                  <a href="/invoice/{review.similarInvoiceId}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;flex-shrink:0;">
                    {t('batch.viewExisting')}
                  </a>
                </div>
              {/if}
              {#if totalMismatch}
                <div class="rev-note rev-note-neg">
                  <AlertTriangle size={12} style="flex-shrink:0;" />
                  <span style="flex:1;">{t('batch.totalMismatchWarning')}</span>
                </div>
              {/if}
              {#if uncertainCount > 0}
                <button type="button" class="rev-note rev-note-warn" onclick={jumpToUncertain} title={`${t('review.jumpUncertain')} · F2`}>
                  <AlertTriangle size={12} style="flex-shrink:0;" />
                  <span style="flex:1;">{uncertainCount} {tp('batch.field', uncertainCount)} {t('extract.lowConfFields')}</span>
                </button>
              {/if}

              <div class="rev-grid">
                <div class="rev-field-wide">
                  <label class="rev-field-label" for="field-supplier-name">
                    {t('field.supplier')}
                    <ConfidenceDot confidence={fieldConf.supplier_name} />
                  </label>
                  <input id="field-supplier-name" type="text" name="supplier_name" bind:value={supplierNameInput}
                    class="rev-input" class:flagged={needsReview(supplierNameInput) || flagged('supplier_name')} />
                </div>
                <div>
                  <label class="rev-field-label" for="field-invoice-number">
                    {t('field.invoiceNum')}
                    <ConfidenceDot confidence={fieldConf.invoice_number} />
                  </label>
                  <input id="field-invoice-number" type="text" name="invoice_number" bind:value={invoiceNumberInput}
                    class="rev-input num" class:flagged={flagged('invoice_number')} />
                </div>
                <div>
                  <label class="rev-field-label" for="field-document-type">
                    {t('field.documentType')}
                    <ConfidenceDot confidence={fieldConf.document_type} />
                  </label>
                  <select id="field-document-type" name="document_type" bind:value={documentTypeInput} class="rev-input">
                    <option value="">{t('field.documentType.unknown')}</option>
                    <option value="factura">{t('field.documentType.factura')}</option>
                    <option value="albaran">{t('field.documentType.albaran')}</option>
                  </select>
                </div>
                <div>
                  <label class="rev-field-label" for="field-invoice-date">
                    {t('field.invoiceDate')}
                    <ConfidenceDot confidence={fieldConf.invoice_date} />
                  </label>
                  <input id="field-invoice-date" type="text" name="invoice_date" bind:value={invoiceDateInput} placeholder="YYYY-MM-DD"
                    class="rev-input num" class:flagged={flagged('invoice_date')} />
                </div>
                {#if fieldVisible.due_date}
                  {#if documentTypeInput !== 'albaran'}
                    <div>
                      <label class="rev-field-label" for="field-due-date">
                        {t('extract.due')}
                        <ConfidenceDot confidence={fieldConf.due_date} />
                      </label>
                      <input id="field-due-date" type="text" name="due_date" bind:value={dueDateInput} placeholder="YYYY-MM-DD"
                        oninput={() => { dueDateSuggested = false; }}
                        class="rev-input num" class:flagged={flagged('due_date')} />
                      {#if dueDateSuggested}
                        <div class="text-[11px] text-fg-3 mt-1">{t('field.dueDateSuggested')}</div>
                      {/if}
                    </div>
                  {:else}
                    <div>
                      <label class="rev-field-label" for="field-due-date">{t('extract.due')}</label>
                      <input id="field-due-date" type="text" class="rev-input text-fg-4" readonly
                        value={t('field.dueDate.notApplicable')} />
                      <input type="hidden" name="due_date" value="" />
                    </div>
                  {/if}
                {:else}
                  <input type="hidden" name="due_date" value={documentTypeInput !== 'albaran' ? dueDateInput : ''} />
                {/if}
                <div class="rev-field-wide">
                  <label class="rev-field-label" for="field-total-amount">
                    {t('tbl.total')}
                    <ConfidenceDot confidence={fieldConf.total_amount} />
                  </label>
                  <input id="field-total-amount" type="text" name="total_amount" bind:value={totalAmountInput}
                    aria-describedby={hasDiscrepancy ? 'err-total_amount' : undefined}
                    class="rev-input num" class:mismatch={hasDiscrepancy} class:flagged={!hasDiscrepancy && flagged('total_amount')} />
                  {#if hasDiscrepancy}
                    <div id="err-total_amount" class="text-[11px] text-warn mt-1 flex items-center gap-1">
                      <AlertTriangle size={10} /> {t('extract.mismatch')} ({fmt(totalCalc)})
                    </div>
                  {/if}
                </div>
                <div>
                  <label class="rev-field-label" for="field-payment-method">{t('field.paymentMethod')}</label>
                  <select id="field-payment-method" name="payment_method" bind:value={paymentMethodInput} class="rev-input">
                    <option value="">{t('field.paymentMethod.unknown')}</option>
                    {#each PAYMENT_METHODS as method}
                      <option value={method}>{t(`field.paymentMethod.${method}`)}</option>
                    {/each}
                  </select>
                </div>
                <div>
                  <label class="rev-field-label" for="field-payment-terms">{t('field.paymentTerms')}</label>
                  <input id="field-payment-terms" type="text" name="payment_terms" bind:value={paymentTermsInput}
                    maxlength={100} class="rev-input" />
                </div>
                <div>
                  <label class="rev-field-label" for="field-purchase-order">{t('field.purchaseOrder')}</label>
                  <input id="field-purchase-order" type="text" name="purchase_order" bind:value={purchaseOrderInput}
                    maxlength={100} class="rev-input" />
                </div>
                <div>
                  <label class="rev-field-label" for="field-seller-name">{t('field.sellerName')}</label>
                  <input id="field-seller-name" type="text" name="seller_name" bind:value={sellerNameInput}
                    maxlength={200} class="rev-input" />
                </div>
                <div>
                  <label class="rev-field-label" for="field-delivery-date">{t('field.deliveryDate')}</label>
                  <input id="field-delivery-date" type="text" name="delivery_date" bind:value={deliveryDateInput}
                    placeholder="YYYY-MM-DD" class="rev-input num" />
                </div>
                <div class="rev-field-wide">
                  <label class="rev-field-label" for="field-delivery-address">{t('field.deliveryAddress')}</label>
                  <input id="field-delivery-address" type="text" name="delivery_address" bind:value={deliveryAddressInput}
                    maxlength={300} class="rev-input" />
                </div>
                <div class="rev-grid-wide">
                  <label class="rev-field-label" for="field-printed-notes">{t('field.printedNotes')}</label>
                  <textarea id="field-printed-notes" name="printed_notes" maxlength={500} rows={2}
                    bind:value={printedNotesInput} class="rev-input"></textarea>
                </div>
                {#if str(review?.data?.iban)}
                  <div>
                    <label class="rev-field-label" for="field-iban">
                      {t('field.iban')}
                      <ConfidenceDot confidence={fieldConf.iban} />
                    </label>
                    <input id="field-iban" type="text" readonly value={str(review?.data?.iban)} class="rev-input text-fg-3" />
                  </div>
                {/if}
                {#if fieldVisible.notes}
                  <div class="rev-grid-wide">
                    <label class="rev-field-label" for="field-notes">{t('extract.notesInternal')} <span style="text-transform:none;letter-spacing:0;">{t('extract.optional')}</span></label>
                    <textarea id="field-notes" name="notes" maxlength={250} rows={2} bind:value={notesInput}
                      placeholder={t('extract.notesPh')} class="rev-input"></textarea>
                  </div>
                {:else}
                  <input type="hidden" name="notes" value={notesInput} />
                {/if}
              </div>
            </div>

            <div class="rev-sticky-head">
              <div class="body-strong">
                {t('extract.lineItems')} <span class="num text-fg-3 font-normal">· {lineItems.length}</span>
              </div>
              <button type="button" class="btn btn-ghost" style="height:26px;font-size:12px;padding:0 8px;gap:5px;" onclick={addRow}>
                <Plus size={12} /> {t('extract.addLine')}
              </button>
            </div>

            {#if lineItems.length === 0}
              <div class="rev-section text-[12.5px] text-fg-3">{t('review.noLines')}</div>
            {:else if isMobile}
              <div class="rev-cards">
                {#each lineItems as item, i}
                  {@const itemConf = typeof item.confidence === 'number' ? item.confidence : null}
                  {@const confLow = itemConf != null && itemConf < 0.85}
                  {@const isOpen = openLine === i}
                  {@const lineRate = percentToFraction(item.tax_rate)}
                  <div class="rev-card" class:flagged={confLow} class:open={isOpen} data-line={i}>
                    <button type="button" class="rev-card-head" onclick={() => toggleLine(i)} aria-expanded={isOpen}>
                      <span class="rev-card-main">
                        <span class="rev-card-name">{str(item.description) || t('extract.fieldEmpty')}</span>
                        <span class="num rev-card-meta">{str(item.quantity)} {str(item.unit)} × {str(item.unit_price)} €</span>
                      </span>
                      <span class="rev-card-side">
                        <span class="num rev-card-total">{str(item.total_price)} €</span>
                        <span class="rev-card-rate" class:none={lineRate === null}>
                          {lineRate === null ? t('review.noRate') : ratePctLabel(lineRate)}
                        </span>
                      </span>
                      {#if confLow}<span class="rev-card-dot"></span>{/if}
                    </button>

                    {#if isOpen}
                      <div class="rev-card-body">
                        <div>
                          <label class="rev-field-label" for="line-desc-{i}">{t('tbl.desc')} <ConfidenceDot confidence={itemConf} size={6} /></label>
                          <input id="line-desc-{i}" type="text" name="line_descriptions" bind:value={lineItems[i].description} class="rev-input" />
                        </div>
                        <div>
                          <label class="rev-field-label" for="line-product-{i}">
                            {t('review.productMatch')}
                            {#if productUnmatched(item.product_name)}
                              <span class="rev-product-chip warn">{t('review.productUnknown')}</span>
                            {:else if !str(item.product_name)}
                              <span class="rev-product-chip">{t('review.productNew')}</span>
                            {:else if item.product_status === 'fuzzy'}
                              <span class="rev-product-chip">{t('review.productFuzzy')}</span>
                            {/if}
                          </label>
                          <input id="line-product-{i}" type="text" list="mep-product-options"
                            bind:value={lineItems[i].product_name} class="rev-input"
                            placeholder={t('review.productPh')} title={t('review.productMatchHint')} />
                        </div>
                        <div class="rev-card-grid3">
                          <div>
                            <label class="rev-field-label" for="line-qty-{i}">{t('tbl.qty')}</label>
                            <input id="line-qty-{i}" type="text" name="line_quantities" bind:value={lineItems[i].quantity} class="rev-input num" style="text-align:right;" />
                          </div>
                          <div>
                            <label class="rev-field-label" for="line-unit-{i}">{t('tbl.unit')}</label>
                            <input id="line-unit-{i}" type="text" name="line_units" bind:value={lineItems[i].unit} class="rev-input" />
                          </div>
                          <div>
                            <label class="rev-field-label" for="line-rate-{i}">{t('review.lineRate')}</label>
                            <input id="line-rate-{i}" type="text" bind:value={lineItems[i].tax_rate} class="rev-input num" placeholder="%" style="text-align:right;" />
                          </div>
                        </div>
                        <div class="rev-card-grid2">
                          <div>
                            <label class="rev-field-label" for="line-unit-price-{i}">{t('tbl.unitPrice')}</label>
                            <input id="line-unit-price-{i}" type="text" name="line_unit_prices" bind:value={lineItems[i].unit_price} class="rev-input num" style="text-align:right;" />
                          </div>
                          <div>
                            <label class="rev-field-label" for="line-total-{i}">{t('tbl.total')}</label>
                            <input id="line-total-{i}" type="text" name="line_total_prices" bind:value={lineItems[i].total_price} class="rev-input num" style="text-align:right;font-weight:600;" />
                          </div>
                        </div>
                        <button type="button" class="rev-card-remove" onclick={() => removeRow(i)}>
                          <Trash size={14} /> {t('review.removeLine')}
                        </button>
                      </div>
                    {:else}
                      <input type="hidden" name="line_descriptions" value={str(item.description)} />
                      <input type="hidden" name="line_quantities" value={str(item.quantity)} />
                      <input type="hidden" name="line_units" value={str(item.unit)} />
                      <input type="hidden" name="line_unit_prices" value={str(item.unit_price)} />
                      <input type="hidden" name="line_total_prices" value={str(item.total_price)} />
                    {/if}
                    <input type="hidden" name="line_tax_rates" value={percentToFraction(item.tax_rate) ?? ''} />
                    <input type="hidden" name="line_supplier_skus" value={str(item.product_code ?? '')} />
                    <input type="hidden" name="line_product_ids" value={productIdFor(item.product_name) ?? ''} />
                  </div>
                {/each}
              </div>
            {:else}
              <table class="tbl rev-lines" style="table-layout:fixed;width:100%;">
                <thead>
                  <tr>
                    <th class="num" scope="col" style="width:38px;" title={t('review.lineNumber')}>#</th>
                    <th scope="col">{t('tbl.desc')}</th>
                    <th class="num" scope="col" style="width:74px;">{t('tbl.qty')}</th>
                    <th scope="col" style="width:80px;">{t('tbl.unit')}</th>
                    <th class="num" scope="col" style="width:96px;">{t('tbl.unitPrice')}</th>
                    <th class="num" scope="col" style="width:72px;" title={t('review.lineRateHint')}>{t('review.lineRate')}</th>
                    <th class="num" scope="col" style="width:100px;">{t('tbl.total')}</th>
                    <th scope="col" style="width:36px;"><span class="sr-only">{t('review.removeLine')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {#each lineItems as item, i}
                    {@const itemConf = typeof item.confidence === 'number' ? item.confidence : null}
                    {@const confLow = itemConf != null && itemConf < 0.85}
                    <tr data-line={i} class={confLow ? 'bg-warn-soft' : 'bg-transparent'}>
                      <td class="num text-fg-4 text-[11px]">{i + 1}</td>
                      <td>
                        <div style="display:flex;align-items:center;gap:5px;">
                          <input type="text" name="line_descriptions" bind:value={lineItems[i].description}
                            aria-label={ti('batch.aria.lineDesc', { row: i + 1 })}
                            class="rev-cell" style="font-weight:500;" />
                          <ConfidenceDot confidence={itemConf} size={6} />
                        </div>
                        <div class="rev-line-product">
                          <span class="rev-line-product-label">{t('review.productMatch')}</span>
                          <input type="text" list="mep-product-options" bind:value={lineItems[i].product_name}
                            aria-label={ti('batch.aria.lineProduct', { row: i + 1 })}
                            class="rev-cell rev-product-input" placeholder={t('review.productPh')}
                            title={t('review.productMatchHint')} />
                          {#if productUnmatched(item.product_name)}
                            <span class="rev-product-chip warn">{t('review.productUnknown')}</span>
                          {:else if !str(item.product_name)}
                            <span class="rev-product-chip">{t('review.productNew')}</span>
                          {:else if item.product_status === 'fuzzy'}
                            <span class="rev-product-chip">{t('review.productFuzzy')}</span>
                          {/if}
                        </div>
                      </td>
                      <td class="num">
                        <input type="text" name="line_quantities" bind:value={lineItems[i].quantity}
                          aria-label={ti('batch.aria.lineQty', { row: i + 1 })}
                          class="rev-cell num" style="text-align:right;" />
                      </td>
                      <td>
                        <input type="text" name="line_units" bind:value={lineItems[i].unit}
                          aria-label={ti('batch.aria.lineUnit', { row: i + 1 })}
                          class="rev-cell text-fg-2" />
                      </td>
                      <td class="num">
                        <input type="text" name="line_unit_prices" bind:value={lineItems[i].unit_price}
                          aria-label={ti('batch.aria.lineUnitPrice', { row: i + 1 })}
                          class="rev-cell num" style="text-align:right;" />
                      </td>
                      <td class="num">
                        <input type="text" bind:value={lineItems[i].tax_rate} class="rev-cell num rev-cell-rate"
                          placeholder="%" aria-label={ti('batch.aria.lineRate', { row: i + 1 })} style="text-align:right;" />
                      </td>
                      <td class="num">
                        <input type="text" name="line_total_prices" bind:value={lineItems[i].total_price}
                          aria-label={ti('batch.aria.lineTotal', { row: i + 1 })}
                          class="rev-cell num" style="text-align:right;font-weight:500;" />
                      </td>
                      <td>
                        <input type="hidden" name="line_tax_rates" value={percentToFraction(item.tax_rate) ?? ''} />
                        <input type="hidden" name="line_supplier_skus" value={str(item.product_code ?? '')} />
                        <input type="hidden" name="line_product_ids" value={productIdFor(item.product_name) ?? ''} />
                        <button type="button" class="rev-icon-btn" style="width:22px;height:22px;" title={t('review.removeLine')} aria-label={t('review.removeLine')} onclick={() => removeRow(i)}>
                          <Trash size={11} />
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}

            <datalist id="mep-product-options">
              {#each productOptions as option (option.id)}
                <option value={option.name}></option>
              {/each}
            </datalist>

          </div>

          {#if taxPanelOpen}
            <div class="rev-tax-panel">
              <div class="rev-totals-chain">
                <span>{t('extract.grossAmount')}
                  <input type="text" name="gross_amount" bind:value={grossAmountInput}
                    class="rev-totals-chain-input num" placeholder="—" aria-label={t('extract.grossAmount')} />
                </span>
                <span class="rev-totals-chain-sep">→</span>
                <span>{t('extract.discountAmount')}
                  <input type="text" name="discount_amount" bind:value={discountAmountInput}
                    class="rev-totals-chain-input num" placeholder="—" aria-label={t('extract.discountAmount')} />
                </span>
                <span class="rev-totals-chain-sep">→</span>
                <span>{t('extract.taxBase')} <span class="num text-fg-2">{fmt(taxBase)}</span></span>
                <span class="rev-totals-chain-sep">→</span>
                <span>{t('extract.vat')} <span class="num text-fg-2">{fmt(taxTotal)}</span></span>
                <span class="rev-totals-chain-sep">→</span>
                <span>{t('extract.retention')}
                  <input type="text" bind:value={retentionRateInput}
                    class="rev-totals-chain-input rev-totals-chain-input-rate num" placeholder="%" aria-label={t('extract.retention')} />
                  <input type="text" name="retention_amount" bind:value={retentionAmountInput}
                    class="rev-totals-chain-input num" placeholder="—" aria-label={t('extract.retention')} />
                </span>
                <input type="hidden" name="retention_rate" value={percentToFraction(retentionRateInput) ?? ''} />
                <span class="rev-totals-chain-sep">→</span>
                <span class="font-medium">{t('extract.calcTotal')} <span class="num text-fg">{fmt(totalCalc)}</span></span>
              </div>
              <div class="rev-tax-panel-head">
                <span class="body-strong">
                  {t('review.taxes')}
                  <span class="num text-fg-3 font-normal">· {tp('review.taxTypeCount', taxBands.length)}</span>
                </span>
                {#if !taxBaseMatchesLines && taxBands.length > 0}
                  <span class="rev-tax-stale" title={t('review.taxBaseStaleHint')}>
                    <AlertTriangle size={11} /> {t('review.taxBaseStale')}
                  </span>
                {/if}
                {#if unbandedRates.length > 0}
                  <span class="rev-tax-stale" title={t('review.taxRateUnbandedHint')}>
                    <AlertTriangle size={11} /> {unbandedRates.map(ratePctLabel).join(' · ')}
                  </span>
                {/if}
                <span style="flex:1;"></span>
                {#if linesCarryRates}
                  <button type="button" class="btn btn-ghost" style="height:24px;font-size:11.5px;padding:0 8px;gap:4px;"
                    onclick={rebuildBandsFromLines} title={t('review.taxRebuildHint')}>
                    <RefreshCw size={11} /> {t('review.taxRebuild')}
                  </button>
                {/if}
                <button type="button" class="btn btn-ghost" style="height:24px;font-size:11.5px;padding:0 8px;gap:4px;" onclick={addBand}>
                  <Plus size={11} /> {t('review.taxAddBand')}
                </button>
              </div>

              {#if taxBands.length === 0}
                <div class="text-xs text-fg-3 pt-1 pb-2.5">{t('review.taxNoBands')}</div>
              {:else}
                <table class="tbl rev-tax-tbl">
                  <thead>
                    <tr>
                      <th class="num" scope="col" style="width:92px;">{t('review.taxRate')}</th>
                      <th scope="col" style="width:96px;">{t('review.taxKind')}</th>
                      <th class="num" scope="col">{t('review.taxBandBase')}</th>
                      <th class="num" scope="col" style="width:120px;">{t('review.taxAmount')}</th>
                      <th scope="col" style="width:32px;"><span class="sr-only">{t('review.taxRemoveBand')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each taxBands as band, i}
                      <tr>
                        <td>
                          <input type="text" bind:value={taxBands[i].rate} oninput={() => syncBandAmount(i)}
                            class="rev-cell num" placeholder="%" aria-label={t('review.taxRate')} style="text-align:right;" />
                        </td>
                        <td>
                          <select bind:value={taxBands[i].type} class="rev-cell" aria-label={t('review.taxKind')}>
                            <option value="">{t('review.taxKindNone')}</option>
                            <option value="iva">{t('review.taxIva')}</option>
                            <option value="rec">{t('review.taxRec')}</option>
                          </select>
                        </td>
                        <td class="num">
                          <input type="text" bind:value={taxBands[i].base} oninput={() => syncBandAmount(i)}
                            class="rev-cell num" aria-label={t('review.taxBandBase')} style="text-align:right;" />
                        </td>
                        <td class="num">
                          <input type="text" bind:value={taxBands[i].amount}
                            class="rev-cell num" aria-label={t('review.taxAmount')} style="text-align:right;font-weight:500;" />
                        </td>
                        <td>
                          <button type="button" class="rev-icon-btn" style="width:22px;height:22px;"
                            title={t('review.taxRemoveBand')} aria-label={t('review.taxRemoveBand')} onclick={() => removeBand(i)}>
                            <Trash size={11} />
                          </button>
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colspan="2" class="text-fg-3">{t('tbl.total')}</td>
                      <td class="num text-fg-3">{fmt(taxBase)}</td>
                      <td class="num" style="font-weight:600;">{fmt(taxTotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              {/if}
            </div>
          {/if}

          <div class="rev-bar rev-bar-foot">
            {#if hasDiscrepancy}
              <div class="rev-foot-status text-warn font-medium">
                <AlertTriangle size={12} /> {t('extract.discrepancy')} · {fmt(discrepancy)}
              </div>
            {:else if lineItems.length > 0}
              <div class="rev-foot-status text-pos font-medium">
                <Check size={12} /> {t('extract.totalsMatch')}
              </div>
            {:else}
              <div class="rev-foot-status text-fg-3">{t('extract.noLinesVerify')}</div>
            {/if}

            <div class="rev-shortcuts" title={t('review.shortcuts')}>
              <span><kbd class="rev-kbd">⌘↵</kbd> {t('review.shortcutSave')}</span>
              <span><kbd class="rev-kbd">⌘\</kbd> {t('review.shortcutPreview')}</span>
              <span><kbd class="rev-kbd">⌘B</kbd> {t('review.shortcutQueue')}</span>
              <span><kbd class="rev-kbd">F2</kbd> {t('review.shortcutJump')}</span>
            </div>

            <div class="rev-foot-totals">
              <span class="text-[11.5px] text-fg-3">{t('extract.taxBase')} <span class="num text-fg-2">{fmt(lineTotal)}</span></span>
              <button type="button" class="rev-tax-toggle" onclick={() => taxPanelOpen = !taxPanelOpen}
                aria-expanded={taxPanelOpen}
                title={taxPanelOpen ? t('review.hideTaxes') : t('review.showTaxes')}>
                {t('extract.vat')} <span class="num">{fmt(taxTotal)}</span>
                {#if documentTypeInput === 'albaran' && taxBands.length === 0}
                  <span class="normal-case tracking-normal text-fg-3">{t('extract.optional')}</span>
                {/if}
                {#if showBandKinds}
                  {#each bandKinds as kind}
                    <span class="badge {kind === 'rec' ? 'badge-pending' : 'badge-exported'}"
                      title={kind === 'rec' ? t('review.taxRecFull') : t('review.taxIva')}>
                      {kind === 'rec' ? t('review.taxRec') : t('review.taxIva')}
                    </span>
                  {/each}
                {/if}
                {#if taxBands.length > 1}<span class="badge badge-neutral">{taxBands.length}</span>{/if}
                {#if taxNeedsAttention}<AlertTriangle size={10} />{/if}
                <span class="rev-tax-caret" class:open={taxPanelOpen}><ChevronsRight size={11} /></span>
              </button>
              {#if extractedDrift}
                <span class="rev-foot-drift" title={t('review.extractedDriftHint')}>
                  {t('review.extractedWas')} <span class="num">{fmt(originalTotalNum)}</span>
                  <span class="num" style="font-weight:600;">{driftLabel}</span>
                </span>
              {/if}
              <span class="text-xs text-fg-2">{t('extract.calcTotal')}</span>
              <span class="num text-[15px] font-semibold text-fg">{fmt(totalCalc)}</span>
            </div>
          </div>

        </div>
      </form>
      {/key}

    {:else if data.failedItem}
      <div class="rev-col rev-col-fill" style="display:flex;flex-direction:column;gap:12px;max-width:560px;overflow:visible;">
        <div class="card p-4 bg-neg-soft border-neg">
          <strong class="body-strong text-neg block mb-1.5">{t('extract.error')} · {data.failedItem.name}</strong>
          <p class="text-[13px] text-neg">{data.failedItem.errorVars ? ti(data.failedItem.error, data.failedItem.errorVars) : t(data.failedItem.error)}</p>
        </div>
        <div style="display:flex;gap:8px;">
          <form method="POST" action="?/retry">
            <input type="hidden" name="itemId" value={data.failedItem.itemId} />
            <button type="submit" class="btn btn-primary" style="height:34px;font-size:13px;gap:6px;">
              <RefreshCw size={13} /> {t('extract.retry')}
            </button>
          </form>
          <form method="POST" action="?/discardItem">
            <input type="hidden" name="itemId" value={data.failedItem.itemId} />
            <button type="submit" class="btn btn-ghost" style="height:34px;font-size:13px;">{t('extract.discard')}</button>
          </form>
        </div>
      </div>

    {:else if data.stalled}
      <div class="rev-col rev-col-fill" style="display:flex;flex-direction:column;gap:12px;max-width:560px;overflow:visible;">
        <div class="card p-4 bg-warn-soft border-warn">
          <strong class="body-strong text-warn flex items-center gap-1.5 mb-1.5">
            <AlertTriangle size={14} /> {t('batch.stalledTitle')}
          </strong>
          <p class="text-[13px] text-fg-2 leading-normal">
            {ti('batch.stalledBody', { name: data.stalled.name })}
          </p>
        </div>
        <div style="display:flex;gap:8px;">
          <form method="POST" action="?/retry">
            <input type="hidden" name="itemId" value={data.stalled.itemId} />
            <button type="submit" class="btn btn-primary" style="height:34px;font-size:13px;gap:6px;">
              <RefreshCw size={13} /> {t('extract.retry')}
            </button>
          </form>
          <form method="POST" action="?/discardItem">
            <input type="hidden" name="itemId" value={data.stalled.itemId} />
            <button type="submit" class="btn btn-ghost" style="height:34px;font-size:13px;">{t('extract.discard')}</button>
          </form>
        </div>
      </div>

    {:else if data.anyInFlight}
      <div class="card rev-col rev-col-fill" style="align-items:center;justify-content:center;gap:18px;padding:40px 32px;text-align:center;">
        <div class="w-11 h-11 border-[3px] border-acc border-t-transparent rounded-full" style="animation:mepspin 0.9s linear infinite;"></div>
        <div>
          <div class="text-[15px] font-semibold text-fg mb-1.5">
            {ti('batch.extracting', { name: extractingItem?.name ?? t('misc.invoice') })}
          </div>
          <div class="text-[13px] text-fg-3 leading-normal">
            {ti('batch.progress', { done: doneCount, total: data.queue.length })}
          </div>
        </div>
      </div>

    {:else}
      <div class="card rev-col rev-col-fill" style="align-items:center;justify-content:center;gap:16px;padding:40px 32px;text-align:center;">
        <div class="w-12 h-12 rounded-3xl bg-acc-soft text-acc flex items-center justify-center">
          <Sparkle size={20} />
        </div>
        <div>
          <div class="text-[15px] font-semibold text-fg mb-1">
            {tp('batch.readyToExtract', data.openCount)}
          </div>
          <div class="text-[13px] text-fg-3">{t('batch.processParallel')}</div>
        </div>
        <form method="POST" action="?/extract">
          <button type="submit" class="btn btn-primary" style="height:40px;justify-content:center;font-weight:500;gap:6px;padding:0 20px;">
            <Sparkle size={14} />
            {tp('confirm.extract', data.openCount)}
          </button>
        </form>
      </div>
    {/if}
  </div>

  {#if review}
    <div class="rev-mobile-only rev-actionbar">
      <button type="button" class="rev-actionbar-icon" onclick={openDocViewer} aria-label={t('review.document')} title={t('review.document')}>
        <FileText size={20} />
      </button>
      <button type="submit" form="discard-item-form" class="rev-actionbar-icon danger" aria-label={t('extract.discard')} title={t('extract.discard')}>
        <Trash size={19} />
      </button>
      <button type="submit" form="save-form" class="rev-actionbar-save">
        <Check size={18} /> {t('extract.confirmSave')}
      </button>
    </div>
  {/if}
</div>

{#if previewFull && review}
  <div class="rev-lightbox" role="presentation" onclick={closeDocViewer}>
    <div class="rev-lightbox-bar">
      <span class="rev-lightbox-title">{review.filename}</span>
      {#if isMobile}
        <a href={previewSrc} target="_blank" rel="noopener" class="rev-icon-btn" style="width:44px;height:44px;"
          title={t('review.openInTab')} aria-label={t('review.openInTab')}>
          <ExternalLink size={17} />
        </a>
      {/if}
      <button type="button" class="btn btn-secondary" style="font-size:12.5px;gap:6px;" onclick={closeDocViewer}>
        <X size={13} /> {t('review.closeFullscreen')}
      </button>
    </div>
    <div class="rev-lightbox-frame" role="presentation" onclick={(e) => e.stopPropagation()}>
      {#if isMobile && previewIsImage}
        <img src={previewSrc} alt={t('a11y.documentPreview')} class="rev-lightbox-img" />
      {:else}
        <iframe src={isMobile ? previewFitSrc : previewSrc} title={t('a11y.documentPreview')} style="width:100%;height:100%;border:none;display:block;"></iframe>
      {/if}
    </div>
    {#if isMobile}
      <div class="rev-returnbar" role="presentation" onclick={(e) => e.stopPropagation()}>
        {#if returnTarget}
          <div class="rev-returnbar-label">{t('review.returnTo')}</div>
          <button type="button" class="rev-returnbar-btn" onclick={closeDocViewer}>
            <ArrowLeft size={18} />
            <span class="rev-returnbar-field">
              <span class="rev-returnbar-name">{t(returnTarget.labelKey)}</span>
              <span class="num rev-returnbar-value">{returnTarget.value || t('extract.fieldEmpty')}</span>
            </span>
            <span class="rev-returnbar-go">{t('review.resume')}</span>
          </button>
        {:else}
          <button type="button" class="rev-returnbar-btn plain" onclick={closeDocViewer}>
            <ArrowLeft size={18} /> {t('review.backToForm')}
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

{#if showContentDuplicateModal}
  <div
    style="position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:24px;"
    role="presentation"
    onclick={closeContentDuplicateModal}
  >
    <div
      class="bg-bg border border-border-strong rounded-[14px] px-6 py-7 max-w-[400px] w-full shadow-[0_12px_40px_rgba(0,0,0,0.2)]"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="dup-modal-title"
      use:focusModalPanel
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => { if (e.key === 'Escape') closeContentDuplicateModal(); else e.stopPropagation(); }}
    >
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <AlertTriangle size={18} class="text-neg shrink-0" />
        <strong id="dup-modal-title" class="text-[15px] font-semibold text-fg">{t('batch.dupTitle')}</strong>
      </div>
      <p class="text-[13px] text-fg-2 leading-[1.6] mb-5">
        {t('batch.dupBody')}
      </p>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
        <button type="button" class="btn btn-secondary" style="height:36px;font-size:13px;"
          onclick={closeContentDuplicateModal}>
          {t('batch.backToReview')}
        </button>
        <button type="submit" form="discard-item-form" class="btn btn-primary" style="height:36px;font-size:13px;"
          onclick={closeContentDuplicateModal}>
          {t('extract.discard')}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showLowConfModal}
  <div
    style="position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:24px;"
    role="presentation"
    onclick={closeLowConfModal}
  >
    <div
      class="bg-bg border border-border-strong rounded-[14px] px-6 py-7 max-w-[400px] w-full shadow-[0_12px_40px_rgba(0,0,0,0.2)]"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="lowconf-modal-title"
      use:focusModalPanel
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => { if (e.key === 'Escape') closeLowConfModal(); else e.stopPropagation(); }}
    >
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <AlertTriangle size={18} class="text-warn shrink-0" />
        <strong id="lowconf-modal-title" class="text-[15px] font-semibold text-fg">{t('batch.lowConfTitle')}</strong>
      </div>
      <p class="text-[13px] text-fg-2 leading-[1.6] mb-4">
        {t('batch.lowConfPre')} <strong>{uncertainCount}</strong> {tp('batch.field', uncertainCount)} {t('batch.lowConfPost')}
      </p>
      {#if uncertainHeaderFields.length > 0}
        <ul class="text-[12.5px] text-fg-3 mb-4 pl-4">
          {#each uncertainHeaderFields as f}
            <li>{uncertainFieldLabel(f)}</li>
          {/each}
        </ul>
      {/if}
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px;">
        <button
          type="button"
          class="btn btn-secondary"
          style="height:36px;font-size:13px;"
          onclick={closeLowConfModal}
        >
          {t('batch.backToReview')}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          style="height:36px;font-size:13px;"
          onclick={async () => {
            lowConfAck = true;
            closeLowConfModal();
            await tick();
            (document.getElementById('save-form') as HTMLFormElement)?.requestSubmit();
          }}
        >
          {t('batch.reviewedAll')}
        </button>
      </div>
    </div>
  </div>
{/if}
