import { describe, it, expect } from 'vitest';
import { ownershipTransferEmail } from '../src/lib/server/email';

describe('ownershipTransferEmail (RULE-275)', () => {
	it('renders in each locale and escapes the restaurant name', () => {
		const en = ownershipTransferEmail('new@example.com', 'Bar <b>Pepe</b>', 'en');
		const es = ownershipTransferEmail('new@example.com', 'Bar <b>Pepe</b>', 'es');

		expect(en).toMatchObject({ to: 'new@example.com', kind: 'ownership_transfer' });
		expect(en.subject).toBe('You are now the owner of Bar <b>Pepe</b>');
		expect(es.subject).toBe('Ahora eres el propietario de Bar <b>Pepe</b>');
		for (const mail of [en, es]) {
			expect(mail.html).toContain('Bar &lt;b&gt;Pepe&lt;/b&gt;');
			expect(mail.html).not.toContain('<b>Pepe</b>');
			expect(mail.html).not.toContain('email.ownerTransfer');
		}
	});
});
