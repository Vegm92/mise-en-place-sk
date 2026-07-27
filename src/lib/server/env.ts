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
// Stripe price IDs per tier — set these in your Stripe dashboard and env.
export const STRIPE_PRICE_ID_STARTER  = process.env.STRIPE_PRICE_ID_STARTER  ?? '';
export const STRIPE_PRICE_ID_PRO      = process.env.STRIPE_PRICE_ID_PRO      ?? '';
export const STRIPE_PRICE_ID_BUSINESS = process.env.STRIPE_PRICE_ID_BUSINESS ?? '';
// ── WhatsApp Cloud API ────────────────────────────────────────────────────────
export const WHATSAPP_ACCESS_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN    ?? '';
export const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
export const WHATSAPP_VERIFY_TOKEN    = process.env.WHATSAPP_VERIFY_TOKEN    ?? '';
// App secret from Meta App Dashboard — used to verify X-Hub-Signature-256 on
// inbound webhook POSTs. Without it, the webhook cannot authenticate Meta.
export const WHATSAPP_APP_SECRET      = process.env.WHATSAPP_APP_SECRET      ?? '';
// Graph API version used for every Cloud API call. Meta expires each version
// roughly two years after release and calls to an expired one fail outright,
// so this is env-tunable: bumping it must not require a code change (and the
// default must be reviewed at each upgrade). See DEPLOYMENT.md.
export const WHATSAPP_API_VERSION     = process.env.WHATSAPP_API_VERSION     ?? 'v25.0';

if (!GEMINI_API_KEY) console.warn('[env] GEMINI_API_KEY is not set — invoice extraction will fail');
