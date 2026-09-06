<script lang="ts">
  import StatusBadge from '$lib/components/mep/StatusBadge.svelte';
  import IncidenceKindBadge from '$lib/components/mep/IncidenceKindBadge.svelte';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
  import FileText from '@lucide/svelte/icons/file-text';
  import Edit from '@lucide/svelte/icons/edit';
  import Download from '@lucide/svelte/icons/download';
  import Truck from '@lucide/svelte/icons/truck';
  import { enhance } from '$app/forms';
  import { locale, t, ti } from '$lib/i18n';
  import { fmtEur } from '$lib/formatters';
  import { uploadExtname } from '$lib/upload-formats';

  interface LineItem {
    id: number;
    description: string | null;
    quantity: number | null;
    unit: string | null;
    unit_price: number | null;
    total_price: number | null;
  }

  interface LinkedInvoice {
    id: number;
    invoice_number: string | null;
    document_type: string | null;
  }

  interface Claim {
    eligible: boolean;
    to: string | null;
    sentAt: string | null;
    subject: string;
    body: string;
  }

  interface Invoice {
    id: number;
    invoice_number: string | null;
    document_type?: string | null;
    supplier_name: string | null;
    supplier_id: number | null;
    total_amount: number | null;
    display_amount?: number | null;
    review_state: string | null;
    incidence_kind: string | null;
    incidence_reasons: string[] | null;
    invoice_date: Date | string | null;
    due_date: Date | string | null;
    source_file: string | null;
    payment_method?: string | null;
    payment_terms?: string | null;
    iban?: string | null;
    gross_amount?: number | null;
    discount_amount?: number | null;
    retention_rate?: number | null;
    retention_amount?: number | null;
    linked_invoice?: LinkedInvoice | null;
    purchase_order?: string | null;
    seller_name?: string | null;
    delivery_date?: Date | string | null;
    delivery_address?: string | null;
    printed_notes?: string | null;
  }

  let {
    invoice,
    lineItems,
    unlinkedLineCount = 0,
    claim,
    form,
  }: {
    invoice: Invoice;
    lineItems: LineItem[];
    unlinkedLineCount?: number;
    claim: Claim;
    form: { claim?: string } | null;
  } = $props();

  let claimOpen = $state(false);

  function fmt(n: number | null | undefined) {
    if (n == null) return '—';
    return fmtEur(n, locale.current);
  }
  function fmtDate(s: Date | string | null | undefined) {
    if (!s) return '—';
    const d = new Date(s as string);
    return isNaN(d.getTime()) ? String(s) : d.toLocaleDateString(locale.current, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const shown = $derived(lineItems.slice(0, 5));
  const remaining = $derived(Math.max(0, lineItems.length - 5));

  const sourceExt = $derived(invoice.source_file ? uploadExtname(invoice.source_file) : '');
  const invoiceNumberDisplay = $derived(invoice.invoice_number ?? `#${invoice.id}`);
  const documentDisplayName = $derived(
    invoice.source_file ? `${invoiceNumberDisplay}${sourceExt}` : ''
  );
</script>

<div class="flex flex-col overflow-hidden bg-bg" style="height: 100%;">

  <div class="px-[14px] pt-4 pb-2.5 shrink-0 bg-surface border-b border-divider flex items-center gap-2">
    <a href="/invoices" class="w-11 h-11 rounded-full border-0 bg-transparent text-fg cursor-pointer flex items-center justify-center no-underline shrink-0" aria-label={t('mid.back')}>
      <ChevronLeft size={18} />
    </a>
    <div style="flex: 1; min-width: 0;">
      <div style="display: flex; align-items: center; gap: 6px;">
        <div class="num text-[14.5px] font-semibold text-fg overflow-hidden text-ellipsis whitespace-nowrap">
          {invoice.invoice_number ?? `#${invoice.id}`}
        </div>
        {#if invoice.document_type === 'factura' || invoice.document_type === 'albaran'}
          <span class="shrink-0 text-[11px] font-medium py-px px-1.5 rounded-[10px] bg-surface-2 text-fg-3">
            {t(`field.documentType.${invoice.document_type}`)}
          </span>
        {/if}
      </div>
      <div class="text-[11px] text-fg-3 overflow-hidden text-ellipsis whitespace-nowrap">
        {invoice.supplier_name ?? '—'}
      </div>
    </div>
    <button class="w-11 h-11 rounded-full border-0 bg-transparent text-fg cursor-pointer flex items-center justify-center" aria-label={t('mid.moreOptions')}>
      <MoreHorizontal size={18} />
    </button>
  </div>

  <div style="flex: 1; overflow: auto; padding: 14px 14px 100px; display: flex; flex-direction: column; gap: 12px;">

    <div class="card" style="padding: 16px;">
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
        <div>
          <div class="label" style="margin-bottom: 6px;">{t('mid.totalVat')}</div>
          <div class="num text-[30px] font-semibold text-fg tracking-[-0.6px] leading-none">
            {fmt(invoice.display_amount ?? invoice.total_amount)}
          </div>
        </div>
        <div class="flex flex-col items-end gap-1">
          <StatusBadge status={invoice.review_state ?? 'revisado'} />
          <IncidenceKindBadge kind={invoice.incidence_kind} reasons={invoice.incidence_reasons} hint />
        </div>
      </div>
      <div class="mt-3 pt-3 border-t border-divider flex justify-between text-[12px]">
        <div>
          <div class="text-fg-3">{t('mid.issued')}</div>
          <div class="num text-fg font-medium mt-0.5">{fmtDate(invoice.invoice_date)}</div>
        </div>
        <div>
          <div class="text-fg-3">{t('tbl.due')}</div>
          <div class="num text-fg font-medium mt-0.5">{fmtDate(invoice.due_date)}</div>
        </div>
        <div>
          <div class="text-fg-3">{t('tbl.lines')}</div>
          <div class="num text-fg font-medium mt-0.5">{lineItems.length}</div>
        </div>
      </div>
      {#if invoice.payment_method || invoice.payment_terms || invoice.iban}
        <div class="border-t border-divider text-fg-2" style="margin-top: 12px; padding-top: 12px; font-size: 11px;">
          {#if invoice.payment_method}{t(`field.paymentMethod.${invoice.payment_method}`)}{/if}
          {#if invoice.payment_terms} · {invoice.payment_terms}{/if}
          {#if invoice.iban} · {invoice.iban}{/if}
        </div>
      {/if}

      {#if invoice.purchase_order || invoice.seller_name || invoice.delivery_date || invoice.delivery_address}
        <div class="border-t border-divider text-fg-2" style="margin-top: 12px; padding-top: 12px; font-size: 11px;">
          {#if invoice.purchase_order}{t('field.purchaseOrder')}: {invoice.purchase_order}{/if}
          {#if invoice.seller_name} · {t('field.sellerName')}: {invoice.seller_name}{/if}
          {#if invoice.delivery_date} · {t('field.deliveryDate')}: {fmtDate(invoice.delivery_date)}{/if}
          {#if invoice.delivery_address} · {invoice.delivery_address}{/if}
        </div>
      {/if}

      {#if invoice.printed_notes}
        <div class="border-t border-divider text-fg-2" style="margin-top: 12px; padding-top: 12px; font-size: 11px;">
          {invoice.printed_notes}
        </div>
      {/if}

      {#if invoice.gross_amount != null || invoice.discount_amount != null || invoice.retention_amount != null}
        <div class="border-t border-divider flex flex-wrap items-baseline gap-1.5 text-[11px] text-fg-3" style="margin-top: 12px; padding-top: 12px;">
          {#if invoice.gross_amount != null}
            <span>{t('extract.grossAmount')} <span class="num text-fg-2">{fmt(invoice.gross_amount)}</span></span>
            <span class="opacity-60">→</span>
          {/if}
          {#if invoice.discount_amount != null}
            <span>{t('extract.discountAmount')} <span class="num text-fg-2">−{fmt(invoice.discount_amount)}</span></span>
            <span class="opacity-60">→</span>
          {/if}
          {#if invoice.retention_amount != null}
            <span>
              {t('extract.retention')}{invoice.retention_rate != null ? ` (${(invoice.retention_rate * 100).toLocaleString(locale.current)}%)` : ''}
              <span class="num text-fg-2">−{fmt(invoice.retention_amount)}</span>
            </span>
            <span class="opacity-60">→</span>
          {/if}
          <span class="body-strong text-fg">{t('field.totalAmount')} <span class="num">{fmt(invoice.total_amount)}</span></span>
        </div>
      {/if}
    </div>

    {#if invoice.source_file}
      <div class="card" style="padding: 0; overflow: hidden;">
        <div class="px-[14px] py-2.5 flex items-center gap-2">
          <FileText size={13} class="text-fg-2 shrink-0" />
          <div class="flex-1 text-[12px] text-fg-2 overflow-hidden text-ellipsis whitespace-nowrap">
            {documentDisplayName}
          </div>
          <a href="/invoice/{invoice.id}/file" target="_blank"
            class="text-[12px] text-acc font-medium no-underline shrink-0">
            {t('mid.open')}
          </a>
        </div>
      </div>
    {/if}

    {#if invoice.linked_invoice}
      <a href="/invoice/{invoice.linked_invoice.id}" class="card" style="padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 8px; text-decoration: none;">
        <div>
          <div class="label" style="margin-bottom: 2px;">{t('inv.detail.linkedDocument')}</div>
          <div class="body-strong">
            {invoice.linked_invoice.document_type ? t(`field.documentType.${invoice.linked_invoice.document_type}`) : ''}
            {invoice.linked_invoice.invoice_number ?? `#${invoice.linked_invoice.id}`}
          </div>
        </div>
        <span class="body text-acc font-medium">{t('inv.detail.viewLinked')}</span>
      </a>
    {/if}

    {#if claim.sentAt}
      <div class="card p-3">
        <span class="body-strong">{ti('inv.claim.sentLine', { date: fmtDate(claim.sentAt) })}</span>
      </div>
    {:else if claim.eligible}
      <div class="card p-3 flex flex-col gap-3">
        {#if !claimOpen}
          <button
            type="button"
            class="btn btn-primary min-h-11"
            onclick={() => claimOpen = true}
          >
            {t('inv.claim.button')}
          </button>
        {:else}
          <form method="post" action="/invoice/{invoice.id}?/requestCorrection" use:enhance class="flex flex-col gap-3">
            {#if form?.claim}
              <span class="body text-neg">{t(`inv.claim.error.${form.claim}`)}</span>
            {/if}
            <div class="flex flex-col gap-1">
              <span class="label">{t('inv.claim.form.to')}</span>
              <span class="body-strong">{claim.to}</span>
            </div>
            <div class="flex flex-col gap-1">
              <label class="label" for="mid-claim-subject">{t('inv.claim.form.subject')}</label>
              <input id="mid-claim-subject" name="subject" class="input min-h-11" value={claim.subject} maxlength={200} required />
            </div>
            <div class="flex flex-col gap-1">
              <label class="label" for="mid-claim-body">{t('inv.claim.form.body')}</label>
              <textarea id="mid-claim-body" name="body" class="input min-h-32 resize-y" maxlength={4000} required>{claim.body}</textarea>
            </div>
            <span class="body text-fg-3">{t('inv.claim.form.hint')}</span>
            <div class="flex gap-2">
              <button type="submit" class="btn btn-primary min-h-11 flex-1">{t('inv.claim.form.submit')}</button>
              <button type="button" class="btn btn-ghost min-h-11" onclick={() => claimOpen = false}>{t('edit.cancel')}</button>
            </div>
          </form>
        {/if}
      </div>
    {/if}

    {#if unlinkedLineCount > 0}
      <div class="card" style="padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;">
        <span class="body text-warn">
          {ti('inv.detail.unlinkedLines', { n: unlinkedLineCount })}
        </span>
        <form method="post" action="/invoice/{invoice.id}?/relinkProducts">
          <button type="submit" class="btn btn-secondary" style="width: 100%;">
            {t('inv.detail.relink')}
          </button>
        </form>
      </div>
    {/if}

    {#if lineItems.length > 0}
      <div class="card" style="padding: 4px 0;">
        {#each shown as item, i}
          <div class="px-[14px] py-[11px] flex items-center gap-3"
            style="{i < shown.length - 1 || remaining > 0 ? 'border-bottom:1px solid var(--mep-divider);' : ''}"
          >
            <div style="flex: 1; min-width: 0;">
              <div class="text-[13px] font-medium text-fg overflow-hidden text-ellipsis whitespace-nowrap">
                {item.description ?? '—'}
              </div>
              {#if item.quantity != null && item.unit_price != null}
                <div class="num text-[11px] text-fg-3 mt-0.5">
                  {item.quantity.toFixed(2).replace('.', ',')} {item.unit ?? ''} × {item.unit_price.toFixed(2).replace('.', ',')} €
                </div>
              {/if}
            </div>
            <div class="num text-[13px] font-medium text-fg shrink-0">
              {fmt(item.total_price)}
            </div>
          </div>
        {/each}
        {#if remaining > 0}
          <a href="/invoice/{invoice.id}" class="block px-[14px] py-2.5 text-center text-[12px] text-acc font-medium border-t border-divider no-underline">
            {ti('mid.viewLines', { n: lineItems.length })}
          </a>
        {/if}
      </div>
    {/if}

    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
      {#each [
        { icon: Edit, label: t('mid.actionEdit'), href: `/invoice/${invoice.id}/edit` },
        { icon: Download, label: t('mid.actionDownload'), href: invoice.source_file ? `/invoice/${invoice.id}/file` : '#' },
        { icon: Truck, label: t('mid.actionSupplier'), href: invoice.supplier_id ? `/suppliers/${invoice.supplier_id}` : '/suppliers' },
      ] as action}
        <a
          href={action.href}
          class="card px-2 py-[14px] border border-border flex flex-col items-center gap-1.5 bg-surface cursor-pointer no-underline"
        >
          <action.icon size={18} class="text-fg-2" />
          <span class="text-[11.5px] text-fg-2 font-medium">{action.label}</span>
        </a>
      {/each}
    </div>

  </div>
</div>
