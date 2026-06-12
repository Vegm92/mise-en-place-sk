/**
 * Standalone replacement for SvelteKit's `$env/dynamic/private`, used only by
 * the worker bundle (see vite.worker.config.ts). Mirrors what adapter-node
 * does at runtime: dynamic private env is just process.env.
 */
export const env = process.env as Record<string, string | undefined>;
