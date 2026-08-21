export const UPLOADS_DIR = process.env.UPLOADS_DIR ?? 'uploads';
export const STORAGE_DRIVER = (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 'railway';
export const AWS_ENDPOINT_URL = process.env.AWS_ENDPOINT_URL ?? '';
export const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID ?? '';
export const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY ?? '';
export const AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME ?? '';
export const AWS_DEFAULT_REGION = process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
export const AWS_S3_URL_STYLE = (process.env.AWS_S3_URL_STYLE ?? 'path') as 'path' | 'virtual';
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.1-flash';
export const GEMINI_TIMEOUT_MS = parseInt(process.env.GEMINI_TIMEOUT_MS ?? '120000', 10);
export const CHAT_RATE_LIMIT_RPM = parseInt(process.env.CHAT_RATE_LIMIT_RPM ?? '20', 10);
export const MAX_CONCURRENT_EXTRACTIONS = parseInt(process.env.MAX_CONCURRENT_EXTRACTIONS ?? '3', 10);
export const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL ?? '';
export const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? '';
export const LLM_PROVIDER = (process.env.LLM_PROVIDER ?? 'gemini') as 'gemini';
export const STRIPE_PRICE_ID_STARTER  = process.env.STRIPE_PRICE_ID_STARTER  ?? '';
export const STRIPE_PRICE_ID_PRO      = process.env.STRIPE_PRICE_ID_PRO      ?? '';
export const STRIPE_PRICE_ID_BUSINESS = process.env.STRIPE_PRICE_ID_BUSINESS ?? '';
export const WHATSAPP_ACCESS_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN    ?? '';
export const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
export const WHATSAPP_VERIFY_TOKEN    = process.env.WHATSAPP_VERIFY_TOKEN    ?? '';
export const WHATSAPP_APP_SECRET      = process.env.WHATSAPP_APP_SECRET      ?? '';
export const WHATSAPP_API_VERSION     = process.env.WHATSAPP_API_VERSION     ?? 'v25.0';
export const WHATSAPP_DISPLAY_NUMBER  = process.env.WHATSAPP_DISPLAY_NUMBER  ?? '';
export const APP_BASE_URL             = process.env.APP_BASE_URL            ?? '';
export const SENTRY_DSN               = process.env.SENTRY_DSN              ?? '';
export const SENTRY_AUTH_TOKEN        = process.env.SENTRY_AUTH_TOKEN       ?? '';
export const SENTRY_ORG               = process.env.SENTRY_ORG              ?? '';
export const SENTRY_PROJECT           = process.env.SENTRY_PROJECT          ?? '';
export const SENTRY_RELEASE           = process.env.SENTRY_RELEASE          ?? '';

if (!GEMINI_API_KEY) console.warn('[env] GEMINI_API_KEY is not set — invoice extraction will fail');
if (!APP_BASE_URL) {
	console.warn('[env] APP_BASE_URL is not set — batch links sent over WhatsApp will be relative paths');
}
