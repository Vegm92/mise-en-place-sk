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
#   BACKUP_RETENTION_DAILY     newest N backups to keep (default 30)
#   BACKUP_RETENTION_MONTHLY   plus the oldest backup of each of the newest N months (default 12)
#   BACKUP_ROTATE              1 (default) deletes backups outside the retention; 0 disables rotation
#   BACKUP_DRY_RUN             1 = print what would be deleted/uploaded, change nothing remote
#
# Output per run (name = mep-YYYY-MM-DDTHHMMSSZ.dump[.age]): the dump plus a .counts sidecar with
# per-table row counts, which restore-check.sh uses to prove the restore is complete.
# Needs: pg_dump (major >= server), psql, and aws CLI when BACKUP_S3_BUCKET is set.
# Rotation only ever deletes names matching mep-<timestamp>.dump(.age)(.counts) under the prefix.
# The dump contains customer data (GDPR): keep the destination private; prefer BACKUP_AGE_RECIPIENT.
set -euo pipefail

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'; exit 0; fi

: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is not set}"
LOCAL_DIR="${BACKUP_LOCAL_DIR:-./backups}"
BUCKET="${BACKUP_S3_BUCKET:-}"
PREFIX="${BACKUP_S3_PREFIX:-mise-backups}"
KEEP_DAILY="${BACKUP_RETENTION_DAILY:-30}"
KEEP_MONTHLY="${BACKUP_RETENTION_MONTHLY:-12}"
ROTATE="${BACKUP_ROTATE:-1}"
DRY="${BACKUP_DRY_RUN:-0}"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}"

case "$KEEP_DAILY$KEEP_MONTHLY" in *[!0-9]*|"") echo "retention values must be integers" >&2; exit 2;; esac
[ "$KEEP_DAILY" -ge 1 ] || { echo "BACKUP_RETENTION_DAILY must be >= 1" >&2; exit 2; }
command -v pg_dump >/dev/null || { echo "pg_dump not found" >&2; exit 2; }
command -v psql >/dev/null || { echo "psql not found" >&2; exit 2; }
if [ -n "$BUCKET" ]; then command -v aws >/dev/null || { echo "aws CLI not found (needed for BACKUP_S3_BUCKET)" >&2; exit 2; }; fi
if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then command -v age >/dev/null || { echo "age not found (needed for BACKUP_AGE_RECIPIENT)" >&2; exit 2; }; fi

aws_s3() {
	if [ -n "${BACKUP_S3_ENDPOINT_URL:-}" ]; then aws --endpoint-url "$BACKUP_S3_ENDPOINT_URL" s3 "$@"; else aws s3 "$@"; fi
}

mkdir -p "$LOCAL_DIR"
umask 077
stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
base="mep-$stamp"
dump="$LOCAL_DIR/$base.dump"
counts="$LOCAL_DIR/$base.dump.counts"

COUNT_SQL="SELECT n.nspname || '.' || c.relname || ' ' || (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p') AND NOT c.relispartition AND n.nspname IN ('public','drizzle','pgboss')
ORDER BY 1;"

echo "[1/5] row counts"
printf '%s\n' "$COUNT_SQL" | psql -X -A -t -q -v ON_ERROR_STOP=1 "$BACKUP_DATABASE_URL" > "$counts"
[ -s "$counts" ] || { echo "count query returned nothing; aborting" >&2; rm -f "$counts"; exit 1; }

echo "[2/5] pg_dump --format=custom"
pg_dump --format=custom --no-owner --no-privileges --dbname "$BACKUP_DATABASE_URL" --file "$dump"

echo "[3/5] verify the archive is readable"
[ -s "$dump" ] || { echo "dump is empty" >&2; rm -f "$dump" "$counts"; exit 1; }
pg_restore --list "$dump" > /dev/null
grep -q '^drizzle\.__drizzle_migrations ' "$counts" || echo "WARNING: drizzle.__drizzle_migrations not in counts (is this the right database?)" >&2

final="$dump"
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
	fi
else
	echo "[5/5] local-only: kept in $LOCAL_DIR"
fi
printf 'backup: %s (%s bytes)\n' "$(basename "$final")" "$(wc -c < "$final" | tr -d ' ')"

select_deletions() {
	awk -v kd="$KEEP_DAILY" -v km="$KEEP_MONTHLY" '
		/^mep-[0-9-]+T[0-9]+Z\.dump(\.age)?$/ { names[++n] = $0 }
		END {
			for (i = 1; i <= n; i++)
				for (j = i + 1; j <= n; j++)
					if (names[j] > names[i]) { t = names[i]; names[i] = names[j]; names[j] = t }
			for (i = 1; i <= n; i++) {
				m = substr(names[i], 5, 7)
				if (!(m in oldest) || names[i] < oldest[m]) oldest[m] = names[i]
				if (!(m in seen)) { seen[m] = 1; order[++nm] = m }
			}
			for (i = 1; i <= nm && i <= km; i++) keepmonth[oldest[order[i]]] = 1
			for (i = 1; i <= n; i++)
				if (i > kd && !(names[i] in keepmonth)) print names[i]
		}'
}

if [ "$ROTATE" = "1" ]; then
	echo "rotation: keep newest $KEEP_DAILY + oldest-of-month for newest $KEEP_MONTHLY months"
	if [ -n "$BUCKET" ]; then
		listing="$(aws_s3 ls "s3://$BUCKET/$PREFIX/" | awk '{print $NF}')"
	else
		listing="$(ls -1 "$LOCAL_DIR")"
	fi
	victims="$(printf '%s\n' "$listing" | select_deletions || true)"
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
