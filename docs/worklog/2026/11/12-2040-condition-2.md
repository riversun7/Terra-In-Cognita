# 컨디션 선호·쉼터 주거·선택 방식 컨디션·시설 레벨 보너스 5·구인 Lv4·5·아이템 무게 (D-535)

- 일시: 2026-11-12 20:40 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-535(질문 1151~1158·1137 기술 추천 확정), ADR `docs/adr/2026-11-12-unit-condition.md`·`2026-10-31-faction-society-core.md`·`2026-11-11-city-building-layout.md` "바뀜 (2026-11-12, D-535 …)", 질문 `docs/questions/2026-11-12-condition-2.md`(1196~1203), 가지 `work/condition-2`

## 한 일
- **1151 나 선호**: 유닛마다 좋아하는 음식(식품 중분류)·선호 주거 종류(숙소·집) — `@terra/sim` `unitPreferences`(세계 시드 × 유닛 ID, 저장 없음). 선호 주거 몫 ±5, 선호 음식 몫 ±10(그 도시 창고에 그 중분류가 있나), 설정 칸 `condition_prefer_*` 4개. 서버 시드 = NPC 사회 시드.
- **1152 나 주거 = 쉼터 배정**: `labor/condition.ts`가 `workerRest.restOf`(남은 침대 숙소, 없으면 집)를 쓴다. 옛 "주인의 가장 좋은 숙소"(`ownerLodgingLevel`)는 지웠다. 채집 세계가 `facilities.attachRest`로 잇는다.
- **1154 나 선택 방식에도 컨디션**: `conditionedStats`(컨디션을 반씩 두 스탯에) → 농장·목장 해금 티어·진행 속도·수확량·낚시 성공 확률. 예상 확률 탭 칸에 "선택(농장·목장) T a~b" 한 줄.
- **1155 나 시설 레벨 보너스 10 → 5**(팩·계수표 출발값). 측정 표는 ADR "바뀜 (2026-11-12, D-535)".
- **1153 가·1156 가·1157 가**: 그대로(확인).
- **1158 나 구인 Lv4·Lv5**: 토탈 60~80(Lv3과 같음), 카드 4~6·5~7, 속성 점수 덤 +3·+6, 토탈 굴림 2·3번(큰 값). 설정 칸 `n45_element_bonus_l*`·`n45_stat_rolls_l*` 10개, 검사 `n45_fit` 확장.
- **1137 나 아이템 무게**: `@terra/shared/itemWeights`(장비 칸·무기 종류·중분류·대분류 출발값), 팩 core@77이 시험 장비 12개·임시 아이템을 그 값으로. 아이템 편집기 새 항목 틀도 이 값.
- 화면: 유닛·사이보그 컨디션 줄 아래 선호 한 줄(`RosterCondition` 새 칸, ko·en). 시안 자료에 선호.

