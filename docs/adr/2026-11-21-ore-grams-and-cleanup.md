# 광석 1g 기본 단위·10kg 묶음·g 단위 채집 및 화석·이탄·소금 제거

- 상태: 확정 (일부 대체됨: 2026-11-22-ore-yield-mass.md — 결정 3 광산 한 사이클 무게 50~500g → 1~10kg, `n44_ore_grams` 1 → 20)
- 날짜: 2026-11-21
- 관련: `docs/PLAN.md` 4장, `docs/adr/2026-10-31-economy-core.md`, `docs/adr/2026-11-07-gather-objects.md`, `docs/adr/2026-11-15-gather-object-tiers.md`, `docs/adr/2026-11-15-shipyard-harbor.md`

## 배경
- 아이템 편집기(`원료 > 광석`)에 금속 광석 8종은 기본 단위 `1g`(거래 묶음 `1kg`)인 반면, 잡석·석재는 `1kg`(개 단위), 화석(`2kg`)·이탄(`1kg`)·소금(`100g`)은 제각각이었다(Verified: `content/core/items.json`).
- 화석·이탄·소금은 2차맵 장식 소품에서 임시 자연 채집물(`wild_goods`)을 만들면서 생겼다가, `wild_goods` 분류를 없애면서 `광석`으로 옮겨진 항목이다(Verified: 커밋 `8f8bda9d`, `3073c6d2`, `45d7249a`).
- 광산 채집은 `n44_ore_grams = 1000` × 수확 배수(1~10)로 사이클당 1kg~10kg을 캤고, 직접 채집도 `lotSize`를 그대로 곱해 1kg 단위로만 캤다.
- 벽돌(`brick`)은 잡석에서 가마로 구워 건축 재료로 쓰이는 가공품이지만, 판자(`가공품 > 가공 목재`)와 달리 `건축 자재 > 건축 자재`에 따로 빠져 있었다.

## 선택지
1. **광석 전체 1g·10kg 묶음 통일 + g 단위 채집 + 화석·이탄·소금 제거 + 벽돌을 가공품 > 금속으로 이동** (사용자 지시 2026-11-21).
2. 원료 전체(목재·작물·어류 포함)를 1g 단위로 전환 — 목재·식량·어류 전체 레시피·건물·배 비용을 전면 재설계해야 해 범위 밖.

## 결정
1. **화석·이탄·소금 제거 (`core@137`)**:
   - `items.json`에서 `salt`·`peat`·`fossil`, `gather_objects.json`에서 `salt_deposit`·`peat_cut`·`fossil_dig`를 지우고 `id-changes.json` `removed`에 `since: 137`로 기록한다.
   - 2차맵 장식 소품(`map_props.json` `ice_fossil`·`salt_flat`·`peat_mound`·`salt_pan` 및 `MAP_PROP_ARTS`)은 생성기 호환 보호 대상(`docs/PROTECTED.md`)이므로 장식 그대로 두고 설명만 되돌린다.
   - 배 연료(`facilities.json` `boats[].fuelItems`)의 `peat`는 나무 연료(`pine_log`)로 바꾼다(추후 석유 추가 예정).
2. **광석 1g 기본 단위·10kg 거래 묶음**:
   - 남은 광석 10종(`rubble`·`stone`·`copper_ore`·`iron_ore`·`silver_ore`·`titanium_ore`·`gold_ore`·`platinum_ore`·`mithril`·`orichalcum`) 모두 `weight: 1`, `lotSize: 10000`(10kg)으로 맞춘다.
   - 시작 시세는 10kg 묶음 기준으로 맞춘다(`iron_ore` 8 → 80, 그 밖 광석 1 → 10).
   - 제련·소성 레시피 입력은 묶음 단위(`lotSize` 곱셈)이므로 `smelt_iron`은 `iron_ore × 1 → iron_ingot × 7`, 그 밖 제련 7종은 `× 1 → × 10`, `fire_bricks`는 `rubble × 1 → brick × 6`으로 무게 비율을 지킨다.
   - 건물·배 건설 재료 수량(`facilities.json` `build`·`boats.materials`)과 시작 재료(`start_goods_stone`)는 원장 기본 단위(g)로 소비·비교되므로 `stone`·`rubble`·`iron_ore` 수량을 g 단위(×1,000)로 바꾸고, 건설 시간·알박기 운반 무게 셈(`facilities/catalog.ts weightOf`, `territory/facility.ts`, `npcBuild.ts lotWeightOf`, `buildingModel.ts`)도 기본 단위 무게(`weight`)를 쓰게 통일한다.
