#!/bin/bash
# Daily MySQL backup for Estimate Nepal
# Cron: 0 2 * * * /var/www/nepaliestimate/scripts/backup-db.sh >> /var/log/nepaliestimate-backup.log 2>&1

set -euo pipefail

BACKUP_DIR="/var/backups/nepaliestimate"
KEEP_DAYS=14

# Load env vars from production .env
ENV_FILE="/var/www/nepaliestimate/.env"
if [[ -f "$ENV_FILE" ]]; then
  # Extract DATABASE_URL value
  DB_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')
fi

# Parse mysql:// URL → host, port, user, pass, dbname
if [[ "${DB_URL:-}" =~ mysql://([^:]+):([^@]+)@([^:/]+):?([0-9]*)/([^\?]+) ]]; then
  DB_USER="${BASH_REMATCH[1]}"
  DB_PASS="${BASH_REMATCH[2]}"
  DB_HOST="${BASH_REMATCH[3]}"
  DB_PORT="${BASH_REMATCH[4]:-3306}"
  DB_NAME="${BASH_REMATCH[5]}"
else
  echo "[backup] ERROR: Could not parse DATABASE_URL. Aborting."
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "[backup] $(date) — dumping $DB_NAME to $FILE"

MYSQL_PWD="$DB_PASS" mysqldump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  --single-transaction \
  --routines \
  --triggers \
  --add-drop-table \
  "$DB_NAME" | gzip > "$FILE"

echo "[backup] $(date) — done. Size: $(du -sh "$FILE" | cut -f1)"

# Remove backups older than KEEP_DAYS days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$KEEP_DAYS -delete
echo "[backup] $(date) — pruned backups older than $KEEP_DAYS days"
