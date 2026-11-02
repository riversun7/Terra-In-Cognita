# 옛 1차 생산 규칙: 주 스탯 진행 속도·티어별 필요 진행·보조 스탯 수확량·하위 재료 (D-507)

- 일시: 2026-11-02 23:30 (KST)
- 작업 도구: Claude Code
- 관련: 사용자 원문(2026-11-02, `docs/questions/2026-11-02-gather-tier.md` 끝 절), 기획 D-507·49 N44(미러 `3fc96ba`, 이 가지에 합침), 대조 `docs/research/2026-11-02-old-primary-production.md`, ADR `docs/adr/2026-10-31-economy-core.md` "바뀜 (2026-11-02, 옛 1차 생산 규칙 …)", 앞 작업 기록 `docs/worklog/2026/11/02-2135-gather-tier.md`, 가지 `work/primary-production`(main `f69d514`에서 시작, `3fc96ba` 합침)

## 한 일
- **옛 프로젝트 조사**: AntiGravt01 main `0ea5299`의 `game/gather/` 엔진 셋·`migrations/index.js`(`gather_type_config`·`skill_tier_probability`·`resource_tier_items`·`fishing_config`)·`building_seed.js`·`BuildingSpawner.js`·ITM-10·BLD-3를 읽고 건물별 규칙과 옛 문서·코드가 다른 곳(확률 스탯 단독 vs 합, 수확량 1개 고정, 엔진 안 스탯 고정 표, 광석 보조 0 버그)을 줄 번호로 적었다(대조 문서).
- **진행 속도(49 N32)**: 스탯 짝이 있는 시설(광산·벌목장·농장)은 시간당 작업량 = 일꾼 × 1000 × `max(1, ⌊주 ÷ 20⌋)`(`@terra/sim` `gatherProgress`, 세력·사회 `production()`도 이 함수를 쓴다).
- **티어별 필요 진행(49 N44)**: 사다리(추첨·선택) 산출은 한 번마다 나온 아이템 티어의 `max(30, 30 + T × 30)` 진행, 진행 1 = 1분(옛 1분 틱). 나온 티어가 시간을 정하므로 한 번을 시작할 때 미리 뽑는다(`simulator/economy.ts` `nextBatch`·`PendingBatch`, 난수 흐름 7 그대로). 사다리 밖 레시피는 레시피 작업량이 시간(옛 작물 칸 `required_progress` 자리, 해석).
- **수확량**: 한 번 캘 때 `min(상한, 기본 + ⌊보조 × 비율⌋)`개(`gatherYield`), 시설 칸 = 옛 `gather_type_config`(광산·벌목장 1·100‰·10, 농장 1·80‰·8). 광석 한 개 = N44 `n44_ore_grams` 1,000g.
- **선택 + 효율(49 P8)**: 농장 `gather {vit, int, crop, mode: "select"}` — 해금 티어 `min(⌊(주 + 보조) ÷ 20⌋, 9)`(`accessibleTier`)에서 켜진 가장 높은 티어. 지금 켜진 작물이 없어 곡물 레시피는 사다리 밖(속도·수확량만 걸린다).
- **시뮬 일꾼 스탯**: 시나리오 계획 `primaryStat`·`secondaryStat`(앞 `gatherStat` 없앰), 기본 ⌊N9 60 ÷ 6⌋ = 10씩.
- **하위 재료**: 잡석·석재·구리 원석, 소나무·자작나무·편백나무 켬. 벌목장 레시피 `cut_logs`(목재 사다리 추첨) 더함.
- **건설 재료(49 M14 = 옛 값)**: 팩 시설 칸 `build {mulPm, materials}`(옛 `buildCost` 줄마다 반올림, 옛 돌던 `MAT_MAP` = 잡석·철). 공용 셈·건설 행동은 없음(데이터만). 팩 검사 `build_material_disabled`(알림)·`gather_yield_cap`(오류).
- **설정 칸**: N44 4칸 `n44_tier_progress_base` 30·`n44_tier_progress_step` 30·`n44_tick_ms` 60,000·`n44_ore_grams` 1,000(새, 옛 값), N32 두 칸에 단위·범위. 아이템 편집기 미리 보기가 N32·N44를 실효 값으로 읽어 반영 범위 live(`tuning/scope.ts`). `pnpm settings:cells` 다시 만듦(main 미러 것과 같아 바뀐 줄 없음).
- **화면**: 경제 생산 화면 레시피 줄에 기준 유닛 효과("기준 유닛(스탯 10) STR → 속도 ×1 · VIT → 한 번에 2개"), 식, 사다리면 한 번 캘 때 T0~T3 시간, 사다리 레시피 시간 "모두 T0일 때부터"(서버 경제 목록 `worker`·`gather.mode`). 아이템 편집기 채집 미리 보기에 진행·수확량 줄·식·광석 g·스탯 표(10~240, 기준 유닛 행 표시), 선택 방식이면 해금 티어(서버 `previewGather` `work`·`mode`·`unitTier`).
- `SIM_VERSION` 8 → 9, 팩 core@29 → core@30.

