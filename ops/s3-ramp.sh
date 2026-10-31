#!/usr/bin/env bash
# S3 규모 계단 시험(NAS) — docs/adr/2026-10-31-s3-server-stage.md 6·7절, GitHub Actions s3-ramp가 부른다.
# 운영 컨테이너(tic-app·tic-db)는 건드리지 않는다. 같은 이미지로 짧게 사는 컨테이너(tic-s3-ramp)를 따로 띄우고,
# DB는 NAS 5440의 시험 DB 컨테이너(terra_testDB, 사용자가 비워도 된다고 함) 안에 시험용 DB·계정(s3ramp)을 새로 만든다.
# 다른 프로젝트 DB(sunplant-db, ks-frontier)는 쓰지 않는다. 공개 포트를 열지 않고, 끝나면 컨테이너·DB·계정을 지운다.
# 비밀값(DB 비밀번호, 인증 비밀값)은 실행할 때 만들고 로그에 찍지 않는다(GitHub 가리기 + 명령줄에 넣지 않음).
#
# 단계: prepare(DB·이미지·마이그레이션) → ramp(계단: 봇 수마다 새 컨테이너 → STEP_MINUTES 동안 지표 → SIGKILL 복구) → cleanup
# 환경 변수: S3_RAMP_STEPS(기본 1000,2000,5000,10000,20000,50000,100000), S3_RAMP_MINUTES(기본 3, 2~10),
#   S3_RAMP_TAG(비우면 지금 배포된 태그), S3_RAMP_DB_CONTAINER(기본 terra_testDB)
# 멈추는 조건: 이벤트 루프 p99 > 50ms(첫 1분 뺌), RSS > 900MB(컨테이너 상한 1GiB 가까움), 컨테이너가 죽거나 준비가 안 됨.
set -euo pipefail

MODE="${1:?mode: prepare | ramp | cleanup}"
DATA_DIR=/volume1/docker/terra-in-cognita
WORK="${RUNNER_TEMP:-/tmp}/s3-ramp"
SECRETS="${RUNNER_TEMP:-/tmp}/s3-ramp-secrets"
DB_CONTAINER="${S3_RAMP_DB_CONTAINER:-terra_testDB}"
APP=tic-s3-ramp
STEPS="${S3_RAMP_STEPS:-1000,2000,5000,10000,20000,50000,100000}"
MINUTES="${S3_RAMP_MINUTES:-3}"
P99_LIMIT_MS=50
RSS_LIMIT_MB=900
READY_TIMEOUT_S=300
BOTS_PER_MAP=2000

case "$STEPS" in '' | *[!0-9,]*) echo "S3_RAMP_STEPS는 숫자와 쉼표만" >&2; exit 1 ;; esac
case "$MINUTES" in '' | *[!0-9]*) echo "S3_RAMP_MINUTES는 2~10" >&2; exit 1 ;; esac
if [ "$MINUTES" -lt 2 ] || [ "$MINUTES" -gt 10 ]; then echo "S3_RAMP_MINUTES는 2~10" >&2; exit 1; fi
case "$DB_CONTAINER" in sunplant-db | *ks-frontier* | tic-db) echo "다른 프로젝트·운영 DB는 쓰지 않는다: $DB_CONTAINER" >&2; exit 1 ;; esac

TAG="${S3_RAMP_TAG:-}"
if [ -z "$TAG" ]; then TAG="$(cat "$DATA_DIR/deployed-tag")"; fi
case "$TAG" in '' | *[!A-Za-z0-9._-]*) echo "이미지 태그가 이상하다" >&2; exit 1 ;; esac
IMAGE="ghcr.io/riversun7/terra-in-cognita:$TAG"

# 시험 DB 컨테이너 안의 관리자 psql(컨테이너 안 소켓 접속, 비밀번호 없이). SQL은 표준 입력으로 넣는다
admin_psql() {
  docker exec -i "$DB_CONTAINER" sh -c 'psql -v ON_ERROR_STOP=1 -q -U "${POSTGRES_USER:-postgres}" -d postgres'
}

# 시험 컨테이너의 /health JSON(안 되면 빈 문자열)
health() {
  docker exec "$APP" node -e "fetch('http://127.0.0.1:4100/health').then(r=>r.text()).then(t=>process.stdout.write(t),()=>{})" 2>/dev/null || true
}

json_field() { sed -n "s/.*\"$1\":\"\{0,1\}\([^\",}]*\).*/\1/p" | head -n 1; }

