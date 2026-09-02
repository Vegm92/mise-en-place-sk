import { isNull, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import {
	restaurants, suppliers, invoices, invoiceLineItems, products, categoryBudgets,
	systemNotifications, invoiceAuditLog, productAliases, supplierMetrics, settings,
	unitConversions, stockLevels, extractionCorrections, extractionResults, chatSessions, chatMessages,
	llmUsageLog, tenantLlmQuotas, monthlyUsage, usageEvents, idempotencyKeys, uploadBatches, batchItems,
	whatsappContacts, whatsappPairingCodes, subscriptions, mrrSnapshots, deadLetterQueue,
	digestShares, recipes, recipeItems, categories,
} from './schema';

export type TenantDeletionStrategy = 'root' | 'explicit' | 'cascade-via-restaurants';

export interface TenantDataMapEntry {
	tableName: string;
	table: PgTable;
	scopeColumn: AnyPgColumn;
	deletion: TenantDeletionStrategy;
	exportKey: string | null;
	exportFilter?: () => SQL | undefined;
}

export const tenantDataMap: readonly TenantDataMapEntry[] = [
	{ tableName: 'restaurants', table: restaurants, scopeColumn: restaurants.id, deletion: 'root', exportKey: 'restaurants' },
	{ tableName: 'suppliers', table: suppliers, scopeColumn: suppliers.restaurantId, deletion: 'cascade-via-restaurants', exportKey: 'suppliers' },
	{
		tableName: 'invoices', table: invoices, scopeColumn: invoices.restaurantId, deletion: 'cascade-via-restaurants',
		exportKey: 'invoices', exportFilter: () => isNull(invoices.deletedAt),
	},
	{ tableName: 'invoice_line_items', table: invoiceLineItems, scopeColumn: invoiceLineItems.restaurantId, deletion: 'cascade-via-restaurants', exportKey: 'invoice_line_items' },
	{ tableName: 'category_budgets', table: categoryBudgets, scopeColumn: categoryBudgets.restaurantId, deletion: 'cascade-via-restaurants', exportKey: 'category_budgets' },
	{ tableName: 'unit_conversions', table: unitConversions, scopeColumn: unitConversions.restaurantId, deletion: 'cascade-via-restaurants', exportKey: 'unit_conversions' },
	{ tableName: 'chat_sessions', table: chatSessions, scopeColumn: chatSessions.restaurantId, deletion: 'cascade-via-restaurants', exportKey: 'chat_sessions' },
	{ tableName: 'chat_messages', table: chatMessages, scopeColumn: chatMessages.restaurantId, deletion: 'cascade-via-restaurants', exportKey: 'chat_messages' },
	{ tableName: 'extraction_corrections', table: extractionCorrections, scopeColumn: extractionCorrections.restaurantId, deletion: 'cascade-via-restaurants', exportKey: 'extraction_corrections' },
	{ tableName: 'extraction_results', table: extractionResults, scopeColumn: extractionResults.restaurantId, deletion: 'cascade-via-restaurants', exportKey: 'extraction_results' },
	{ tableName: 'stock_levels', table: stockLevels, scopeColumn: stockLevels.restaurantId, deletion: 'cascade-via-restaurants', exportKey: 'stock_levels' },
	{ tableName: 'settings', table: settings, scopeColumn: settings.restaurantId, deletion: 'cascade-via-restaurants', exportKey: 'settings' },
	{ tableName: 'products', table: products, scopeColumn: products.restaurantId, deletion: 'cascade-via-restaurants', exportKey: null },
	{ tableName: 'system_notifications', table: systemNotifications, scopeColumn: systemNotifications.restaurantId, deletion: 'cascade-via-restaurants', exportKey: null },
	{ tableName: 'invoice_audit_log', table: invoiceAuditLog, scopeColumn: invoiceAuditLog.restaurantId, deletion: 'cascade-via-restaurants', exportKey: null },
	{ tableName: 'product_aliases', table: productAliases, scopeColumn: productAliases.restaurantId, deletion: 'cascade-via-restaurants', exportKey: null },
	{ tableName: 'supplier_metrics', table: supplierMetrics, scopeColumn: supplierMetrics.restaurantId, deletion: 'cascade-via-restaurants', exportKey: null },
	{ tableName: 'llm_usage_log', table: llmUsageLog, scopeColumn: llmUsageLog.restaurantId, deletion: 'cascade-via-restaurants', exportKey: null },
	{ tableName: 'tenant_llm_quotas', table: tenantLlmQuotas, scopeColumn: tenantLlmQuotas.restaurantId, deletion: 'cascade-via-restaurants', exportKey: null },
	{ tableName: 'monthly_usage', table: monthlyUsage, scopeColumn: monthlyUsage.restaurantId, deletion: 'cascade-via-restaurants', exportKey: null },
	{ tableName: 'usage_events', table: usageEvents, scopeColumn: usageEvents.restaurantId, deletion: 'cascade-via-restaurants', exportKey: null },
	{ tableName: 'idempotency_keys', table: idempotencyKeys, scopeColumn: idempotencyKeys.restaurantId, deletion: 'cascade-via-restaurants', exportKey: null },
	{ tableName: 'upload_batches', table: uploadBatches, scopeColumn: uploadBatches.restaurantId, deletion: 'cascade-via-restaurants', exportKey: null },
	{ tableName: 'batch_items', table: batchItems, scopeColumn: batchItems.restaurantId, deletion: 'cascade-via-restaurants', exportKey: null },
	{ tableName: 'whatsapp_contacts', table: whatsappContacts, scopeColumn: whatsappContacts.restaurantId, deletion: 'cascade-via-restaurants', exportKey: null },
	{ tableName: 'whatsapp_pairing_codes', table: whatsappPairingCodes, scopeColumn: whatsappPairingCodes.restaurantId, deletion: 'cascade-via-restaurants', exportKey: null },
	{ tableName: 'subscriptions', table: subscriptions, scopeColumn: subscriptions.restaurantId, deletion: 'explicit', exportKey: null },
	{ tableName: 'mrr_snapshots', table: mrrSnapshots, scopeColumn: mrrSnapshots.restaurantId, deletion: 'cascade-via-restaurants', exportKey: null },
	{ tableName: 'dead_letter_queue', table: deadLetterQueue, scopeColumn: deadLetterQueue.restaurantId, deletion: 'cascade-via-restaurants', exportKey: null },
	{ tableName: 'digest_shares', table: digestShares, scopeColumn: digestShares.restaurantId, deletion: 'cascade-via-restaurants', exportKey: null },
	{ tableName: 'recipes', table: recipes, scopeColumn: recipes.restaurantId, deletion: 'cascade-via-restaurants', exportKey: 'recipes' },
	{ tableName: 'recipe_items', table: recipeItems, scopeColumn: recipeItems.restaurantId, deletion: 'cascade-via-restaurants', exportKey: 'recipe_items' },
	{ tableName: 'categories', table: categories, scopeColumn: categories.restaurantId, deletion: 'cascade-via-restaurants', exportKey: null },
];

export function exportableEntries(): TenantDataMapEntry[] {
	return tenantDataMap.filter((entry) => entry.exportKey !== null);
}

export function explicitDeletionEntries(): TenantDataMapEntry[] {
	return tenantDataMap.filter((entry) => entry.deletion === 'explicit');
}

export function rootEntry(): TenantDataMapEntry {
	const root = tenantDataMap.find((entry) => entry.deletion === 'root');
	if (!root) throw new Error('tenantDataMap: no root entry defined');
	return root;
}

export function missingFromTenantDataMap(tableNames: readonly string[]): string[] {
	const mapped = new Set(tenantDataMap.map((entry) => entry.tableName));
	return tableNames.filter((name) => !mapped.has(name));
}