## 검증
- 시뮬 앞·뒤(Verified, 시드 1, 각 한 번. 앞 = main `f69d514`/core@29/SIM 8, 뒤 = 이 가지/core@30/SIM 9)
  - war16 30일: `linesHash` 4dbba2b2 → e87fc56c, stub16 180일: ce3ec385 → 4811e917. 요약은 판·팩 칸 말고 같다(경제 없음).
  - econ16 180일: f592cdc5 → 5a18d660, 위반 0.

| 180일 합 | 앞(core@29) | 뒤(core@30) |
|---|---|---|
| 철광석 | 65,295kg | 19,986kg (30.6%) |
| 철 주괴 | 45,591 | 13,902 |
| 생활용품 | 22,783 | 6,936 |
| 잡석 · 석재 · 구리 원석 | 0 · 0 · 0 (꺼진 채 빈 묶음) | 277,906개(277t) · 59,450개 · 39,318kg — 쌓인다 |
| 원목 | 1,796,600 | 3,902,080 (한 번에 2개) |
| 곡물 · 배급 식량 | 4,586,480 · 3,439,560 | 4,829,300 · 3,621,630 |
| 재료 모자람(생산 못 함) | 165,736번 | 214,236번 |
| 생활용품 · 배급 모자람(유닛·시간) | 100,098 · 542,471 | 122,017 · 575,569 |
| 체결 · 시장 | 346 · 504 | 565 · 768 |
| 반란 성공 · 폐허 · 끝 도시 · 끝 유닛 | 70 · 36 · 29 · 415 | 103 · 32 · 32 · 474 |
| 세력 멈춤(stalled) | 1 | 0 |

  - 철이 더 준 까닭: 광산 한 번(10번 캠)의 필요 진행 기대값 = 10 × (0.70 × 30 + 0.15 × 60 + 0.10 × 90 + 0.05 × 120) = 450분 ÷ 일꾼 2 = 225분(앞 30분, 7.5배). 수확량 2배(VIT 10 × 0.10 = +1)가 그 일부만 메운다. 광산 하나 하루 철 ≈ 6.4번 × 10 × 5% × 2 = 6.4kg(앞 24kg). 잡석 ÷ 철 = 13.9(확률 70 ÷ 5 = 14), 구리 ÷ 철 = 2.0(10 ÷ 5).
