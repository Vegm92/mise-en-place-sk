import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
	return json(
		{
			error: 'Not implemented',
			expected_schema: {
				sales: [
					{
						ingredient_id: 'number',
						quantity: 'number',
						unit: 'string',
						sold_at: 'ISO8601',
					},
				],
			},
			formula:
				'Stock_Final = Stock_Inicial + Sum(Pending_Validations_Confirmed) - Sum(TPV_Sales)',
		},
		{ status: 501 }
	);
};
