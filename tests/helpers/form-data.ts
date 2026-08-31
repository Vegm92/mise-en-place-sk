/**
 * Shared builders for the issue #844 "a File posted under a string field
 * name" tests (tests/public-form-action.test.ts, tests/signup.test.ts,
 * tests/password-recovery.test.ts): all three need to build a FormData that
 * mixes string fields with a File under an arbitrary key, and a stand-in
 * malicious file. Centralized so three near-identical loops don't reappear
 * per file (jscpd / `pnpm lint:duplication`).
 */
export function fileFormData(fields: Record<string, string | File>): FormData {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) data.append(key, value);
	return data;
}

export function maliciousFile(content = 'payload', name = 'evil.txt'): File {
	return new File([content], name, { type: 'text/plain' });
}

export function formDataEvent(data: FormData, extra: Record<string, unknown> = {}): unknown {
	return { request: { formData: async () => data }, ...extra };
}
