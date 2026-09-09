export const NORMALIZE_QUEUE = 'normalize-product';
export const NORMALIZE_DEAD_LETTER_QUEUE = `${NORMALIZE_QUEUE}-dead-letter`;

export const CATEGORIZE_QUEUE = 'categorize-product';
export const CATEGORIZE_DEAD_LETTER_QUEUE = `${CATEGORIZE_QUEUE}-dead-letter`;

export interface NormalizeJobData {
	restaurantId: string;
	productId: number;
	rawText: string;
	requestId?: string;
}

export interface CategorizeJobData {
	restaurantId: string;
	productId: number;
	canonicalName: string;
	requestId?: string;
}

export const NORMALIZE_OPTIONS = (restaurantId: string, productId: number) => ({
	priority: -10,
	retryLimit: 1,
	retryDelay: 60,
	retryBackoff: true,
	retryDelayMax: 300,
	expireInSeconds: 900,
	singletonKey: `${restaurantId}:${productId}`,
	deadLetter: NORMALIZE_DEAD_LETTER_QUEUE,
});

export const CATEGORIZE_OPTIONS = (restaurantId: string, productId: number) => ({
	priority: -10,
	retryLimit: 1,
	retryDelay: 60,
	retryBackoff: true,
	retryDelayMax: 300,
	expireInSeconds: 900,
	singletonKey: `${restaurantId}:${productId}`,
	deadLetter: CATEGORIZE_DEAD_LETTER_QUEUE,
});
