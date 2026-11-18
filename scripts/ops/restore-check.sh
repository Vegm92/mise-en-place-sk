#!/usr/bin/env bash
# restore-check.sh: proves a pg-backup.sh dump restores, using a throwaway local Postgres container.
#
# Usage:
#   scripts/ops/restore-check.sh path/to/mep-2026-11-18T020000Z.dump [path/to/expected.counts]
#   BACKUP_AGE_IDENTITY=~/key.txt scripts/ops/restore-check.sh dump.age      (decrypts first, needs `age`)
#
# Environment (names only):
#   RESTORE_PG_IMAGE           image for the throwaway server (default postgres:18, must match the production major)
#   BACKUP_AGE_IDENTITY        path to the age identity file, only for *.age dumps
#   RESTORE_EXPECT_MIGRATIONS  expected rows in drizzle.__drizzle_migrations (default: entries in
#                              drizzle/meta/_journal.json of this checkout)
#   RESTORE_ALLOW_DRIFT        1 = a differing row count is a WARN instead of a FAIL (counts taken while the source was live)
#
# What it does: starts one docker container with no published port and trust auth inside the container
# (no credentials anywhere), restores the dump with pg_restore --no-owner --no-privileges --exit-on-error,
# counts every table of public/drizzle/pgboss, compares them with the .counts sidecar (default: <dump>.counts),
# checks the migration ledger against the journal, and ALWAYS removes the container AND its data volume on exit.
# It never connects to any real database. Exit code: 0 all OK, 1 any FAIL, 2 usage error.
# Needs: docker. The restored data is customer data: container and volume are deleted on exit; delete the dump when done.
set -uo pipefail

