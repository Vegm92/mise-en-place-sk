import type { JobWithMetadata } from 'pg-boss';
import { WHATSAPP_NOTIFY_QUEUE, type WhatsAppNotifyJobData } from '../../contracts/whatsapp-contract.js';
import { runJob } from '../../dead-letter.js';
import { createLogger } from '../../log.js';
import { newRequestId } from '../../request-id.js';
import { handleInboundMessage } from './message-handler.js';
import { notifyWhatsAppSender } from './notify.js';
import { startWhatsAppTransport } from './runtime.js';
import type { WhatsAppTransport } from './transport.js';

const log = createLogger('worker');

export interface WhatsAppWorkerBoss {
	work(queue: string, options: { batchSize: number; includeMetadata: true }, handler: (jobs: JobWithMetadata<WhatsAppNotifyJobData>[]) => Promise<void>): Promise<unknown>;
}

export async function startWhatsAppWorker(boss: WhatsAppWorkerBoss): Promise<WhatsAppTransport | null> {
	const whatsapp = await startWhatsAppTransport();
	if (!whatsapp) {
		log.info('WhatsApp bot disabled — not starting a transport');
		return null;
	}
	whatsapp.onMessage((msg) => handleInboundMessage(msg, whatsapp, newRequestId()));
	await boss.work(
		WHATSAPP_NOTIFY_QUEUE,
		{ batchSize: 1, includeMetadata: true },
		async (jobs: JobWithMetadata<WhatsAppNotifyJobData>[]) => {
			for (const job of jobs) {
				await runJob(job, () => notifyWhatsAppSender(job.data, whatsapp));
			}
		},
	);
	log.info('Listening for queue jobs', { queue: WHATSAPP_NOTIFY_QUEUE });
	return whatsapp;
}
