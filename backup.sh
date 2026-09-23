#!/bin/bash
set -e

# Requires SUPABASE_DB_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY to be set
# as environment variables before running this script.

BUCKET="bookjobs-backup-bucket"
FILENAME="backup-$(date +%F-%H%M).sql.gz"

echo "Dumping database..."
pg_dump "$SUPABASE_DB_URL" | gzip > "/tmp/$FILENAME"

echo "Uploading to S3..."
aws s3 cp "/tmp/$FILENAME" "s3://$BUCKET/daily/$FILENAME"

rm "/tmp/$FILENAME"
echo "Backup complete: $FILENAME"
