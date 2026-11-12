# 배후지 칸 재고 저장·마을 건물 배치·가문 도시 자동 구인·국가 땅이 버티는 도시 수

- 일시: 2026-11-12 08:45 ~ 10:30 (KST)
- 작업 도구: Claude Code
- 관련: 가지 `work/catchment-db`(main `4bfc786`에서), 기획 D-533("대부분 기술 추천대로", "1061 칸 재고는 DB 저장"), 질문 1061 나·1052 다·1041 다·1025 나, 새 질문 `docs/questions/2026-11-12-catchment-db.md`(1096~1101), ADR `2026-11-11-city-catchment.md`·`2026-11-11-city-building-layout.md`·`2026-11-11-house-village.md`의 "바뀜 (2026-11-12, …)"

## 한 일
1. **칸 재고 DB 저장(1061 나)**: 표 `catchment_cell_stock`(행성·칸 키 × 원자재 여섯, 상한과 다른 칸만 — 상한으로 돌아오면 지움) + `world_cities.catchment`(도시 결과 12칸). `npc/catchmentStore.ts`: 하루 끝 뒤 런타임 처리의 첫 저장에서 바뀐 칸·도시만 쓰기 대기열(`catchmentStock`·`cityCatchment` 쓰기 표). 켤 때 경제가 시설을 놓기 전에 읽어 넣는다. 불변 조건 C1(도시 결과 모양), 세계 새로 시작이 비우는 표(남길 목록에 없음 — `resetWorld.test.ts`에 넣음). 1분 지표 `catchmentRows`·`catchmentCells`, 시작 기록에 `catchment { cells, cities, loadMs }`.
2. **마을 건물(1052 다)**: 시작 도시가 아닌 도시(NPC 새 마을·가문 마을·되살린 폐허)는 행정 건물 + 숙소(설정 칸 `npc_village_lodgings` [임시] 1, core@74)를 같은 도시 배치 함수로(`npcSeed.ts villagePlan`). 부팅 씨앗이 모자란 것을 채우고, 실행 중에 선 새 도시는 도시 행을 처음 쓸 때 같은 동기 처리에서(`persist.ts onCityFounded` → `villageSeeder`). 그 자리에 누구 것이든 행정 건물이 있으면 행정 건물은 더 세우지 않는다. NPC가 나중에 짓는 길은 아직 부팅 씨앗뿐(질문 1101).
3. **가문 도시 구인(1041 다)**: 확인 — 가문 도시는 구인하지 않았다(판단 사건을 버림). 넣음: 가문 세력도 판단 사건을 받아 NPC와 같은 구인 규칙식(`recruitPolicy`, 시뮬에서 내보냄)만 돈다(`npc/houseRecruit.ts`, 기본 켬 `factions.recruit_auto`). 가문장 `house_recruit_auto`(켬·끔, 감사 기록)·`house_recruit_hire`(지금 창 카드, 국고가 모자라면 가문장 지갑 [임시] — 시뮬 구인 `prepaid` 칸), 프로토콜 25(최소 24). 세력 화면 "내 가문" 가문 도시 칸 아래 `HouseRecruitBlock.tsx`.
4. **국가 땅이 버티는 도시 수(1025 나)**: `catchmentView.ts sustainOf` — 수도 둘레 찾는 반경 안 알맞은 땅에 시작 도시 배치 함수(`pickCitySites`)로 더 놓을 수 없을 때까지 놓은 수(다른 국가 계획 도시는 피함). tRPC `worldLayout.catchment.sustain`, `/dev/world-layout` 배후지 덮개 요약 줄(등급 표·지금 세계 수와 함께, 모자라면 위험 줄). 측정 스크립트 `bench/citySpacing.ts`에 국가 표.

## 측정 (Verified: 실행)
- 칸 재고 쓰기·읽기(DB 시험 도우미로 잰 임시 스크립트, 커밋 안 함 — 저장소 밖 `…/scratchpad/cdb-measure.test.ts.txt`): 시험 DB(PostgreSQL 16, 개발 컨테이너), 도시 64 × 반경 3칸(29칸, 짝마다 겹침) = 칸 1,260, 원자재 넷을 캠, 30일.
  - 하루 끝 쓰기 줄: 1·2일 1,324·1,260, 고갈이 바닥에 닿은 뒤 533~664줄/일. 쓰기 대기열 커밋 33~69ms.
  - 분당: 하루 끝이 든 1분에만 위 줄 수, 다른 1,439분은 0(평균 0.4~0.9줄/분).
  - 켤 때 읽기 1,260줄 9.3ms, 상태에 넣기 0.39ms.
  - Assumed: NAS 세계(도시 49~64)도 칸 1천여 개. 실제 서버(행성 값 + NPC 런타임)의 1분 지표로는 재지 않았다(미실행 — DB 시험은 행성 값 없이 돈다).
