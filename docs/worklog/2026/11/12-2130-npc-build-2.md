# NPC 증축 2(나라 성격·도시 등급 상한·레벨 올리기·수리), 시작 도시 인구 상한, 공성 피해의 세계 반영, 시뮬 공성 변

- 일시: 2026-11-12 21:30 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-535(질문 1111~1172 모두 기술 추천) — 1131 나, 1142 다, 1143 나, 1146 나, 1112 가, 1114 가, 1113 가(할 일 없음). 앞 작업 기록 `12-1712-logistics-2.md`·`12-1715-npc-build.md`·`12-1727-siege-2.md`. 새 질문 `docs/questions/2026-11-12-npc-build-2.md`(1186~1192). ADR `2026-11-11-city-building-layout.md` "바뀜 (2026-11-12 3차, D-535)", `2026-10-31-combat-core.md`·`2026-11-07-buildings-runtime.md` "바뀜 (2026-11-12, D-535)". 가지 `work/npc-build-2`(바탕 main `1324780`).

## 한 일
- **1131 나 — 시작 도시 인구 상한 = 주거 그대로** (Verified: 시험·측정)
  - 시설 줄에 `seeded` 칸(세계 씨앗이 세운 시설: 시작 도시·마을 기본 시설·성벽). 마이그레이션 `20261112111806_facility_seeded` = 열 더하기 + 이미 선 세계에서 "그 도시 행정 건물과 같은 시각에 사람 없이 선 시설"을 씨앗으로 적기(질문 1191).
  - `npc/cityRest.ts planCityRest`에 `capBeds` = 침대 합 − 씨앗 숙소 Lv1 침대. 서버 도시 경제가 도시 `beds`에 `capBeds`를 적는다(쉼터 자리 `bedTotal`은 그대로). 씨앗 뒤에 지은 숙소(NPC 증축·플레이어)와 씨앗 숙소를 올린 레벨만큼만 상한이 오른다.
  - 시뮬: 시뮬 도시에는 씨앗 숙소가 없어 NPC가 지은 숙소 침대(레벨 합 × 레벨당 침대)를 도시 `beds`에 적는다(예전에는 시뮬 숙소가 상한에 들지 않았다).
  - 붐빔 숙소: 휴먼이 인구 상한에 닿고 생필품이 넉넉하면 숙소를 짓는다 — 씨앗 숙소가 상한을 올리지 않으니 이것이 자람의 길이다(질문 1188).
