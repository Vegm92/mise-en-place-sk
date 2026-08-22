<script lang="ts">
  import type { PageData } from './$types';
  import { t, ti } from '$lib/i18n';
  import SectionCard from '$lib/components/mep/SectionCard.svelte';
  import NotificationItem from '$lib/components/mep/NotificationItem.svelte';
  import Bell from '@lucide/svelte/icons/bell';
  import Search from '@lucide/svelte/icons/search';
  import Clock from '@lucide/svelte/icons/clock';
  import Tag from '@lucide/svelte/icons/tag';
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
  import Upload from '@lucide/svelte/icons/upload';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import type { Notif } from '$lib/notification-display';

  let { data }: { data: PageData } = $props();

  // svelte-ignore state_referenced_locally — intentional: seed once from prop
  let duplicates  = $state<Notif[]>(data.duplicates as Notif[]);
  // svelte-ignore state_referenced_locally — intentional: seed once from prop
  let priceShocks = $state<Notif[]>(data.priceShocks as Notif[]);

  const isEmpty = $derived(
    duplicates.length === 0 &&
    priceShocks.length === 0 &&
    data.lowConfidence.length === 0 &&
    data.pendingPrice.length === 0 &&
    data.untypedSuppliers.length === 0
  );

  async function dismiss(id: number, from: 'duplicates' | 'priceShocks') {
    const list = from === 'duplicates' ? duplicates : priceShocks;
    const removed = list.find((n) => n.id === id);
    const removedIndex = list.findIndex((n) => n.id === id);
    if (from === 'duplicates') duplicates = duplicates.filter((n) => n.id !== id);
    else priceShocks = priceShocks.filter((n) => n.id !== id);
    try {
      const resp = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!resp.ok) throw new Error(`dismiss failed: ${resp.status}`);
    } catch {
      if (removed && removedIndex >= 0) {
        const next = [...list];
        next.splice(removedIndex, 0, removed);
        if (from === 'duplicates') duplicates = next; else priceShocks = next;
      }
    }
  }

  function noop() {}
</script>

