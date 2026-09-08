/**
 * The beforeAll/afterAll pair nearly every DB-backed suite repeats: create a
 * throwaway test restaurant before the suite runs, and clean it up (plus
 * close the pooled test connection) after. Centralized so the same six lines
 * don't reappear per file (jscpd / `pnpm lint:duplication`).
 *
 * Usage: `const restaurant = useTestRestaurant('my-suite'); ... rid: restaurant.id`
 * — `restaurant.id` is '' until the beforeAll above the suite's tests runs.
 */
import { beforeAll, afterAll } from 'vitest';
import { createTestRestaurant, cleanupTestRestaurant, closeDb, hasDbEnv } from './test-db';

export function useTestRestaurant(namePrefix: string): { id: string } {
	const restaurant = { id: '' };
	beforeAll(async () => {
		if (!hasDbEnv) return;
		restaurant.id = (await createTestRestaurant(namePrefix)).id;
	});
	afterAll(async () => {
		if (!hasDbEnv) return;
		await cleanupTestRestaurant(restaurant.id);
		await closeDb();
	});
	return restaurant;
}
