import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	restaurants, userRestaurants, suppliers, invoices, invoiceLineItems,
	categoryBudgets, unitConversions, chatSessions, chatMessages,
	extractionCorrections, stockLevels, settings,
} from '$lib/server/schema';
import { checkRateLimit } from '$lib/server/rate-limiter';
import { eq, and, isNull, inArray } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Unauthorized');

	if (!(await checkRateLimit(`account-export:${user.id}`, 5))) {
		throw error(429, 'Too many requests — please wait a moment before trying again');
	}

	const memberships = await db
		.select({ restaurantId: userRestaurants.restaurantId, role: userRestaurants.role })
		.from(userRestaurants)
		.where(eq(userRestaurants.userId, user.id));

	const restaurantIds = memberships.map(m => m.restaurantId);

	const [
		restaurantRows,
		supplierRows,
		invoiceRows,
		lineItemRows,
		budgetRows,
		conversionRows,
		chatSessionRows,
		correctionRows,
		stockRows,
		settingRows,
	] = restaurantIds.length > 0 ? await Promise.all([
		db.select().from(restaurants).where(inArray(restaurants.id, restaurantIds)),
		db.select().from(suppliers).where(inArray(suppliers.restaurantId, restaurantIds)),
		db.select().from(invoices).where(and(inArray(invoices.restaurantId, restaurantIds), isNull(invoices.deletedAt))),
		db.select().from(invoiceLineItems).where(inArray(invoiceLineItems.restaurantId, restaurantIds)),
		db.select().from(categoryBudgets).where(inArray(categoryBudgets.restaurantId, restaurantIds)),
		db.select().from(unitConversions).where(inArray(unitConversions.restaurantId, restaurantIds)),
		db.select().from(chatSessions).where(inArray(chatSessions.restaurantId, restaurantIds)),
		db.select().from(extractionCorrections).where(inArray(extractionCorrections.restaurantId, restaurantIds)),
		db.select().from(stockLevels).where(inArray(stockLevels.restaurantId, restaurantIds)),
		db.select().from(settings).where(inArray(settings.restaurantId, restaurantIds)),
	]) : [[], [], [], [], [], [], [], [], [], []];

	const messageRows = restaurantIds.length > 0
		? await db.select().from(chatMessages).where(inArray(chatMessages.restaurantId, restaurantIds))
		: [];

	const export_data = {
		exported_at:    new Date().toISOString(),
		user: {
			id:    user.id,
			email: user.email,
		},
		memberships,
		restaurants:           restaurantRows,
		suppliers:             supplierRows,
		invoices:              invoiceRows,
		invoice_line_items:    lineItemRows,
		category_budgets:      budgetRows,
		unit_conversions:      conversionRows,
		chat_sessions:         chatSessionRows,
		chat_messages:         messageRows,
		extraction_corrections: correctionRows,
		stock_levels:          stockRows,
		settings:              settingRows,
	};

	return new Response(JSON.stringify(export_data, null, 2), {
		headers: {
			'Content-Type':        'application/json',
			'Content-Disposition': `attachment; filename="mise-en-place-data-${user.id}.json"`,
		},
	});
};
