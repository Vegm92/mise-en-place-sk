# Dependency patches

## `@auth/sveltekit@1.11.3`

SvelteKit 3 removed `base` from `$app/paths` and rejects external redirects unless they are explicitly allowed. This patch sets `base` to an empty string, because this app does not configure `paths.base`, and marks the library's sign-in and sign-out redirects as external.

If `paths.base` is ever configured, this patch must change too.

**Drop it** when the first `@auth/sveltekit` release that supports SvelteKit 3 is published: upgrade, delete this patch and its `pnpm.patchedDependencies` entry, then re-test credentials login, Google sign-in and logout.