<div style="max-width:760px;margin:0 auto;padding:32px 24px;display:flex;flex-direction:column;gap:20px;" data-coach="avisos-main">

  <div style="display:flex;align-items:center;gap:10px;">
    <Bell size={18} style="color:var(--mep-acc);flex-shrink:0;" />
    <div>
      <h1 style="font-size:16px;font-weight:600;margin:0;line-height:1.2;">{$t('avisos.title')}</h1>
      <p style="font-size:12px;color:var(--mep-fg-3);margin:2px 0 0;">{$t('avisos.subtitle')}</p>
    </div>
  </div>

  {#if isEmpty}
    <div style="padding:32px;border-radius:10px;background:var(--mep-card);border:1px solid var(--mep-border);text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px;">
      <CheckCircle2 size={22} style="color:var(--mep-pos);" />
      <p style="font-size:13px;color:var(--mep-fg-2);margin:0;">{$t('avisos.empty')}</p>
    </div>
  {/if}

  {#if duplicates.length > 0}
    <SectionCard title={$t('avisos.section.action')} noPad>
      <div style="display:flex;flex-direction:column;">
        {#each duplicates as n, i (n.id)}
          <div style="padding:12px 16px;{i > 0 ? 'border-top:1px solid var(--mep-divider);' : ''}">
            <NotificationItem
              notification={n}
              onDismiss={(id) => dismiss(id, 'duplicates')}
              onAcceptCategory={noop}
              onDecideProduct={noop}
            />
          </div>
        {/each}
      </div>
    </SectionCard>
  {/if}

  {#if priceShocks.length > 0 || data.lowConfidence.length > 0 || data.pendingPrice.length > 0 || data.untypedSuppliers.length > 0}
    <SectionCard title={$t('avisos.section.review')} noPad>
      <div style="display:flex;flex-direction:column;">
        {#each priceShocks as n, i (n.id)}
          <div style="padding:12px 16px;{i > 0 ? 'border-top:1px solid var(--mep-divider);' : ''}">
            <NotificationItem
              notification={n}
              onDismiss={(id) => dismiss(id, 'priceShocks')}
              onAcceptCategory={noop}
              onDecideProduct={noop}
            />
          </div>
        {/each}

        {#each data.lowConfidence as r, i (r.id)}
          <div style="padding:12px 16px;{(priceShocks.length + i) > 0 ? 'border-top:1px solid var(--mep-divider);' : ''}display:flex;align-items:flex-start;gap:10px;">
            <Search size={14} style="flex-shrink:0;margin-top:1px;color:var(--mep-warn);" />
            <div style="flex:1;min-width:0;">
              <div style="font-size:12.5px;color:var(--mep-fg);line-height:1.4;">
                {$ti('avisos.lowConfidence.msg', { supplier: r.supplier_name ?? '—' })}
              </div>
              <a href="/invoice/{r.id}" class="btn btn-ghost" style="height:24px;font-size:11px;padding:0 8px;margin-top:6px;text-decoration:none;display:inline-flex;align-items:center;">
                {$t('avisos.review')}
              </a>
            </div>
          </div>
        {/each}

        {#each data.pendingPrice as r, i (r.invoice_id)}
          <div style="padding:12px 16px;{(priceShocks.length + data.lowConfidence.length + i) > 0 ? 'border-top:1px solid var(--mep-divider);' : ''}display:flex;align-items:flex-start;gap:10px;">
            <Clock size={14} style="flex-shrink:0;margin-top:1px;color:var(--mep-warn);" />
            <div style="flex:1;min-width:0;">
              <div style="font-size:12.5px;color:var(--mep-fg);line-height:1.4;">
                {$ti('avisos.pendingPrice.msg', { supplier: r.supplier_name ?? '—', count: r.missing_count })}
              </div>
              <a href="/invoice/{r.invoice_id}" class="btn btn-ghost" style="height:24px;font-size:11px;padding:0 8px;margin-top:6px;text-decoration:none;display:inline-flex;align-items:center;">
                {$t('avisos.review')}
              </a>
            </div>
          </div>
        {/each}

        {#each data.untypedSuppliers as sup, i (sup.id)}
          <div style="padding:12px 16px;{(priceShocks.length + data.lowConfidence.length + data.pendingPrice.length + i) > 0 ? 'border-top:1px solid var(--mep-divider);' : ''}display:flex;align-items:flex-start;gap:10px;">
            <Tag size={14} style="flex-shrink:0;margin-top:1px;color:var(--mep-warn);" />
            <div style="flex:1;min-width:0;">
              <div style="font-size:12.5px;color:var(--mep-fg);line-height:1.4;">
                {$ti('avisos.untypedSupplier.msg', { supplier: sup.name })}
              </div>
              <a href="/suppliers/{sup.id}?edit=1" class="btn btn-ghost" style="height:24px;font-size:11px;padding:0 8px;margin-top:6px;text-decoration:none;display:inline-flex;align-items:center;">
                {$t('avisos.review')}
              </a>
            </div>
          </div>
        {/each}
      </div>
    </SectionCard>
  {/if}

  {#if data.recentUploads.length > 0 || data.recentWithComments.length > 0}
    <SectionCard title={$t('avisos.section.new')} noPad>
      <div style="display:flex;flex-direction:column;">
        {#each data.recentWithComments as r, i (r.id)}
          <div style="padding:12px 16px;{i > 0 ? 'border-top:1px solid var(--mep-divider);' : ''}display:flex;align-items:flex-start;gap:10px;">
            <MessageCircle size={14} style="flex-shrink:0;margin-top:1px;color:var(--mep-fg-3);" />
            <div style="flex:1;min-width:0;">
              <div style="font-size:12.5px;color:var(--mep-fg);line-height:1.4;">
                {$ti('avisos.recentComment.msg', { supplier: r.supplier_name ?? '—' })}
              </div>
              <a href="/invoice/{r.id}" class="btn btn-ghost" style="height:24px;font-size:11px;padding:0 8px;margin-top:6px;text-decoration:none;display:inline-flex;align-items:center;">
                {$t('avisos.viewInvoice')}
              </a>
            </div>
          </div>
        {/each}

        {#each data.recentUploads as r, i (r.id)}
          <div style="padding:12px 16px;{(data.recentWithComments.length + i) > 0 ? 'border-top:1px solid var(--mep-divider);' : ''}display:flex;align-items:flex-start;gap:10px;">
            <Upload size={14} style="flex-shrink:0;margin-top:1px;color:var(--mep-fg-3);" />
            <div style="flex:1;min-width:0;">
              <div style="font-size:12.5px;color:var(--mep-fg);line-height:1.4;">
                {$ti('avisos.recentUpload.msg', { supplier: r.supplier_name ?? '—' })}
              </div>
              <a href="/invoice/{r.id}" class="btn btn-ghost" style="height:24px;font-size:11px;padding:0 8px;margin-top:6px;text-decoration:none;display:inline-flex;align-items:center;">
                {$t('avisos.viewInvoice')}
              </a>
            </div>
          </div>
        {/each}
      </div>
    </SectionCard>
  {/if}

</div>
