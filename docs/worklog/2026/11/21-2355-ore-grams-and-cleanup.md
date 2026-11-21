# 광석 1g·10kg 묶음·g 단위 채집, 화석·이탄·소금 제거, 벽돌 가공품 이동

- 일시: 2026-11-21 23:58 (KST)
- 작업 도구: Antigravity
- 관련: ADR `docs/adr/2026-11-21-ore-grams-and-cleanup.md`, `SIM_VERSION` 71, 팩 `core@137`

## 한 일
- **화석·이탄·소금 제거**: `items.json`에서 `salt`·`peat`·`fossil`, `gather_objects.json`에서 `salt_deposit`·`peat_cut`·`fossil_dig` 제거 및 `id-changes.json` `removed`(`since: 137`) 기록. `map_props.json` 장식 소품 4종(`ice_fossil`·`salt_flat`·`peat_mound`·`salt_pan`)은 생성기 보호 대상이라 설명만 장식 전용으로 수정. 배 연료(`facilities.json` `boats[].fuelItems`)의 `peat`를 `pine_log`로 대체(추후 석유 추가 예정).
- **광석 1g 기본 단위·10kg 묶음**: 광석 10종(`rubble`·`stone`·`copper_ore`·`iron_ore`·`silver_ore`·`titanium_ore`·`gold_ore`·`platinum_ore`·`mithril`·`orichalcum`)을 모두 `weight: 1`, `lotSize: 10000`, 시작 시세 10배(`iron_ore` 80, 나머지 10)로 통일. 제련·벽돌 레시피(`smelt_*`, `fire_bricks`)를 10kg 묶음 비율에 맞게 조정. 건물·배 건설 재료의 `stone`·`rubble`·`iron_ore` 수량과 시작 석재(`start_goods_stone`)를 g 단위로 맞추고, 건설 시간·알박기 운반 무게 셈을 기본 단위 무게로 통일.
- **광석 채집 사이클당 50~500g**: 광산 수확량(`yieldBase: 50`, `yieldPerStatPm: 5000`, `yieldCap: 500`)과 `n44_ore_grams: 1` 반영. 직접 채집(`apps/server/src/gather/service.ts`)도 `lotSize > 1` 아이템은 `gatherOreGrams`를 곱해 g 단위로 채집하게 수정. 사이보그 판 기대 금액(`gatherValue.ts`·`gatherSheet.ts`)에 `harvest / lotSize` 묶음 환산 추가.
- **벽돌 분류 이동**: `brick`(T0)을 `processed / metal`로 이동(가마 레시피·Lv2+ 건축 재료·잡석 `bareHand` 유지).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/items.json` | 화석·이탄·소금 제거, 광석 10종 1g·10kg 묶음 통일, `brick`을 `processed/metal`로 이동 |
| `content/core/gather_objects.json` | `salt_deposit`·`peat_cut`·`fossil_dig` 제거 |
| `content/core/id-changes.json` | 지운 아이템 3종·채집 오브젝트 3종 기록(`since: 137`) |
| `content/core/facilities.json` | 광산 수확량 50+VIT×5(상한 500), 건설·배 재료 `stone`/`rubble`/`iron_ore` g 단위 전환, 배 연료 `peat` → `pine_log` |
| `content/core/recipes.json` | 10kg 광석 묶음에 맞춰 `smelt_*`·`fire_bricks` 수량 조정 |
| `content/core/tuning.json` | `n44_ore_grams` 1000 → 1, `start_goods_stone` 10 → 10000 |
| `content/core/map_props.json` | 장식 소품 4종 설명에서 채집 문구 제거(생성기 출력 변화 없음) |
| `content/core/manifest.json` | 팩 버전 `136 → 137` |
| `packages/sim/src/society/coefficients.ts`, `tuning.ts`, `tuningCyborg.ts`, `simulator/economy.ts`, `simulator/npcBuild.ts`, `version.ts` | `gatherOreGrams: 1`, `startStone: 10000`, `lotWeightOf` 기본 단위 무게, `SIM_VERSION` 71 |
| `apps/server/src/gather/service.ts`, `labor/gatherWork.ts`, `facilities/catalog.ts`, `territory/facility.ts`, `roster/gatherValue.ts`, `roster/gatherSheet.ts` | 직접 채집 g 단위 수확, 건설 시간 기본 단위 무게, 시간당 기대 금액 묶음 환산 |
| `apps/game/src/editor/buildings/buildingModel.ts`, `production/ProductionEditorScreen.tsx` | 건물 편집기 건설 시간 기본 단위 무게, 생산 편집기 `oreGrams` 기본값 1 |
| `packages/sim/src/simulator/gatherEconomy.test.ts`, `apps/server/src/{contentEdit/legacy,economyView/economyView,gather/kinds,gather/service,itemEdit/previewGather,itemEdit/views,roster/gatherSheet,trpc/economy,buildingEdit/buildingEdit.db,facilities/facilities.db}.test.ts`, `apps/game/src/editor/buildings/buildingModel.test.ts`, `e2e/{items,economy}.spec.ts` | 새 규칙·수치에 맞춘 시험 갱신 및 직접 채집 g 단위 시험 추가 |
| `docs/adr/2026-11-21-ore-grams-and-cleanup.md` | 변경 결정 기록 |

## 함께 바꿔야 하는 파일
- `content/core/tuning.json`의 `n44_ore_grams`·`start_goods_stone`을 바꾸면 `packages/sim/src/society/coefficients.ts` 기본값도 함께 맞춘다.
- 건설 재료 수량을 기본 단위로 쓰므로 `facilities/catalog.ts`·`territory/facility.ts`·`npcBuild.ts`·`buildingModel.ts`의 무게 함수는 모두 기본 단위 무게(`weight`)를 반환해야 한다.

## 건드리지 말 것
- `packages/shared/src/mapProps.ts`의 `MAP_PROP_ARTS` 번호와 `content/core/map_props.json`의 소품 배치 규칙(2차맵 생성기 호환 보호 대상).
- `content/core/id-changes.json`의 기존 기록(끝에 추가만).

## 미검증·TODO·알려진 문제
- DB 테스트(`*.db.test.ts`)는 로컬 `TEST_DATABASE_URL` 미설정으로 건너뜀(미실행).
- Playwright E2E(`e2e/items.spec.ts`, `e2e/economy.spec.ts`)는 이번 턴에서 실행하지 않음(미실행).
- 추후 배 연료에 석유 아이템 추가 예정(사용자 지시).

## 사용자 결정 대기
- 없음.
