# lib-pgurl.sh: sourced by the ops scripts. Keeps database URLs (and their passwords) out of argv and out of messages.
#
#   pgurl_init                 creates a private 0700 temp dir (pgurl_cleanup removes it)
#   pgurl_load PREFIX URL      parses URL, stores PREFIX_{HOST,PORT,USER,DB,SSL,PASSFILE} and writes a 0600 passfile.
#                              On a malformed URL prints a generic message (never any part of the URL), returns 1.
#   pgurl_run PREFIX cmd...    runs cmd with PGHOST/PGPORT/PGUSER/PGDATABASE/PGSSLMODE/PGPASSFILE for that connection.
#   redact                     stdin->stdout filter masking anything shaped like scheme://user:pass@
# The password lives only in the 0600 passfile inside the temp dir: never in argv, never in the environment.

_PGURL_DIR=""

pgurl_init() {
	[ -n "$_PGURL_DIR" ] && return 0
	_PGURL_DIR="$(umask 077; mktemp -d)" || return 1
}

pgurl_cleanup() {
	[ -n "$_PGURL_DIR" ] && rm -rf "$_PGURL_DIR"
	_PGURL_DIR=""
}

_pgurl_decode() {
	local s="$1" out="" rest ch
	while [[ "$s" == *%* ]]; do
		out+="${s%%\%*}"; rest="${s#*%}"
		if [[ "$rest" =~ ^([0-9A-Fa-f]{2})(.*)$ ]]; then
			printf -v ch '%b' "\\x${BASH_REMATCH[1]}"; out+="$ch"; s="${BASH_REMATCH[2]}"
		else
			return 1
		fi
	done
	printf '%s' "$out$s"
}

_pgurl_esc() { local v="${1//\\/\\\\}"; printf '%s' "${v//:/\\:}"; }

pgurl_load() {
	local p="$1" url="$2" user pass host port db query dec_user dec_pass ssl="" f
	local re='^postgres(ql)?://([^:@/]+)(:([^@]*))?@(\[[0-9a-fA-F:]+\]|[^:/?@]+)(:([0-9]+))?/([^?]+)(\?(.*))?$'
	local bad="malformed database URL (details withheld to avoid leaking credentials)"
	[[ "$url" =~ $re ]] || { echo "$bad" >&2; return 1; }
	user="${BASH_REMATCH[2]}"; pass="${BASH_REMATCH[4]}"; host="${BASH_REMATCH[5]}"
	port="${BASH_REMATCH[7]:-5432}"; db="${BASH_REMATCH[8]}"; query="${BASH_REMATCH[10]}"
	host="${host#[}"; host="${host%]}"
	dec_user="$(_pgurl_decode "$user")" && dec_pass="$(_pgurl_decode "$pass")" && db="$(_pgurl_decode "$db")" || { echo "$bad" >&2; return 1; }
	pgurl_init || return 1
	if [[ "$query" =~ (^|\&)sslmode=([a-z-]+) ]]; then ssl="${BASH_REMATCH[2]}"; fi
	f="$_PGURL_DIR/$p.pgpass"
	( umask 077; printf '%s:%s:%s:%s:%s\n' "$(_pgurl_esc "$host")" "$port" "$(_pgurl_esc "$db")" "$(_pgurl_esc "$dec_user")" "$(_pgurl_esc "$dec_pass")" > "$f" )
	chmod 600 "$f"
	printf -v "${p}_HOST" '%s' "$host"; printf -v "${p}_PORT" '%s' "$port"
	printf -v "${p}_USER" '%s' "$dec_user"; printf -v "${p}_DB" '%s' "$db"
	printf -v "${p}_SSL" '%s' "$ssl"; printf -v "${p}_PASSFILE" '%s' "$f"
}

pgurl_run() {
	local p="$1"; shift
	local h="${p}_HOST" po="${p}_PORT" u="${p}_USER" d="${p}_DB" s="${p}_SSL" f="${p}_PASSFILE"
	local sslenv=()
	[ -n "${!s}" ] && sslenv=("PGSSLMODE=${!s}")
	env PGHOST="${!h}" PGPORT="${!po}" PGUSER="${!u}" PGDATABASE="${!d}" PGPASSFILE="${!f}" "${sslenv[@]}" "$@"
}

redact() { sed -E 's#([a-zA-Z][a-zA-Z0-9+.-]*://)[^@/[:space:]]*@#\1***@#g'; }
