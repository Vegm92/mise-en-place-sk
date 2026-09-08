import { form, getRequestEvent } from '$app/server';
import { saveNameForUser, saveNameSchema } from './save-name';

export const saveName = form(saveNameSchema, async ({ name }) => {
	const { locals } = getRequestEvent();
	return saveNameForUser(name, locals.user?.id);
});