# 준비될 때까지(world: ready) 기다린다. 걸린 ms를 찍는다. 안 되면 실패
wait_ready() {
  local started now body
  started=$(date +%s%3N)
  while true; do
    if [ "$(docker inspect -f '{{.State.Running}}' "$APP" 2>/dev/null || echo false)" != "true" ]; then return 1; fi
    body="$(health)"
    if [ "$(printf '%s' "$body" | json_field world)" = "ready" ]; then
      now=$(date +%s%3N)
      echo $((now - started))
      return 0
    fi
    now=$(date +%s%3N)
    if [ $((now - started)) -gt $((READY_TIMEOUT_S * 1000)) ]; then return 1; fi
    sleep 1
  done
}

start_app() {
  local bots="$1" maps="$2"
  # shellcheck disable=SC1091
  . "$SECRETS/env"
  docker rm -f "$APP" >/dev/null 2>&1 || true
  # 비밀값은 -e 이름만 넘긴다(값은 이 셸의 환경에서 읽힌다 → 명령줄·로그에 남지 않는다)
  DATABASE_URL="$S3_DATABASE_URL" BETTER_AUTH_SECRET="$S3_AUTH_SECRET" docker run -d --name "$APP" \
    --network "$S3_NET" --memory 1g --cpu-shares 512 \
    --label com.centurylinklabs.watchtower.enable=false \
    -e PORT=4100 -e DATABASE_URL -e BETTER_AUTH_SECRET \
    -e BETTER_AUTH_URL=https://s3-ramp.invalid -e AUTH_OPEN_SIGNUP=false \
    -e S1_TEST_BOTS="$bots" -e S1_TEST_MAPS="$maps" \
    -v "$DATA_DIR/planet-cache:/app/planet-cache:ro" \
    "$IMAGE" >/dev/null
}

