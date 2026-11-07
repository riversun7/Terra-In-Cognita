# 시험 세계 새로 시작 도구 (reset-world 명령 + world-reset 워크플로)

- 일시: 2026-11-08 06:56 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-08-world-reset.md`(제안), 기획 질문 645 답 다(사용자 결정 2026-11-08 "다) 제대로 다시", 가지 `work/world-layout`의 `docs/questions/2026-11-07-world-layout.md`), 가지 `work/world-reset`

## 한 일
- 관리 명령 `node dist/cli.js reset-world --confirm RESET-WORLD [--wait 초] | --dry-run`을 더했다(`apps/server/src/cli/resetWorld.ts`, `commands.ts`에서 부름).
  - 남길 표 목록(`WORLD_RESET_KEEP`, 21개: 계정 6·감사 기록·행성/항성계 편집기 5·설정 칸·계산식·팩 편집기·전투 실험실 7·기기 기록 2)만 적고, public의 나머지 표(지금 53개, 나중에 생기는 세계 표 포함)를 한 트랜잭션에서 `TRUNCATE … RESTART IDENTITY`로 비운다.
  - 거절: 확인 글이 정확하지 않으면 종료 코드 2. 같은 DB에 다른 연결이 있으면(앱이 떠 있음 — 서버는 월드 잠금을 잡지 않는다) 15초까지 기다린 뒤 종료 코드 3. 남길 표가 지울 표를 외래 키로 가리키면 3(CASCADE를 쓰지 않아 PostgreSQL도 막는다).
  - 원장 거래·항목의 추가만 트리거는 TRUNCATE도 막는다 → 지울 표에 걸린 TRUNCATE 트리거만 같은 트랜잭션 안에서 끄고 다시 켠다. 감사 기록 트리거는 남길 표라 건드리지 않는다.
  - 감사 기록 `world.reset`(actor_kind cli, 지운 표마다 행 수, 실행자 `TIC_ACTOR`)을 같은 트랜잭션에 남긴다. 출력은 표 이름·행 수만.
- 워크플로 `.github/workflows/world-reset.yml`(수동, 입력 `RESET-WORLD`, main·NAS 실행기·배포 줄): 앱 이미지 = 배포 기록 확인 → `ops/backup.sh reset` → `docker stop -t 60 tic-app` → `docker compose run --rm --no-deps -T app node dist/cli.js reset-world …` → `docker start tic-app`(늘) → healthy·`/health` 월드 ready·`worldIssues` 0·`check-world`·`ops/smoke.mjs` → Summary.
- `ops/backup.sh`에 종류 인자(`daily` 기본, `reset`)와 단계 출력 `file`을 더했다. `reset-*.dump`는 자동으로 지우지 않는다(`pre-*`는 배포가 14일 뒤 지우므로 이름을 따로 했다).
- 고정본 `second_map_pins`도 지운다(건물이 모두 사라져 지킬 것이 없다). PROTECTED 그 행에 예외를 덧붙였다(사용자 결정 645 다, ADR 2절).
- 시험 도우미 `createTestDatabase`가 DB 주소(`url`)를 돌려주고, 시험이 연결을 먼저 닫아도 `drop`이 된다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/cli/resetWorld.ts` | 남길 표 목록·계획·인자·트랜잭션(연결 확인·외래 키 확인·트리거·TRUNCATE·감사 기록)·출력 |
| `apps/server/src/cli/commands.ts` | `reset-world` 명령 연결, 사용법 |
| `apps/server/src/cli/resetWorld.test.ts` | 남길 표 이름이 표 정의에 있는지, 계정·감사 기록을 남기는지, 세계 표를 남기지 않는지, 인자 |
| `apps/server/src/cli/resetWorld.db.test.ts` | 새 DB에 계정·세계를 만들고 비운 뒤 남는 것·빈 것·감사 기록·트리거, 다시 켜면 세계를 새로 만드는지 |
| `apps/server/src/testDb.ts` | 시험 DB 주소, 닫힌 연결에서도 drop |
| `apps/server/src/db/schema.ts` | 머리 주석: 세계 밖 표는 남길 표 목록에도 넣는다 |
| `.github/workflows/world-reset.yml` | NAS 수동 실행 순서 |
| `ops/backup.sh` | 백업 종류(`reset`)·파일 이름 단계 출력 |
| `ops/nas-setup.md` | 12장 "시험 세계 새로 시작"(실행·결과·되돌리기) |
| `docs/adr/2026-11-08-world-reset.md` | 결정(남길 표 목록과 까닭, 동작, 되살리기) |
| `docs/PROTECTED.md` | `second_map_pins` 예외 |
| `AGENTS.md` | 명령 표에 `world-reset` 줄 |

## 함께 바꿔야 하는 파일
- 세계 밖 표(계정·개발 도구·운영 기록)를 더하는 줄기는 `apps/server/src/cli/resetWorld.ts` `WORLD_RESET_KEEP`에 넣는다. 세계 표는 아무것도 하지 않아도 지워진다.
- 지금 합치는 줄기들의 새 표(채집 대상 상태·전쟁 결과·이동·부상 칸 등)는 세계 표라 목록을 고칠 일이 없다(Assumed: 이름만 들음, 표 정의는 보지 않음). 합친 뒤 `reset-world --dry-run`으로 지울 표 목록을 한 번 본다.

## 건드리지 말 것
- 감사 기록 추가만 트리거(PROTECTED). 명령은 `audit_log`·`users`·`accounts`가 빠진 목록을 받지 않는다.
- `drizzle` 스키마(마이그레이션 기록)는 public 밖이라 명령이 보지 않는다.

## 검사
- 고친 시험만(작업 중): `resetWorld.test.ts` 7개 통과, `resetWorld.db.test.ts` 6개 통과(약 5.5초, `TEST_DATABASE_URL` 시험 DB PostgreSQL 16.15).
- 손으로: 새 DB(마이그레이션 50개)에 `tsx src/cli.ts reset-world --dry-run`·실제 실행 — 지울 표 53개·남길 표 21개, 원장 트리거 둘을 끄고 다시 켬, 감사 기록 한 줄.
- 워크플로: js-yaml로 읽고 각 `run`을 `bash -n`, 헬스 조각(node)을 가짜 `/health`에 돌려 봄. actionlint는 없어 돌리지 않았다.
- 마무리 검사: `TEST_DATABASE_URL=… pnpm check` 통과(시험 479파일 3,800개, DB 시험 포함), `pnpm check:docs origin/main` 통과. 화면을 바꾸지 않아 빌드·화면 시험은 돌리지 않았다.

## 미검증·TODO·알려진 문제
- 워크플로는 돌리지 않았다(미실행). NAS에서 처음 돌릴 때 볼 것: `docker compose run -T`가 실행기에서 출력을 그대로 넘기는지, 앱을 멈춘 뒤 연결이 15초 안에 끊기는지, 빈 세계 부팅(국가·도시·시설 새로 만들기)이 헬스체크 3분 안에 끝나는지.
- NAS(PostgreSQL 18)에서 걸리는 시간은 모른다(Unknown). 표마다 `count(*)`를 한다.
- 새 배치(국가를 행성 위로)는 `work/world-layout` 줄기가 합쳐진 이미지여야 한다. 그 전에 돌리면 옛 배치로 다시 만든다.

## 사용자 결정 대기
- ADR 상태 확정(NAS에서 한 번 돌린 뒤). `second_map_pins`를 함께 지우는 것(PROTECTED 예외)도 그때 함께 확인한다.
