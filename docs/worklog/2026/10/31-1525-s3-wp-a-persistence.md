# S3 WP-A: 월드 저장·부팅 복구, 불변 조건, 사용자 결정 반영

- 일시: 2026-10-31 15:25 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-31-s3-server-stage.md`(제안, "사용자 결정 (2026-10-31)"·"구현하며 정한 것 (WP-A)"), ADR 6·22·26·32·33, 가지 `work/s3-server`(main `6b45d6c`를 합친 뒤)

## 한 일
- 사용자 결정(U1 계단 시험, U2 A, U3 A, U4 전투 빼기)과 작업 지시를 ADR에 적었다. 5~8절(전투·규모·측정·작업 묶음)을 결정에 맞게 고쳤다. PLAN 11장 S3 줄을 고쳤다(14장은 손대지 않았다).
- WP-A 구현: S3 표 12개 + 원장 추가만 트리거(마이그레이션 하나), 월드 쓰기 대기열(0.25초 묶음 커밋), 부팅 복구(건물·유닛·예약, 접속 상태 고치기, 생존 시각), 봇을 시험 NPC 세력 유닛으로 저장(판단 횟수 난수), 불변 조건 검사(부팅 뒤·`check-world`·시험), 시험 2차맵 여러 개(`S1_TEST_MAPS`), `/health` 월드 상태.
- 플레이어에게 보이는 바뀜은 없다: 2차맵 전송·명령은 그대로다. 봇이 서버를 다시 켜도 이어서 움직인다.

## 검사·측정
- `TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm check` 통과: 시험 파일 201개·시험 1,919개(새 `persist.db.test.ts` 6개 포함: 쓰기 합치기·실패 다시·추가만 트리거·부팅 복구·접속 상태 고치기·무작위 6번 죽였다 켜기).
- 개발 서버 손 시험(Verified: `tsx`, 같은 기기 PostgreSQL 16.15, 봇 300개): 첫 부팅 복구 130ms, `/health` `world: "ready"`, `worldIssues: 0`. 12초 뒤 `kill -9` → 다시 켜서 `/health`까지 1,467ms(부팅 복구 94ms), `check-world` `{"ok":true,"problems":[]}`.
- 화면은 바꾸지 않아 `pnpm e2e`는 돌리지 않았다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/db/schema.ts`, `apps/server/drizzle/20261031050531_s3_world/` | S3 표, 원장 추가만 트리거(생성된 SQL 뒤에 덧붙임) |
| `apps/server/src/world/persist/{tables,writer,load}.ts`(새) | 쓰기 대기열, 부팅 읽기 |
| `apps/server/src/world/invariants.ts`(새) | 불변 조건 I1·I2·I5·I6·I7 |
| `apps/server/src/world/unitKinds.ts`(새) | 유닛 종류 코드·시험 NPC 세력 코드 |
| `apps/server/src/world/world.ts` | DB 부팅 복구·생존 시각·시험 2차맵 여러 개·지표·시험용 죽이기 |
| `apps/server/src/world/secondMap.ts` | 저장 고리, `restore`, 유닛 읽기·직무 넣기, 예약 검사 |
| `apps/server/src/world/bots.ts` | 판단 횟수로 뽑는 난수(`botRng`) |
| `apps/server/src/world/gateway.ts` | 부팅 복구 전 요청은 `busy` |
| `apps/server/src/app.ts` | 월드에 DB 풀 넘김, `onReady`가 부팅 복구를 기다림, `/health` 월드 값 |
| `apps/server/src/config.ts`, `main.ts`, `world/worldStats.test.ts` | `S1_TEST_MAPS`, 봇 상한 10만 |
| `apps/server/src/cli/commands.ts` | `check-world` |
| `apps/server/src/world/persist.db.test.ts`(새) | 저장·복구 DB 시험 |
| `AGENTS.md` 7장 | 봇 상한·`S1_TEST_MAPS`·저장·`check-world` |
| `docs/adr/2026-10-31-s3-server-stage.md`, `docs/PLAN.md` 11장 | 사용자 결정, 구현하며 정한 것 |

## 함께 바꿔야 하는 파일
- 월드 표에 열을 더하면 `world/persist/tables.ts`의 열 목록과 `persist/load.ts`의 읽기를 같이 고친다.
- 새 외래 키가 생기면 `tables.ts`의 `WRITE_ORDER`를 그 차례에 맞춘다.

## 건드리지 말 것
- 올라간 마이그레이션(`20261031050531_s3_world` 포함, 합친 뒤)은 고치지 않는다.

## 미검증·TODO·알려진 문제
- NAS에서는 아직 돌리지 않았다(HDD 커밋 시간, Unknown). WP-E 계단 시험이 잰다.
- `S1_TEST_BOTS`를 줄여도 봇이 줄지 않는다(유닛을 지우는 전송 메시지가 없다). 줄이려면 DB의 봇 행을 지운다.
- 부팅이 DB를 최대 약 60초 기다리고, 그래도 안 되면 서버가 뜨지 않는다(전에는 DB 없이 떠서 503).

## 사용자 결정 대기
- 없음.
