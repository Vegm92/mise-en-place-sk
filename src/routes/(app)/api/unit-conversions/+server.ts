import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { defineUnitConversion } from '$lib/server/products';
import { rateLimitScoped } from '$lib/server/rate-limit-scope';
import { apiError, invalidBody } from '$lib/server/api-response';
import { parseJson } from '$lib/server/public-form-action';
import { idempotencyKeyField, withIdempotency } from '$lib/server/api-idempotency';

const MISSING_FIELDS =
	'Missing required fields: supplier_name, ingredient, purchase_unit, canonical_unit, conversion_factor';
const NOT_POSITIVE = 'conversion_factor must be a positive number';

const required = v.pipe(v.string(MISSING_FIELDS), v.trim(), v.minLength(1, MISSING_FIELDS));

const UnitConversionBody = v.object({
	supplier_name: required,
	ingredient: required,
	purchase_unit: required,
	canonical_unit: required,
	conversion_factor: v.pipe(
		v.union([v.number(), v.pipe(v.string(), v.decimal())], NOT_POSITIVE),
		v.transform(Number),
		v.check((n) => n > 0, NOT_POSITIVE),
	),
	supplier_id: v.optional(v.nullable(v.union([v.number(), v.pipe(v.string(), v.decimal())]))),
	idempotency_key: idempotencyKeyField,
});

export const POST: RequestHandler = async ({ request, locals }) => {
	const rid = locals.restaurantId!;
	if (!await rateLimitScoped({ scope: 'tenant', name: 'unit-conversions', max: 30 }, { restaurantId: rid })) {
		return apiError(429, 'Too many requests');
	}

	const parsed = await parseJson(UnitConversionBody, request);
	if (!parsed.success) return invalidBody(parsed, 422, MISSING_FIELDS);
	const {
		supplier_name, ingredient, purchase_unit, canonical_unit,
		conversion_factor: factor, supplier_id, idempotency_key,
	} = parsed.output;

	const supplierId = supplier_id == null ? null : Math.trunc(Number(supplier_id));

	return withIdempotency(idempotency_key, rid, async () => {
		const result = await defineUnitConversion(db, rid, {
			supplierId,
			supplierName:     supplier_name,
			ingredient,
			purchaseUnit:     purchase_unit,
			canonicalUnit:    canonical_unit,
			conversionFactor: factor,
		});

		if (!result.ok) return apiError(422, NOT_POSITIVE);

		return json({
			ok: true,
			message: `Rule saved: 1 ${purchase_unit} = ${factor} ${canonical_unit}`,
			resolvedPrompts: result.resolvedPrompts,
		});
	});
};