if [ $# -lt 1 ] || [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
	awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 {exit}' "$0"
	[ $# -lt 1 ] && exit 2
	exit 0
fi
command -v docker >/dev/null || { echo "docker not found" >&2; exit 2; }

dump="$1"
[ -s "$dump" ] || { echo "dump not found or empty: $dump" >&2; exit 2; }
counts="${2:-$dump.counts}"
[ -s "$counts" ] || { echo "counts file not found: $counts (pass it as 2nd argument)" >&2; exit 2; }
IMAGE="${RESTORE_PG_IMAGE:-postgres:18}"
NAME="mep-restore-check-$$-$(date +%s)"
work=""
errfile=""
volumes=""
cleanup() {
	docker rm -fv "$NAME" >/dev/null 2>&1 || true
	# belt and braces: the anonymous data volume holds the restored customer data
	for v in $volumes; do docker volume rm -f "$v" >/dev/null 2>&1 || true; done
	[ -n "$work" ] && rm -rf "$work"
	[ -n "$errfile" ] && rm -f "$errfile"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ "$dump" == *.age ]]; then
	command -v age >/dev/null || { echo "age not found" >&2; exit 2; }
	[ -n "${BACKUP_AGE_IDENTITY:-}" ] || { echo "BACKUP_AGE_IDENTITY is not set" >&2; exit 2; }
	work="$(mktemp -d)"
	age -d -i "$BACKUP_AGE_IDENTITY" -o "$work/dump" "$dump" || { echo "decryption failed" >&2; exit 2; }
	dump="$work/dump"
fi

expected_migrations="${RESTORE_EXPECT_MIGRATIONS:-}"
if [ -z "$expected_migrations" ]; then
	here="$(cd "$(dirname "$0")" && pwd)"
	journal="$here/../../drizzle/meta/_journal.json"
	[ -f "$journal" ] && expected_migrations="$(grep -o '"tag"' "$journal" | wc -l | tr -d ' ')"
fi

fails=0
ok()   { printf 'OK    %s\n' "$1"; }
warn() { printf 'WARN  %s\n' "$1"; }
bad()  { printf 'FAIL  %s\n' "$1"; fails=$((fails + 1)); }

echo "starting throwaway $IMAGE as $NAME"
docker run -d --name "$NAME" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=mep_restore "$IMAGE" >/dev/null || { echo "could not start the container" >&2; exit 2; }
volumes="$(docker inspect -f '{{range .Mounts}}{{if .Name}}{{.Name}} {{end}}{{end}}' "$NAME" 2>/dev/null || true)"
ready=0
for _ in $(seq 1 60); do
	if docker exec "$NAME" pg_isready -U postgres -d mep_restore -q 2>/dev/null; then
		sleep 2
		docker exec "$NAME" pg_isready -U postgres -d mep_restore -q 2>/dev/null && { ready=1; break; }
	fi
	sleep 1
done
[ $ready -eq 1 ] || { echo "throwaway server did not become ready" >&2; exit 2; }

errfile="$(mktemp)"
started=$(date +%s)
if docker exec -i "$NAME" pg_restore -U postgres -d mep_restore --no-owner --no-privileges --exit-on-error < "$dump" 2> "$errfile"; then
	ok "pg_restore finished without errors ($(( $(date +%s) - started )) s)"
else
	bad "pg_restore failed: $(head -n1 "$errfile" | sed -E 's/ *DETAIL:.*//' | cut -c1-160) (full output withheld: it can contain customer data)"
fi

COUNT_SQL="SELECT n.nspname || '.' || c.relname || ' ' || (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p') AND NOT c.relispartition AND n.nspname IN ('public','drizzle','pgboss')
ORDER BY 1;"
actual="$(printf '%s\n' "$COUNT_SQL" | docker exec -i "$NAME" psql -X -A -t -q -U postgres -d mep_restore -v ON_ERROR_STOP=1 2>&1)" || { bad "could not count restored tables: $actual"; actual=""; }

tables=0; diffs=0
while read -r tname texpected; do
	[ -n "${tname:-}" ] || continue
	tables=$((tables + 1))
	tactual="$(printf '%s\n' "$actual" | awk -v t="$tname" '$1 == t {print $2}')"
	if [ -z "$tactual" ]; then
		bad "$tname: missing after restore (expected $texpected)"; diffs=$((diffs + 1))
	elif [ "$tactual" != "$texpected" ]; then
		diffs=$((diffs + 1))
		if [ "${RESTORE_ALLOW_DRIFT:-0}" = "1" ]; then warn "$tname: $tactual rows, source had $texpected"; else bad "$tname: $tactual rows, source had $texpected"; fi
	fi
done < "$counts"
actual_tables="$(printf '%s\n' "$actual" | grep -c '^[a-z_]*\.[^ ]* [0-9]')"
if [ "$tables" -lt 1 ]; then bad "the counts file lists no tables"
elif [ "$tables" -ne "$actual_tables" ]; then bad "the counts file lists $tables tables but the restored database has $actual_tables"; fi
[ "$diffs" -eq 0 ] && [ "$tables" -ge 1 ] && ok "all $tables tables match the source row counts"

ledger="$(printf '%s\n' "$actual" | awk '$1 == "drizzle.__drizzle_migrations" {print $2}')"
if [ -z "$ledger" ]; then
	bad "drizzle.__drizzle_migrations missing: the migration ledger was not restored"
elif [ -n "$expected_migrations" ] && [ "$ledger" != "$expected_migrations" ]; then
	bad "migration ledger has $ledger rows, the journal expects $expected_migrations"
else
	ok "migration ledger: $ledger rows${expected_migrations:+ (matches the journal)}"
fi

pol="$(docker exec "$NAME" psql -X -A -t -q -U postgres -d mep_restore -c "SELECT count(*) FROM pg_policies WHERE schemaname='public'" 2>/dev/null || true)"
echo "info  RLS policies in public after restore: ${pol:-unknown}"

if [ $fails -eq 0 ]; then echo "RESULT: restore verified"; exit 0; fi
echo "RESULT: $fails check(s) FAILED"
exit 1
