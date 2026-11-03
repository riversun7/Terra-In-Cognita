# 아이템 3단 분류 체계(대분류·중분류·소분류) 통합, 결정·보석 합침·에너지 자원 원자재 이동, 타일 고르기 화면

- 일시: 2026-11-04 08:15 (KST)
- 작업 도구: Antigravity
- 관련: ADR `docs/adr/2026-11-01-item-editor.md`, `docs/PLAN.md` 13장 ADR 50, 가지 `work/item-taxonomy`

## 한 일
- **8대분류 통합 및 명칭 개편**:
  - 기존 `보석(gem)`과 `귀금속(precious)` 대분류를 **`결정·보석` (`Crystals & Gems`, 코드 ID `"gem"`)** 하나로 통합하고 `"precious"`를 제거했다(8대분류: `원자재`, `가공 재료`, `부품`, `장비`, `식품·소모품`, `결정·보석`, `건축·설치물`, `설계도·문서`).
  - 중분류 `energy_resource`(에너지 자원)를 `major: "raw"`(원자재)로, `diamond`·`gold`·`silver`를 `major: "gem"`(결정·보석)으로 이동했다.
  - 옛 DB 덮어쓰기 줄(`apps/server/src/contentEdit/legacy.ts`)과 대량 도구 가져오기(`packages/shared/src/itemEditorBulk.ts`)가 옛 `"precious"` 대분류를 `"gem"`으로 자동 승격하도록 했다.
- **3단 분류 체계(`대분류 → 중분류 → 소분류`) 스키마·검증·팩 데이터**:
  - `@terra/content`: `itemMicrocategorySchema`(`{id, name, slot?, ammo?, enabled}`)와 중분류 `micros`(최대 64개), 아이템 `microcategory` 선택 칸을 더하고 교차 검증(`item_microcategory_missing`, `item_microcategory_orphan`, `subcategory_micro_duplicate`, `subcategory_micro_slot`)을 추가했다.
  - `content/core/item_subcategories.json`의 36개 중분류 전체에 소분류(`micros`)를 채우고, `content/core/items.json`의 160개 아이템에 `subcategory`·`microcategory`를 넣었다(`manifest.json` `version: 36`).
- **드롭다운 대신 한눈에 보이는 3단 타일 화면 및 장비 칸 자동 연결**:
  - 목록(`ItemList.tsx`): 1단 대분류 타일 아래에 선택한 대분류의 2단 중분류 타일 줄(`.ie-sub-tiles`)과 선택한 중분류의 3단 소분류 타일 줄(`.ie-micro-tiles`)이 바로 펼쳐진다.
  - 편집 칸(`ItemForm.tsx`)·새 아이템(`ItemNewForm.tsx`)·분류 탭(`ItemTaxonomy.tsx`): 드롭다운 대신 `.ie-tiles` 버튼으로 대분류·중분류·소분류·창고·식재료 계열을 고른다.
  - 장비(`equipment`)는 위 `[분류]` 구역에서 `중분류(무기·보조 무기·방어구·장신구·임플란트) → 소분류(검·도, 활, 방패, 화살통, 머리, 몸, 반지, 인공장기 등)`를 고르면 `equip.slot`과 `equip.weaponType`이 자동으로 맞춰지고(`withSubcategory`·`withMicrocategory`), 아래 `[장비]` 구역(`ItemEquipFields.tsx`)의 중복 드롭다운(장착 칸·무기 종류)을 제거했다.
