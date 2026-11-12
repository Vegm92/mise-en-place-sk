import { describe, it, expect } from 'vitest';
import { WORK_KINDS } from '../src/lib/dashboard-turno';
import es from '../src/lib/messages/es';
import en from '../src/lib/messages/en';

describe('turno work kind labels', () => {
	it.each(WORK_KINDS)('has a turno.kind.%s label in es and en', (kind) => {
		const key = `turno.kind.${kind}`;
		expect((es as Record<string, string>)[key], `es ${key}`).toBeTruthy();
		expect((en as Record<string, string>)[key], `en ${key}`).toBeTruthy();
	});
});
