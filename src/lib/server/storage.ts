import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { UPLOADS_DIR, STORAGE_DRIVER, STORAGE_BUCKET } from './env.js';

class LocalDriver {
	private base: string;
	constructor() { this.base = path.resolve(process.cwd(), UPLOADS_DIR); }

	async save(key: string, buf: Buffer): Promise<void> {
		const dest = path.join(this.base, key);
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.writeFileSync(dest, buf);
	}

	async read(key: string): Promise<Buffer> {
		const fp = path.resolve(this.base, key);
		if (!fp.startsWith(this.base + path.sep) && fp !== this.base) {
			throw new Error(`Invalid storage key: ${key}`);
		}
		return fs.readFileSync(fp);
	}

	async delete(key: string): Promise<void> {
		try {
			const fp = path.resolve(this.base, key);
			if (fp.startsWith(this.base + path.sep) && fs.existsSync(fp)) fs.unlinkSync(fp);
		} catch {
			// already gone or invalid path — ignore
		}
	}
}

class SupabaseStorageDriver {
	private client: ReturnType<typeof createClient>;

	constructor() {
		const url = process.env.SUPABASE_URL;
		const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
		if (!url || !key) {
			throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Supabase storage');
		}
		this.client = createClient(url, key);
	}

	async save(key: string, buf: Buffer): Promise<void> {
		const { error } = await this.client.storage.from(STORAGE_BUCKET).upload(key, buf, { upsert: true });
		if (error) throw new Error(`Storage upload failed: ${error.message}`);
	}

	async read(key: string): Promise<Buffer> {
		const { data, error } = await this.client.storage.from(STORAGE_BUCKET).download(key);
		if (error) throw new Error(`Storage read failed: ${error.message}`);
		return Buffer.from(await data.arrayBuffer());
	}

	async delete(key: string): Promise<void> {
		await this.client.storage.from(STORAGE_BUCKET).remove([key]);
		// ignore errors — object may already be gone
	}
}

const _storage = STORAGE_DRIVER === 'supabase' ? new SupabaseStorageDriver() : new LocalDriver();
export function getStorage() { return _storage; }
