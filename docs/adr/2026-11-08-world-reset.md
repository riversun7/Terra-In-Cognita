# 시험 세계 새로 시작: 남길 표 목록 + 나머지 TRUNCATE, 관리 명령 reset-world와 수동 워크플로 world-reset

- 상태: 제안 (사용자 결정 645 다에 따른 도구. NAS에서 처음 돌린 결과로 확정)
- 날짜: 2026-11-08
- 관련: docs/PLAN.md 9.5(백업·복구), 기획 질문 `docs/questions/2026-11-07-world-layout.md` 645(가지 `work/world-layout`), ADR `2026-11-07-world-layout.md`(국가를 행성 위로 퍼뜨리는 배치), ADR `2026-10-28-auth-and-accounts.md`(관리 명령·감사 기록 추가만), ADR `2026-10-31-s3-server-stage.md`(세계 표·부팅·원장 추가만 트리거), ADR `2026-10-31-second-map-from-planet.md` 6절(고정본 `second_map_pins`), ADR `2026-10-28-deploy-and-ops.md`(NAS 배포·백업), `docs/PROTECTED.md`

## 배경
- NAS 시험 세계는 시작 도시가 시험 2차맵 한 줄에 모인 옛 배치로 만들어졌다. 새 배치(국가를 행성 위에 서로 멀리)는 빈 세계에서 켤 때 만든다(ADR `2026-11-07-world-layout.md`).
- 기획 질문 645 "옛 세계는 어떻게 옮기나요?"에 사용자가 "다) 제대로 다시"를 골랐다(2026-11-08): NAS 시험 세계 DB를 비우고 계정은 남긴다. 옮기기(가·나)는 플레이어 것이 걸린 도시를 남기고 규칙이 많다.
- 지금 DB를 손으로 비우는 길이 없다. 원장 거래·항목과 감사 기록은 DB 트리거가 TRUNCATE·DELETE를 막는다(마이그레이션 `20261031050531_s3_world`, `20261028112504_audit_log_append_only`). 세계 표는 줄기마다 늘어난다(지금 public 표 74개 가운데 세계 표 53개, Verified: 새 DB에 마이그레이션 50개를 적용해 셈). 지금 합치는 줄기들도 새 세계 표(채집 대상 상태·전쟁 결과·이동·부상 칸 등)를 더한다.
- 서버는 DB에 월드 잠금을 잡지 않는다(Verified: `apps/server/src/world/`에 advisory lock이 없다. `world_heartbeat`는 생존 시각만 적고, 정상 종료 때도 마지막 시각을 쓴다 → 멈춘 앱과 도는 앱을 가르지 못한다).

## 선택지
1. DB를 지우고 새로 만든 뒤 계정만 다시 만든다 — 비밀번호 해시·역할·감사 기록·개발 도구 자료를 옮기는 일이 따로 생기고, 감사 기록이 끊긴다.
2. 지울 표 목록을 적는다 — 줄기가 세계 표를 더할 때마다 목록을 고쳐야 한다. 빠뜨리면 옛 세계 행이 새 세계에 남아 불변 조건이 깨진다(가리키는 세력·유닛이 없음).
3. 남길 표 목록을 적고 public의 나머지는 모두 지운다 — 새 세계 표는 목록을 고치지 않아도 지워진다. 세계 밖 표(계정·개발 도구)를 더하는 줄기만 목록에 한 줄 더한다.
4. 세계 표에 "세계 번호" 칸을 두고 새 번호로 시작한다 — 모든 표·질의를 바꿔야 한다. 시험 세계 한 번 비우기에는 너무 크다.

## 결정
3번. 관리 명령 `node dist/cli.js reset-world --confirm RESET-WORLD`(`apps/server/src/cli/resetWorld.ts`)와 수동 워크플로 `world-reset`(`.github/workflows/world-reset.yml`)으로 한다.

### 1. 남길 표(`WORLD_RESET_KEEP`)
| 표 | 까닭 |
|---|---|
| `users`·`sessions`·`accounts`·`verifications` | 계정(Better Auth). 세션도 남겨서 사용자가 다시 로그인하지 않아도 된다 |
| `account_recovery` | 복구 이메일(계정에 딸림) |
| `user_settings` | 계정 설정(테마·언어·메뉴·홈). 세계와 상관없다 |
| `audit_log` | 감사 기록. 추가만이고 지우지 않는다(PROTECTED, 트리거가 TRUNCATE를 막는다) |
| `planet_drafts`·`planet_draft_revisions`·`planet_library`·`planet_library_versions` | 행성 편집기 초안·보관함. 사람이 만든 팀 자료이고 게임 세계가 아니다 |
| `star_systems` | 항성계 편집기 보관함(게임 실행에 쓰지 않는다) |
| `tuning_overrides`·`tuning_revision` | 설정 칸 패널 저장 값. 팀이 맞춘 값이라 새 세계도 같은 값으로 돈다(되돌리려면 패널에서) |
| `formula_overrides` | 계산식 편집기 저장 값 |
| `content_overrides`·`content_override_revision`·`content_retired_ids` | 스킬·아이템·건물 편집기 저장(지운 ID는 다시 쓰지 않는다) |
| `battle_lab_presets` | 전투 실험실 프리셋 |
| `client_errors`·`client_perf_samples` | 기기 오류·성능 기록(운영 관측, 세계 상태가 아니다) |

