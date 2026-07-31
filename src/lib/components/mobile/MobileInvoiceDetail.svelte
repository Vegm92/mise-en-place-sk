<script lang="ts">
  import StatusBadge from '$lib/components/mep/StatusBadge.svelte';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
  import FileText from '@lucide/svelte/icons/file-text';
  import Edit from '@lucide/svelte/icons/edit';
  import Download from '@lucide/svelte/icons/download';
  import Truck from '@lucide/svelte/icons/truck';
  import Check from '@lucide/svelte/icons/check';
  import { locale, t, ti } from '$lib/i18n';

  interface LineItem {
    id: number;
    description: string | null;
    quantity: number | null;
    unit: string | null;
    unit_price: number | null;
    total_price: number | null;
  }

  interface Invoice {
    id: number;
    invoice_number: string | null;
    supplier_name: string | null;
    supplier_id: number | null;
    total_amount: number | null;
    display_amount?: number | null;
    status: string | null;
    invoice_date: Date | string | null;
    due_date: Date | string | null;
    source_file: string | null;
  }

  let {
    invoice,
    lineItems,
  }: {
    invoice: Invoice;
    lineItems: LineItem[];
  } = $props();

  function fmt(n: number | null | undefined) {
    if (n == null) return '—';
    return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }
  function fmtDate(s: Date | string | null | undefined) {
    if (!s) return '—';
    const d = new Date(s as string);
    return isNaN(d.getTime()) ? String(s) : d.toLocaleDateString($locale, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const shown = $derived(lineItems.slice(0, 5));
  const remaining = $derived(Math.max(0, lineItems.length - 5));
</script>

<div style="height: 100%; display: flex; flex-direction: column; overflow: hidden; background: var(--mep-bg);">

  <div style="
    padding: 16px 14px 10px; flex-shrink: 0;
    background: var(--mep-surface);
    border-bottom: 1px solid var(--mep-divider);
    display: flex; align-items: center; gap: 8px;
  ">
    <a href="/invoices" style="
      width: 36px; height: 36px; border-radius: 18px; border: 0;
      background: transparent; color: var(--mep-fg); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      text-decoration: none; flex-shrink: 0;
    " aria-label={$t('mid.back')}>
      <ChevronLeft size={18} />
    </a>
    <div style="flex: 1; min-width: 0;">
      <div class="num" style="font-size: 14.5px; font-weight: 600; color: var(--mep-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        {invoice.invoice_number ?? `#${invoice.id}`}
      </div>
      <div style="font-size: 11px; color: var(--mep-fg-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        {invoice.supplier_name ?? '—'}
      </div>
    </div>
    <button style="
      width: 36px; height: 36px; border-radius: 18px; border: 0;
      background: transparent; color: var(--mep-fg); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    " aria-label={$t('mid.moreOptions')}>
      <MoreHorizontal size={18} />
    </button>
  </div>

  <div style="flex: 1; overflow: auto; padding: 14px 14px 100px; display: flex; flex-direction: column; gap: 12px;">

    <div class="card" style="padding: 16px;">
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
        <div>
          <div class="label" style="margin-bottom: 6px;">{$t('mid.totalVat')}</div>
          <div class="num" style="font-size: 30px; font-weight: 600; color: var(--mep-fg); letter-spacing: -0.6px; line-height: 1;">
            {fmt(invoice.display_amount ?? invoice.total_amount)}
          </div>
        </div>
        <StatusBadge status={invoice.status ?? 'pending'} />
      </div>
      <div style="
        margin-top: 12px; padding-top: 12px;
        border-top: 1px solid var(--mep-divider);
        display: flex; justify-content: space-between; font-size: 12px;
      ">
        <div>
          <div style="color: var(--mep-fg-3);">{$t('mid.issued')}</div>
          <div class="num" style="color: var(--mep-fg); font-weight: 500; margin-top: 2px;">{fmtDate(invoice.invoice_date)}</div>
        </div>
        <div>
          <div style="color: var(--mep-fg-3);">{$t('tbl.due')}</div>
          <div class="num" style="color: var(--mep-fg); font-weight: 500; margin-top: 2px;">{fmtDate(invoice.due_date)}</div>
        </div>
        <div>
          <div style="color: var(--mep-fg-3);">{$t('tbl.lines')}</div>
          <div class="num" style="color: var(--mep-fg); font-weight: 500; margin-top: 2px;">{lineItems.length}</div>
        </div>
      </div>
    </div>

    {#if invoice.source_file}
      <div class="card" style="padding: 0; overflow: hidden;">
        <div style="
          padding: 10px 14px; border-bottom: 1px solid var(--mep-divider);
          display: flex; align-items: center; gap: 8px;
        ">
          <FileText size={13} style="color: var(--mep-fg-2); flex-shrink: 0;" />
          <div style="flex: 1; font-size: 12px; color: var(--mep-fg-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            {invoice.source_file}
          </div>
          <a href="/invoice/{invoice.id}/file" target="_blank"
            style="font-size: 12px; color: var(--mep-acc); font-weight: 500; text-decoration: none; flex-shrink: 0;">
            {$t('mid.open')}
          </a>
        </div>
        <div style="padding: 16px; background: var(--mep-surface-2); display: flex; align-items: center; justify-content: center;">
          <div style="
            width: 130px; height: 165px; background: var(--mep-surface); border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.10);
            display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
          ">
            <FileText size={32} style="color: var(--mep-fg-3);" />
            <span style="font-size: 11px; color: var(--mep-fg-3);">{$t('mid.preview')}</span>
          </div>
        </div>
      </div>
    {/if}

    {#if lineItems.length > 0}
      <div class="card" style="padding: 4px 0;">
        {#each shown as item, i}
          <div style="
            padding: 11px 14px;
            border-bottom: {i < shown.length - 1 || remaining > 0 ? '1px solid var(--mep-divider)' : 'none'};
            display: flex; align-items: center; gap: 12px;
          ">
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 13px; font-weight: 500; color: var(--mep-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                {item.description ?? '—'}
              </div>
              {#if item.quantity != null && item.unit_price != null}
                <div class="num" style="font-size: 11px; color: var(--mep-fg-3); margin-top: 2px;">
                  {item.quantity.toFixed(2).replace('.', ',')} {item.unit ?? ''} × {item.unit_price.toFixed(2).replace('.', ',')} €
                </div>
              {/if}
            </div>
            <div class="num" style="font-size: 13px; font-weight: 500; color: var(--mep-fg); flex-shrink: 0;">
              {fmt(item.total_price)}
            </div>
          </div>
        {/each}
        {#if remaining > 0}
          <a href="/invoice/{invoice.id}" style="
            display: block; padding: 10px 14px; text-align: center;
            font-size: 12px; color: var(--mep-acc); font-weight: 500;
            border-top: 1px solid var(--mep-divider); text-decoration: none;
          ">
            {$ti('mid.viewLines', { n: lineItems.length })}
          </a>
        {/if}
      </div>
    {/if}

    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
      {#each [
        { icon: Edit, label: $t('mid.actionEdit'), href: `/invoice/${invoice.id}/edit` },
        { icon: Download, label: 'PDF', href: invoice.source_file ? `/invoice/${invoice.id}/file` : '#' },
        { icon: Truck, label: $t('mid.actionSupplier'), href: invoice.supplier_id ? `/suppliers/${invoice.supplier_id}` : '/suppliers' },
      ] as action}
        <a
          href={action.href}
          class="card"
          style="
            padding: 14px 8px; border: 1px solid var(--mep-border);
            display: flex; flex-direction: column; align-items: center; gap: 6px;
            background: var(--mep-surface); cursor: pointer; text-decoration: none;
          "
        >
          <action.icon size={18} style="color: var(--mep-fg-2);" />
          <span style="font-size: 11.5px; color: var(--mep-fg-2); font-weight: 500;">{action.label}</span>
        </a>
      {/each}
    </div>

  </div>
</div>
