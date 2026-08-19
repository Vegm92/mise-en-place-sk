function envStr(key: string, fallback = ''): string {
	return process.env[key] ?? fallback;
}

function envInt(key: string, fallback: number): number {
	const raw = process.env[key];
	if (raw === undefined || raw === '') return fallback;
	const n = parseInt(raw, 10);
	return Number.isFinite(n) ? n : fallback;
}

function envBool(key: string, fallback = false): boolean {
	const raw = process.env[key];
	if (raw === undefined || raw === '') return fallback;
	return raw === 'true' || raw === '1' || raw === 'yes';
}

export interface Config {
	app: {
		nodeEnv: string;
		baseUrl: string;
		membershipTimeoutMs: number;
		loadBlockTimeoutMs: number;
		addressHeader: string;
	};
	database: {
		url: string;
		poolUrl: string;
		sslMode: string;
		caCert: string;
		connectTimeoutSec: number;
		statementTimeoutMs: number;
	};
	auth: {
		secret: string;
		googleId: string;
		googleSecret: string;
		adminEmail: string;
		adminPassword: string;
		adminRestaurantName: string;
	};
	storage: {
		driver: 'local' | 'railway';
		uploadsDir: string;
		aws: {
			endpoint: string;
			accessKey: string;
			secretKey: string;
			bucket: string;
			region: string;
			urlStyle: 'path' | 'virtual';
		};
	};
	gemini: {
		apiKey: string;
		model: string;
		timeoutMs: number;
		llmProvider: 'gemini';
		maxConcurrent: number;
	};
	stripe: {
		secretKey: string;
		webhookSecret: string;
		founderCouponId: string;
		priceStarter: string;
		pricePro: string;
		priceBusiness: string;
		planPriceStarterEur: string;
		planPriceProEur: string;
		planPriceBusinessEur: string;
	};
	email: {
		resendApiKey: string;
		from: string;
		companyLegalName: string;
		companyAddress: string;
		companyNif: string;
	};
	whatsapp: {
		accessToken: string;
		phoneNumberId: string;
		verifyToken: string;
		appSecret: string;
		apiVersion: string;
		displayNumber: string;
	};
	sentry: {
		dsn: string;
		authToken: string;
		org: string;
		project: string;
		release: string;
		env: string;
		tracesSampleRate: number;
	};
	rateLimit: {
		chatRpm: number;
		upstashUrl: string;
		upstashToken: string;
	};
}

const nodeEnv = envStr('NODE_ENV', 'development');

export const config: Config = Object.freeze({
	app: Object.freeze({
		nodeEnv,
		baseUrl: envStr('APP_BASE_URL'),
		membershipTimeoutMs: envInt('MEMBERSHIP_TIMEOUT_MS', 5000),
		loadBlockTimeoutMs: envInt('LOAD_BLOCK_TIMEOUT_MS', 8000),
		addressHeader: envStr('ADDRESS_HEADER'),
	}),
	database: Object.freeze({
		url: envStr('DATABASE_URL'),
		poolUrl: envStr('DATABASE_POOL_URL'),
		sslMode: envStr('DATABASE_SSL_MODE', 'require'),
		caCert: envStr('DATABASE_CA_CERT'),
		connectTimeoutSec: envInt('DB_CONNECT_TIMEOUT_SECONDS', 10),
		statementTimeoutMs: envInt('DB_STATEMENT_TIMEOUT_MS', 15000),
	}),
	auth: Object.freeze({
		secret: envStr('AUTH_SECRET'),
		googleId: envStr('AUTH_GOOGLE_ID'),
		googleSecret: envStr('AUTH_GOOGLE_SECRET'),
		adminEmail: envStr('AUTH_ADMIN_EMAIL'),
		adminPassword: envStr('AUTH_ADMIN_PASSWORD'),
		adminRestaurantName: envStr('AUTH_ADMIN_RESTAURANT_NAME', 'Mi Restaurante'),
	}),
	storage: Object.freeze({
		driver: (envStr('STORAGE_DRIVER', 'local') as 'local' | 'railway'),
		uploadsDir: envStr('UPLOADS_DIR', 'uploads'),
		aws: Object.freeze({
			endpoint: envStr('AWS_ENDPOINT_URL'),
			accessKey: envStr('AWS_ACCESS_KEY_ID'),
			secretKey: envStr('AWS_SECRET_ACCESS_KEY'),
			bucket: envStr('AWS_S3_BUCKET_NAME'),
			region: envStr('AWS_DEFAULT_REGION', 'us-east-1'),
			urlStyle: (envStr('AWS_S3_URL_STYLE', 'path') as 'path' | 'virtual'),
		}),
	}),
	gemini: Object.freeze({
		apiKey: envStr('GEMINI_API_KEY'),
		model: envStr('GEMINI_MODEL', 'gemini-2.5-flash'),
		timeoutMs: envInt('GEMINI_TIMEOUT_MS', 120000),
		llmProvider: (envStr('LLM_PROVIDER', 'gemini') as 'gemini'),
		maxConcurrent: envInt('MAX_CONCURRENT_EXTRACTIONS', 3),
	}),
	stripe: Object.freeze({
		secretKey: envStr('STRIPE_SECRET_KEY'),
		webhookSecret: envStr('STRIPE_WEBHOOK_SECRET'),
		founderCouponId: envStr('STRIPE_FOUNDER_COUPON_ID'),
		priceStarter: envStr('STRIPE_PRICE_ID_STARTER'),
		pricePro: envStr('STRIPE_PRICE_ID_PRO'),
		priceBusiness: envStr('STRIPE_PRICE_ID_BUSINESS'),
		planPriceStarterEur: envStr('PLAN_PRICE_STARTER_EUR'),
		planPriceProEur: envStr('PLAN_PRICE_PRO_EUR'),
		planPriceBusinessEur: envStr('PLAN_PRICE_BUSINESS_EUR'),
	}),
	email: Object.freeze({
		resendApiKey: envStr('RESEND_API_KEY'),
		from: envStr('EMAIL_FROM', 'Mise en Place <noreply@miseenplace.app>'),
		companyLegalName: envStr('COMPANY_LEGAL_NAME'),
		companyAddress: envStr('COMPANY_ADDRESS'),
		companyNif: envStr('COMPANY_NIF'),
	}),
	whatsapp: Object.freeze({
		accessToken: envStr('WHATSAPP_ACCESS_TOKEN'),
		phoneNumberId: envStr('WHATSAPP_PHONE_NUMBER_ID'),
		verifyToken: envStr('WHATSAPP_VERIFY_TOKEN'),
		appSecret: envStr('WHATSAPP_APP_SECRET'),
		apiVersion: envStr('WHATSAPP_API_VERSION', 'v25.0'),
		displayNumber: envStr('WHATSAPP_DISPLAY_NUMBER'),
	}),
	sentry: Object.freeze({
		dsn: envStr('SENTRY_DSN'),
		authToken: envStr('SENTRY_AUTH_TOKEN'),
		org: envStr('SENTRY_ORG'),
		project: envStr('SENTRY_PROJECT'),
		release: envStr('SENTRY_RELEASE'),
		env: nodeEnv === 'production' ? 'production' : 'development',
		tracesSampleRate: nodeEnv === 'production' ? 0.1 : 1.0,
	}),
	rateLimit: Object.freeze({
		chatRpm: envInt('CHAT_RATE_LIMIT_RPM', 20),
		upstashUrl: envStr('UPSTASH_REDIS_REST_URL'),
		upstashToken: envStr('UPSTASH_REDIS_REST_TOKEN'),
	}),
});

