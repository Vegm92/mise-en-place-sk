import { env } from '$env/dynamic/private';

export const UPLOADS_DIR = env.UPLOADS_DIR ?? 'uploads';
export const GEMINI_API_KEY = env.GEMINI_API_KEY ?? '';
export const GEMINI_MODEL = env.GEMINI_MODEL ?? 'gemini-2.5-flash';
export const CHAT_RATE_LIMIT_RPM = parseInt(env.CHAT_RATE_LIMIT_RPM ?? '20', 10);
export const MAX_CONCURRENT_EXTRACTIONS = parseInt(env.MAX_CONCURRENT_EXTRACTIONS ?? '3', 10);
if (!GEMINI_API_KEY) console.warn('[env] GEMINI_API_KEY is not set — invoice extraction will fail');
