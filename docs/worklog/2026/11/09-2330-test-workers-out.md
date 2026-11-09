# 시험 일꾼 다 없애기 — 프로토콜 20, 옛 행 부팅 정리, 시험 바꾸기

- 일시: 2026-11-09 23:30 (KST)
- 작업 도구: Claude Code
- 관련: `docs/adr/2026-10-31-s3-server-stage.md` "바뀜 (2026-11-09)", `docs/adr/2026-11-07-unit-control.md` "바뀜 (2026-11-09)"(단추 지움, main `83a8300`),
  `docs/adr/2026-10-28-time-and-session-protocol.md`(현재 + 직전 판), 가지 `work/test-workers-out`(main `c296a43`에서)

## 한 일
- 사용자 지적(원문): "시험일꾼받기 기능 없애라 왜 만든거냐" → 단추만 지웠던 것(main `83a8300`)에 이어 "시험일꾼 다 없애라고".
  시험 일꾼(유닛 종류 1)을 만드는 길·시험 일꾼만의 규칙·화면 이름을 모두 지우고, NAS 세계에 남은 옛 시험 일꾼("시험 일꾼 #1012" 등)은 서버가 켤 때 지운다.
- 왜 있었나(S3 ADR 3·4절): S3에는 플레이어 유닛을 얻는 길이 없어 시야 전송·오프라인 정산을 보려고 dev·admin 시험 명령을 두었다. 지금은 사이보그
  본체·구인 카드 고용·노동 계약·직무 배치가 있다.
- 프로토콜 20(최소 19): 기기 메시지 `dev_spawn_units`를 뺐다. 11판에서 `unit_rebirth`를 뺀 방식 그대로(현재 + 직전 판을 받는다 — 19판 기기가 보내면
  `invalid_message`, 19판 기기에서도 단추는 이미 지웠다). `codec.test.ts`가 최소 = 현재 − 1을 본다. 다른 메시지는 그대로라 19판 기기를 내쫓지 않는다.
- 서버: 게이트웨이·세션 처리, `World.devSpawn`, `Settlement.giveWorkers`, 노동 계약·정산의 "계약 밖·산출 구간 없는 유닛은 시험 광석"(시험 일꾼만이었다),
  `WorkBook.isTestWorker`를 지웠다. 권한 동작 `secondMap:dev-spawn`은 다른 개발 시험 명령(물건·재료 받기, 작업 끝내기, 부상·비활성·폐허·유전자 시험)이
  같이 쓰는 문이라 없애지 않고 `dev-test`로 이름만 바꿨다(dev·admin 그대로, Better Auth 권한 문장은 코드에만 있고 DB에 없다 — **Verified**: `permissions.ts`).
- 유닛 종류 1은 `UNIT_KIND_OLD_WORKER`(다시 쓰지 않음)로 남기고, 유닛 화면 종류 `test_worker`(공용 `UNIT_TYPES`·`MAP_UNIT_KINDS`)·메시지
  `roster_type_test_worker`·운영 화면 `ops_unit_kind_1`(ko·en)을 지웠다. 운영 화면은 종류 1이 남아 있으면 "종류 1"로 보이고 유닛 찾기 칸 목록에서 뺐다.
  감사 기록에는 유닛 종류 이름이 없어(JSON 그대로 보인다) 옛 이름을 남길 까닭이 없다.
