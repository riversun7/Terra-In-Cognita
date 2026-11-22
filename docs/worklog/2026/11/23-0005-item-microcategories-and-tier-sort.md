# 아이템 편집기 3단계 소분류 일반화 및 기본 티어 정렬

- 일시: 2026-11-23 00:05 (KST)
- 작업 도구: Antigravity
- 관련: `docs/adr/2026-11-01-item-editor.md`, `content/core/manifest.json` (`core@152`)

## 한 일
- 아이템 분류의 3단계(`weapon_types`)를 무기·보조 칸 전용 `"장비 종류"`(`Gear kind`)에서 모든 대분류·중분류 아래에 붙는 **`"소분류"`(`Microcategory`)**로 일반화했습니다(**Verified**).
  - `packages/content/src/schema/items.ts`: `weaponTypeEntrySchema`의 `slot`을 선택(`optional`)으로 바꾸고, `itemEntrySchema` 최상위에 `weaponType: ref("weapon_types").optional()`을 추가해 비장비 아이템과 방어구·장신구·임플란트도 소분류를 가리킬 수 있게 했습니다.
  - `packages/content/src/validate/items.ts`: `slot`이 있는 소분류(`weapon`·`offhand`)만 장비 대분류 중분류를 요구하고, `slot`이 없는 일반 소분류는 어느 대분류의 중분류든 상위 중분류(`subcategory`)로 둘 수 있게 했습니다. 아이템의 `weaponType`(또는 `equip.weaponType`)이 가리키는 소분류의 상위 중분류와 아이템의 `subcategory`가 일치하는지 함께 검사합니다.
  - `apps/game/src/editor/items/`:
    - `ItemBrowseBar.tsx`: 대분류·중분류 선택과 연동해 모든 대분류에서 3번째 드롭다운(`소분류`)이 활성화되고, 소분류를 고르면 해당 상위 중분류·대분류로 자동 맞춰지도록 고쳤습니다.
    - `ItemForm.tsx`, `ItemTaxonomy.tsx`, `ItemTaxonomyNode.tsx`, `ItemTaxonomyFields.tsx`, `itemTree.ts`: 아이템 편집 창의 `[분류]` 구역에서 소분류를 고를 수 있게 하고, `[아이템 분류]` 탭의 모든 중분류 마디 아래에서 소분류 목록 확인과 `[새 소분류]` 생성이 동작하도록 고쳤습니다.
    - `ItemEditorScreen.tsx`, `itemModel.ts`, `ItemTaxonomyNode.tsx`: 아이템 목록과 분류 마디 아이템 목록의 기본 정렬을 이름순(`"name"`)에서 **티어순(`"tier"`, `T0 → T9`)**으로 바꿨습니다.
- `content/core/weapon_types.json`에 비무기 중분류(요리 6종, 광석 3종, 목재 3종, 작물 3종, 약초 2종, 어류 4종, 축산물 2종, 목축 부산물 2종, 금속 2종, 가공 목재·회로·포획 장비·유전자·방어구·장신구·임플란트·음료·버프·설계도) 소분류 39개를 추가(총 53개)하고, `content/core/items.json`의 중분류가 있는 모든 아이템(246개)에 소분류를 배정했습니다(`core@152`, **Verified**).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/content/src/schema/items.ts` | `weapon_types`의 `slot` 선택화 및 `items` 최상위 `weaponType` 참조 추가 |
| `packages/content/src/validate/items.ts` | 일반 소분류(`slot` 없음)의 비장비 상위 중분류 허용 및 아이템 최상위 `weaponType` 상위 중분류 일치 검사 |
| `packages/content/src/validate/items.test.ts` | 비장비 소분류 상위 중분류 일치·불일치 단위 시험 추가 |
| `packages/shared/src/itemEditor.ts` | `ItemJson.weaponType`, `WeaponTypeJson.slot` 선택 타입 및 `ITEM_FIELD_USES` 반영 |
| `apps/server/src/itemEdit/views.ts` | `itemJsonOf`, `weaponTypeJsonOf`, `itemRowOf`에서 최상위 `weaponType` 및 선택 `slot` 직렬화 |
| `apps/server/src/itemEdit/advice.ts` | 최상위 `item.weaponType`의 꺼진 항목 참조 권고 검사 추가 |
| `apps/server/src/buildingEdit/views.ts` | 공방 장비 수리 옵션(`weaponTypeOptions`)은 `slot !== undefined`인 장착 무기·보조 종류만 추리도록 유지 |
| `apps/server/src/contentEdit/overrideRules.test.ts` | `ration`에 소분류가 배정됨에 따라 대분류·중분류 변경 시험 도우미(`newItem`)에서 이전 소분류 정리 |
| `apps/game/src/editor/items/itemTree.ts` | 모든 대분류의 중분류 아래에 소분류(`kinds`)를 붙이고 최상위 `item.weaponType`을 읽도록 수정 |
| `apps/game/src/editor/items/itemTree.test.ts` | 비장비 중분류(`raw/ore`) 아래 소분류 트리 구성 및 개수 집계 시험 추가 |
| `apps/game/src/editor/items/itemModel.ts` | 정렬 목록 첫 값을 `"tier"`로 바꾸고 대분류 변경 시 맞지 않는 `weaponType` 정리 |
| `apps/game/src/editor/items/ItemEditorScreen.tsx` | 기본 정렬 상태를 `"tier"`로 변경 |
| `apps/game/src/editor/items/ItemBrowseBar.tsx` | 모든 대분류·중분류에서 3단계 소분류 필터가 동작하도록 수정 |
| `apps/game/src/editor/items/ItemForm.tsx` | `[분류]` 구역에 소분류 선택 칸 추가 및 중분류 변경 시 소분류 초기화 |
| `apps/game/src/editor/items/ItemTaxonomy.tsx` | 소분류 마디 선택 시 실제 상위 중분류의 대분류를 따라가도록 수정 |
| `apps/game/src/editor/items/ItemTaxonomyNode.tsx` | 모든 중분류에서 하위 소분류 표시·생성 허용 및 마디 아이템 목록 티어순 정렬 |
| `apps/game/src/editor/items/ItemTaxonomyFields.tsx` | 소분류의 상위 중분류로 모든 중분류 허용 및 비장비 중분류일 때 장착 칸 숨김 |
| `apps/game/messages/ko.json`, `apps/game/messages/en.json` | `"장비 종류"` / `"Gear kind"` 문구를 `"소분류"` / `"Microcategory"`로 변경 |
| `content/core/weapon_types.json`, `content/core/items.json`, `content/core/manifest.json` | 전체 중분류용 소분류 39종 추가, 아이템 246개 소분류 배정, 팩 버전 `151 → 152` |
| `e2e/items.spec.ts` | 원료 › 광석에서 소분류 사슬 표시와 소분류 필터(`일반 금속광`) 동작 확인 추가 |

## 함께 바꿔야 하는 파일
- `content/core/weapon_types.json`·`content/core/items.json`을 바꿀 때는 `content/core/manifest.json`의 `version`을 함께 올립니다.
- UI 메시지 키를 고칠 때는 `apps/game/messages/ko.json`과 `apps/game/messages/en.json`을 함께 고칩니다.

## 건드리지 말 것
- `docs/PROTECTED.md`에 지정된 보호 파일과 `docs/design/` 기획 미러 원본.

## 미검증·TODO·알려진 문제
- Playwright 화면 시험(`e2e/items.spec.ts`)은 미실행.

## 사용자 결정 대기
- 없음.
