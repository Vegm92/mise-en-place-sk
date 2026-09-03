import Bell from '@lucide/svelte/icons/bell';
import TrendingUp from '@lucide/svelte/icons/trending-up';
import Package from '@lucide/svelte/icons/package';
import Ruler from '@lucide/svelte/icons/ruler';
import Boxes from '@lucide/svelte/icons/boxes';
import Tag from '@lucide/svelte/icons/tag';
import Wallet from '@lucide/svelte/icons/wallet';
import Lock from '@lucide/svelte/icons/lock';
import MessageCircle from '@lucide/svelte/icons/message-circle';
import FileDiff from '@lucide/svelte/icons/file-diff';
import Phone from '@lucide/svelte/icons/phone';

export type Notif = {
  id: number;
  notificationType: string;
  message: string;
  payload: unknown;
  createdAt: Date | null;
  invoiceId?: number | null;
};

export function notificationMessage(
  n: { message: string; payload: unknown },
  tiv: (key: string, vars: Record<string, string | number>) => string,
): string {
  const msg = n.payload as { messageKey?: string; messageVars?: Record<string, string | number> } | null;
  return msg?.messageKey ? tiv(msg.messageKey, msg.messageVars ?? {}) : n.message;
}

export function notificationIcon(type: string) {
  if (type === 'price_shock')                 return TrendingUp;
  if (type === 'low_stock_forecast')          return Package;
  if (type === 'unit_conversion_needed')      return Ruler;
  if (type === 'product_suggestion')          return Boxes;
  if (type === 'supplier_uncategorized')      return Tag;
  if (type === 'supplier_category_suggested') return Tag;
  if (type === 'budget_overage')              return Wallet;
  if (type === 'locations_locked')            return Lock;
  if (type === 'whatsapp_pending_save')       return MessageCircle;
  if (type === 'whatsapp_needs_review')       return MessageCircle;
  if (type === 'line_item_mismatch')          return FileDiff;
  if (type === 'restaurant_phone_mismatch')   return Phone;
  return Bell;
}

export function notificationColor(type: string) {
  if (type === 'price_shock')                 return 'var(--mep-neg)';
  if (type === 'low_stock_forecast')          return 'var(--mep-warn)';
  if (type === 'unit_conversion_needed')      return 'var(--mep-info)';
  if (type === 'product_suggestion')          return 'var(--mep-info)';
  if (type === 'supplier_uncategorized')      return 'var(--mep-warn)';
  if (type === 'supplier_category_suggested') return 'var(--mep-info)';
  if (type === 'budget_overage')              return 'var(--mep-neg)';
  if (type === 'locations_locked')            return 'var(--mep-warn)';
  if (type === 'whatsapp_pending_save')       return 'var(--mep-info)';
  if (type === 'whatsapp_needs_review')       return 'var(--mep-warn)';
  if (type === 'line_item_mismatch')          return 'var(--mep-warn)';
  if (type === 'restaurant_phone_mismatch')   return 'var(--mep-info)';
  return 'var(--mep-fg-2)';
}

const PRICE_SHOCK      = ['price_shock'];
const LOW_STOCK         = ['low_stock_forecast'];
const BUDGET            = ['budget_overage'];
const SUPPLIERS         = ['supplier_uncategorized', 'supplier_category_suggested'];
const CATEGORIZED_TYPES = new Set([...PRICE_SHOCK, ...LOW_STOCK, ...BUDGET, ...SUPPLIERS]);

export function groupNotifications(items: Notif[]) {
  return {
    priceShock: items.filter(n => PRICE_SHOCK.includes(n.notificationType)),
    lowStock:   items.filter(n => LOW_STOCK.includes(n.notificationType)),
    budget:     items.filter(n => BUDGET.includes(n.notificationType)),
    suppliers:  items.filter(n => SUPPLIERS.includes(n.notificationType)),
    other:      items.filter(n => !CATEGORIZED_TYPES.has(n.notificationType)),
  };
}
