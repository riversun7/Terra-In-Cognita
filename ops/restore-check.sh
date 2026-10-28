#!/usr/bin/env bash
# 복구 훈련 — 가장 최근 백업을 임시 DB 컨테이너에 되살려 본다 (주 1회, nas-backup 워크플로)
# 운영 DB(tic-db)는 건드리지 않는다. 임시 컨테이너와 임시 폴더는 끝나면 지운다.
set -euo pipefail

DATA_DIR="${TERRA_DATA_DIR:-/volume1/docker/terra-in-cognita}"
NAME=tic-restore-check
TMP_DIR="$DATA_DIR/restore-check"

BACKUP="$(find "$DATA_DIR/backups" -name '*.dump' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)"
if [ -z "$BACKUP" ]; then
  echo "백업 파일이 없습니다: $DATA_DIR/backups"
  exit 1
fi

cleanup() {
  docker rm -f "$NAME" > /dev/null 2>&1 || true
  rm -rf "${TMP_DIR:?}"
}
trap cleanup EXIT
cleanup # 지난 훈련이 남긴 것이 있으면 정리
mkdir -p "$TMP_DIR"

echo "되살릴 백업: $BACKUP"
# 네트워크 없이, 운영과 같은 PostgreSQL 이미지로 띄운다
docker run -d --name "$NAME" --network none \
  -e POSTGRES_USER=terra -e POSTGRES_DB=terra \
  -e POSTGRES_PASSWORD="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')" \
  -v "$TMP_DIR:/var/lib/postgresql" postgres:18.6-trixie > /dev/null

# 첫 기동 때 이미지가 초기화용 임시 서버(소켓만 받음)를 띄웠다가 끈다.
# TCP(127.0.0.1)로 확인해야 진짜 서버가 뜬 뒤에만 통과한다.
ready=""
for _ in $(seq 1 60); do
  if docker exec "$NAME" pg_isready -h 127.0.0.1 -U terra -d terra > /dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [ -z "$ready" ]; then
  echo "임시 DB가 준비되지 않았습니다"
  docker logs --tail 30 "$NAME" || true
  exit 1
fi

docker exec -i "$NAME" pg_restore -U terra -d terra --no-owner --exit-on-error < "$BACKUP"

# 검사 1: 백업 목차의 표 개수 = 되살린 DB의 표 개수 (게임 표 public + 마이그레이션 기록 drizzle)
# (목차 줄 예: "215; 1259 16385 TABLE public 이름 terra". 데이터 줄은 "TABLE DATA public"이라 세지 않는다)
toc_tables="$(docker exec -i "$NAME" pg_restore --list < "$BACKUP" | grep -c -E '^[0-9]+; [0-9]+ [0-9]+ TABLE (public|drizzle) ' || true)"
restored_tables="$(docker exec "$NAME" psql -U terra -d terra -At -c \
  "select count(*) from information_schema.tables where table_schema in ('public', 'drizzle') and table_type = 'BASE TABLE'")"
# 참고: 표별 행 수 (원장 합계 같은 불변 조건은 원장이 생기면 여기에 더한다)
row_counts="$(docker exec "$NAME" psql -U terra -d terra -At -c \
  "select coalesce(string_agg(format('%s.%s=%s', table_schema, table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text), ', ' order by table_schema, table_name), '(표 없음)') from information_schema.tables where table_schema in ('public', 'drizzle') and table_type = 'BASE TABLE'")"

result="표 ${restored_tables}개 (백업 목차 ${toc_tables}개) / 행 수: ${row_counts}"
echo "$result"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  printf '## 복구 훈련\n- 백업: `%s`\n- 결과: %s\n' "$(basename "$BACKUP")" "$result" >> "$GITHUB_STEP_SUMMARY"
fi

if [ "$toc_tables" != "$restored_tables" ]; then
  echo "복구 훈련 실패: 표 개수가 다릅니다"
  exit 1
fi
echo "복구 훈련 통과"
