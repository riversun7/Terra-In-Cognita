#!/usr/bin/env bash
# NAS DB 매일 백업 — nas-backup 워크플로가 실행한다 (PLAN 9.5, docs/adr/2026-10-28-deploy-and-ops.md)
# 배포 직전 백업(pre-*.dump)은 deploy.sh가 따로 만든다. 이 스크립트는 daily-*.dump를 만든다.
set -euo pipefail
umask 077 # 백업 파일은 NAS의 다른 사용자가 읽지 못하게

DATA_DIR="${TERRA_DATA_DIR:-/volume1/docker/terra-in-cognita}"
KEEP_DAYS="${TERRA_BACKUP_KEEP_DAYS:-14}"
OUT="$DATA_DIR/backups/daily-$(date +%Y%m%d-%H%M%S).dump"

mkdir -p "$DATA_DIR/backups"
docker exec tic-db pg_dump -U terra -d terra -Fc > "$OUT"

# 만든 파일의 목차를 읽어 본다 (깨진 백업이면 여기서 실패)
docker exec -i tic-db pg_restore --list < "$OUT" > /dev/null
echo "백업: $OUT ($(du -h "$OUT" | cut -f1))"

# 오래된 매일 백업 정리
find "$DATA_DIR/backups" -name 'daily-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "보관 중인 백업: $(find "$DATA_DIR/backups" -name '*.dump' | wc -l)개"
