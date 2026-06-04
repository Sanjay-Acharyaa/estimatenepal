#!/bin/bash
# Daily database backup: dumps MySQL → gzips → uploads to MinIO
# Cron: 0 2 * * * /path/to/scripts/backup.sh >> /var/log/nepaliestimate-backup.log 2>&1

set -e

DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="/tmp/nepaliestimate_${DATE}.sql.gz"

echo "[$(date)] Starting backup..."

# Dump and compress
mysqldump \
  --host="${MYSQL_HOST:-localhost}" \
  --port="${MYSQL_PORT:-3306}" \
  --user="${MYSQL_USER:-root}" \
  --password="${MYSQL_PASSWORD:-root}" \
  --single-transaction \
  --routines \
  --triggers \
  nepaliestimate | gzip > "$BACKUP_FILE"

# Upload to MinIO / S3-compatible storage
mc alias set minio "${STORAGE_ENDPOINT:-http://localhost:9000}" \
  "${STORAGE_ACCESS_KEY:-minioadmin}" "${STORAGE_SECRET_KEY:-minioadmin}" --quiet

mc cp "$BACKUP_FILE" "minio/nepaliestimate-backups/$(basename $BACKUP_FILE)"

# Retain only last 30 days of backups
mc rm --recursive --force --older-than 30d "minio/nepaliestimate-backups/" 2>/dev/null || true

rm -f "$BACKUP_FILE"
echo "[$(date)] Backup complete: $(basename $BACKUP_FILE)"