- 버티는 도시 수(`node apps/server/bench/citySpacing.ts`, S2 시험 행성 F9·국가 16·국력 등급): 등급 표 1~6곳 → 땅이 버티는 9~25곳(초강대국 13·14, 강대국 13~16, 중견국 9~21, 소국 15~25, 도시국가 15), 알맞은 빈 땅 209~426칸, 16국가 셈 161ms. 국가마다 혼자 센다(질문 1100).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/db/catchmentSchema.ts`(새)·`schema.ts`, `drizzle/20261111235133_catchment_stock/` | 칸 재고 표, `world_cities.catchment`, `factions.recruit_auto`(더하기만) |
| `apps/server/src/world/persist/tables.ts` | 쓰기 표 `cityCatchment`·`catchmentStock`·`houseRecruitAuto` |
| `apps/server/src/npc/catchmentStore.ts`(새)·`catchmentStore.db.test.ts`(새), `npc/economy.ts`·`npc/runtime.ts` | 저장·읽기·넣기, 지표 |
| `apps/server/src/world/invariants.ts`, `cli/resetWorld.test.ts` | C1, 세계 표 확인 |
| `apps/server/src/npc/houseRecruit.ts`(새)·`npc/houseRuntime.ts`·`npc/state.ts`·`npc/runtime.ts` | 가문 판단 사건 = 자동 구인, 들일 때 사건 걸기, 끔 읽기 |
| `packages/sim/src/simulator/npcRun.ts`·`societyRecruit.ts`·`societyTypes.ts`·`society.ts`·`index.ts` | `recruitPolicy` 내보내기, 구인 `prepaid`(시뮬 출력 그대로) |
| `packages/protocol/src/houseRecruit.ts`(새)·`houseRecruit.test.ts`(새)·`messages.ts`·`index.ts`·`version.ts` | 프로토콜 25 |
| `apps/server/src/factionIdentity/houseRecruit.ts`(새)·`houseRecruit.db.test.ts`(새)·`gateway.ts`·`attach.ts`·`houseCity.ts`(+db 시험), `session.ts`, `recruit/service.ts` | 명령·조회·연결, 카드 모양 공용 |
| `packages/shared/src/house.ts` | `HouseRecruitView` |
| `apps/game/src/faction/identity/HouseRecruitBlock.tsx`(새)·`HouseCityBlock.tsx`·`houseCommands.ts`·`houseText.ts`, `map/mapFeed.ts`, `messages/{ko,en}.json` | 화면·명령·문구(구인 22개 + 버티는 도시 4개, ko·en) |
| `apps/server/src/facilities/npcSeed.ts`(+시험)·`npc/persist.ts`·`world/world.ts` | 마을 건물·새 도시 때 세우기 |
| `packages/sim/src/society/worldSeed.ts`·`tuningWorldSeed.ts`, `content/core/tuning.json`·`manifest.json` | 설정 칸 `npc_village_lodgings`, core@74 |
| `apps/server/src/world/catchmentView.ts`·`placementService.ts`·`citySites.test.ts`, `packages/shared/src/worldPlacementApi.ts`, `apps/game/src/editor/worldLayout/WorldCatchmentPanel.tsx`, `bench/citySpacing.ts`, `e2e/world-layout.spec.ts` | 버티는 도시 수 |
| ADR 셋, 질문 넷(넣음 줄)·새 질문, `docs/PLAN.md` 14장 표 | 위 관련 |

## 함께 바꿔야 하는 파일
- 배후지 상태 모양(`CityCatchment` 칸)을 바꾸면 `catchmentStore.ts`의 12칸 순서·`CITY_CATCHMENT_FIELDS`·불변 조건 C1.
- 마을 건물 차례를 바꾸면 `npcSeed.ts villagePlan` 하나(부팅·실행 중 같은 함수).
- 가문 구인 결과 코드를 더하면 `houseRecruit.ts`(프로토콜)·`houseText.ts`.

## 건드리지 말 것
- 시뮬이 `prepaid`를 쓰지 않게 둔다(쓰면 출력·`SIM_VERSION`이 바뀐다).
- 칸 재고 저장은 "상한과 다른 칸만" — 상한 칸을 쓰면 줄 수가 배후지 전체로 는다.

## 미검증·TODO·알려진 문제
- 실제 서버(행성 값이 있는 NPC 런타임)에서 칸 재고 저장·다시 켬을 돌려 보지 않았다(미실행 — 단위·DB 시험은 가짜 칸 자리).
- 가문 국고 입금 길이 없다 → 자동 구인은 국고가 있을 때만(질문 1097). 손으로 사기는 가문장 지갑으로 된다.
- 가문 구인 칸 화면은 e2e로 보지 않았다(가문을 거울 세계에 들이려면 마을 값 5,000이 필요하고 e2e 계정 잔고가 모자람 — house-3 작업 기록과 같다). DB 시험만.
- 버티는 도시 수는 국가마다 혼자 센 어림이다(질문 1100).
- 이 판으로 NAS를 켜면 이미 선 NPC 마을(시작 도시가 아닌 도시)에 행정 건물·숙소가 선다(더하기만).

## 검사
(끝 검사 결과는 아래 "끝 검사"에 적는다)

## 사용자 결정 대기
- 질문 1096~1101(`docs/questions/2026-11-12-catchment-db.md`).
