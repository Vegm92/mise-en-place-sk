#!/usr/bin/env bash
# pg-backup.sh: logical backup of the production Postgres to an S3-compatible bucket, with rotation.
#
# Usage:
#   BACKUP_DATABASE_URL=... BACKUP_S3_BUCKET=... scripts/ops/pg-backup.sh
#   BACKUP_LOCAL_DIR=./backups BACKUP_DATABASE_URL=... scripts/ops/pg-backup.sh   (local only, no upload)
#
# Environment (names only; values are never printed):
#   BACKUP_DATABASE_URL        source database (read-only: pg_dump and count queries). Required.
#   BACKUP_S3_BUCKET           destination bucket. Unset = local-only backup in BACKUP_LOCAL_DIR.
#   BACKUP_S3_PREFIX           key prefix inside the bucket (default: mise-backups)
#   BACKUP_S3_ENDPOINT_URL     S3-compatible endpoint (R2, B2, MinIO...); unset = AWS
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION   standard AWS CLI credentials for the destination
#   BACKUP_LOCAL_DIR           staging/local directory (default: ./backups)
#   BACKUP_AGE_RECIPIENT       optional age public key: encrypts the dump (file gets .age suffix); needs `age`
#   BACKUP_RETENTION_DAILY     keep the newest backup of each of the newest N calendar DAYS (default 30)
#   BACKUP_RETENTION_MONTHLY   plus the oldest backup of each of the newest N months (default 12)
#   BACKUP_ROTATE              1 (default) deletes backups outside the retention; 0 disables rotation
#   BACKUP_DRY_RUN             1 = print what would be deleted/uploaded, change nothing remote
#   BACKUP_KEEP_LOCAL          1 = keep the local dump after a verified S3 upload (default: delete it)
#
# Output per run (name = mep-YYYY-MM-DDTHHMMSSZ.dump[.age]): the dump plus a .counts sidecar with
# per-table row counts, which restore-check.sh uses to prove the restore is complete.
# Needs: pg_dump (major >= server), psql, and aws CLI when BACKUP_S3_BUCKET is set.
# Rotation only ever deletes names matching mep-<timestamp>.dump(.age)(.counts) under the prefix.
# The dump contains customer data (GDPR): keep the destination private; prefer BACKUP_AGE_RECIPIENT.
# The database URL is never passed in argv (it becomes PGHOST/PGUSER/... plus a private 0600 passfile).
# The dump omits grants/owners (--no-privileges --no-owner): after a disaster restore into a fresh database,
# re-run create-runtime-role.sql to recreate mep_runtime and its grants. The .counts sidecar is NOT encrypted.
# Known limit: row counts and the dump are two separate snapshots, so a busy source can show small drift.
set -euo pipefail

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 {exit}' "$0"; exit 0; fi

here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib-pgurl.sh
. "$here/lib-pgurl.sh"

: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is not set}"
LOCAL_DIR="${BACKUP_LOCAL_DIR:-./backups}"
BUCKET="${BACKUP_S3_BUCKET:-}"
PREFIX="${BACKUP_S3_PREFIX:-mise-backups}"
PREFIX="${PREFIX#/}"; PREFIX="${PREFIX%/}"
KEEP_LOCAL="${BACKUP_KEEP_LOCAL:-0}"
KEEP_DAILY="${BACKUP_RETENTION_DAILY:-30}"
KEEP_MONTHLY="${BACKUP_RETENTION_MONTHLY:-12}"
ROTATE="${BACKUP_ROTATE:-1}"
DRY="${BACKUP_DRY_RUN:-0}"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}"

case "$KEEP_DAILY$KEEP_MONTHLY" in *[!0-9]*|"") echo "retention values must be integers" >&2; exit 2;; esac
[ "$KEEP_DAILY" -ge 1 ] || { echo "BACKUP_RETENTION_DAILY must be >= 1" >&2; exit 2; }
command -v pg_dump >/dev/null || { echo "pg_dump not found" >&2; exit 2; }
command -v psql >/dev/null || { echo "psql not found" >&2; exit 2; }
command -v pg_restore >/dev/null || { echo "pg_restore not found" >&2; exit 2; }
if [ -n "$BUCKET" ]; then command -v aws >/dev/null || { echo "aws CLI not found (needed for BACKUP_S3_BUCKET)" >&2; exit 2; }; fi
if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then command -v age >/dev/null || { echo "age not found (needed for BACKUP_AGE_RECIPIENT)" >&2; exit 2; }; fi

aws_s3() {
	if [ -n "${BACKUP_S3_ENDPOINT_URL:-}" ]; then aws --endpoint-url "$BACKUP_S3_ENDPOINT_URL" s3 "$@"; else aws s3 "$@"; fi
}

