# 플레이어 일꾼 숙소 회복, 숙소 침대 = 인구 상한, 보이는 운반꾼, 손 옮김 거리 시간, 피로 바퀴 움직임, 아이템 무게

- 일시: 2026-11-12 17:12 (KST)
- 작업 도구: Claude Code
- 관련: 기획 정리 D-534 "기술 추천대로"(질문 1086~1095 `docs/questions/2026-11-12-worker-logistics.md`), 앞 줄기 `docs/worklog/2026/11/12-0930-worker-logistics.md`, ADR `docs/adr/2026-11-11-city-building-layout.md` "바뀜 (2026-11-12 2차)", 질문 `docs/questions/2026-11-12-logistics-2.md`(1131~1140), 가지 `work/logistics-2`(바탕 main `9e30065`)

## 한 일
- **1088 가 — 플레이어 일꾼도 숙소에서 회복**: 직무 배치·노동 계약 일꾼은 일터 도시의 숙소 가운데 NPC 계획이 쓰고 남은 침대를 유닛 ID 차례로 받는다(`npc/cityRest.ts planPlayerRest`). 침대가 없으면 집(×1.0, 3분에 1점) [임시]. 소유 주체 정산에 유닛별 직무 규칙(`settleOwnerPeriod` `unitRules`)을 더해 쉼터 회복 배율을 얹는다(`labor/workerRest.ts`, 정산 고리 `settlement.restRules`). 숙소 Lv1 = 예전 시험 규칙(2분에 1점)과 같다. 남의 숙소면 일·쉼 한 바퀴마다 하룻밤 요금(일꾼 주인 → 숙소 주인, 시험 화폐) [임시]. 채집소 판 일꾼 줄에 "숙소 Lv1에서 쉼(회복 ×1.5)"·"집에서 쉼(회복 ×1.0)"과 안내 한 줄(ko·en).
- **1089 나 — 숙소 침대가 인구 상한을 늘림**: `@terra/sim cityHousingCap` = 주거 + 침대. 구인 규칙식 목표(D-469)·마을 세우기 붐빔·만족도 주거 칸·쉼터 계획 자리 수가 이 값을 본다. 서버 도시 경제가 맞출 때마다 도시 숙소 침대 합을 시뮬 도시 `beds`에 적는다. 가문 구인 화면의 주거도 상한으로. 시작 도시 숙소 수(1049 나)·처음 인구는 주거(집)만 본다(물고 돌지 않게) — 그래서 시작 도시 상한이 두 배가 된다(측정 1, 질문 1131).
- **1090 가 + 1092 가 — 보이는 운반꾼**: `gather/porter.ts`. 채집소 일꾼 하나(그 2차맵에 있고 움직일 수 있고 채집 줄이 없는 유닛, 물건 주인 유닛 먼저)가 운반꾼이다. 떠날 때 물건이 채집소 창고 → 운반꾼 화물(거래 `station_haul_load`), 닿는 시각에 화물에 남은 만큼 도시 창고로(`station_haul`). 시간 셈은 옛 식 그대로(나르는 사람 = 운반꾼 하나 [임시], 질문 1134). 운반꾼은 채집소 ↔ 창고를 오가며 걷고(5초마다 확인) 닿으면 채집소로 돌아간다. 운반꾼이 없으면 물건이 기다린다 [임시]. 다시 켜면 일꾼 화물에 남은 짐이 다음 정시에 다시 떠난다. 채집소 판에 "유닛 N이(가) 짐을 지고 나르는 중"(ko·en).
- **1091 가 — 손으로 옮기기도 거리 시간**: 건물 서비스 `attachStorageOut` 고리 → 채집소 건물이면 `station.haulOut`(같은 운반꾼·시간, 10초 안 명령은 한 짐으로 합침). 운반꾼이 없으면 `unknown_unit`, 모두 바쁘면 `unit_busy` → 화면 "짐을 질 일꾼이 없습니다". 채집소 아님·거리 0·옮김 셈 끔이면 예전처럼 바로.
- **1093 나**: 할 일 없음(운송 줄기로).
- **1094 — 아이템 무게**: 옛 표 `AntiGravt01/docs/GDD/Item/Consolidated_Item.md`(ITM-10 원자재 표·요리 5.1) 확인(Verified). 표에 있는 원자재(광석 1kg·통나무 2kg·작물 0.05~0.5kg·약초·생선·목장)는 팩에 이미 같은 값이 있었다. 무게가 없던 17개를 채움: 곡물 200g·원목 2kg·배급 식량 500g(표 값), 생활용품 1kg·시험 장비 9종·임시 아이템 [임시](질문 1137·1138). 팩 core@76.
- **1095 가 — 피로 바퀴**: 생산 셈은 이미 피로 바퀴였다(Verified: `restDutyPm`·`settle.ts advanceJob`). 보이는 NPC 일꾼 움직임은 지역 낮·밤이었다 → 이제 같은 일·쉼 바퀴(`WorkShift.cycle`, `restCycleOf`)로 일터 ↔ 쉼터를 오간다. 바퀴 시작은 유닛마다 흩음. 설정 칸 `worker_rest_cycle_mode`(1, 0 = 옛 낮·밤). 플레이어 일꾼은 2차맵에서 따로 걷지 않는다(정산 엔진의 피로 바퀴 — 그대로).
- 측정 스크립트 `bench:city-rest`에 인구 상한(주거·침대) 표와 채집소 옮김(첫 레시피 한 묶음 무게·가득 찬 창고 나르기·간격 넘는 채집소) 표, `--pack <폴더>`(무게 전·후 견주기).

