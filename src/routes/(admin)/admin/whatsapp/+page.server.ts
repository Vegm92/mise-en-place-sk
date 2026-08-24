import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { safe } from '$lib/server/load-guard';
import { isAdminUser } from '$lib/server/admin';
import { getFlag, setFlag } from '$lib/server/app-flags';
import { renderQrSvg } from '$lib/server/qr-svg';
import {
	WHATSAPP_BOT_FLAG, WHATSAPP_QR_FLAG, WHATSAPP_STATUS_FLAG,
} from '$lib/server/integrations/whatsapp/runtime';
import { WHATSAPP_BOT_ENABLED } from '$lib/server/env';

export const load: PageServerLoad = async () => {
	const [killSwitch, qr, status] = await Promise.all([
		safe('admin/whatsapp-flag', () => getFlag(WHATSAPP_BOT_FLAG), null),
		safe('admin/whatsapp-qr', () => getFlag(WHATSAPP_QR_FLAG), null),
		safe('admin/whatsapp-status', () => getFlag(WHATSAPP_STATUS_FLAG), null),
	]);

	return {
		configured: WHATSAPP_BOT_ENABLED === 'true',
		enabled: killSwitch !== 'false',
		status: status ?? 'unknown',
		qrSvg: qr ? renderQrSvg(qr) : null,
	};
};

export const actions: Actions = {
	toggleBot: async ({ request, locals }) => {
		if (!isAdminUser(locals.user)) return fail(403, { error: 'forbidden' });

		const data = await request.formData();
		await setFlag(WHATSAPP_BOT_FLAG, data.get('enabled') === 'true' ? 'true' : 'false');
		return { success: true };
	},
};
