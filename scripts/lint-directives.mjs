/**
 * The project's own machine-read comment directives, in one place.
 *
 * Two linters have opinions about these and must not disagree: lint-invariants
 * *requires* the annotation to wave a query past a gate, while check-no-comments
 * *bans* every comment that isn't a tool directive. When each hardcoded its own
 * copy, a directive the first demanded was a violation to the second.
 *
 * Consumers anchor these as they need — the gate matches anywhere in a
 * statement, the comment check only at the start of a comment body — so this
 * exports the names, not the patterns.
 */
export const PROJECT_DIRECTIVES = ['tenant-scope-ok', 'tenant-check-ok'];
