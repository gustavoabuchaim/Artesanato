set -euo pipefail

: "${DATABASE_URL:?Missing DATABASE_URL}"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${OUT_DIR:-./backups}"
FILE="$OUT_DIR/backup-$TS.sql.gz"

mkdir -p "$OUT_DIR"

pg_dump "$DATABASE_URL" | gzip -9 > "$FILE"
echo "$FILE"

