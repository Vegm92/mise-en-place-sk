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
import { releaseContactByPhone } from '$lib/server/whatsapp-contacts';

export const load: PageServerLoad = async () => {
	const [killSwitch, qr, status] = await Promise.all([
		safe('admin/whatsapp-flag', () => getFlag(WHATSAPP_BOT_FLAG), null),
		safe('admin/whatsapp-qr', () => getFlag(WHATSAPP_QR_FLAG), null),
		safe('admin/whatsapp-status', () => getFlag(WHATSAPP_STATUS_FLAG), null),
	]);

	return {
		title: 'admin.whatsapp.title',
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

	releaseContact: async ({ request, locals }) => {
		if (!isAdminUser(locals.user)) return fail(403, { error: 'forbidden' });

		const data = await request.formData();
		const phone = ((data.get('phone') as string) ?? '').trim();

		const result = await releaseContactByPhone(phone, locals.user!.email ?? locals.user!.id);
		if (!result.ok) return fail(result.reason === 'notFound' ? 404 : 422, { error: result.reason });

		return { success: true, released: true };
	},
};
