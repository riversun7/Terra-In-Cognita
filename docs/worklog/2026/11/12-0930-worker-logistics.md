# 숙소 = 일꾼 회복 + 주거, 시작 도시 숙소 수 = 주거 ÷ 침대, 채집소 → 창고 옮김에 거리 시간

- 일시: 2026-11-12 09:30 (KST)
- 작업 도구: Claude Code
- 관련: 기획 정리 D-533(질문 1047 다·1049 나·1050 가 "추천대로"), 사용자 원문(2026-11-11) "숙소는 노동자 회복 루트, 창고와 원자재채집소와의 관계도 고려", ADR `docs/adr/2026-11-11-city-building-layout.md` "바뀜 (2026-11-12)", 질문 `docs/questions/2026-11-12-worker-logistics.md`(1086~1095), 가지 `work/worker-logistics`(바탕 main `4bfc786`)

## 한 일
- 공용 규칙(`@terra/sim` `society/logistics.ts`): 쉬는 곳의 회복 배율(숙소 Lv = 주거 등급 N24, 집, 노숙 S25), 일한 몫(정산 엔진의 일·쉼 바퀴 + 일터 ↔ 쉼터 왕복), 집에 견준 셈 배율, 하루 쉬는 번 수, 옮김 횟수·시간(무게 ÷ 화물 상한 × 왕복 ÷ 나르는 사람). 새 피로 체계를 만들지 않고 기존 `recoveryPm`(labor.ts)·`fatigueRecoverStepMs`·`TEST_JOB_RULES`·`WALK_SPEED`·`gather_obj_carry_g`를 그대로 쓴다.
- 시뮬 경제: 시설에 `dutyPm`(숙소 셈 배율)·`haul`(옮김 칸·화물 상한)을 두고 생산 속도에 곱하고 한 번 시간에 옮김 시간을 더한다. 시나리오 `cityPlan`에 `dutyPm`·`haulCells`(측정용). 목록에 물건 무게(팩 `weight`).
- NPC 도시(서버): `npc/cityRest.ts` `planCityRest` — 일꾼마다 침대가 남은 숙소 가운데 길 위(돌아감이 작은) 곳, 모자라면 집·노숙. 도시 경제가 시설을 맞출 때 이 계획으로 시설 속도 배율·옮김 칸을 넣고(`npc/economy.ts`, `market/worldInput.ts`), 휴먼 집·일터도 같은 계획으로 밤 쉼터를 고른다(`humanPlaces.ts`). 하루 끝 숙소 요금(남의 숙소만).
- 시작 도시 숙소 수: ⌈주거 ÷ Lv1 침대⌉, 위 끝 `npc_seed_lodgings`(3 → 8, 뜻을 위 끝으로). 주거 40이면 4채.
- 플레이어 채집소: 자동 옮김이 정시에 싣고 떠나 걸어 나르는 시간 뒤 도시 창고에 닿는다(나르는 동안 그 채집소는 다음 정시를 건너뜀). 채집소 판에 옮김 칸·시간·닿는 시각, 건물 카드(숙소)에 침대·쉬는 NPC 일꾼(ko·en).
- 설정 칸 다섯(팩 core@74): `lodging_recovery_mode`·`lodging_beds_per_level`·`lodging_fee_per_night`·`lodging_home_recovery_pm`·`haul_distance_mode`(모두 [임시], 개발자 패널 경제 페이지).
- 측정 스크립트 `pnpm --filter @terra/server bench:city-rest [도시 수]`.

## 측정
### 1. 일꾼 쉼·하루 일·산출 (Verified: `pnpm --filter @terra/server bench:city-rest 16`, S2 시험 행성 F9, 빈 세계 등급 배치 16도시, 전략 배치, 처음 인구 = 주거 40 × 750‰ = 30명을 채집소에 고르게 — 남는 사람은 건물 없는 도시 직무)
| 평균 | 셈 배율 ‰ | 일터↔쉼터 칸 | 하루 일 시간 | 하루 쉼(회복 + 오감) 시간 | 산출 지수(숙소 없음 = 100) |
|---|---|---|---|---|---|
| 숙소 길 위(배치 그대로, 4채) | 1326 | 16.9 | 7.97 | 16.02 | 133.1 |
| 숙소 길 밖(넷 모두 채집소 반대쪽 40칸 한곳) | 1317 | 50.6 | 7.90 | 16.10 | 132.1 |
| 옛 숙소 수 3채(침대 30) | 1297 | 18.1 | 7.81 | 16.19 | 130.2 |
| 숙소 없음(시청 칸 집) | 996 | 19.1 | 6.00 | 18.00 | 100.0 |
- 숙소에서 쉬면(Lv1 ×1.5) 피로 120점 푸는 쉼이 6시간 → 4시간, 하루 일 6 → 8시간(+33%).
- 길 위 ↔ 길 밖 차이는 약 1%다: 일터 ↔ 쉼터 왕복(17칸 = 80초, 50칸 = 4분)이 쉼 바퀴(4~6시간)에 견줘 짧다(걷기 D-120 2,344ms/칸). 거리보다 침대 수(3채 → 침대 30, 일꾼이 많은 도시는 일부가 집)가 더 크다. 그래서 "회복 루트"의 효과는 지금 수치로는 주로 숙소가 있느냐·침대가 넉넉하냐로 나온다(질문 1095 — 피로 바퀴와 낮·밤 근무).

