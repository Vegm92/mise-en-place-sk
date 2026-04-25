import { env } from '$env/dynamic/private';

export const UPLOADS_DIR = env.UPLOADS_DIR ?? 'uploads';
export const SK_SESSIONS_DIR = env.SK_SESSIONS_DIR ?? 'data/sk_sessions';
export const GEMINI_API_KEY = env.GEMINI_API_KEY ?? '';
if (!GEMINI_API_KEY) console.warn('[env] GEMINI_API_KEY is not set — invoice extraction will fail');
