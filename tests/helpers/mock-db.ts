import { testDb } from './test-db';
import { forTenant } from '../../src/lib/server/tenant';

export const db = testDb;
export const runAsSystem = <T>(fn: () => Promise<T>): Promise<T> => fn();
export { forTenant };
