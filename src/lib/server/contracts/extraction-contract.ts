export const EXTRACTION_QUEUE = 'extract-invoice';
export const EXTRACTION_DEAD_LETTER_QUEUE = `${EXTRACTION_QUEUE}-dead-letter`;

export interface ExtractionJobData {
	itemId: string;
	restaurantId: string;
	requestId?: string;
}

export const EXTRACTION_OPTIONS = (itemId: string) => ({
	retryLimit: 2,
	retryDelay: 30,
	retryBackoff: true,
	retryDelayMax: 300,
	expireInSeconds: 600,
	singletonKey: itemId,
	deadLetter: EXTRACTION_DEAD_LETTER_QUEUE,
});
