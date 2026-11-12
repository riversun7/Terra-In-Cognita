# 컨디션(관리 보너스)·초기 스탯 합 상한·채집 T9·예상 채집 확률표 (D-534)

- 일시: 2026-11-12 17:30 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-534, ADR `docs/adr/2026-11-12-unit-condition.md`(제안), 질문 `docs/questions/2026-11-12-condition-gather.md`(1151~1158), 가지 `work/condition-gather`

## 한 일
- **컨디션**(새 시스템, `packages/sim/src/society/condition.ts`): 주거 몫(선호 주거 등급 대비 숙소 등급, 집, 노숙) + 음식 몫(생필품 충족 ‰) → 합계 ±상한(설정 칸 `condition_cap` 40).
  만족도와 따로, 저장하지 않음(늘 다시 셈 → 마이그레이션 없음). 채집 유효 스탯에 더한다(`gatherStat` 넷째 인자, `workerEffects` plan.condition).
  선호는 [임시] 최소 모델(초기 합 → 선호 주거 등급). 설정 칸 `condition_*` 10개(개발자 패널 경제 페이지, 서버 반영 범위 live).
- **서버**: `labor/condition.ts`가 입력을 모은다(초기 합 = 사이보그 처음 값·그 밖 60, 주거 = 주인의 그 도시 숙소 최고 레벨, 음식 = `world_cities.necessities_pm`).
  채집 정산(`workBook` → `gatherLots`)이 그 시설 도시의 컨디션을 더하고, 유닛·사이보그 화면(`units.list`·`cyborg.get`)에 `condition` 칸(`RosterCondition`)을 보낸다.
- **화면**: 유닛 상세·사이보그 화면 상태 목록에 컨디션 한 줄(`roster/ConditionFact.tsx`, ko·en, 토큰만). 시안 자료에 컨디션 값.
- **초기 스탯 합 상한**: `@terra/shared/statGrowth` `STAT_SUM_ABSOLUTE_MAX` 100·`capStatSum`. 사이보그 굴림(100 넘으면 던짐), 구인 카드·처음 인구(토탈 100으로 자름, Lv4·Lv5 [임시] 65~80·70~80),
  융합(합 비례 축소), 유전자(합성 총합 ≤ 100, 출발 상한 600 → 80, 인큐베이터 ≤ 휴먼 최대), 크리쳐(팩 검사 `creature_stat_sum`, 편집기 예산 보스 72·전설 78·신화 80, 팩 13종을 80으로 비례 축소).
  새 설정 칸 `n9_human_sum_max`·`n9_creature_sum_max`(80), 설정 칸 검사 `stat_sum_cap`, `n9_initial_sum` 최대 600 → 100.
- **채집 T9**: 팩 core@76 확률표 200 구간 T9 2‰, 220 15‰, 새 240 25‰·260 35‰(`TEST_GATHER_BANDS` 같음).
- **예상 채집 확률표**: 생산 편집기 공용 [예상 확률] 탭(`ProductionExpectPanel.tsx`, 새 조각 없음 → PWA 목록·`e2e/dev.spec.ts` 도구 수 그대로). 셈은 `@terra/shared/gatherExpect`
  (성장 `primaryAtLevel`을 sim → shared로 옮기고 sim이 다시 내보냄). 컨디션·시설 레벨 손잡이, 담은 확률표 반영. `buildings.list` `gatherRules`에 성장률·K·만렙·레벨 보너스·컨디션 상한.

