#!/usr/bin/env bash
# NAS 배포 스크립트 — NAS의 self-hosted runner가 실행한다 (docs/adr/2026-10-28-deploy-and-ops.md)
# 순서: 비밀값 준비(빠진 키만 추가) → 이미지 받기 → DB 기동·백업 → 마이그레이션 → 앱 교체 → 헬스체크 + 자동 점검 → 실패 시 이전 버전으로 되돌림
# 사용: deploy.sh <이미지 태그> [콘텐츠 버전] [콘텐츠 해시]
#   콘텐츠 버전·해시는 CI가 검사한 팩의 값(check 작업 출력). 주면 새 앱의 /health가 같은지 본다(ops/smoke.mjs)
set -euo pipefail

TAG="${1:?사용법: deploy.sh <이미지 태그> [콘텐츠 버전] [콘텐츠 해시]}"
EXPECT_CONTENT_VERSION="${2:-}"
EXPECT_CONTENT_HASH="${3:-}"
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

# 새 앱이 실제로 응답하는지 점검한다: /health(DB·콘텐츠 버전·해시) + WebSocket hello → welcome.
# 실행기에 node가 없어도 되게 컨테이너 안의 node로 돌린다(스크립트는 표준 입력으로 넘김)
smoke() {
  docker exec -i -e EXPECT_DB=ok -e "EXPECT_CONTENT_VERSION=$EXPECT_CONTENT_VERSION" \
    -e "EXPECT_CONTENT_HASH=$EXPECT_CONTENT_HASH" tic-app node --input-type=module - < "$HERE/smoke.mjs"
}

# 비밀값 파일(.env)에 키가 없으면 무작위 값($2바이트, 16진수)을 덧붙인다. 이미 있는 값은 바꾸지 않는다(값은 출력하지 않음)
ensure_secret() {
  local name="$1" bytes="$2"
  grep -q "^${name}=" "$ENV_FILE" && return 0
  # 마지막 줄에 줄바꿈이 없으면(손으로 고친 경우) 먼저 줄을 바꾼다
  if [ -s "$ENV_FILE" ] && [ -n "$(tail -c 1 "$ENV_FILE")" ]; then echo >> "$ENV_FILE"; fi
  printf '%s=%s\n' "$name" "$(head -c "$bytes" /dev/urandom | od -An -tx1 | tr -d ' \n')" >> "$ENV_FILE"
  echo "비밀값을 추가했습니다: $name ($ENV_FILE)"
}

mkdir -p "$DATA_DIR/pgdata" "$DATA_DIR/backups"

# 1) 비밀값 파일 준비 (git에는 절대 넣지 않음). 없으면 만들고, 빠진 키만 덧붙인다
#    - POSTGRES_PASSWORD: DB 비밀번호(24바이트)
#    - BETTER_AUTH_SECRET: 로그인 쿠키 서명 비밀값(32바이트 → 64자). 바꾸면 모든 로그인이 풀린다
if [ ! -f "$ENV_FILE" ]; then
  umask 077
  : > "$ENV_FILE"
  echo "새 비밀값 파일을 만들었습니다: $ENV_FILE"
fi
ensure_secret POSTGRES_PASSWORD 24
ensure_secret BETTER_AUTH_SECRET 32

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

# 6) 앱 교체 → 7) 헬스체크(최대 약 90초) + 자동 점검. 컨테이너 생성·헬스체크·점검 중 하나라도 실패하면 이전 버전으로.
#    콘텐츠 팩이 틀리면 앱이 시작하지 않아(코드 1) 헬스체크에서 걸린다
if ! compose up -d app || ! wait_healthy tic-app 45 || ! smoke; then
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
