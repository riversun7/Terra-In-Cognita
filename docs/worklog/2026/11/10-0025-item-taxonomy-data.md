# 아이템 분류 자료 정리 — 장비 종류 이름·상위 중분류 칸·중분류 채움 (D-497 정리 895~897)

- 일시: 2026-11-10 00:25 (KST)
- 작업 도구: Claude Code
- 관련: 질문 `docs/questions/2026-11-09-item-classes.md` 895~899(기획 정리 2026-11-09, D-497 포인터, 미러 `docs/design/02_Decision_Log.md`), ADR `docs/adr/2026-11-01-item-editor.md` "바뀜 (2026-11-10, D-497 포인터)", 가지 `work/item-taxonomy-data`(main bc04add에서), 팩 `core@59` → `core@60`

## 한 일
- **895 이름만 바꿈**: 중분류 `offhand_weapon` 이름 "보조 무기 / Off-hand weapons" → "보조 장비 / Off-hand gear"(팩, ID 그대로). 화면 목록 이름 "무기 종류" → "장비 종류(무기 칸·보조 칸)" / "Gear kinds (weapon & off-hand slots)", 짧은 이름 "장비 종류 / Gear kind"(아이템 편집기 칸·거르기·분류 사슬·나무, 건물 편집기 수리 줄). 메시지 키 이름은 그대로(값만). 분류 탭의 "무기 아님" 표시와 896 "자료 이상" 표시를 없앴다(895·896이 풀어서).
- **896 상위 중분류 칸**: `weaponTypeEntrySchema`에 선택 칸 `subcategory`(참조 `item_subcategories`)를 더하고 팩 14개를 채웠다(무기 칸 11 → `weapon`, 보조 칸 3 → `offhand_weapon`, 지금 나무가 관례로 놓던 자리와 같다). 팩 검사 둘(`validate/items.ts`): `weapon_type_subcategory_major`(상위 중분류는 장비 대분류의 것만, 파일 `weapon_types.json`), `item_weapon_type_subcategory`(무기 종류를 단 장비의 중분류 = 그 종류의 상위 중분류, 중분류가 비어도 문제, 칸 `subcategory`). 지금 팩에는 무기 종류를 단 아이템이 없어 새 문제는 0이다(Verified: `pnpm check:content origin/main`).
- 아이템 편집기 분류 나무(`itemTree.ts`)는 이름 관례 `WEAPON_SLOT_SUBCATEGORY`를 없애고 `subcategory` 칸으로 잇는다. 칸이 없거나 장비 중분류가 아니면 장비 대분류 아래 "상위 중분류가 없는 장비 종류". 장비 종류 마디에 "상위 중분류" 고르기 칸(장비 중분류 + (없음), 담은 변경 → [적용], 기존 `weapon_types` 덮어쓰기 길 그대로), 장비 중분류 마디마다(무기·보조 장비만이 아니라) 아래 장비 종류 줄과 [새 장비 종류](틀 = 그 중분류 + 그 아래 종류의 많은 칸, 없으면 무기 칸 `slotForNewKind`). 서버 목록 줄 `weaponTypeJsonOf`가 `subcategory`를 싣는다. 두 검사 코드의 메시지(ko·en)를 더했다.
- **897 중분류 채움(23개)**: 괴 8(`iron_ingot` 등) → `metal`, 원소 지팡이 6·`test_sword`·`test_staff` → `weapon`, `test_vest`·`test_helmet` → `armor`, `test_ring` → `accessory`, `test_heart` → `implant`, `ration` → `dish`, `household_goods` → `buff_item`, `dev_placeholder` → `blueprint`.
- 898·899: 바꾸지 않음. 질문 파일 상태 줄을 "답함"으로 바꾸고 반영 메모를 달았다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/weapon_types.json` | 14개에 `subcategory`(896) |
| `content/core/item_subcategories.json` | `offhand_weapon` 이름(895) |
| `content/core/items.json` | 중분류 23개 채움(897) |
| `content/core/manifest.json` | 판 59 → 60 |
| `packages/content/src/schema/items.ts` | 무기 종류 선택 칸 `subcategory` |
| `packages/content/src/validate/items.ts`, `items.test.ts` | 상위 중분류 팩 검사 둘 + 시험 |
| `packages/shared/src/itemEditor.ts` | `WeaponTypeJson.subcategory` |
| `apps/server/src/itemEdit/views.ts` | 목록 줄에 상위 중분류 |
| `apps/server/src/contentEdit/overrideRules.test.ts` | 배급 식량이 중분류 요리를 가져 대분류를 원자재로 바꾸는 시험에 원자재 중분류를 같이 줌 |
| `apps/game/src/editor/items/itemTree.ts`, `itemTree.test.ts` | 나무가 자료 칸을 따름, `slotForNewKind`, 관례·`isOffhandKind` 없앰 |
| `apps/game/src/editor/items/ItemTaxonomy.tsx`, `ItemTaxonomyNode.tsx`, `ItemTaxonomyFields.tsx` | 상위 중분류 칸·새 종류 틀·표시 정리 |
| `apps/game/src/editor/items/itemMessages.ts`, `apps/game/messages/{ko,en}.json` | 이름 바꿈, 새 메시지(상위 중분류·검사 코드 둘), 쓰지 않는 "무기 아님" 키 둘 지움 |
| `e2e/items.spec.ts` | 분류 시험 둘·사진 시험: 시험 검은 중분류 무기, 방패 표시 없음·"보조 장비", 896 풀이, 새 종류의 상위 중분류·옮기기 |
| `docs/adr/2026-11-01-item-editor.md` | 바뀜 절 |
| `docs/questions/2026-11-09-item-classes.md` | 상태 줄·반영 메모 |

## 함께 바꿔야 하는 파일
- 무기 종류 칸을 더하면 `weaponTypeEntrySchema`·`WeaponTypeJson`·`weaponTypeJsonOf`·`WeaponTypeFields`를 함께 본다.
- 장비 종류의 상위 중분류를 바꾸면 그 종류를 단 아이템의 중분류도 같이 바꿔야 [적용]이 된다(팩 검사).

## 건드리지 말 것
- 자료 이름 `weapon_types`·`equip.weaponType`·ID는 그대로 둔다(895 = 이름만). 탄약 연결(`equip.weapon.ammo`)·전투 코드가 읽는 모양.
- `grain`·`timber`에 작물·목재 중분류를 넣지 않는다(아래).

## 미검증·TODO·알려진 문제
- **`grain`·`timber`는 채우지 않았다(25개 중 2개)**: 중분류 작물(`crop`)·목재(`wood`)는 농장·벌목장 채집 추첨(`facilities.gather.subcategory`)의 사다리다. 넣으면 시뮬(`prepareCatalog`의 `rolled`)·서버(`economyView`·`facilities` 사다리)에서 곡물 재배·원목 베기가 고정 산출에서 중분류 추첨으로 바뀌고, T0 추첨에 곡물·원목이 섞인다(배급 식량 사슬의 곡물이 끊길 수 있다). 추천안 "수치·규칙은 바꾸지 않음" 밖이라 기획에 맡긴다(질문 파일 반영 메모). 고른다면 채집 사다리에서 빼는 규칙이나 곡물·원목을 사다리 아이템으로 바꾸는 결정이 먼저다.
- 가장 가까운 것을 고른 둘: `household_goods`(생활용품, D-150 생필품) → 버프 — 식품·소모품 중분류(요리·음료·약·버프)에 맞는 것이 없다. `dev_placeholder` → 설계도. 둘 다 쿨 종류(물약)·보관 창고(일반)가 중분류 없을 때와 같다(Verified: `cooldownKindOf`·`defaultStorageOf` 코드).
- `ration` → 요리(식품 중분류): 편집기 보관 창고 표시가 일반 → 식량 창고, 사용 효과를 달면 쿨이 요리 쿨(5분, D-509·D-510)이 된다(지금 팩 배급 식량은 사용 효과가 없다). 편집기 권고 "식품인데 신선도 없음"이 배급 식량에 하나 생긴다(권고만, 저장을 막지 않음).
- 새 팩 검사는 중분류가 빈 장비에도 문제를 낸다: 편집기에서 장비 종류를 고르면 중분류도 직접 골라야 한다(자동 채우기 없음).

## 검사
- `pnpm check:content origin/main`: 통과(core@60, 기준 bc04add, 호환 포함) — Verified.
- `@terra/content` vitest 113개 통과(상위 중분류 시험 1개 새로), `@terra/sim` vitest 723개 통과, 서버 `itemEdit`·`contentEdit`·`holdings`·`market`·`facilities`·`buildingEdit`·`economyView` DB 포함 174개 통과(`overrideRules.test.ts` 1개 고침), 게임 `editor/items` 21개 통과.
- `pnpm check`(전체, DB 시험 빼고): 통과 — 시험 파일 504 통과·65 건너뜀, 시험 4,052 통과·275 건너뜀.
- `TEST_DATABASE_URL=… pnpm e2e e2e/items.spec.ts`: 43개 통과(3.7분, 분류 시험 둘·배치·사진 시험 포함).
- `pnpm build` + `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 107,721 B / 상한 131,416 B.
- 사진은 e2e 사진 시험이 찍었다(개발 테마 둘 × ko·en × 390·1440, 저장소 밖). 눈으로 본 확인은 하지 않았다(미확인).

## 사용자 결정 대기
- 없음(`grain`·`timber`는 기획 질문으로 남김 — 번호는 기획이 매긴다).