- 옛 행 정리(`apps/server/src/world/retireOldWorkers.ts`, 부팅): 유닛을 2차맵에 놓기 전에 종류 1 행을 걸러 지운다. 든 물건은 주인 사이보그 본체가 든
  것으로(입은 것은 벗김), 본체가 없으면 그 2차맵의 가장 가까운 도시 창고로(보유 물건 위치는 0이 될 수 없다 — 표 검사 `item_holdings_location`, 시험이
  처음에 0을 넣다가 걸렸다), 도시도 없으면 그대로. 화물(원장 위치 = −유닛 ID)은 계정 주인의 위치 없는 계정으로(`retire_worker_cargo`). 노동 계약은 다음
  정산이 "유닛 사라짐"으로 끝내고 보증금을 돌려준다. 지우면 서버 기록 `world boot: removed the old test workers`와 감사 기록 `world.retire_test_workers`.
  - 마이그레이션이 아닌 까닭: 표 모양이 그대로이고, SQL로 지우면 화물·든 물건을 옮기는 원장 거래를 SQL로 다시 짜야 하며, 직전 판 앱이 그 뒤에 또 만들 수
    있다. 부팅 정리는 새 판이 켤 때마다 보고 지울 것이 없으면 아무것도 하지 않는다(ADR 22 "직전 판 앱이 그대로 돈다"도 지킨다 — 표를 바꾸지 않음).
