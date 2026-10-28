#!/usr/bin/env bash
# NAS 배포 스크립트 — NAS의 self-hosted runner가 실행한다 (docs/adr/2026-10-28-deploy-and-ops.md)
# 순서: 비밀값 준비 → 이미지 받기 → DB 기동·백업 → 마이그레이션 → 앱 교체 → 헬스체크 → 실패 시 이전 버전으로 되돌림
set -euo pipefail

TAG="${1:?사용법: deploy.sh <이미지 태그>}"
DATA_DIR="${TERRA_DATA_DIR:-/volume1/docker/terra-in-cognita}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$DATA_DIR/.env"
compose() { docker compose -p tic -f "$HERE/compose.yml" --env-file "$ENV_FILE" "$@"; }

# 컨테이너가 healthy가 될 때까지 기다린다 (2초 간격, 최대 $2회). 실패하면 로그를 보여준다.
wait_healthy() {
  local status=none
  for _ in $(seq 1 "$2"); do
    # 헬스체크가 없는 컨테이너는 inspect가 빈 줄을 찍고 실패한다 → 실패하면 none
    status="$(docker inspect -f '{{.State.Health.Status}}' "$1" 2>/dev/null)" || status=none
    [ "$status" = healthy ] && return 0
    sleep 2
  done
  echo "$1 헬스체크 실패 (상태: $status)"
  docker logs --tail 50 "$1" || true
  return 1
}

mkdir -p "$DATA_DIR/pgdata" "$DATA_DIR/backups"

# 1) 비밀값 파일이 없으면 처음 한 번 만든다 (git에는 절대 넣지 않음)
if [ ! -f "$ENV_FILE" ]; then
  umask 077
  printf 'POSTGRES_PASSWORD=%s\n' "$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')" > "$ENV_FILE"
  echo "새 비밀값 파일을 만들었습니다: $ENV_FILE"
fi

PREV_TAG="$(cat "$DATA_DIR/deployed-tag" 2>/dev/null || true)"
export TERRA_TAG="$TAG"

# 2) 이미지 받기
compose pull

# 3) DB 기동 후 준비될 때까지 대기 (최대 약 2분, 준비 안 되면 중단)
compose up -d db
wait_healthy tic-db 60

# 4) 배포 전 백업 (이전 배포가 있을 때)
if [ -n "$PREV_TAG" ]; then
  BACKUP="$DATA_DIR/backups/pre-$TAG-$(date +%Y%m%d-%H%M%S).dump"
  docker exec tic-db pg_dump -U terra -d terra -Fc > "$BACKUP"
  echo "백업: $BACKUP"
fi

# 5) 마이그레이션 — 새 이미지로 한 번 실행한다(앱 교체 전). 밀린 것을 트랜잭션 하나로 적용하므로
#    실패하면 DB는 그대로고, 앱도 바꾸지 않은 채 멈춘다. 되돌림(7단계)은 DB를 되돌리지 않는다
#    → 마이그레이션은 직전 버전 앱이 그대로 돌 수 있게 만든다 (docs/adr/2026-10-28-db-access-and-migrations.md)
compose run --rm --no-deps app node dist/migrate.js

# 6) 앱 교체 → 7) 헬스체크 (최대 약 90초). 컨테이너 생성 실패든 헬스체크 실패든 이전 버전으로
if ! compose up -d app || ! wait_healthy tic-app 45; then
  if [ -n "$PREV_TAG" ]; then
    echo "이전 버전으로 되돌립니다: $PREV_TAG"
    TERRA_TAG="$PREV_TAG" compose up -d app
  fi
  exit 1
fi

echo "$TAG" > "$DATA_DIR/deployed-tag"
# 8) 14일 지난 배포 전 백업 정리
find "$DATA_DIR/backups" -name 'pre-*.dump' -mtime +14 -delete
echo "배포 완료: $TAG"
