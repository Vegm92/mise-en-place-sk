export const NORMALIZE_QUEUE = 'normalize-product';

export const CATEGORIZE_QUEUE = 'categorize-product';

export interface NormalizeJobData {
	restaurantId: string;
	productId: number;
	rawText: string;
	requestId?: string | undefined;
}

export interface CategorizeJobData {
	restaurantId: string;
	productId: number;
	canonicalName: string;
	requestId?: string | undefined;
}

export const NORMALIZE_OPTIONS = (restaurantId: string, productId: number) => ({
	priority: -10,
	retryLimit: 1,
	retryDelay: 60,
	retryBackoff: true,
	retryDelayMax: 300,
	expireInSeconds: 900,
	singletonKey: `${restaurantId}:${productId}`,
});

export const CATEGORIZE_OPTIONS = (restaurantId: string, productId: number) => ({
	priority: -10,
	retryLimit: 1,
	retryDelay: 60,
	retryBackoff: true,
	retryDelayMax: 300,
	expireInSeconds: 900,
	singletonKey: `${restaurantId}:${productId}`,
});