- 시험: 서버 시험은 시험 도우미 `addTestUnits`(`world/testSupport.ts`, 휴먼을 2차맵에 바로 세운다 — 기기 명령 없음)로, 일하는 유닛이 필요한 시험
  (오프라인 정산·복귀 요약·노화·유닛 읽기)은 임금형 노동 계약(일반 건물 → 일한 구간 시험 광석)으로 바꿨다. `world.db.test.ts`는 앱을 켜기 전에 같은 DB로
  월드를 한 번 켜 admin 휴먼을 세운다. 화면 시험은 `e2e/helpers/wsCommands.ts`의 `ensureHuman`(그 2차맵의 내 휴먼, 없으면 구인 카드 고용)과
  `grantCredit`(운영자 지급 tRPC `ops.economy.grant`)을 쓴다. `recruit.spec.ts`는 남은 카드 가운데 가장 싼 것을 고른다(다른 시험이 같은 창 카드를 살 수 있다).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/protocol/src/{secondMap,version,index,facilities}.ts`, `secondMap.test.ts` | `dev_spawn_units`·`MAX_DEV_SPAWN_UNITS` 뺌, 판 20·최소 19, 권한 이름 주석, 뺀 메시지 거절 시험 |
| `apps/server/src/world/{gateway,world,settlement,unitKinds,vision}.ts`, `session.ts` | 명령·`devSpawn`·`giveWorkers`·기본 시험 광석 산출 제거, 종류 1 이름 바꿈, 부팅 정리 호출 |
| `apps/server/src/world/retireOldWorkers.ts`(새), `retireOldWorkers.test.ts`(새), `retireOldWorkers.db.test.ts`(새) | 옛 시험 일꾼 행 부팅 정리와 시험 |
| `apps/server/src/labor/{service,workBook}.ts` | 계약 밖 시험 광석·`isTestWorker` 제거 |
| `apps/server/src/auth/permissions.ts` 외 `dev-spawn` 쓰던 곳(holdings·facilities·fusion·hospital·temple·ruins 게이트웨이, trpc 4개) | 권한 이름 `dev-test` |
| `apps/server/src/roster/worldUnits.ts`, `packages/shared/src/{roster,mapUnits,labor}.ts`, `apps/server/src/db/schema.ts`(주석만) | 화면 종류 `test_worker` 제거, 주석 |
| `apps/game/src/roster/rosterText.ts`·`.test.ts`, `apps/game/src/ops/{opsUi,UnitsTab}.tsx`, `apps/game/src/map/UnitControlPanels.tsx`(주석), `apps/game/messages/{ko,en}.json` | 화면 이름·메시지 키 제거, 운영 화면 종류 목록 |
| `apps/server/src/world/testSupport.ts` | 시험 도우미 `addTestUnits` |
| 서버 DB 시험 13개(`settlement`·`world`·`worldLayout`·`nationPlacement`·`battleResults`·`labor`·`facilities`·`attack`·`holdings`·`vitals`·`worldUnits`·`ops`), `gateway.test.ts`, `roster.test.ts` | 시험 일꾼 대신 휴먼·임금형 계약 |
| `e2e/helpers/wsCommands.ts`, `e2e/{units,inventory,equip-stats,labor,recruit,vision}.spec.ts` | 구인 고용·운영자 지급으로 유닛·화폐, 주석 |
| `docs/adr/2026-10-31-s3-server-stage.md` | "바뀜 (2026-11-09)" |

## 함께 바꿔야 하는 파일
- 유닛 종류를 더하거나 지우면: `world/unitKinds.ts`, `roster/worldUnits.ts unitTypeOf`, `apps/game/src/ops/opsUi.tsx UNIT_KIND_LABELS`(메시지 `ops_unit_kind_*` ko·en).
- 프로토콜 판을 올리면 `codec.test.ts`가 최소 = 현재 − 1을 본다.

## 건드리지 말 것
- 유닛 종류 1 번호를 다시 쓰지 않는다(옛 행 정리가 종류 1을 지운다).
- S1 규모 시험 봇(종류 0, `S1_TEST_BOTS`)과 관리자 시험 유닛(종류 2, 시험 코드 `addUnit` 기본)은 시험 일꾼과 다르다 — 그대로 둔다.
- 다른 개발 시험 명령(`dev_grant_item`·`dev_facility_grant` 등)은 이번 지적 밖이라 그대로 둔다(권한 이름만 바뀜).

## 미검증·TODO·알려진 문제
- NAS 세계의 실제 옛 시험 일꾼 수·그 물건은 보지 않았다(**Unknown**). 배포 뒤 서버 기록 `world boot: removed the old test workers` 한 줄과
  `check-world`로 본다. 본체가 없는 주인의 일꾼이 도시 없는 2차맵에 있었으면 그 든 물건은 남는다(stranded로 센다 — 수명이 다한 휴먼과 같은 처리).
- 복귀 요약 "생산" 칸은 시험 광석(`job_output`)만 센다. 시험 일꾼이 없으면 채집 시설의 진짜 물건만 나오는 플레이어는 이 칸이 0이다(원래 있던 한계, 이번에
  바꾸지 않음).
- 결과는 아래 "검사"에 적는다.

## 검사
- 서버 DB 시험(바꾼 파일, `TEST_DATABASE_URL`): 통과. 공용 시험 DB가 느려(빈 DB 만들기 약 20초) `--hookTimeout`을 늘려 돌렸다.
- 빌드·`check-pwa`·`check:bundle`: 통과(첫 화면 JS 107,253B / 상한 131,416B).
- 화면 시험(빌드한 앱, 헤드리스 Chromium — 휴대폰 값 아님):
  - 첫 판(`units`·`inventory`·`equip-stats`·`labor`·`recruit`·`vision`·`unit-control`·`play-map`, 103개): 89 통과·13 실패·1 건너뜀. 실패 대부분은 시험마다 휴먼을
    새로 고용하다 (주인, 도시, 창)의 카드 3~5장이 떨어진 것(`no recruit card left`)과 그 뒤 따라 실패한 것 → 있는 휴먼을 먼저 쓰는 `ensureHuman`,
    `recruit.spec`은 남은 카드 가운데 고르기로 고쳤다. `unit-control`·`play-map`은 모두 통과.
  - 고친 뒤(`units`·`inventory`·`equip-stats`·`labor`·`recruit`·`vision`, 61개): 58 통과·2 실패·1 건너뜀. 실패 2개는 `vision.spec.ts` "경계 너머 보기"(알려진 헤드리스
    시간 초과)와 "2차맵 낮밤 사진 1440 pastel"(사진 찍는 중 120초 시간 초과 — 첫 판에서는 1440 pastel·dark 둘 다, 이번에는 dark는 통과. 유닛과 상관없는
    낮밤 화면이고 이번에 바꾸지 않았다, main에서 따로 재지 않았다 — **Assumed**: 헤드리스 느림).

## 사용자 결정 대기
- 없음
