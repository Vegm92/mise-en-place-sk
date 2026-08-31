import { messageLoaders } from '$lib/i18n';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ data }) => {
  const es = await messageLoaders.es();
  const contextMessages =
    data.locale === 'es' ? es.default : (await messageLoaders[data.locale]()).default;
  return { ...data, messages: es.default, contextMessages };
};
