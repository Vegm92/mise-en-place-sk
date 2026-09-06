import { eq, inArray, like } from 'drizzle-orm';
import { BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys';
import type { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys';
import { db } from '../../db';
import { whatsappSession } from '../../schema';

const CREDS_KEY = 'creds';

async function readRow(id: string): Promise<unknown | null> {
	const rows = await db
		.select({ data: whatsappSession.data })
		.from(whatsappSession)
		.where(eq(whatsappSession.id, id))
		.limit(1);
	if (!rows.length) return null;
	return JSON.parse(JSON.stringify(rows[0]!.data), BufferJSON.reviver);
}

async function writeRow(id: string, value: unknown): Promise<void> {
	const data = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
	await db
		.insert(whatsappSession)
		.values({ id, data })
		.onConflictDoUpdate({
			target: whatsappSession.id,
			set: { data, updatedAt: new Date() },
		});
}

async function deleteRows(ids: string[]): Promise<void> {
	if (!ids.length) return;
	await db.delete(whatsappSession).where(inArray(whatsappSession.id, ids));
}

export async function clearWhatsAppSession(): Promise<void> {
	await db.delete(whatsappSession).where(like(whatsappSession.id, '%'));
}

export interface PostgresAuthState {
	state: AuthenticationState;
	saveCreds: () => Promise<void>;
}

export async function usePostgresAuthState(): Promise<PostgresAuthState> {
	const creds = ((await readRow(CREDS_KEY)) as AuthenticationCreds | null) ?? initAuthCreds();

	return {
		state: {
			creds,
			keys: {
				get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
					const data: { [id: string]: SignalDataTypeMap[T] } = {};
					await Promise.all(ids.map(async (id) => {
						let value = await readRow(`${type}-${id}`);
						if (type === 'app-state-sync-key' && value) {
							value = proto.Message.AppStateSyncKeyData.fromObject(value as object);
						}
						if (value) data[id] = value as SignalDataTypeMap[T];
					}));
					return data;
				},
				set: async (data) => {
					const writes: Array<Promise<void>> = [];
					const removals: string[] = [];
					for (const category of Object.keys(data)) {
						const bucket = data[category as keyof typeof data] ?? {};
						for (const id of Object.keys(bucket)) {
							const value = (bucket as Record<string, unknown>)[id];
							if (value) writes.push(writeRow(`${category}-${id}`, value));
							else removals.push(`${category}-${id}`);
						}
					}
					await Promise.all([...writes, deleteRows(removals)]);
				},
			},
		},
		saveCreds: () => writeRow(CREDS_KEY, creds),
	};
}