- `TEST_DATABASE_URL=… pnpm check`(Verified, 마지막 코드 앞 판 — 뒤로 e2e·문서만 고침, 마지막에 다시 돌림): 포맷·린트·타입·경계·크기(경고만)·다국어(3,303키)·대비(738쌍)·콘텐츠(core@30)·단위 시험 376파일 3,176개 통과. 새·고친 시험: `packages/sim/src/economy/gather.test.ts`(옛 예시 값: 진행 0~39 → 1·40 → 2·60 → 3, 필요 진행 T0 30 … T9 300, VIT 60 + INT 20 = 80 → T4, 수확량 광산 0.10·상한 10·농장 0.08·상한 8·낚시 상한 5, 선택 방식, 광석 g), `simulator/gatherEconomy.test.ts`(일꾼 효과, 잡석 T0 하루 4 × 9 × 10 = 360개 / 주 40이면 4 × 19 × 10 = 760개, 보조 20 → ×3·보조 200 → 상한 10), 서버 `previewGather.test.ts`(진행·수확량 표, 농장 선택 방식), `economyView.test.ts`(레시피 `worker`).
- `pnpm check:content origin/main`(Verified): core@30 (32a8f2430cee) 통과, 단계 1·2·4a·4b(기준 3fc96ba).
- `pnpm settings:cells`: 다시 만들었고 바뀐 줄 없음(main 미러가 N44를 이미 넣음). 설정 칸 패널 "49 칸 284개 중 62개 연결"(앞 61).
- 화면 시험(Verified, `TEST_DATABASE_URL=… E2E_SHOTS_DIR=… pnpm e2e e2e/items.spec.ts e2e/economy.spec.ts e2e/tuning.spec.ts --workers=1`, 헤드리스 Chromium, 7.8분): 82개 중 81개 통과. 실패 1개는 경제 "한눈에" 시험의 거래 물건 수(6 → 12, 하위 재료 6개를 켜서)였고 고친 뒤 그 시험만 다시 돌려 통과. 일꾼 하나로 돌려 1440 사진에서 브라우저가 죽지 않았다.
- `pnpm check:bundle`(Verified, e2e 빌드): 첫 화면 JS 105,388 B / 상한 131,416 B(앞 기록 105,379 B). 아이템 편집기 조각 171,720 B(앞 167,348 B, 진행·수확량 표).
- 사진(저장소 밖): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/primary-production/shots/` — `items-gather-preview-{neon,light}-{ko,en}-{390,1440}.png`(진행·수확량 줄·스탯 표), `economy-recipe-worker-ko.png`(광산 레시피 줄), `economy-production-{pastel,dark}-{ko,en}-{390,1440}.png`, `tuning-n44-{neon,light}-{ko,en}-{390,1440}.png`(N44 네 칸, 서버 즉시). 눈으로 본 것: 네온 1440·라이트 390(영어) 채집 미리 보기, 파스텔 390 광산 레시피 줄, 네온 1440 N44 줄.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/economy/gather.ts`(+시험) | `gatherProgress`·`gatherYield`·`tierRequiredProgress`·`accessibleTier`, `rollGatherOutputs`의 선택 방식·수확량·광석 g·`landed` |
| `packages/sim/src/economy/production.ts` | `GatherMode`, 레시피 `gather.mode` |
| `packages/sim/src/simulator/economy.ts`·`catalog.ts`·`scenario.ts`·`run.ts`·`npcTrade.ts`·`testEconomy.ts`·`gatherEconomy.test.ts` | 일꾼 효과(`workerEffects`), 미리 뽑는 한 번(필요 진행 시간), 계획 스탯 두 칸, 계수 넘김, 재료 수요 × 속도, 시험 |
| `packages/sim/src/society/coefficients.ts`·`labor.ts`·`tuning.ts`·`version.ts`·`index.ts`, `cli/common.ts` | N44 계수·칸, `production()`이 공용 함수 사용, SIM 9, 내보내기, 팩 시설 칸 읽기 |
| `packages/content/src/schema/economy.ts`·`index.ts`·`validate/gather.ts` | 시설 `gather.mode·yield*`, `build`, 검사 둘 |
| `content/core/items.json`·`facilities.json`·`recipes.json`·`tuning.json`·`manifest.json` | 하위 재료 켬, 시설 수확량·선택·건설 재료, `cut_logs`, N44·N32 칸, core@30 |
| `packages/shared/src/economy.ts`·`itemEditorPreview.ts`·`itemEditor.ts` | 경제 목록 `CatalogWorkerView`, 미리 보기 `ItemGatherWork`·`mode`·`unitTier` |
| `apps/server/src/economyView/catalog.ts`(+시험), `itemEdit/previewGather.ts`(+시험)·`preview.ts`·`services.ts`, `tuning/scope.ts` | 레시피 일꾼 효과, 미리 보기 진행·수확량·선택 방식, live 경로 |
| `apps/game/src/economy/ProductionView.tsx`, `editor/items/ItemGatherPart.tsx`·`itemEditor.css`, `messages/ko.json`·`en.json` | 화면 줄·표, 문구 19개(ko·en) |
| `e2e/economy.spec.ts`·`items.spec.ts`·`tuning.spec.ts` | 일꾼 효과·진행 표·N44 연결 확인과 사진 |
| 대조 문서, ADR 경제 코어, PLAN 14장 | 기록 |