## 측정 (Verified: `@terra/shared/gatherExpect` `expectedGatherCell`, 팩 core 확률표, K 0.8~1.2, 레벨 60)
| 초기 | 컨디션 | 시설 | 유효 스탯(레벨당 10 → 5) | T9(10 → 5) | 기대 티어(10 → 5) |
|---|---|---|---|---|---|
| 15·15 | 0 | Lv1 | 170~242 | 0.4% | 2.40 |
| 15·15 | 0 | Lv5 | 210~282 → 190~262 | 2.3% → 1.3% | 2.89 → 2.64 |
| 15·15 | +40 | Lv1 | 210~282 | 2.3% | 2.89 |
| 15·15 | +40 | Lv5 | 250~322 → 230~302 | 3.4% → 3.1% | 3.17 → 3.09 |
| 18·18 | 0 | Lv1 | 204~290 | 2.3% | 2.90 |
| 18·18 | 0 | Lv5 | 244~330 → 224~310 | 3.4% → 3.1% | 3.17 → 3.09 |
| 18·18 | +40 | Lv1 | 244~330 | 3.4% | 3.17 |
| 18·18 | +40 | Lv5 | 284~370 → 264~350 | 3.5% | 3.18 |
- 15·15 Lv20 농장 해금 T3~T4 → 컨디션 +40이면 T5~T6(시설 레벨은 해금 티어에 들지 않는다).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/society/condition.ts`(+시험), `tuningCondition.ts`, `society/coefficients.ts` | 선호·선호 몫·설정 칸, 레벨 보너스 5 |
| `packages/shared/src/gatherMath.ts`, `gatherExpect.ts`(+시험), `packages/sim/src/simulator/economy.ts`, `economy/gather.ts` | 1154 컨디션 반씩, 예상 표 해금 티어 |
| `apps/server/src/labor/condition.ts`(+시험), `facilities/world.ts`·`catalog.ts`, `gather/world.ts`, `world/world.ts`(1줄 바꿈, 줄 수 그대로), `roster/services.ts`·`preview.ts`, `tuning/scope.ts`, `packages/shared/src/roster.ts` | 서버 입력(쉼터·선호·도시 창고 식품), 화면 칸 |
| `packages/sim/src/society/recruitment.ts`(+시험), `tuningRecruit.ts`, `tuningChecks.ts`(+시험) | 1158 |
| `packages/shared/src/itemWeights.ts`(+시험), `package.json`, `apps/game/src/editor/items/itemModel.ts`(+시험), `content/core/items.json` | 1137 |
| `content/core/tuning.json`, `manifest.json`(77) | 설정 칸 14개 + 값 |
| `apps/game/src/roster/ConditionFact.tsx`, `editor/production/ProductionExpectPanel.tsx`, `messages/{ko,en}.json` | 화면 |
| `e2e/gather-expect.spec.ts`, `e2e/items.spec.ts`(Lv5 확률 6% → 3%) | 시험 |
| 시험 맞춤: `gather/service.test.ts`·`station.test.ts`, `itemEdit/previewGather.test.ts`(레벨 보너스 10 고정), `buildingEdit.db.test.ts` | 새 칸·값 |

## 함께 바꿔야 하는 파일
- 팩 판 core@77 — 다른 줄기와 겹치면 통합 때 접는다. `SIM_VERSION`·프로토콜 그대로.
- 생활 시설(주택 등)이 늘면 선호 주거 후보가 저절로 는다(`facilities/world.ts` preferences).

## 건드리지 말 것
- `apps/server/src/world/world.ts`는 998줄(상한 1,000) — `necessitiesOf` 줄을 `npc: () => npc`로 바꿨을 뿐 줄 수는 같다.

## 미검증·TODO·알려진 문제
- 선호는 저장하지 않는다(질문 1199). NPC 사회가 꺼진 서버는 시드 0으로 정한다(Assumed: 개발 서버만).
- 도시 창고 식품 표는 30초 들고 쓴다(원장 전체를 한 번 훑음). 10만 계정 규모 비용은 재지 않았다(Unknown).
- 시뮬 도시 시설은 컨디션 0이라 시뮬 결과 그대로(아래 검사).

## 검사 (Verified, 실행)
- `pnpm check`(TEST_DATABASE_URL): 포맷·린트·타입·경계·크기·다국어·대비·콘텐츠(core@77) 통과. 시험 5,015 통과 / 14 실패 — 실패는 모두 DB 시험 7개 파일의 `Hook timed out in 30000ms`(세 줄기가 한 DB를 같이 씀)였고, 그 7개 + `buildingEdit.db.test.ts`를 `--hookTimeout 180000 --no-file-parallelism`로 다시 돌려 8개 파일 21개 모두 통과.
- 시험 추가·고침: sim `condition.test.ts`(선호 4), `recruitment.test.ts`(Lv4·5 1), `tuningChecks.test.ts`(n45_fit 3), shared `gatherExpect.test.ts`(해금 티어·레벨 보너스 2), `itemWeights.test.ts`(2), server `labor/condition.test.ts`(쉼터·선호·도시 창고 식품, 5).
- 시뮬 결과 그대로: econ16·war16 60일 요약이 옛 값(`--tuning`으로 레벨 보너스 10·구인 Lv4·5 옛 값)을 얹은 실행과 바이트까지 같다(`cmp`) → `SIM_VERSION` 그대로.
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 108,929 B / 상한 131,416 B.
- e2e(헤드리스 Playwright): `gather-expect.spec.ts` 6/6(선택 해금 티어 줄·레벨당 5·선호 한 줄 확인 포함), `cyborg.spec.ts` 17/17 — 합계 23 통과. `items.spec.ts`의 광산 Lv5 확률 줄(6% → 3%)은 고쳤지만 돌리지 않았다(미실행).
- 사진: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/condition-2-shots/gather-expect-{neon-ko-1440,light-en-1440,neon-en-390,light-ko-390}.png`, `cyborg-d459-vitals-1440-dark-ko.png`.

## 사용자 결정 대기
- 질문 1196~1203(`docs/questions/2026-11-12-condition-2.md`).