- 행성 표본(`planet_templates`)은 DB 표가 아니라 콘텐츠 팩 분류라 해당 없다. 행성 타일·2차맵 지형 디스크 캐시(`planet-cache`)도 세계 상태가 아니라 그대로 둔다.
- `drizzle.__drizzle_migrations`(마이그레이션 기록)는 public 밖이라 보지 않는다. public 밖 스키마는 건드리지 않는다.

### 2. 지우는 것
- 남길 표 밖의 public 표 모두: 세력·소유 주체·도시·유닛·건물·원장·사이보그(`cyborgs`·`cyborg_rolls`·`cyborg_units`)·휴먼·구인·보유 물건·노동·시설·거래소·전투·정원사·폐허·신전·랭킹·영토 비콘·이동·NPC 사회·접속 상태·탐사 기록·복귀 요약 확인 시각(`summary_acks`, 옛 세계 사건 기준)·생존 시각, 그리고 나중에 생기는 세계 표.
- 고정본 `second_map_pins`도 지운다. PROTECTED는 "고치거나 지우지 않는다"고 적었는데, 까닭이 "플레이어가 지은 것이 지형 아래로 꺼지지 않게"다. 세계를 새로 시작하면 지은 것이 모두 사라져 고정본이 지킬 것이 없다. 남기면 옛 줄의 2차맵만 고정본 판의 지형으로 남아 새 배치와 어긋날 수 있다. 사용자 결정 645 다("DB 초기화, 계정은 남김")를 이 예외의 승인 근거로 적고, PROTECTED 그 행에 예외를 덧붙인다. → 사용자가 이 예외를 따로 승인했다(2026-11-08, 기술 세션 질문 "세계를 비울 때 2차맵 고정본 표도 같이 지울까요?"에 "같이 지움 (추천)").
- 사이보그도 지운다. 계정에 딸려 보이지만 세계 안의 몸(유닛·도시·세력)을 가리키는 세계 자료다. 다음 로그인 때 사이보그 만들기부터 다시 한다.

### 3. 동작 (트랜잭션 하나)
1. 같은 DB의 다른 연결(`pg_stat_activity`의 `client backend`, 자기 연결 빼고)이 없을 때까지 기다린다(기본 15초, `--wait`). 남아 있으면 거절한다(종료 코드 3, 아무것도 바꾸지 않음). 트랜잭션을 연 뒤 한 번 더 본다. 월드 잠금이 없어서 "앱이 떠 있음"을 이것으로 본다. 그래서 워크플로가 앱 컨테이너를 먼저 멈춘다.
2. `lock_timeout` 10초(누가 표를 쥐고 있으면 기다리지 않고 실패).
3. public 표를 남길 표·지울 표로 나누고, 표마다 행 수를 센다(요약·감사 기록용).
4. 남길 표(또는 public 밖 표)가 지울 표를 외래 키로 가리키면 거절한다. 지울 표를 한 TRUNCATE 문장에 모두 적으므로 CASCADE를 쓰지 않는다. CASCADE를 빼서, 이 확인을 지나쳐도 PostgreSQL이 TRUNCATE를 거절한다 — 남길 표가 말없이 비는 일이 없다.
5. 지울 표에 걸린 TRUNCATE 거절 트리거(지금은 원장 거래·항목의 추가만 트리거 둘)를 `ALTER TABLE … DISABLE TRIGGER`로 끄고, `TRUNCATE … RESTART IDENTITY`(정체 열 번호를 1부터) 뒤 같은 트랜잭션 안에서 다시 켠다. 감사 기록 트리거는 남길 표라 끄지 않는다(코드가 `audit_log`·`users`·`accounts`가 빠진 목록을 받지 않는다).
6. 감사 기록 한 줄: `actor_kind = cli`, `action = world.reset`, `before.rows` = 지운 표마다 행 수, `after` = 지운 표 수·행 수·남긴 표 목록·잠깐 끈 트리거, `meta` = 실행자(`TIC_ACTOR`)·명령. 그 뒤 커밋한다. 어느 단계든 실패하면 되돌린다.
- 따로 선 시퀀스(`planet_draft_revision_seq`, 행성 초안 판 번호)는 남긴다(편집기 자료).
- `--dry-run`은 연결 확인 없이 세기만 하고 되돌린다(확인 글이 없어도 된다).
- 출력에는 표 이름·행 수만 쓴다(환경 변수·접속 주소·비밀값을 쓰지 않는다).