## 측정
### 1. 인구 상한·일꾼 쉼 (Verified: `node bench/cityRest.ts 16`, S2 시험 행성 F9)
| 시작 도시 16곳 평균 | 주거 | 숙소 침대 | 예전 상한 max(주거, 침대) | 지금 상한 주거 + 침대 |
|---|---|---|---|---|
| 이 판 | 43.0 | 45.0 | 45.0 | 88.0 |
- 구인 목표(주거 × `recruitTargetPm` 1000‰)가 평균 45 → 88명이 된다. 처음 인구는 그대로(주거 × 750‰).
- 일꾼 쉼·산출 지수는 앞 줄기·이 판이 같다(Verified: 같은 16도시를 옛 코드 스냅숏 `bench-before`와 이 판으로 — 길 위 셈 배율 1325‰·하루 일 7.94시간·산출 지수 133.1, 옛 숙소 3채 130.2, 숙소 없음 100). 처음 인구 30명이 모두 침대 안이라 "주거 + 침대" 자리 셈이 바뀌어도 쉼터가 같다.

### 2. 채집소 옮김·밀림 — 아이템 무게 전·후 (Verified: 같은 측정, `--pack` 옛 팩 core@75 ↔ core@76, 운반꾼 하나, 화물 상한 80kg, 자동 옮김 10분)
| 시설 | 채집소 | 평균 칸 | 한 묶음(첫 레시피) 무게 전 → 후 | 한 묶음 나르기 전 → 후 | 가득 찬 채집소 창고 | 가득 찬 창고 나르기 | 10분 간격을 넘는 채집소 |
|---|---|---|---|---|---|---|---|
| 농장 | 22 | 7.8 | 0 → 4kg(곡물 20 × 200g) | 0 → 36.7초 | 300kg | 146.6초 | 0 |
| 벌목장 | 18 | 8.9 | 0 → 20kg(원목 10 × 2kg) | 0 → 41.9초 | 200kg | 125.8초 | 0 |
| 광산 | 14 | 8.4 | 10g → 10g(철광석 1g) | 39.5초 | 200kg | 118.5초 | 0 |
- 밀림(창고가 차서 일이 막힘): 운반꾼 하나가 가득 찬 채집소 창고(Lv1)를 한 번에 나르는 시간이 2~2.5분으로 자동 옮김 간격(10분)보다 짧아 시작 도시 채집소 54곳 가운데 넘는 곳이 없다 — 무게를 채워도 밀리지 않는다. 화물 상한 80kg를 넘으면 여러 번(농장 300kg = 4번) 오간다. 나르는 사람이 운반꾼 하나로 바뀌어(예전 = 일꾼 수로 나눔) 일꾼이 여럿인 채집소는 예전보다 길다(질문 1134).
- 거리별(Verified: 앞 줄기와 같은 식): 40칸 떨어진 300kg 채집소는 750초로 10분을 넘는다 — 배치가 창고를 채집 구역에 두어 지금 시작 도시에는 없다.