const REQUIRED_IN_PRODUCTION = [
	'AUTH_SECRET',
	'DATABASE_URL',
	'STRIPE_SECRET_KEY',
	'STRIPE_WEBHOOK_SECRET',
	'GEMINI_API_KEY',
] as const;

export function assertProduction(env: NodeJS.ProcessEnv = process.env): void {
	if (env.NODE_ENV !== 'production') return;

	const missing: string[] = REQUIRED_IN_PRODUCTION.filter(key => !env[key]);

	if (env.WHATSAPP_ACCESS_TOKEN && !env.WHATSAPP_APP_SECRET) {
		missing.push('WHATSAPP_APP_SECRET');
	}

	if (missing.length > 0) {
		throw new Error(`Missing required environment variable(s) in production: ${missing.join(', ')}`);
	}
}

if (!config.gemini.apiKey) console.warn('[env] GEMINI_API_KEY is not set — invoice extraction will fail');
if (!config.app.baseUrl) {
	console.warn('[env] APP_BASE_URL is not set — batch links sent over WhatsApp will be relative paths');
}

export const UPLOADS_DIR = config.storage.uploadsDir;
export const STORAGE_DRIVER = config.storage.driver;
export const AWS_ENDPOINT_URL = config.storage.aws.endpoint;
export const AWS_ACCESS_KEY_ID = config.storage.aws.accessKey;
export const AWS_SECRET_ACCESS_KEY = config.storage.aws.secretKey;
export const AWS_S3_BUCKET_NAME = config.storage.aws.bucket;
export const AWS_DEFAULT_REGION = config.storage.aws.region;
export const AWS_S3_URL_STYLE = config.storage.aws.urlStyle;
export const GEMINI_API_KEY = config.gemini.apiKey;
export const GEMINI_MODEL = config.gemini.model;
export const GEMINI_TIMEOUT_MS = config.gemini.timeoutMs;
export const CHAT_RATE_LIMIT_RPM = config.rateLimit.chatRpm;
export const MAX_CONCURRENT_EXTRACTIONS = config.gemini.maxConcurrent;
export const UPSTASH_REDIS_REST_URL = config.rateLimit.upstashUrl;
export const UPSTASH_REDIS_REST_TOKEN = config.rateLimit.upstashToken;
export const LLM_PROVIDER = config.gemini.llmProvider;
export const STRIPE_PRICE_ID_STARTER = config.stripe.priceStarter;
export const STRIPE_PRICE_ID_PRO = config.stripe.pricePro;
export const STRIPE_PRICE_ID_BUSINESS = config.stripe.priceBusiness;
export const WHATSAPP_ACCESS_TOKEN = config.whatsapp.accessToken;
export const WHATSAPP_PHONE_NUMBER_ID = config.whatsapp.phoneNumberId;
export const WHATSAPP_VERIFY_TOKEN = config.whatsapp.verifyToken;
export const WHATSAPP_APP_SECRET = config.whatsapp.appSecret;
export const WHATSAPP_API_VERSION = config.whatsapp.apiVersion;
export const WHATSAPP_DISPLAY_NUMBER = config.whatsapp.displayNumber;
export const APP_BASE_URL = config.app.baseUrl;
export const SENTRY_DSN = config.sentry.dsn;
export const SENTRY_AUTH_TOKEN = config.sentry.authToken;
export const SENTRY_ORG = config.sentry.org;
export const SENTRY_PROJECT = config.sentry.project;
export const SENTRY_RELEASE = config.sentry.release;
