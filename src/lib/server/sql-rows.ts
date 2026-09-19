import * as v from 'valibot';

export function sqlRows<TSchema extends v.GenericSchema>(rows: unknown, rowSchema: TSchema): v.InferOutput<TSchema>[] {
	try {
		return v.parse(v.array(rowSchema), rows);
	} catch (err) {
		if (err instanceof v.ValiError) {
			const path = v.getDotPath(err.issues[0]);
			throw new Error(`sql row shape mismatch${path ? ` at ${path}` : ''}: ${err.message}`);
		}
		throw err;
	}
}