- **1142 다 — 나라 성격대로 짓기**: 목표 = 국력 등급 처음 시설 수(프리셋 성격 칸 → 등급 표 → 설정 칸)와 국가 특산 줄(cityJobs)의 시설 수 가운데 큰 값(서버 `npc/cityBuild.ts nationBuildTargets`, 시뮬은 세력 묶음 도시 계획). 모자라면 650 + 모자란 수 × 10. 주방·제련소·공방·제재소가 서면 그 특산이 도시 직무에서 건물로 옮겨 간다(Verified: DB 시험 — 지은 가공 시설이 건물 ID로 특산 레시피를 돌리고 그 시설의 도시 직무가 사라진다). 땅 몫 0인 채집 시설은 목표여도 짓지 않는다. 재료를 구할 길이 없는 시설은 후보에서 뺀다(예전에는 그 시설을 골라 놓고 멈췄다).
- **1143 나 — 도시 등급별 건물 수 상한**: 설정 칸 `npc_build_cap_l1~l6` 8·10·12·16·20·24 [임시], 전체 끝 `npc_build_max_buildings` 16 → 32(0이면 짓기·레벨 올리기 끔). 등급 = `cityGrade(발전도)`(D-137, 영토 층 문턱).
- **1146 나 — 상한에 닿으면 레벨 올리기**: 붐비면 낮은 숙소, 아니면 일꾼이 가장 많은 생산 시설(같으면 낮은 레벨 → ID), 한 번에 한 레벨. 재료·시간 = 플레이어 레벨업(팩 `buildCostAt`·`buildTimeAt`, 일 없는 휴먼 일꾼 단축). 구할 길이 없는 재료가 드는 시설은 건너뛴다(질문 1186). 서버 = 건물 서비스 새 `npcJob`(플레이어 `upgrade`·`repair`와 같은 검사·재료 자리·작업 줄). 시뮬 = 끝나면 경제 시설 레벨 + 1(자리만큼 일꾼 더, 채집 효과 다시 셈), 숙소는 침대 + 10.
- **1114 가 — 공성에서 부서진 성벽·건물은 세계에도**: 건물 공격(`facilities/attack.ts`)·정원사 웨이브(`npc/gardener.ts`)의 공성 시작 자료에 전투맵 창 안 세계 시설을 결과 목표로 단다(`world/battleTargets.ts siegeFacilityTargets`). 결과 적용은 앞 판 길(`damage`). 웨이브의 넥서스(행정 건물)는 정원사 결과 규칙만(질문 1190). 그리고 NPC 수리: 상태 700‰([임시] `npc_build_repair_below_pm`) 아래 시설을 가장 낮은 것부터 플레이어 수리와 같은 재료·시간으로 가득까지(짓기·레벨 올리기보다 먼저, 서버만) — 수리 재료가 성벽을 지키는 값이 된다(질문 1189).
- **1112 가 — 시뮬 세력 공성 변**: 배치 전투맵이면 공격 세력의 가장 가까운 도시(합성 격자) 쪽 변(`run.ts simSiegeEdge` → `edgeToward`, 편 2는 맞은편). 다른 도시가 없으면 옛 서쪽. 열린 맵·반란은 그대로.
- 요약 출력(형식 19): `npc.upgrades`·`npc.repairs`·`npc.cities`(도시 등급마다 도시 수·건물 수·레벨 합·휴먼·인구 상한). 새 시나리오 `build16u`(build16 + 농업 도시 제재소·공업 도시 가마 — 레벨 2 재료가 세계에 있다). `SIM_VERSION` 29 → 30. 팩 core@77.
- `bench:city-rest`에 인구 상한 칸(지금 = 주거 + 씨앗 뒤 침대, 숙소 하나 더 지으면).

## 측정
### 1. 시작 도시 인구 상한 (Verified: `node bench/cityRest.ts 16`, S2 시험 행성 F9, 시작 도시 16곳 평균)
| 주거 | 침대(쉼터) | 예전 max(주거, 침대) | 1089 나(앞 판) 주거 + 침대 | 지금 주거 + 씨앗 뒤 침대 | 숙소 하나 더 지으면 |
|---|---|---|---|---|---|
| 43.0 | 45.0 | 45.0 | 88.0 | **43.0** | 53.0 |

### 2. 시뮬 30일 앞(main `1324780`, SIM 29) → 뒤(이 판, SIM 30) (Verified: `node cli/sim.ts <시나리오> --days 30 --seed 1`, 앞 판은 같은 커밋 사본 + 요약에 등급별 칸만 잠깐 더해 셈, 위반 0)
| 시나리오 | 짓기 | 레벨 올리기 | 인구 | 도시당 건물 | 만족도 | 구인 | 거래 |
|---|---|---|---|---|---|---|---|
| build16 앞 | 704 | — | 960 | 14.4 | 56 | 575 | 529 |
| build16 뒤 | 731 | 0 | 1,374 | 14.8 | 56 | 989 | 1,153 |
| build16u 앞 | 659 | — | 967 | 14.7 | 56 | 582 | 1,638 |
| build16u 뒤 | 685 | 225 | 1,524 | 15.0 | 53 | 1,139 | 1,865 |
| econ16 앞 → 뒤 | 0 → 0 | 0 | 974 → 974 | — | — | 589 → 589 | 같음 |

