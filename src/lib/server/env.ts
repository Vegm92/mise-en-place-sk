import { env } from '$env/dynamic/private';

export const UPLOADS_DIR = env.UPLOADS_DIR ?? 'uploads';
export const SK_SESSIONS_DIR = env.SK_SESSIONS_DIR ?? 'data/sk_sessions';
export const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY ?? '';