## 함께 바꿔야 하는 파일
- 일꾼 효과 셈: 시뮬 `workerEffects`·`nextBatch` ↔ 서버 경제 목록 `workerViewOf` ↔ 편집기 미리 보기 `previewGather` `workOf`. 셋 다 `@terra/sim` 함수를 쓰지만 기본값(수확량 칸 없을 때 1 + N32, 진행 1 = N44)을 같이 고친다.
- 사다리 판단(시설 `gather` + 산출이 모두 그 중분류): 시뮬 `prepareCatalog` ↔ 서버 `economyCatalogFrom` ↔ 편집기 `previewGather`(앞 기록과 같음, `mode`가 더해짐).
- 팩 `tuning.json` N44·N32 ↔ `TEST_SOCIETY_COEFFICIENTS`(서버 시험이 계수표 = 팩을 본다).

## 건드리지 말 것
- 팩 확률표·N43 [임시] 값과 econ16 시나리오(광산 Lv1·일꾼 2·스탯 없음): 사용자 확인 전에는 맞추지 않는다(D-487, D-507 "확률은 나중에").
- 시설 `build` 재료는 옛 돌던 값(잡석·철)이다. 석재·소나무로 바꾸는 것은 사용자 답 뒤.

## 미검증·TODO·알려진 문제
- `build`(건설 재료)는 아무도 읽지 않는다(건설·레벨 올림·수리 행동 없음). 옛 건설 시간·유지비·수리(10% → 10%) 공식은 대조 문서에만.
- 피로(`fatigue_per_cycle`)·채집 스킬 XP·부상·자원 칸 HP·낚시 성공률은 옮기지 않았다(시뮬에 피로·스킬·칸이 없다).
- 경제 목록의 일꾼 효과는 팩 값으로 센다(세계 덮어쓰기는 보지 않는다). 아이템 편집기 미리 보기는 실효 값.
- 옛 PWA 기기(새 서버, 옛 화면)는 레시피 `worker`·미리 보기 `work`를 모르는 칸으로 두고 보이지 않는다(미실행).
- `packages/sim/src/simulator/economy.ts` 775줄(600 넘어 경고, 1,000 아래).

## 사용자 결정 대기
- 건설 재료: 돌던 코드(모두 잡석 + 철) 그대로 둘지, 문서 뜻(WOOD → 소나무, STONE → 석재, PLANK·BRICK → 가공품)으로 바꿀지.
- 건설 비용 레벨 배율: 옛 "건물 티어"를 시설 레벨로 읽음(Lv² × 배율, Assumed).
- econ16 철 공급(아래): 손잡이 = 일꾼 STR(40이면 속도 ×2), 확률표 0~39 구간, N44 진행 1의 시간·필요 진행, N43 레벨 보너스, econ16 광산 일꾼 수.
