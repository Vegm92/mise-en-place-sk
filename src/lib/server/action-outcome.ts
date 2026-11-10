export type ActionOutcome = { ok: string } | { error: string; status: number };

export const succeed = (ok: string): ActionOutcome => ({ ok });

export const reject = (status: number, error: string): ActionOutcome => ({ error, status });