## 측정 (Verified: 같은 함수로 팩 core@76 표, 시설 Lv1, K 0.8~1.2 두 스탯 9×9 평균)
| 초기 | 레벨 | 컨디션 | 유효 스탯 | T8 | T9 | 기대 티어 |
|---|---|---|---|---|---|---|
| 15·15 | 50 | 0 | 146~206 | 0.5% | 0% | 2.11 |
| 15·15 | 50 | +40 | 186~246 | 1.2% | 0.7% | 2.52 |
| 15·15 | 60 | 0 | 170~242 | 0.8% | 0.4% | 2.40 |
| 15·15 | 60 | +40 | 210~282 | 2.7% | 2.3% | 2.89 |
| 18·18 | 50 | 0 | 176~246 | 1.1% | 0.6% | 2.47 |
| 18·18 | 50 | +40 | 216~286 | 2.9% | 2.6% | 2.96 |
| 18·18 | 60 | 0 | 204~290 | 2.7% | 2.3% | 2.90 |
| 18·18 | 60 | +40 | 244~330 | 3.5% | 3.4% | 3.17 |
- 15·15 만렙 + 컨디션 +40은 T9 구간에 닿는다(K 1.0이면 유효 216 → 200 구간 T9 0.2%, K 평균 0.7%). 시설 Lv5(+40)도 같은 크기라 질문 1155.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/society/condition.ts`(+시험), `tuningCondition.ts`, `society/coefficients.ts`, `tuning.ts`, `tuningPages.ts`, `index.ts` | 컨디션 규칙·계수·설정 칸 |
| `packages/shared/src/statGrowth.ts`(+시험), `gatherExpect.ts`(+시험), `gatherMath.ts`, `package.json` | 절대 상한·성장 공용·예상 표 셈, 유효 스탯에 컨디션 |
| `packages/sim/src/combat/stats.ts` | `primaryAtLevel`을 shared에서 다시 내보냄 |
| `packages/sim/src/simulator/economy.ts`·`run.ts`·`scenario.ts` | `workerEffects` 컨디션, 시나리오 칸 `condition`, `conditionCap` |
| `packages/sim/src/society/cyborgStats.ts`·`recruitment.ts`·`fusion.ts`·`genes.ts`, `tuningRecruit.ts`, `tuningChecks.ts`(+시험), `packages/shared/src/tuning.ts` | 초기 합 상한 |
| `packages/sim/src/economy/gather.ts`(+시험), `content/core/gather_tiers.json`, `manifest.json`(76) | T9 구간 |
| `content/core/tuning.json`, `creatures.json`, `packages/content/src/validate/statSums.ts`·`pack.ts`, `packages/shared/src/creatureEditor.ts` | 새 칸, 크리쳐 80 |
| `apps/server/src/labor/condition.ts`(+시험)·`gatherWork.ts`(+시험)·`workBook.ts`·`service.ts`, `facilities/world.ts`, `holdings/world.ts`, `world/world.ts`(1줄), `npc/economy.ts`, `tuning/scope.ts` | 서버 컨디션 |
| `apps/server/src/roster/services.ts`·`preview.ts`, `app.ts`, `packages/shared/src/roster.ts` | 화면 컨디션 칸 |
| `apps/server/src/buildingEdit/services.ts`, `packages/shared/src/buildingEditor.ts` | 예상 표 손잡이 |
| `apps/game/src/roster/ConditionFact.tsx`·`roster.css`, `units/UnitDetail.tsx`, `cyborg/CyborgScreen.tsx` | 컨디션 한 줄 |
| `apps/game/src/editor/production/*`(ExpectPanel·Screen·Model·Icons·css), `creatures/CreatureStatsTab.tsx`, `tuning/tuningMessages.ts`, `balance/balanceMessages.ts`, `messages/{ko,en}.json` | 예상 확률 탭·문구 |
| `e2e/gather-expect.spec.ts` | 새 화면 시험 |
| ADR 새 1개 + economy-core·faction-society-core·cyborg-fusion-genes "바뀜 (2026-11-12)" | 결정 기록 |

## 함께 바꿔야 하는 파일
- 물류 줄기(`logistics-2`)의 플레이어 일꾼 숙소 배정이 합쳐지면 `apps/server/src/labor/condition.ts`·`facilities/world.ts`의 주거 입력을 배정 숙소로(질문 1152).
- 팩 판 번호는 core@76으로 올렸다(다른 줄기와 겹치면 통합 때 접는다). `SIM_VERSION`·프로토콜은 그대로.

## 건드리지 말 것
- `STAT_SUM_ABSOLUTE_MAX`(100)는 설정 칸으로 만들지 않는다(사용자 원문 "어떠한 경우에도").
- `apps/server/src/world/world.ts`는 998줄(상한 1,000).

## 미검증·TODO·알려진 문제
- (아래 "검사"에 결과)
- 시뮬 도시 시설은 일꾼 스탯·컨디션이 기본값이라 시뮬 결과는 그대로다(Assumed: sim 시험 통과로 확인, 시나리오 요약은 비교하지 않음).
- 선호 음식·성향별 선호는 없다(질문 1151). 컨디션은 전투·진행 속도·수확량에 들지 않는다(질문 1154).

## 검사
- 미실행

## 사용자 결정 대기
- 질문 1151~1158(`docs/questions/2026-11-12-condition-gather.md`).
