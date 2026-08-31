import { messageLoaders } from '$lib/i18n';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ data }) => {
  const es = await messageLoaders.es();
  return { ...data, messages: es.default };
};
