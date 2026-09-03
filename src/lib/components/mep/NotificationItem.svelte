<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import { t, tiv } from '$lib/i18n';
  import { notificationIcon, notificationColor, notificationMessage, type Notif } from '$lib/notification-display';

  let {
    notification,
    onDismiss,
    onAcceptCategory,
    onDecideProduct,
    decidingCategoryId = null,
    decidingProductId = null,
  }: {
    notification: Notif;
    onDismiss: (id: number) => void;
    onAcceptCategory: (n: Notif) => void;
    onDecideProduct: (n: Notif, accept: boolean) => void;
    decidingCategoryId?: number | null;
    decidingProductId?: number | null;
  } = $props();

  const Ic = $derived(notificationIcon(notification.notificationType));
</script>

<div style="display:flex;align-items:flex-start;gap:10px;">
  <div style="flex-shrink:0;margin-top:1px;color:{notificationColor(notification.notificationType)};">
    <Ic size={14} />
  </div>
  <div style="flex:1;min-width:0;">
    <div style="font-size:12.5px;color:var(--mep-fg);line-height:1.4;">
      {notificationMessage(notification, $tiv)}
    </div>
    {#if notification.notificationType === 'supplier_uncategorized'}
      {@const supplierId = (notification.payload as { supplierId?: number } | null)?.supplierId}
      {#if supplierId}
        <div style="margin-top:6px;">
          <a
            href="/suppliers/{supplierId}?edit=1&highlight=category"
            class="btn btn-primary"
            style="height:26px;font-size:11px;padding:0 10px;text-decoration:none;display:inline-flex;align-items:center;"
          >{$t('notif.categorize')}</a>
        </div>
      {/if}
    {/if}
    {#if notification.notificationType === 'supplier_category_suggested'}
      {@const p = notification.payload as { supplierId?: number; suggestedCategory?: string } | null}
      {#if p?.supplierId && p?.suggestedCategory}
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
          <button
            class="btn btn-primary"
            style="height:26px;font-size:11px;padding:0 10px;"
            disabled={decidingCategoryId !== null}
            onclick={() => onAcceptCategory(notification)}
          >{$t('notif.catAccept')}</button>
          <a
            href="/suppliers/{p.supplierId}?edit=1&highlight=category"
            class="btn btn-secondary"
            style="height:26px;font-size:11px;padding:0 10px;text-decoration:none;display:inline-flex;align-items:center;"
          >{$t('notif.catChange')}</a>
        </div>
      {/if}
    {/if}
    {#if notification.notificationType === 'unit_conversion_needed'}
      {@const p = notification.payload as { supplierId?: number; ingredient?: string; purchaseUnit?: string } | null}
      {#if p?.supplierId}
        <div style="margin-top:6px;">
          <a
            href="/suppliers/{p.supplierId}?tab=conversiones&ingredient={encodeURIComponent(p.ingredient ?? '')}&purchase_unit={encodeURIComponent(p.purchaseUnit ?? '')}"
            class="btn btn-primary"
            style="height:26px;font-size:11px;padding:0 10px;text-decoration:none;display:inline-flex;align-items:center;"
          >{$t('notif.setConversion')}</a>
        </div>
      {/if}
    {/if}
    {#if notification.notificationType === 'whatsapp_pending_save' || notification.notificationType === 'whatsapp_needs_review'}
      {@const batchId = (notification.payload as { batchId?: string } | null)?.batchId}
      {#if batchId}
        <div style="margin-top:6px;">
          <a
            href="/batch/{batchId}"
            class="btn btn-primary"
            style="height:26px;font-size:11px;padding:0 10px;text-decoration:none;display:inline-flex;align-items:center;"
          >{$t('notif.openBatch')}</a>
        </div>
      {/if}
    {/if}
    {#if notification.notificationType === 'restaurant_phone_mismatch'}
      <div style="margin-top:6px;">
        <a
          href="/settings"
          class="btn btn-primary"
          style="height:26px;font-size:11px;padding:0 10px;text-decoration:none;display:inline-flex;align-items:center;"
        >{$t('notif.openSettings')}</a>
      </div>
    {/if}
    {#if notification.notificationType === 'product_suggestion'}
      <div style="display:flex;gap:6px;margin-top:6px;">
        <button
          class="btn btn-primary"
          style="height:26px;font-size:11px;padding:0 10px;"
          disabled={decidingProductId !== null}
          onclick={() => onDecideProduct(notification, true)}
        >{$t('notif.prodConfirm')}</button>
        <button
          class="btn btn-secondary"
          style="height:26px;font-size:11px;padding:0 10px;"
          disabled={decidingProductId !== null}
          onclick={() => onDecideProduct(notification, false)}
        >{$t('notif.prodReject')}</button>
      </div>
    {/if}
    {#if notification.createdAt}
      <div style="font-size:11px;color:var(--mep-fg-3);margin-top:2px;">
        {new Date(notification.createdAt).toLocaleDateString()}
      </div>
    {/if}
  </div>
  <button
    style="flex-shrink:0;background:none;border:none;cursor:pointer;color:var(--mep-fg-3);padding:2px;margin-top:-1px;"
    onclick={() => onDismiss(notification.id)}
    aria-label={$t('a11y.dismiss')}
  >
    <X size={12} />
  </button>
</div>