### 2. 채집소 → 창고 옮김 (Verified: 같은 측정, 채집소 40곳 → 가장 가까운 창고, 화물 상한 80kg, 나르는 사람 1)
| 칸 구간 | 채집소 | 평균 칸 | 왕복(초) | 100kg 나르기(초) |
|---|---|---|---|---|
| 0~9 | 33 | 6.7 | 31.5 | 63.1 |
| 10~19 | 7 | 12.0 | 56.3 | 112.5 |
- 거리별 셈(Verified: 같은 식을 node로 셈): 5칸 왕복 23초·100kg 47초·300kg 94초, 20칸 94초·188초·375초, 40칸 188초·375초·750초, 80칸 375초·750초·1,500초. 자동 옮김 간격 10분(600초) — 40칸 넘게 떨어진 300kg 채집소(농장 Lv1 창고 상한)는 나르는 사람 하나로 정시를 따라가지 못해 창고가 찬다. 배치가 창고를 채집 구역 길에 둬서(평균 6.7칸) 지금 시작 도시는 막히지 않는다.

### 3. NPC 도시 산출 (Verified: `node cli/sim.ts <변형>.json --days 30`, econ16 시드 1, 변형은 모든 시설 계획에 `dutyPm` 1326·채집 시설에 `haulCells`)
| 30일 생산 | 기본 | 숙소(1326‰) | 숙소 + 옮김 7칸 | 숙소 + 옮김 40칸 | 옮김 40칸만 |
|---|---|---|---|---|---|
| 구리 광석 | 12,136,000 | 16,256,000 | 16,212,000 | 16,084,000 | 12,042,000 |
| 철광석 | 6,198,000 | 8,176,000 | 8,162,000 | 8,106,000 | 6,174,000 |
| 곡물 | 920,960 | 1,221,760 | 1,221,760 | 1,221,760 | 920,960 |
| 목재 | 920,320 | 1,221,120 | 1,221,120 | 1,221,120 | 920,320 |
| 전투식량 | 690,240 | 915,840 | 915,840 | 915,840 | 690,240 |
| 돌 | 18,448 | 24,302 | 24,254 | 24,090 | 18,292 |
| 거래 | 337 | 448 | 451 | 447 | 337 |
| 생필품 모자람(전투식량, 유닛·회) | 296,668 | 286,702 | 286,702 | 286,760 | 296,668 |
- 숙소 배율을 얹으면 생산 +32~33%, 거래 +33%, 생필품 모자람 −3.4%. 옮김 40칸은 광석·돌 −0.8~1.1%. 곡물·목재는 팩에 무게가 없어 옮김 시간이 0이다(질문 1094). 시뮬 기본 시나리오(`dutyPm`·`haulCells`를 적지 않음)는 셈이 예전과 같다(Assumed: 정수 셈이 같아짐을 코드로 확인 — 옛 판과 나란히 돌리지 않았다. econ16 기본 30일 hash 50640993, 위반 0).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/society/logistics.ts`·`logisticsCoefficients.ts`·`logistics.test.ts` | 숙소 회복·일한 몫·셈 배율·하루 쉬는 번 수·옮김 시간 규칙과 계수(새) |
| `packages/sim/src/society/coefficients.ts`·`tuningLogistics.ts`·`tuning.ts`·`tuningPages.ts`·`index.ts` | 계수표 `logistics` 칸, 설정 칸 다섯(경제 페이지) |
| `packages/sim/src/society/worldSeed.ts` | `npc_seed_lodgings` 출발값 8(뜻 = 위 끝) |
| `packages/sim/src/simulator/economy.ts`·`catalog.ts`·`scenario.ts`, `packages/sim/cli/common.ts` | 시설 `dutyPm`·`haul`, 물건 무게, 시나리오 칸 |
| `apps/server/src/npc/cityRest.ts`·`cityRest.test.ts` | NPC 도시 일꾼 쉼터·옮김 칸 계획(새) |
| `apps/server/src/npc/economy.ts`·`market/worldInput.ts`·`market/catalog.ts` | 도시 경제가 계획으로 시설 속도·옮김 칸을 넣음, 숙소 요금, 쉼터 계획 조회, 물건 무게 |
| `apps/server/src/npc/humanPlaces.ts`·`humanPlaces.test.ts`·`runtime.ts` | 휴먼 밤 쉼터 = 같은 계획 |
| `apps/server/src/facilities/npcSeed.ts`·`npcSeed.test.ts`·`world/cities.ts` | 시작 도시 숙소 수 = 주거 ÷ 침대(도시 행에 주거) |
| `apps/server/src/gather/station.ts`·`station.test.ts`·`station.db.test.ts`·`stationReads.ts` | 채집소 자동 옮김에 거리 시간, 옮김 길·나르는 중 조회 |
| `apps/server/src/facilities/views.ts`·`appSource.ts` | 숙소 카드 침대·쉬는 일꾼 |
| `packages/shared/src/gatherStation.ts`·`facilities.ts` | 응답 칸(선택) 더함 |
| `apps/game/src/map/gather/StationPanel.tsx`·`economy/FacilityCards.tsx`·`messages/{ko,en}.json` | 화면 두 줄(ko·en) |
| `apps/server/bench/cityRest.ts`·`package.json`·`tsconfig.json`·`bench/tsconfig.json` | 측정 스크립트 |
| `content/core/tuning.json`·`manifest.json` | 설정 칸 다섯 + `npc_seed_lodgings` 뜻·값, core@74 |
| `docs/adr/2026-11-11-city-building-layout.md`, `docs/questions/2026-11-12-worker-logistics.md` | 바뀜 절, 질문 1086~1095 |

## 함께 바꿔야 하는 파일
- 설정 칸을 더하면 `content/core/tuning.json`과 `packages/sim/src/tuningLogistics.ts`를 같이(팩 판 올림).
- 쉼터 고르는 규칙을 바꾸면 `npc/cityRest.ts` 하나 — 도시 경제·휴먼 집·건물 카드가 같이 따른다.

## 건드리지 말 것
- `planCityRest`의 일꾼 차례(시설 ID 차례 × 일꾼 수)는 `assignHumanPlaces`가 휴먼을 나누는 차례와 같아야 한다(보이는 쉼터 = 셈).

## 미검증·TODO·알려진 문제
- 기존 NAS 세계: 이 판으로 켜면 시작 도시마다 숙소가 하나씩 더 선다(3 → 4, 모자란 것만 더함). NPC 도시 생산이 숙소 배율로 약 +33% 오른다(측정 3) — 거래소 값이 내려갈 수 있다(Unknown: NAS에서 보지 않았다).
- 숙소 요금 거래(`lodging_fee`)는 남의 숙소에서만 생긴다. 지금 NPC 일꾼이 플레이어 숙소를 쓰는 세계를 DB 시험으로 만들지 않았다(미실행 — 단위 시험은 계획만 본다).
- 채집소 나르는 중 상태는 메모리다(다시 켜면 물건은 채집소 창고에 남아 다음 정시에 다시 떠난다).
- 손으로 옮기기는 여전히 바로(질문 1091). 플레이어 일꾼은 숙소 회복을 받지 않는다(질문 1088).
- 숙소 카드(침대·쉬는 일꾼) 줄은 화면 시험·사진으로 보지 않았다(플레이어가 숙소를 가진 시험 세계가 없다 — 타입 검사·코드만, 미실행).

## 검사
- Verified: `pnpm check`(TEST_DATABASE_URL) — 포맷·린트·타입·경계 통과, 파일 크기에서 `packages/sim/src/index.ts` 1,001줄로 한 번 실패 → 내보내기 줄을 빼 999줄로 고친 뒤 크기·다국어(6,883키)·디자인 값·콘텐츠·`pnpm test` 다시: 처음 634파일 중 DB 시험 2파일 4건 실패(시작 도시 숙소 수 3 → 4를 기대값이 몰랐다) → `npcSeed.db.test.ts`·`nationTiers.db.test.ts`가 주거로 숙소 수를 세게 고친 뒤 두 파일 8건 통과. 나머지 632파일 4,882건 통과.
- Verified: `pnpm build` + `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 108,912 B / 상한 131,416 B.
- Verified: `pnpm e2e e2e/gather-station.spec.ts` 9건 통과(5.0분), 옮김 줄 사진을 더한 농장 판 2건 다시 통과. 사진(저장소 밖): `gather-station-haul-route-390-{pastel-ko,dark-en}.png`, `gather-station-farm-390-dark-en.png` — 시작 도시 농장 "창고까지 6칸 · 지금 짐 나르기 1분 안".
- Verified: `pnpm check:content origin/main`(호환 포함), `pnpm check:docs origin/main` 통과.

## 사용자 결정 대기
- 질문 1086~1095(`docs/questions/2026-11-12-worker-logistics.md`).