도시 등급별 끝 상태(도시당, 뒤 = 이 판. 앞 판은 레벨 칸이 없다):
| 시나리오 | 등급(상한) | 도시 | 건물 | 레벨 합 | 휴먼 | 인구 상한 |
|---|---|---|---|---|---|---|
| build16 앞 | 3 / 4 / 5 (16 한 값) | 12 / 23 / 28 | 14.7 / 13.2 / 15.1 | — | 12.7 / 13.3 / 14.9 | 15 / 15 / 15 |
| build16 뒤 | 3(12) / 4(16) / 5(20) | 9 / 30 / 26 | 13.3 / 14.0 / 16.1 | 같음 | 12.2 / 19.5 / 22.9 | 15 / 21.0 / 23.1 |
| build16u 뒤 | 3(12) / 4(16) / 5(20) | 11 / 27 / 27 | 13.8 / 13.5 / 17.1 | 16.3 / 16.9 / 20.7 | 17.1 / 23.0 / 24.4 | 19.5 / 26.5 / 25.0 |
- build16에는 판자·벽돌을 내는 시설이 없어 레벨 올리기 0(구할 길이 없는 재료 — 질문 1186). build16u는 레벨 2 재료가 있어 225번.
- 인구는 붐빔 숙소로 자란다(960 → 1,374). 생필품 조건을 넣기 전에는 3,111이었다(만족도 48) — 조건을 넣었다(질문 1188).
- 낮은 등급 도시의 건물 수가 상한보다 많은 것은 하루 끝마다 등급이 오르내려서다(더 높을 때 지음, 허물지 않음 — 질문 1192).

### 3. 시뮬 war16 30일 (1112 가 + 1146·1143, Verified: 같은 방법)
| | 세력 | 도시 | 유닛 | 전투 | 공성 | 공격 승 | 쓰러짐 |
|---|---|---|---|---|---|---|---|
| 앞(SIM 29) | 29 | 66 | 2,739 | 581 | 433 | 506 | 4,802 |
| 뒤(SIM 30) | 27 | 66 | 2,648 | 511 | 361 | 429 | 4,042 |
- war16은 경제가 없어 증축이 없다 → 차이는 공성 변(서쪽 고정 → 공격 세력 쪽)만이다(Assumed: 다른 바뀜이 war16 경로에 닿지 않음 — 코드 읽기). 공성 수·공격 승이 준 까닭(오는 쪽 변의 성벽·둘레 건물 차이)은 따로 재지 않았다(Unknown).

