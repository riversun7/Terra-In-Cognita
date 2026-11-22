# 옛 프로젝트 참고 T0~T9 요리 아이템 71종·1차 스탯 요리 버프 효과 6종·주방 조리 레시피 71종 추가 (D-472, 팩 core@149)

- 일시: 2026-11-22 02:05 (KST)
- 작업 도구: Antigravity
- 관련: 기획 `D-472`·`D-501`·`D-510`, ADR `docs/adr/2026-11-01-item-editor.md`·`docs/adr/2026-11-03-item-holdings.md`, 옛 프로젝트 `AntiGravt01` (`terra-server/scripts/seed_cooking_recipes.js`·`docs/GDD/Item/Consolidated_Item.md` PART 4)

## 한 일
- **1차 스탯 요리 버프 효과 6종 추가 (`content/core/effects.json`)**
  - `food_str`(요리: 힘 / Food: STR), `food_vit`(요리: 체력 / Food: VIT), `food_dex`(요리: 솜씨 / Food: DEX), `food_agi`(요리: 민첩 / Food: AGI), `food_int`(요리: 지능 / Food: INT), `food_wis`(요리: 지혜 / Food: WIS).
  - 고정값(`valueMode: "flat"`), 기본 지속 30분(`durationMs: 1800000`), `stacking: "refresh"`, `maxStacks: 1`.
- **T0~T9 요리 아이템 71종 추가 (`content/core/items.json`)**
  - 옛 프로젝트 `AntiGravt01`의 `seed_cooking_recipes.js`(42종)와 `Consolidated_Item.md` PART 4(전 티어 샘플 레시피)를 현재 `content/core/items.json`의 1차 식재료(`raw/crop` 33종·`raw/livestock_product` 13종·`raw/fish` 29종·`raw/herb` 30종)와 대조하여 T0~T9 전 티어 71종으로 구성했다(Verified).
  - 분류 `category: "consumable"`, `subcategory: "dish"`, 무게 `weight: 250`(1인분 250g), 시작 시세 `startPrice`는 투입 원재료 시작 시세 합(2~3)과 맞춰 레시피 원가 권고 경고가 없도록 했다.
  - 재료 계열별 버프(`D-472`): 농작물(`CROP`) → `INT·WIS`, 목축(`RANCH`) → `STR·VIT`, 낚시(`FISH`) → `DEX·AGI`, 2계열 혼합 → 4스탯, 3계열 진수성찬(`ALL`) → 6스탯. 티어별 기준 수치는 옛 `TIER_STATS` 공식(`T0: +1, T1: +2, T2: +3, T3: +4, T4: +5, T5: +6, T6: +8, T7: +10, T8: +12, T9: +15`)을 따랐다.
  - 한글 이름 2~8자·영문 이름 3~16자 범위를 지켜 이름 길이 권고 경고가 0건이다(Verified: `apps/server/src/itemEdit/advice.test.ts`).
- **주방(`kitchen`) 조리 레시피 71종 추가 (`content/core/recipes.json`)**
  - `cook_<요리ID>` 71종을 `facility: "kitchen"` 아래에 추가했다(첫 주방 레시피는 기존 `cook_ration` 유지).
  - 옛 시드의 존재하지 않는 코드(`CROP_T0_SPINACH`)나 비식용 목축 부산물을 쓰던 항목을 우리 1차 식재료(`barley`, `crucian_carp`, `trout`, `squid`, `rockfish`, `sea_bass`, `octopus`, `whale_meat`, `sailfish`, `grouper`, `giant_sea_bass`, `megalodon`, `coelacanth` 등)와 1:1로 맞췄고, 투입 재료 최고 티어가 산출 요리 티어와 일치한다(Verified).
  - 작업량(`work`)은 옛 `TIER_STATS.cookTime`(`300` ~ `9000`)을 적용했다.
- **검증**
  - `node scripts/check-content.mjs HEAD` 통과(Verified: `core@138`).
  - `pnpm --filter @terra/content test`, `pnpm --filter @terra/sim test`, `pnpm vitest run apps/server/src/itemEdit/ apps/server/src/holdings/ apps/server/src/buildingEdit/views.test.ts apps/server/src/economyView/economyView.test.ts` 통과(Verified).
  - 시뮬레이터 골든 출력 본문이 기존과 동일하여 `SIM_VERSION`은 71 그대로 유지했다(Verified).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/effects.json` | 1차 스탯 6종 요리 버프 효과(`food_str`~`food_wis`) 추가 |
| `content/core/items.json` | T0~T9 요리 아이템(`consumable/dish`) 71종 추가 |
| `content/core/recipes.json` | 주방(`kitchen`) 조리 레시피(`cook_*`) 71종 추가 |
| `content/core/manifest.json` | 콘텐츠 팩 버전 올림(`core@149`) |
| `packages/sim/src/combat/catalog.ts` | `TEST_COMBAT_CATALOG.effects`에 `food_str`~`food_wis` 6종 동기화(`combatCatalog.test.ts` 일치) |
| `apps/server/src/itemEdit/advice.test.ts` | T0~T9 요리 71종의 원가·티어·이름 길이·효과 참조·주방 레시피 연결 검증 추가 |

## 함께 바꿔야 하는 파일
- 요리 아이템 ID나 레시피 ID를 바꾸거나 지울 때는 `content/core/id-changes.json`에 기록하고 `content/core/manifest.json` 버전을 함께 올린다.

## 건드리지 말 것
- `ration`(배급 식량)과 `cook_ration`(배급 식량 조리): 도시 생필품(`necessities.json`) 및 주방의 첫 기본 레시피(`firstRecipe("kitchen")`)로 쓰이므로 순서와 원장 물자 성격을 그대로 둔다.

## 미검증·TODO·알려진 문제
- 화면 E2E 시험은 이번 묶음에서 실행하지 않았다(미실행).

## 사용자 결정 대기
- 없음.
