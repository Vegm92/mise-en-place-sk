<script lang="ts">
  import type { PageData } from './$types';
  import { locale, t, ti } from '$lib/i18n';
  import { fmtEur } from '$lib/formatters';
  import { uploadExtname } from '$lib/upload-formats';
  import MobileInvoiceDetail from '$lib/components/mobile/MobileInvoiceDetail.svelte';
  import StatusBadge from '$lib/components/mep/StatusBadge.svelte';
  import IncidenceKindBadge from '$lib/components/mep/IncidenceKindBadge.svelte';

  const PREVIEWABLE_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);

  let { data }: { data: PageData } = $props();
  const { invoice, lineItems, unlinkedLineCount } = $derived(data);

  let confirmDelete = $state(false);

  const sourceExt = $derived(invoice.source_file ? uploadExtname(invoice.source_file) : '');
  const isPreviewable = $derived(PREVIEWABLE_EXTENSIONS.has(sourceExt));
  const invoiceNumberDisplay = $derived(invoice.invoice_number ?? `#${invoice.id}`);
  const documentDisplayName = $derived(
    invoice.source_file ? `${invoiceNumberDisplay}${sourceExt}` : ''
  );

  function fmt(n: number | null | undefined) {
    if (n == null) return '—';
    return fmtEur(n, $locale);
  }
  function fmtDate(s: Date | string | null | undefined) {
    if (!s) return '—';
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleDateString($locale, { day: '2-digit', month: 'short', year: 'numeric' });
  }

  const timelineEvents = $derived([
    { labelKey: 'inv.detail.uploaded',  ts: invoice.created_at },
    { labelKey: 'inv.detail.extracted', ts: invoice.created_at },
    ...(invoice.review_state === 'revisado'
      ? [{ labelKey: 'inv.detail.confirmed', ts: null }]
      : []),
  ]);
</script>

<div class="md:hidden" style="height:100%;overflow:hidden;">
  <MobileInvoiceDetail {invoice} {lineItems} {unlinkedLineCount} />
</div>