### 3. NPC 산출 — econ16 30일 (Verified: `node cli/sim.ts <변형>.json --days 30 --seed 1`, 변형은 채집 시설 계획에 `haulCells`(7·40), `duty_` = 모든 시설 `dutyPm` 1326(숙소 배율, 앞 줄기와 같음))
| 30일 생산 | 기본 | 옮김 7칸 전 → 후 | 옮김 40칸 전 → 후 | 숙소 + 7칸 전 → 후 | 숙소 + 40칸 전 → 후 |
|---|---|---|---|---|---|
| 곡물 | 920,960 | 920,960 → 912,640 (−0.9%) | 920,960 → 875,520 (−4.9%) | 1,221,760 → 1,207,040 (−1.2%) | 1,221,760 → 1,143,040 (−6.4%) |
| 원목 | 920,320 | 920,320 → 912,640 (−0.8%) | 920,320 → 875,520 (−4.9%) | 1,221,120 → 1,207,040 (−1.2%) | 1,221,120 → 1,143,040 (−6.4%) |
| 구리 광석 | 12,136,000 | 12,118,000 (같음) | 12,042,000 (같음) | 16,212,000 (같음) | 16,084,000 (같음) |
| 철광석 | 6,198,000 | 6,190,000 (같음) | 6,174,000 (같음) | 8,162,000 (같음) | 8,106,000 (같음) |
| 전투식량(배급) | 690,240 | 같음 | 같음 | 915,840 (같음) | 915,840 (같음) |
| 거래 | 337 | 337 | 337 | 451 | 447 |
| 생필품 모자람(배급, 유닛·회) | 296,668 | 같음 | 같음 | 286,702 | 286,760 |
- 무게가 생긴 곡물(묶음 20 × 200g = 4kg)·원목(10 × 2kg = 20kg)만 옮김 시간이 생겨 생산이 준다(40칸이면 −5~6%). 배급 식량은 부엌(채집소 아님)이라 옮김 셈이 없어 그대로, 곡물이 줄어도 이 30일에는 배급 생산·모자람이 같았다.
- 기본 시나리오(옮김·숙소 배율 없음)는 생산·거래·모자람·위반 0이 core@75와 같다. `linesHash`는 b22c6eae → 7ffe146d로 다르다 — 줄에 팩 판·해시가 실려서로 본다(Assumed: 숫자 칸은 모두 같음을 요약으로 확인, 줄 파일은 견주지 않음). 그래서 `SIM_VERSION`은 올리지 않았다.
- 숙소 침대 인구 상한(1089 나)은 시뮬에 숙소가 없어(`beds` 없음) 이 표에 들지 않는다. 서버 NPC 도시는 구인 목표가 두 배라 국고가 허락하는 만큼 인구·산출이 시간을 두고 는다(Unknown: 서버를 오래 돌려 보지 않았다 — 질문 1131).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/items.json`·`tuning.json`·`manifest.json` | 무게 17개, 설정 칸 `worker_rest_cycle_mode`, core@76 |
| `packages/sim/src/settle/owner.ts`·`owner.test.ts` | 유닛별 직무 규칙 `unitRules`(1088) |
| `packages/sim/src/society/logistics.ts`·`logisticsCoefficients.ts`, `tuningLogistics.ts` | `cityHousingCap`(1089), `restPeriodMs`(요금·바퀴), `restCycleMode`(1095) |
| `packages/sim/src/simulator/world.ts`·`npcRun.ts`·`society.ts` | 도시 `beds`, 상한 = 주거 + 침대 |
| `apps/server/src/npc/cityRest.ts`·`cityRest.test.ts` | 쉼터 자리 = 주거 + 침대, `bedTotal`, `planPlayerRest`, `restCycleOf` |
| `apps/server/src/npc/economy.ts` | 도시 `beds` 적기 |
| `apps/server/src/npc/humanPlaces.ts`·`humanPlaces.test.ts`·`runtime.ts`, `world/bots.ts`·`bots.test.ts` | 피로 바퀴로 일터 ↔ 쉼터 |
| `apps/server/src/labor/workerRest.ts`·`workerRest.test.ts`(새), `labor/service.ts`(`workplaceOf`), `world/settlement.ts`(`restRules`), `gather/world.ts` | 플레이어 일꾼 쉼터·요금, 정산 고리 |
| `apps/server/src/market/worldInput.ts` | 쉼터 자리 모으기 `cityRestPlacesOf`(NPC·플레이어 같이) |
| `apps/server/src/gather/porter.ts`(새), `gather/station.ts`·`station.test.ts`, `gather/service.ts`(`acting`), `facilities/service.ts`(`attachStorageOut`) | 운반꾼, 손 옮김 거리 시간 |
| `apps/server/src/gather/stationReads.ts`, `packages/shared/src/gatherStation.ts` | 일꾼 쉼터·운반꾼 칸(선택) |
| `apps/server/src/factionIdentity/houseRecruit.ts` | 가문 구인 화면 주거 = 상한 |
| `apps/game/src/map/gather/StationPanel.tsx`·`stationData.ts`, `apps/game/messages/{ko,en}.json` | 쉼터 줄·안내, 운반꾼 줄, 일꾼 없음 문구 |
| `apps/server/bench/cityRest.ts` | 인구 상한·옮김 무게 표, `--pack` |
| `docs/adr/2026-11-11-city-building-layout.md`, `docs/questions/2026-11-12-logistics-2.md` | 바뀜 절, 질문 1131~1140 |

## 함께 바꿔야 하는 파일
- 쉼터 규칙: `npc/cityRest.ts` 하나 — NPC 계획(`planCityRest`)과 플레이어(`planPlayerRest`)·피로 바퀴(`restCycleOf`)가 같은 `@terra/sim` 셈을 쓴다.
- 인구 상한을 읽는 곳을 더하면 `city.housing` 대신 `cityHousingCap(city)`.
- 설정 칸을 더하면 `content/core/tuning.json`과 `packages/sim/src/tuningLogistics.ts`를 같이(팩 판 올림).

## 건드리지 말 것
- 운반꾼 화물 위치는 `cargoLocation(유닛)` — 전투 화물 약탈·늙은 일꾼 은퇴·불변 조건 I12가 같은 위치를 본다.
- 시작 도시 숙소 수(`seedLodgings`)는 주거(집)만 본다. 침대를 넣으면 숙소 수 ↔ 상한이 물고 돈다.

## 미검증·TODO·알려진 문제
- 운반꾼이 실제 2차맵에서 걷는 모습은 화면으로 보지 않았다(단위 시험은 이동 명령이 나가는 것까지 — 미실행). 플레이어가 그 유닛에 다른 명령을 주면 운반꾼 걸음과 다툰다(짐은 닿는 시각에 그대로 닿는다).
- 나르는 중 상태는 메모리(질문 1136). 플레이어 일꾼 요금 바퀴 나머지도 메모리.
- 서버 NPC 도시 인구가 상한 80으로 얼마나 빨리 느는지 재지 않았다(Unknown, 질문 1131).
- `gather/station.ts` 600줄 넘음(경고만, 운반꾼은 `porter.ts`로 뺐다).

## 검사
- Verified: `pnpm check`(TEST_DATABASE_URL) — 포맷·린트·타입·경계·파일 크기·다국어(6,918키)·디자인 값·콘텐츠 통과, `pnpm test` 644파일 중 2파일 2건 실패 → 고친 뒤 두 파일 7건 통과: `itemEdit/advice.test.ts`(곡물에 무게가 생겨 "무게 없음" 권고를 볼 항목이 없음 → 곡물에서 무게를 뺀 항목으로), `npc/cityNames.db.test.ts`(주거 4로 붐비게 하던 시험이 침대 상한에 막힘 → 침대도 0으로). 나머지 642파일 4,938건 통과.
- Verified: `pnpm build` + `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 108,920 B / 상한 131,416 B.
- Verified: `pnpm e2e e2e/gather-station.spec.ts` 9건 통과(5.8분). 사진(저장소 밖) `gather-station-farm-390-pastel-ko.png`·`gather-station-haul-route-390-dark-en.png` 등 — 시험 세계 채집소에 일꾼이 없어 새 줄(쉼터·운반꾼)은 사진에 나오지 않는다(화면은 타입 검사·코드만, 미실행).
- Verified: `pnpm check:content origin/main`(호환 포함), `pnpm check:docs origin/main`, `pnpm docs:index`.

## 사용자 결정 대기
- 질문 1131~1140(`docs/questions/2026-11-12-logistics-2.md`).