umask 077
mkdir -p "$LOCAL_DIR"
pgurl_load SRC "$BACKUP_DATABASE_URL" || exit 2
unset BACKUP_DATABASE_URL
stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
base="mep-$stamp"
dump="$LOCAL_DIR/$base.dump"
counts="$LOCAL_DIR/$base.dump.counts"
finished=0
cleanup() {
	pgurl_cleanup
	if [ "$finished" -ne 1 ]; then rm -f "$dump" "$dump.age" "$counts" "$dump.age.counts"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

COUNT_SQL="SELECT n.nspname || '.' || c.relname || ' ' || (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p') AND NOT c.relispartition AND n.nspname IN ('public','drizzle','pgboss')
ORDER BY 1;"

echo "[1/5] row counts"
printf '%s\n' "$COUNT_SQL" | pgurl_run SRC psql -X -A -t -q -v ON_ERROR_STOP=1 > "$counts" 2> >(redact >&2) || { echo "count query failed; aborting" >&2; exit 1; }
[ -s "$counts" ] || { echo "count query returned nothing; aborting" >&2; exit 1; }

echo "[2/5] pg_dump --format=custom"
pgurl_run SRC pg_dump --format=custom --no-owner --no-privileges --file "$dump" 2> >(redact >&2)

echo "[3/5] verify the archive is readable"
[ -s "$dump" ] || { echo "dump is empty" >&2; exit 1; }
pg_restore --list "$dump" > /dev/null
if ! grep -q '^drizzle\.__drizzle_migrations ' "$counts"; then
	echo "FATAL: drizzle.__drizzle_migrations not in the counts: this is not the mise database. Nothing uploaded, nothing rotated." >&2
	exit 1
fi

final="$dump"
uploaded=0
if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
	echo "[4/5] encrypt with age"
	age -r "$BACKUP_AGE_RECIPIENT" -o "$dump.age" "$dump"
	rm -f "$dump"
	final="$dump.age"
	mv "$counts" "$final.counts"
	counts="$final.counts"
else
	echo "[4/5] encryption skipped (BACKUP_AGE_RECIPIENT not set)"
fi

if [ -n "$BUCKET" ]; then
	echo "[5/5] upload to s3://$BUCKET/$PREFIX/"
	if [ "$DRY" = "1" ]; then
		echo "DRY RUN: would upload $(basename "$final") and $(basename "$counts")"
	else
		aws_s3 cp --only-show-errors "$final" "s3://$BUCKET/$PREFIX/$(basename "$final")"
		aws_s3 cp --only-show-errors "$counts" "s3://$BUCKET/$PREFIX/$(basename "$counts")"
		# verify: the remote object must exist with the same byte size before the local copy is removed
		for f in "$final" "$counts"; do
			remote_size="$(aws_s3 ls "s3://$BUCKET/$PREFIX/$(basename "$f")" | awk -v n="$(basename "$f")" '$NF == n {print $3}' | head -n1)"
			[ "$remote_size" = "$(wc -c < "$f" | tr -d ' ')" ] || { echo "upload verification failed for $(basename "$f"); local copy kept, no rotation" >&2; finished=1; exit 1; }
		done
		uploaded=1
	fi
else
	echo "[5/5] local-only: kept in $LOCAL_DIR"
fi
backup_name="$(basename "$final")"
printf 'backup: %s (%s bytes)\n' "$backup_name" "$(wc -c < "$final" | tr -d ' ')"
if [ "$uploaded" = "1" ] && [ "$KEEP_LOCAL" != "1" ]; then
	rm -f "$final" "$counts"
	echo "local plaintext/staging copy removed after verified upload"
fi
finished=1

select_deletions() {
	awk -v kd="$KEEP_DAILY" -v km="$KEEP_MONTHLY" '
		/^mep-[0-9-]+T[0-9]+Z\.dump(\.age)?$/ { names[++n] = $0 }
		END {
			for (i = 1; i <= n; i++)
				for (j = i + 1; j <= n; j++)
					if (names[j] > names[i]) { t = names[i]; names[i] = names[j]; names[j] = t }
			for (i = 1; i <= n; i++) {
				d = substr(names[i], 5, 10)
				if (!(d in dayseen)) { dayseen[d] = 1; if (++nd <= kd) keepday[names[i]] = 1 }
				m = substr(names[i], 5, 7)
				if (!(m in oldest) || names[i] < oldest[m]) oldest[m] = names[i]
				if (!(m in seen)) { seen[m] = 1; order[++nm] = m }
			}
			for (i = 1; i <= nm && i <= km; i++) keepmonth[oldest[order[i]]] = 1
			for (i = 1; i <= n; i++)
				if (!(names[i] in keepday) && !(names[i] in keepmonth)) print names[i]
		}'
}

if [ "$ROTATE" = "1" ]; then
	echo "rotation: keep newest copy of each of the newest $KEEP_DAILY days + oldest-of-month for newest $KEEP_MONTHLY months"
	if [ -n "$BUCKET" ]; then
		listing="$(aws_s3 ls "s3://$BUCKET/$PREFIX/" | awk '{print $NF}')"
	else
		listing="$(find "$LOCAL_DIR" -maxdepth 1 -type f -size +0 -printf '%f\n')"
	fi
	# the backup just taken always counts (dry-run does not upload it), and must be the newest or we refuse to rotate
	listing="$(printf '%s\n%s\n' "$listing" "$backup_name" | sort -u)"
	if [ "$(printf '%s\n' "$listing" | grep -E '^mep-[0-9-]+T[0-9]+Z\.dump(\.age)?$' | sort | tail -n1)" != "$backup_name" ]; then
		echo "rotation skipped: the new backup is not the newest by name (host clock wrong?)" >&2
		echo "done"; exit 0
	fi
	victims="$(printf '%s\n' "$listing" | select_deletions)" || { echo "rotation skipped: could not compute deletions" >&2; echo "done"; exit 0; }
	victims="$(printf '%s\n' "$victims" | grep -vxF "$backup_name" || true)"
	if [ -z "$victims" ]; then
		echo "rotation: nothing to delete"
	else
		while IFS= read -r name; do
			[ -n "$name" ] || continue
			if [ "$DRY" = "1" ]; then echo "DRY RUN: would delete $name (+ .counts)"; continue; fi
			if [ -n "$BUCKET" ]; then
				aws_s3 rm --only-show-errors "s3://$BUCKET/$PREFIX/$name"
				aws_s3 rm --only-show-errors "s3://$BUCKET/$PREFIX/$name.counts" || true
			else
				rm -f -- "$LOCAL_DIR/$name" "$LOCAL_DIR/$name.counts"
			fi
			echo "deleted $name"
		done <<< "$victims"
	fi
fi
echo "done"