<div class="hidden md:block">
<div style="padding:24px;display:flex;flex-direction:column;gap:16px;max-width:1100px;margin:0 auto;">

  <nav style="display:flex;align-items:center;gap:6px;">
    <a href="/invoices" class="body" style="color:var(--mep-fg-3);text-decoration:none;">
      {$t('nav.invoices')}
    </a>
    <span class="body" style="color:var(--mep-fg-4);">/</span>
    <span class="body-strong">{invoice.invoice_number ?? `#${invoice.id}`}</span>
  </nav>

  <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;">

    <div class="card" style="flex:0 0 44%;min-width:280px;overflow:hidden;">
      <div class="card-header">
        <div class="section-title">
          <span class="body-strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px;">
            {documentDisplayName || (invoice.invoice_number ?? `#${invoice.id}`)}
          </span>
        </div>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-ghost" style="width:28px;height:28px;padding:0;justify-content:center;font-size:15px;" title={$t('a11y.zoomOut')}>−</button>
          <span class="body" style="align-self:center;padding:0 4px;font-size:12px;">100%</span>
          <button class="btn btn-ghost" style="width:28px;height:28px;padding:0;justify-content:center;font-size:15px;" title={$t('a11y.zoomIn')}>+</button>
        </div>
      </div>

      {#if invoice.source_file && isPreviewable}
        <iframe
          src="/invoice/{invoice.id}/file"
          title={documentDisplayName}
          style="width:100%;min-height:320px;border:0;background:var(--mep-surface-2);"
        ></iframe>
      {:else}
        <div style="
          min-height:320px;
          background-color:var(--mep-surface-2);
          display:flex;align-items:center;justify-content:center;
          padding:32px;
        ">
          <span class="body" style="color:var(--mep-fg-4);">
            {invoice.source_file ? $t('inv.detail.noPreview') : $t('inv.detail.noFile')}
          </span>
        </div>
      {/if}
    </div>

    <div style="flex:1;min-width:280px;display:flex;flex-direction:column;gap:12px;">

      <div class="card p-4" style="display:flex;flex-direction:column;gap:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <span class="title" style="font-size:18px;">{invoice.invoice_number ?? `Invoice #${invoice.id}`}</span>
          <div class="flex flex-col items-end gap-1">
            <StatusBadge status={invoice.review_state ?? 'revisado'} />
            <IncidenceKindBadge kind={invoice.incidence_kind} hint />
          </div>
        </div>

        <div class="divider"></div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;">
          <div style="display:flex;flex-direction:column;gap:2px;">
            <span class="label">{$t('field.supplier')}</span>
            <span class="body-strong">{invoice.supplier_name ?? '—'}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:2px;">
            <span class="label">{$t('field.invoiceNum')}</span>
            <span class="body-strong">{invoice.invoice_number ?? '—'}</span>
          </div>
          {#if invoice.document_type}
            <div style="display:flex;flex-direction:column;gap:2px;">
              <span class="label">{$t('field.documentType')}</span>
              <span class="body-strong">{$t(`field.documentType.${invoice.document_type}`)}</span>
            </div>
          {/if}
          <div style="display:flex;flex-direction:column;gap:2px;">
            <span class="label">{$t('field.invoiceDate')}</span>
            <span class="body-strong">{fmtDate(invoice.invoice_date)}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:2px;">
            <span class="label">{$t('field.dueDate')}</span>
            <span class="body-strong">{fmtDate(invoice.due_date)}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:2px;">
            <span class="label">{$t('field.totalAmount')}</span>
            <span class="num body-strong" style="font-size:17px;">{fmt(invoice.total_amount)}</span>
          </div>
        </div>

        {#if invoice.notes}
          <div style="display:flex;flex-direction:column;gap:2px;">
            <span class="label">{$t('inv.detail.notes')}</span>
            <span class="body" style="line-height:1.5;">{invoice.notes}</span>
          </div>
        {/if}

        {#if invoice.linked_invoice}
          <div class="divider"></div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <div style="display:flex;flex-direction:column;gap:2px;">
              <span class="label">{$t('inv.detail.linkedDocument')}</span>
              <span class="body-strong">
                {invoice.linked_invoice.document_type ? $t(`field.documentType.${invoice.linked_invoice.document_type}`) : ''}
                {invoice.linked_invoice.invoice_number ?? `#${invoice.linked_invoice.id}`}
              </span>
            </div>
            <a href="/invoice/{invoice.linked_invoice.id}" class="btn btn-ghost" style="height:30px;font-size:13px;">
              {$t('inv.detail.viewLinked')}
            </a>
          </div>
        {/if}
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <a
          href="/invoice/{invoice.id}/edit"
          class="btn btn-primary"
          style="text-decoration:none;"
        >
          {$t('action.edit')}
        </a>
        {#if invoice.source_file}
          <a
            href="/invoice/{invoice.id}/file"
            class="btn btn-secondary"
            download
            style="text-decoration:none;"
          >
            {$t('inv.detail.downloadOriginal')}
          </a>
        {/if}
        {#if !confirmDelete}
          <button
            class="btn btn-ghost"
            style="color:var(--mep-neg);"
            onclick={() => confirmDelete = true}
          >
            {$t('inv.detail.delete')}
          </button>
        {:else}
          <form method="post" action="?/delete" style="display:flex;gap:6px;align-items:center;">
            <span class="body" style="color:var(--mep-neg);font-size:12px;">{$t('inv.detail.sure')}</span>
            <button type="submit" class="btn btn-secondary" style="color:var(--mep-neg);border-color:var(--mep-neg);">
              {$t('inv.detail.confirmDelete')}
            </button>
            <button type="button" class="btn btn-ghost" onclick={() => confirmDelete = false}>
              {$t('edit.cancel')}
            </button>
          </form>
        {/if}
      </div>
    </div>
  </div>

  {#if lineItems.length > 0}
    <div class="card" style="overflow:hidden;">
      <div class="card-header">
        <div class="section-title">
          <span class="subtitle">{$t('extract.lineItems')}</span>
        </div>
      </div>
      {#if unlinkedLineCount > 0}
        <div class="p-4 flex flex-wrap items-center gap-3 border-b border-divider">
          <span class="body text-warn">
            {$ti('inv.detail.unlinkedLines', { n: unlinkedLineCount })}
          </span>
          <form method="post" action="?/relinkProducts">
            <button type="submit" class="btn btn-secondary">
              {$t('inv.detail.relink')}
            </button>
          </form>
        </div>
      {/if}
      <table class="tbl">
        <thead>
          <tr>
            <th>{$t('tbl.desc')}</th>
            <th class="num">{$t('tbl.qty')}</th>
            <th>{$t('tbl.unit')}</th>
            <th class="num">{$t('tbl.unitPrice')}</th>
            <th class="num">{$t('tbl.total')}</th>
          </tr>
        </thead>
        <tbody>
          {#each lineItems as item}
            <tr>
              <td class="body-strong">{item.description ?? '—'}</td>
              <td class="num">{item.quantity ?? '—'}</td>
              <td class="body">{item.unit ?? '—'}</td>
              <td class="num">{fmt(item.unit_price)}</td>
              <td class="num">{fmt(item.total_price)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <div class="card p-4" style="display:flex;flex-direction:column;gap:12px;">
    <span class="subtitle" style="font-size:15px;">{$t('inv.detail.activity')}</span>
    <div style="display:flex;flex-direction:column;gap:0;">
      {#each timelineEvents as ev, i}
        <div style="display:flex;gap:12px;align-items:flex-start;{i < timelineEvents.length - 1 ? 'padding-bottom:14px;' : ''}">
          <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:16px;">
            <div style="width:8px;height:8px;border-radius:50%;background:var(--mep-acc);margin-top:4px;flex-shrink:0;"></div>
            {#if i < timelineEvents.length - 1}
              <div style="width:1px;flex:1;background:var(--mep-divider);margin-top:4px;min-height:20px;"></div>
            {/if}
          </div>
          <div style="display:flex;flex-direction:column;gap:1px;">
            <span class="body-strong" style="font-size:12.5px;">{$t(ev.labelKey)}</span>
            {#if ev.ts}
              <span class="body" style="font-size:11px;">{fmtDate(ev.ts)}</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>

</div>
</div>