### 4. 워크플로 `world-reset` (수동, NAS 실행기)
입력 `confirm` = `RESET-WORLD`(정확히) → main에서만, 배포 줄(`deploy-nas`)에 선다 → 앱 이미지 = 배포 기록(`deployed-tag`)인지 확인 → 백업 `backups/reset-<시각>.dump`(`ops/backup.sh reset`, 목차 확인, 실패하면 멈춤. 매일·배포 백업과 달리 자동으로 지우지 않는다) → `docker stop -t 60 tic-app`(DB는 그대로) → 같은 이미지·`.env`·네트워크로 `docker compose run --rm --no-deps app node dist/cli.js reset-world --confirm RESET-WORLD` → `docker start tic-app`(앞 단계가 실패해도) → healthy + `/health` `world: "ready"`·`worldIssues: 0` + `check-world` + `ops/smoke.mjs` → Summary(백업 파일 이름, 지운 표·행 수, 헬스).
- `set -x`를 쓰지 않고 환경을 찍지 않는다. 입력은 env로만 넘긴다.
- 거절(다른 연결)이나 실패면 트랜잭션이 되돌려져 옛 세계가 그대로이고, 앱은 다시 켜진다.

### 5. 되살리기 (백업에서)
옛 세계로 돌아가야 하면 `reset-*.dump`를 되살린다(DB 전체: 계정도 백업 때로 돌아간다).
1. `docker stop tic-app`
2. `docker exec tic-db psql -U terra -d postgres -c "drop database terra"` → `... -c "create database terra"`
3. `docker exec -i tic-db pg_restore -U terra -d terra --no-owner --exit-on-error < <백업 폴더>/reset-<시각>.dump`
4. 백업 뒤 배포로 더해진 마이그레이션이 있으면 적용: `docker compose -p tic -f ops/compose.yml --env-file <데이터 폴더>/.env run --rm --no-deps app node dist/migrate.js`(TERRA_TAG = 배포 기록)
5. `docker start tic-app`
- 백업 파일은 계정 비밀번호 해시를 담는다(권한 600). 다 쓰면 손으로 지운다.

## 이유
- 남길 표 목록은 짧고(21개) 잘 바뀌지 않는다. 세계 표는 줄기마다 늘어난다(Verified: 이번 주에만 시설·랭킹·신전·폐허·거래소·이동 표가 더해짐). 빠뜨렸을 때의 피해도 남길 표 쪽이 작다: 남길 목록에서 세계 밖 표가 빠지면 그 표가 비고 감사 기록에 행 수가 남지만, 지울 목록에서 세계 표가 빠지면 옛 세계 행이 새 세계에 섞여 불변 조건이 깨진다.
- 남길 표 이름은 표 정의(`schema.ts` 내보내기)에 모두 있어야 한다는 시험이 있다(`resetWorld.test.ts`). 이름이 바뀌면 시험이 잡는다. DB에 없는 남길 표는 명령이 경고로 알린다.
- 원장 추가만 트리거를 잠깐 끄는 것은 원장을 고치는 것이 아니라 세계째 버리는 것이다. 같은 트랜잭션 안에서 다시 켜므로 커밋 뒤에는 늘 켜져 있다(Verified: DB 시험이 `tgenabled = 'O'`와 DELETE 거절을 본다).
- 다른 연결 확인은 백업(pg_dump)·사람의 psql·앱 모두를 막는다. 앱을 멈춘 직후 연결이 늦게 끊기는 경우를 위해 기다린다.
- Verified(DB 시험 `apps/server/src/cli/resetWorld.db.test.ts`, PostgreSQL 16 시험 DB): 계정·감사 기록·계정 설정·설정 칸 판은 남고, 남길 표 밖의 public 표는 모두 비고, 감사 기록 `world.reset`이 남고, 다시 켜면 NPC 국가 셋·도시·유닛을 새로 만들고(세력 번호 1부터) 불변 조건 위반이 없다. 다른 연결이 있으면 종료 코드 3, 확인 글이 틀리면 2.
- Unknown: NAS(PostgreSQL 18, 실제 세계 크기)에서 걸리는 시간. 표마다 `count(*)`를 하므로 행이 많으면 몇 초 더 걸린다(Assumed).

## 결과
- 좋은 점: 한 번의 수동 실행으로 백업 → 비우기 → 새 세계 → 점검까지 끝나고, 실패하면 옛 세계 그대로 앱이 다시 켜진다. 나중에 생기는 세계 표도 따로 손대지 않아도 지워진다.
- 감수할 점: 세계 밖 표(계정·개발 도구·운영 기록)를 더하는 줄기는 `WORLD_RESET_KEEP`에 한 줄 더해야 한다(안 하면 다음 새로 시작 때 비워진다). 이 규칙을 `schema.ts` 머리 주석과 AGENTS.md 명령 표(`world-reset` 줄)에 적었다. 도구로 강제하지는 않는다(어느 표가 세계 밖인지는 사람이 정한다).
- 설정 칸·편집기 저장 값은 새 세계에도 그대로다. 새 세계를 팩 값으로 시작하려면 개발자 패널에서 먼저 되돌린다.
- 다시 볼 조건: 실유저 단계(실제 플레이어 자료가 있는 운영 DB) 전에 이 워크플로를 지우거나 막는다. 그때는 세계를 비우는 대신 옮기기(645 가·나) 같은 다른 절차가 필요하다.