- **검증 (Verified)**:
  - `pnpm check` (Biome, oxlint, `tsc -b`, 경계·결정성, 파일 크기, 다국어 3,717키, 색상 대비, 콘텐츠 1·2·4a, Vitest 373파일 3,196시험) 통과 (**Verified**).
  - `node scripts/check-content.mjs origin/main` (core@36, 1·2·4a·4b 통과, **Verified**).
  - `pnpm build && node scripts/check-pwa.mjs && pnpm check:bundle` (첫 화면 JS 105,541 B / 상한 131,416 B 통과, **Verified**).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/content/src/schema/items.ts` | `ITEM_CATEGORIES`에서 `"precious"` 제거, `itemMicrocategorySchema`·`micros`·`microcategory` 추가 |
| `packages/content/src/validate/items.ts` | 소분류 중복·장비 슬롯·아이템 소분류 참조 검증 추가 |
| `packages/content/src/index.ts` | `itemMicrocategorySchema`, `ItemMicrocategory` 내보내기 |
| `content/core/item_subcategories.json` | `energy_resource` → `raw`, `diamond`·`gold`·`silver` → `gem`, 36개 중분류에 `micros` 추가 |
| `content/core/items.json` | 160개 아이템에 `subcategory`·`microcategory` 채움 |
| `content/core/manifest.json` | `core` 팩 판 `35` → `36` |
| `packages/shared/src/itemEditor.ts` | `ITEM_CATEGORY_IDS` 8대분류, `MicrocategoryJson`, `SubcategoryJson.micros`, `ItemJson.microcategory`, `ItemRow.microcategory` 추가 |
| `packages/shared/src/itemEditorBulk.ts` | `ItemPatch.microcategory`, CSV `microcategory` 열, 옛 `"precious"` → `"gem"` 호환 |
| `packages/shared/src/itemEditorBulk.test.ts` | CSV 머리글 및 `"precious"` → `"gem"` 호환 단위 시험 추가 |
| `apps/server/src/itemEdit/views.ts` | 서버 목록·항목 보기에 `micros`·`microcategory` 매핑 |
| `apps/server/src/contentEdit/legacy.ts` | 옛 덮어쓰기 줄의 `"precious"` → `"gem"` 승격 및 `item_subcategories` `micros` 보충 |
| `apps/server/src/contentEdit/overrideRules.test.ts` | `newItem` 시험 도우미에서 복제 원본의 `subcategory`·`microcategory` 분리 |
| `apps/game/messages/ko.json`, `apps/game/messages/en.json` | 8대분류 명칭 및 소분류·분류 경로 메시지 키(ko/en) 추가 |
| `apps/game/src/editor/items/itemMessages.ts` | `precious` 제거, 소분류 검사 코드 메시지 연결 |
| `apps/game/src/editor/buildings/BuildingLevels.tsx` | `CATEGORY_NAME`에서 `precious` 제거 |
| `apps/game/src/editor/items/itemModel.ts` | `ItemQuery.microcategory`, `subcategoryCounts`, `microcategoryCounts`, `withSubcategory`, `withMicrocategory` 추가 |
| `apps/game/src/editor/items/itemModel.test.ts` | 3단 분류 거르기·집계 및 장비 슬롯·무기 종류 자동 설정 시험 추가 |
| `apps/game/src/editor/items/ItemList.tsx` | 1단 대분류 타일 아래 2단 중분류·3단 소분류 타일 줄 표시 |
| `apps/game/src/editor/items/ItemForm.tsx` | `[분류]` 구역을 분류 경로 배지 + 3단 타일 선택기로 개편 |
| `apps/game/src/editor/items/ItemEquipFields.tsx` | 상단 중복 드롭다운(장착 칸·무기 종류) 제거 및 분류 연동 안내 표시 |
| `apps/game/src/editor/items/ItemNewForm.tsx` | 새 아이템 대분류 선택을 드롭다운에서 타일 버튼으로 변경 |
| `apps/game/src/editor/items/ItemTaxonomy.tsx` | 중분류·무기 종류 편집을 타일 버튼으로 바꾸고 중분류 안 소분류(`micros`) 편집기 추가 |
| `apps/game/src/editor/items/itemList.css` | 2단·3단 분류 타일 줄(`.ie-sub-tiles`, `.ie-micro-tiles`) 계층 구분선 스타일 추가 |
| `docs/adr/2026-11-01-item-editor.md`, `docs/PLAN.md` | 3단 분류 체계·8대분류 통합·타일 화면 결정 기록 |

## 함께 바꿔야 하는 파일
- 대분류 ID(`ITEM_CATEGORIES` / `ITEM_CATEGORY_IDS`)를 바꿀 때는 `packages/content/src/schema/items.ts`, `packages/shared/src/itemEditor.ts`, `apps/game/src/editor/items/itemMessages.ts`, `apps/game/src/editor/buildings/BuildingLevels.tsx`, `apps/server/src/contentEdit/legacy.ts`를 함께 맞춘다.
- 장비 소분류(`item_subcategories.json`의 `major: "equipment"` 아래 `micros`)와 무기 종류(`weapon_types.json`)는 같은 ID·장착 칸(`slot`)을 유지한다.

## 건드리지 말 것
- `e2e/items.spec.ts`가 기대하는 `.ie-filters` 첫 번째 `<select>`(중분류)와 `[아이템 분류]` 탭의 `.ie-tax[data-category="weapon_types"]` 구역.

## 미검증·TODO·알려진 문제
- 로컬 환경에 PostgreSQL 서버가 떠 있지 않아 DB 시험 35개 파일과 Playwright E2E(`e2e/items.spec.ts`)는 미실행(CI·DB 환경에서 실행 필요).

## 사용자 결정 대기
- 없음.