case "$MODE" in
prepare)
  mkdir -p "$WORK" "$SECRETS"
  chmod 700 "$SECRETS"
  : >"$WORK/steps.tsv"
  if [ "$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null || echo false)" != "true" ]; then
    echo "시험 DB 컨테이너($DB_CONTAINER)가 돌고 있지 않다" >&2
    exit 1
  fi
  PW="$(od -An -tx1 -N16 /dev/urandom | tr -d ' \n')"
  SECRET="$(od -An -tx1 -N32 /dev/urandom | tr -d ' \n')"
  echo "::add-mask::$PW"
  echo "::add-mask::$SECRET"
  # 시험용 DB·계정을 비우고 새로 만든다(비밀번호는 16진수라 따옴표 문제 없음, 표준 입력으로만 넘긴다)
  printf '%s\n' \
    "DROP DATABASE IF EXISTS s3ramp WITH (FORCE);" \
    "DROP ROLE IF EXISTS s3ramp;" \
    "CREATE ROLE s3ramp LOGIN PASSWORD '$PW';" \
    "CREATE DATABASE s3ramp OWNER s3ramp;" | admin_psql
  NET="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' "$DB_CONTAINER" | head -n 1)"
  if [ -z "$NET" ] || [ "$NET" = "host" ]; then echo "시험 DB 네트워크를 쓸 수 없다($NET)" >&2; exit 1; fi
  HOST="$(docker inspect -f "{{(index .NetworkSettings.Networks \"$NET\").IPAddress}}" "$DB_CONTAINER")"
  CPORT="$(docker port "$DB_CONTAINER" | sed -n 's#^\([0-9]*\)/tcp -> .*:5440$#\1#p' | head -n 1)"
  CPORT="${CPORT:-5432}"
  (
    umask 077
    {
      echo "S3_NET='$NET'"
      echo "S3_DATABASE_URL='postgres://s3ramp:$PW@$HOST:$CPORT/s3ramp'"
      echo "S3_AUTH_SECRET='$SECRET'"
    } >"$SECRETS/env"
  )
  docker pull -q "$IMAGE" >/dev/null
  # shellcheck disable=SC1091
  . "$SECRETS/env"
  DATABASE_URL="$S3_DATABASE_URL" docker run --rm --network "$S3_NET" -e DATABASE_URL "$IMAGE" node dist/migrate.js
  {
    echo "시각: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "이미지: $IMAGE"
    echo "CPU: $(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2- | sed 's/^ //') ($(grep -c '^processor' /proc/cpuinfo)스레드)"
    echo "메모리(호스트): $(awk '/MemTotal/ {printf "%d MB", $2/1024}' /proc/meminfo)"
    echo "컨테이너: 메모리 상한 1GiB, CPU 상한 없음(커널 4.4, cpu_shares 512), 경로 워커 1"
    echo "계단마다 ${MINUTES}분, 봇은 2차맵마다 최대 ${BOTS_PER_MAP}개"
  } >"$WORK/meta.txt"
  ;;

ramp)
  for BOTS in ${STEPS//,/ }; do
    MAPS=$(((BOTS + BOTS_PER_MAP - 1) / BOTS_PER_MAP))
    if [ "$MAPS" -gt 64 ]; then MAPS=64; fi
    echo "== 계단: 봇 $BOTS, 2차맵 $MAPS"
    start_app "$BOTS" "$MAPS"
    STATE=ok
    BOOT_MS=""
    if ! BOOT_MS="$(wait_ready)"; then STATE=died; BOOT_MS=""; fi
    if [ "$STATE" = ok ]; then sleep $((MINUTES * 60 + 5)); fi
    docker logs "$APP" 2>&1 | grep '"metric":"server"' >"$WORK/metrics-$BOTS.log" || true
    RUNNING="$(docker inspect -f '{{.State.Running}}' "$APP" 2>/dev/null || echo false)"
    if [ "$RUNNING" != "true" ]; then STATE=died; fi
    # 첫 줄(부팅이 든 1분)을 뺀 최대값
    P99="$(sed -n 's/.*"eventLoopP99Ms":\([0-9.]*\).*/\1/p' "$WORK/metrics-$BOTS.log" | awk 'NR>1 && $1>m {m=$1} END {print m+0}')"
    RSS="$(sed -n 's/.*"rssMb":\([0-9.]*\).*/\1/p' "$WORK/metrics-$BOTS.log" | awk '$1>m {m=$1} END {print m+0}')"
    if [ "$STATE" = ok ] && awk -v v="$P99" -v l="$P99_LIMIT_MS" 'BEGIN {exit !(v > l)}'; then STATE=loop; fi
    if [ "$STATE" = ok ] && awk -v v="$RSS" -v l="$RSS_LIMIT_MB" 'BEGIN {exit !(v > l)}'; then STATE=memory; fi
    RECOVERY_MS=""
    RECOVERY_BOOT=""
    ISSUES=""
    if [ "$STATE" = ok ]; then
      # 그만큼의 유닛 행에서 부팅 복구: SIGKILL → 다시 켜기 → 준비까지
      docker kill -s KILL "$APP" >/dev/null
      KILLED=$(date +%s%3N)
      docker start "$APP" >/dev/null
      if wait_ready >/dev/null; then
        RECOVERY_MS=$(($(date +%s%3N) - KILLED))
        BODY="$(health)"
        RECOVERY_BOOT="$(printf '%s' "$BODY" | json_field worldBootMs)"
        ISSUES="$(printf '%s' "$BODY" | json_field worldIssues)"
        docker exec "$APP" node dist/cli.js check-world || ISSUES="${ISSUES:-0}+check-world"
      else
        STATE=died
      fi
    fi
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$BOTS" "$MAPS" "$BOOT_MS" "$STATE" "$RECOVERY_MS" "$RECOVERY_BOOT" "$ISSUES" >>"$WORK/steps.tsv"
    echo "   결과 $STATE, 부팅 ${BOOT_MS:-–}ms, p99 최대 ${P99}ms, RSS 최대 ${RSS}MB, SIGKILL 복구 ${RECOVERY_MS:-–}ms"
    if [ "$STATE" != ok ]; then break; fi
  done
  docker rm -f "$APP" >/dev/null 2>&1 || true
  # 요약(시험 이미지의 node로)
  docker run --rm -v "$WORK:/ramp:ro" -v "$PWD/ops:/ops:ro" --entrypoint node "$IMAGE" /ops/s3-ramp-summary.mjs /ramp \
    | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
  ;;

cleanup)
  docker rm -f "$APP" >/dev/null 2>&1 || true
  if [ "$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null || echo false)" = "true" ]; then
    printf '%s\n' "DROP DATABASE IF EXISTS s3ramp WITH (FORCE);" "DROP ROLE IF EXISTS s3ramp;" | admin_psql || true
  fi
  rm -rf "$SECRETS"
  ;;

*)
  echo "mode: prepare | ramp | cleanup" >&2
  exit 1
  ;;
esac
