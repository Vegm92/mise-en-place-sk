import { createHash } from 'node:crypto';
import { EXTRACTION_PROMPT_VERSION } from './extract';
import { UNIT_GROUPS } from './normalize';

export function getPipelineVersion(): string {
	const fingerprint = JSON.stringify({ UNIT_GROUPS });
	return `pipeline-${createHash('sha256').update(EXTRACTION_PROMPT_VERSION + fingerprint).digest('hex').slice(0, 12)}`;
}