### 4. 서버 (Verified: DB 시험)
- `npc/cityBuildUpgrade.db.test.ts`(새): 씨앗 시설 `seeded`(DB 칸 수 같음), 씨앗 숙소의 쉼터 침대 > 0인데 도시 `beds` = 0(상한 = 주거). 깎인 창고(상태 0) → 판단이 수리 작업 → 가득. 상한 1(모든 등급)이면 새 건물 0, 레벨 올리기 작업 → 레벨 2, 판자가 소멸 계정으로, 도시 경제가 레벨 2로 돈다.
- `npc/cityBuild.db.test.ts`: 나라 성격 목표로 가공·완제품 시설(주방 등)도 서고 특산을 건물로 돌린다. 등급 상한은 첫 하루 끝 전 등급 1(상한 8)이라 이 시험만 16으로 둔다(질문 1187).
- `facilities/attack.db.test.ts`: 이웃 야적장이 공성 시작 자료의 결과 목표에 든다(대상 다음).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/npc/build.ts`·`coefficients.ts`, `tuningNpc.ts` | 나라 목표·붐빔 숙소·막힌 시설·등급 상한(`buildingCapOf`)·레벨 올리기 후보(`rankCityUpgrades`)·수리(`chooseCityRepair`), 설정 칸 일곱 |
| `packages/sim/src/simulator/npcBuild.ts` | 수리 → 짓기 → 레벨 올리기, 시뮬 짓기 자리 레벨 올리기·숙소 침대, 요약 `npcCityGrades` |
| `packages/sim/src/simulator/npcRun.ts`·`run.ts`·`catalog.ts`·`combatRun.ts`, `cli/common.ts` | 카운트·요약(형식 19), 시뮬 나라 목표, 시뮬 공성 변, 시설 `maxLevel` |
| `packages/sim/src/version.ts` | SIM 30 |
| `packages/sim/scenarios/build16u.json`(새) | 레벨 올리기 측정 |
| `apps/server/src/db/facilitySchema.ts`, `drizzle/20261112111806_facility_seeded/`(새), `facilities/state.ts`, `world/persist/tables.ts` | `seeded` 칸 |
| `apps/server/src/facilities/npcSeed.ts`·`cityWalls.ts` | 씨앗 시설에 `seeded` |
| `apps/server/src/npc/cityRest.ts`·`economy.ts`, `market/worldInput.ts` | `capBeds` → 도시 `beds`, `cityJobsOf` |
| `apps/server/src/facilities/service.ts` | `npcJob`(NPC 레벨 올리기·수리) |
| `apps/server/src/npc/cityBuild.ts`·`runtime.ts` | 서버 레벨 올리기·수리·후보·침대, 나라 목표 |
| `apps/server/src/world/battleTargets.ts`, `facilities/attack.ts`, `npc/gardener.ts`, `world/world.ts` | 공성 둘레 시설 결과 목표 |
| `apps/server/src/market/catalog.ts` | 시뮬 목록 `maxLevel` |
| `apps/server/bench/cityRest.ts` | 인구 상한 칸 |
| `content/core/tuning.json`·`manifest.json` | 설정 칸, core@77 |
| 시험: `npc/build.test.ts`·`simulator/npcBuild.test.ts`·`simulator/run.test.ts`, `npc/cityRest.test.ts`·`cityBuild.db.test.ts`·`cityBuildUpgrade.db.test.ts`(새), `facilities/attack.db.test.ts`·`gateway.test.ts`, `world/battleTargets.test.ts`(새) | |
| 문서: 질문 `2026-11-12-npc-build-2.md`(새), 질문 셋 답 줄, ADR 셋 바뀜 | |

## 함께 바꿔야 하는 파일
- 다른 줄기와 겹치는 판: 팩 core@77, `SIM_VERSION` 30, 출력 형식 19, 마이그레이션 하나(`seeded` — 다른 줄기 마이그레이션과 같은 부모면 갈래로 그대로 합친다, AGENTS.md 6장 Drizzle).
- 세계 씨앗이 시설을 더 세우는 곳을 만들면 시설 줄에 `seeded: true`.
- `apps/server/src/npc/runtime.ts` 996줄·`world/world.ts` 1,000줄 바로 아래 — 더할 것은 다른 파일로.

## 건드리지 말 것
- 쉼터 자리(`bedTotal`)는 모든 침대다. 상한에 드는 침대(`capBeds`)와 섞지 않는다.
- 웨이브 넥서스(행정 건물)를 결과 목표로 달지 않는다(정원사 결과 규칙과 두 번 깎인다 — 질문 1190).

## 미검증·TODO·알려진 문제
- 실제 행성 세계(NAS)에서 등급 상한·레벨 올리기·수리·붐빔 숙소가 며칠 동안 어떻게 자라는지 재지 않았다(Unknown). NAS 세계는 판자를 내는 나라(목재 국가)만 레벨 2를 올린다(벽돌은 아무도 내지 않는다 — 질문 1186).
- 이미 선 세계의 씨앗 적기(마이그레이션)는 시험 DB(새 세계)에서만 돌았다 — 옛 세계 줄에서 맞게 적는지는 재지 않았다(미실행).
- 공성 둘레 시설이 실제 전투에서 깎여 세계에 남는 것은 DB 시험이 목표가 달리는 것까지 보았다(결과 적용 길은 앞 판 넥서스 시험과 같다). 둘레 건물이 실제로 부서지는 전투를 끝까지 돌려 보지는 않았다.
- war16 공성 수·공격 승이 준 까닭은 나눠 재지 않았다.

## 검사
- Verified: `pnpm check`(TEST_DATABASE_URL 있음) 통과 — 포맷·린트·타입·경계·파일 크기·다국어(6,965키)·디자인 값·콘텐츠(core@77), 시험 660파일 5,025개.
- Verified: `pnpm check:content origin/main`(호환 포함) 통과, `pnpm check:docs origin/main` 통과, `pnpm docs:index`.
- Verified: sim 시험 101파일 811개(작업 중), 서버 DB 시험 `cityBuildUpgrade`·`cityBuild`·`attack` 통과.
- `apps/game`은 바꾸지 않아 빌드·`check-pwa`·`check:bundle`·화면 시험은 돌리지 않았다.

## 사용자 결정 대기
- 질문 1186~1192(`docs/questions/2026-11-12-npc-build-2.md`).
