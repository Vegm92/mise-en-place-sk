// process.env is equivalent to $env/dynamic/private at runtime with adapter-node,
// and allows this module to be imported from the worker process without Vite.
export const UPLOADS_DIR = process.env.UPLOADS_DIR ?? 'uploads';
export const STORAGE_DRIVER = (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 'supabase';
export const STORAGE_BUCKET = process.env.STORAGE_BUCKET ?? 'invoice-uploads';
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
export const CHAT_RATE_LIMIT_RPM = parseInt(process.env.CHAT_RATE_LIMIT_RPM ?? '20', 10);
export const MAX_CONCURRENT_EXTRACTIONS = parseInt(process.env.MAX_CONCURRENT_EXTRACTIONS ?? '3', 10);
export const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL ?? '';
export const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? '';
export const LLM_PROVIDER = (process.env.LLM_PROVIDER ?? 'gemini') as 'gemini';
if (!GEMINI_API_KEY) console.warn('[env] GEMINI_API_KEY is not set — invoice extraction will fail');