3. **광석 채집 사이클당 50g~500g 획득 (`SIM_VERSION 71`)**:
   - `facilities.json` `mine.gather`: `yieldBase: 50`, `yieldPerStatPm: 5000`, `yieldCap: 500` (기본 50g + 보조 스탯 VIT 1당 +5g, 상한 500g).
   - `tuning.json` `n44_ore_grams` 및 `TEST_SOCIETY_COEFFICIENTS.gatherOreGrams`: `1000 → 1`.
   - 직접 채집(`apps/server/src/gather/service.ts`)도 `lotSize > 1` 아이템은 `lotSize` 대신 `gatherOreGrams`(1g)를 곱해 광산 일꾼 채집과 같은 g 단위로 캔다.
   - 사이보그 판 기대 금액(`apps/server/src/roster/gatherValue.ts`·`gatherSheet.ts`)은 `harvest / lotSize` 비율을 반영해 10kg 묶음 시세를 g 수확량에 맞게 환산한다.
4. **벽돌 분류 이동**:
   - `brick`(T0)을 `construction / building_material`에서 `processed / metal`로 옮긴다. 가마 레시피(`fire_bricks`), Lv2+ 건축 재료, 잡석의 레벨 0 건축 재료(`bareHand: true`)는 유지한다.

## 이유
- 광석 10종을 `1g` 기본 단위·`10kg` 거래 묶음으로 통일하면 잡석·석재와 금속 광석 사이의 단위 불일치가 사라지고, 채집은 g 단위로 세밀하게(50~500g), 거래소는 10kg 묶음으로 깔끔하게 나뉜다.
- 기존 코드에서 `spendGoods`·`goodsStock`·`npcBuild`·`claimValue`는 건설 재료 수량을 기본 단위로 취급하면서 `buildTimeAt` 쪽만 `weight × lotSize`를 곱하고 있었다(Verified: `apps/server/src/facilities/service.ts`, `packages/sim/src/simulator/npcBuild.ts`, `claimRules.ts`). 석재·잡석이 `lotSize: 10000`이 되면서 이 불일치를 기본 단위 무게로 통일하지 않으면 건설 시간과 알박기 운반 무게가 10,000배로 뛴다.
- `gatherValuePerHour`가 묶음 환산을 하지 않으면 광산의 시간당 기대 금액이 10,000배 부풀려져 모든 유닛의 최적 작업이 광산으로 고정된다(Verified: `apps/server/src/roster/gatherValue.ts`).

## 결과
- 좋은 점: 광석 10종이 일관된 1g/10kg 단위를 쓰고, 스탯에 따라 50~500g씩 캐며, 화석 때문에 반토막 나던 은(T4) 채집 확률이 정상(100%)으로 돌아온다. 벽돌도 판자와 마찬가지로 가공품 아래 자리한다.
- 감수할 점: `SIM_VERSION` 70 → 71, 팩 `core@136 → core@137`로 올라가며 시뮬레이션 광석 생산량·해시가 바뀐다.
- 다시 볼 조건: 추후 석유 아이템이 추가되면 배 연료(`fuelItems`)에 석유를 넣고, 원목/잡석/석재의 건설 수량 밸런스를 실제 플레이·시뮬 수치로 다시 맞춘다.
