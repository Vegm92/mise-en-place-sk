#!/usr/bin/env bash
# verify-runtime-cutover.sh: checks that the mep_runtime role boundary holds (#464, ADR-030).
#
# Usage:
#   RUNTIME_URL='postgres://mep_runtime:...@host:port/db' \
#   OWNER_URL='postgres://<owner>:...@host:port/db' \
#     scripts/ops/verify-runtime-cutover.sh
#
# Environment (names only; values are never printed):
#   RUNTIME_URL  connection string of the mep_runtime role (public host when run from a laptop)
#   OWNER_URL    connection string of the owner role; used read-only to pick a restaurant and expected counts
#
# Checks (runbook step 1.3):
#   1 DML works as mep_runtime (with app.admin)
#   2 CREATE TABLE is refused
#   3 ALTER TABLE on an app table is refused
#   4 unscoped SELECT on invoices returns 0 rows although rows exist (RLS active)
#   5 scoped SELECT on invoices returns exactly that tenant's rows
#
# Exit code: 0 when every check is OK, 1 when any check FAILs, 2 on usage/connection errors.
# Writes nothing: the two DDL probes run inside a transaction that is always rolled back.
set -u

PSQL_BASE=(psql -X -A -t -q -v ON_ERROR_STOP=1)
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}"
fails=0

usage() { sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
[ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ] && usage
[ -n "${RUNTIME_URL:-}" ] || { echo "RUNTIME_URL is not set" >&2; exit 2; }
[ -n "${OWNER_URL:-}" ] || { echo "OWNER_URL is not set" >&2; exit 2; }
command -v psql >/dev/null 2>&1 || { echo "psql not found" >&2; exit 2; }

run_rt() { "${PSQL_BASE[@]}" "$RUNTIME_URL" 2>&1; }
run_ow() { "${PSQL_BASE[@]}" "$OWNER_URL" 2>&1; }

report() {
	if [ "$1" = "OK" ]; then
		printf 'OK    %s\n' "$2"
	else
		printf 'FAIL  %s\n' "$2"
		[ -n "${3:-}" ] && printf '      %s\n' "$3"
		fails=$((fails + 1))
	fi
}

who=$(printf 'SELECT current_user;\n' | run_rt) || { echo "cannot connect with RUNTIME_URL" >&2; exit 2; }
owner_who=$(printf 'SELECT current_user;\n' | run_ow) || { echo "cannot connect with OWNER_URL" >&2; exit 2; }
echo "runtime connection role: $who | owner connection role: $owner_who"
if [ "$who" = "$owner_who" ]; then
	echo "RUNTIME_URL and OWNER_URL connect as the same role; RLS cannot be active." >&2
fi

out=$(printf "SELECT set_config('app.admin','true',false);\nSELECT count(*) FROM restaurants;\n" | run_rt)
rc=$?
last=$(printf '%s\n' "$out" | tail -n1)
if [ $rc -eq 0 ] && [[ "$last" =~ ^[0-9]+$ ]]; then
	report OK "1 DML as mep_runtime with app.admin (restaurants: $last rows)"
else
	report FAIL "1 DML as mep_runtime with app.admin" "$(printf '%s' "$out" | head -n2 | tr '\n' ' ')"
fi

out=$(printf 'BEGIN;\nCREATE TABLE mep_verify_should_fail (id int);\nROLLBACK;\n' | run_rt)
if printf '%s' "$out" | grep -qi 'permission denied'; then
	report OK "2 CREATE TABLE refused (permission denied)"
else
	report FAIL "2 CREATE TABLE was not refused" "$(printf '%s' "$out" | head -n2 | tr '\n' ' ')"
fi

out=$(printf 'BEGIN;\nALTER TABLE restaurants ADD COLUMN mep_verify_should_fail text;\nROLLBACK;\n' | run_rt)
if printf '%s' "$out" | grep -qi 'must be owner'; then
	report OK "3 ALTER TABLE restaurants refused (must be owner)"
else
	report FAIL "3 ALTER TABLE was not refused" "$(printf '%s' "$out" | head -n2 | tr '\n' ' ')"
fi

pick=$(printf 'SELECT restaurant_id, count(*) FROM invoices GROUP BY restaurant_id ORDER BY count(*) DESC LIMIT 1;\n' | "${PSQL_BASE[@]}" -F ' ' "$OWNER_URL" 2>&1)
rid=$(printf '%s' "$pick" | awk '{print $1}')
expected=$(printf '%s' "$pick" | awk '{print $2}')
total=$(printf 'SELECT count(*) FROM invoices;\n' | run_ow)

if ! [[ "$rid" =~ ^[0-9a-fA-F-]{36}$ ]] || ! [[ "$expected" =~ ^[0-9]+$ ]]; then
	report FAIL "4 unscoped read of invoices" "no invoices found through OWNER_URL, so RLS cannot be demonstrated (create one test invoice and re-run)"
	report FAIL "5 scoped read of invoices" "skipped: no tenant with invoices"
else
	out=$(printf 'SELECT count(*) FROM invoices;\n' | run_rt)
	if [ "$out" = "0" ]; then
		report OK "4 unscoped read of invoices returns 0 (owner sees $total): RLS active"
	else
		report FAIL "4 unscoped read of invoices returned '$out' (owner sees $total)" "RLS is not isolating: DATABASE_URL is still privileged or the policies are missing"
	fi
	out=$(printf "SELECT set_config('app.restaurant_id','%s',false);\nSELECT count(*) FROM invoices;\n" "$rid" | run_rt)
	last=$(printf '%s\n' "$out" | tail -n1)
	if [ "$last" = "$expected" ]; then
		report OK "5 scoped read returns the tenant's $expected invoices"
	else
		report FAIL "5 scoped read returned '$last', expected $expected" "$(printf '%s' "$out" | head -n2 | tr '\n' ' ')"
	fi
fi

if [ $fails -eq 0 ]; then
	echo "RESULT: all 5 checks OK"
	exit 0
fi
echo "RESULT: $fails check(s) FAILED"
exit 1
