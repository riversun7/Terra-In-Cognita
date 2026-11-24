# 유닛·사이보그 통합: 유닛 목록에 본체, 유닛 상세 = 사이보그 판, 장비 칸 20칸(옛 프로젝트)

- 일시: 2026-11-24 15:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-24-unit-cyborg-unify.md`, 사용자 지시 2026-11-24 "유닛에 사이보그를 넣어서 통합할것이다. 1. 모든 유닛은 사이보그 화면처럼 세부 정보가 뜨게 해야한다. 2. 사이보그도 유닛이므로 유닛 창에 목록에 존재해야한다. 장비칸, 인공장기칸을 antigavt01대로 제대로 수를 맞춰라"(옛 프로젝트 사이보그 화면 사진 첨부)

## 한 일
- **장비 칸을 옛 프로젝트 칸으로**: 일반장비 10칸(헬멧·갑옷·장갑·신발·토템·무기·보조무기·반지 1·2·목걸이) + 인공장기 10칸(헤드·바디·심장·팔·다리·임플란트 1~5).
  - 칸 종류 11개를 더했다(`hands`·`feet`·`totem`·`ring`·`necklace`·`organ_head`·`organ_body`·`organ_heart`·`organ_arm`·`organ_leg`·`implant`). 사람형(사이보그·휴먼·안드로이드)이 일반장비 10칸을 같이 쓰고, 사이보그만 인공장기 10칸을 갖는다. 안드로이드 부품 3칸·크리쳐 3칸은 그대로.
  - 칸 번호(보유 물건 `slot`)는 저장된 값이라 옛 자리(0~8)를 그대로 두고 새 칸을 뒤에 붙였다. 화면만 옛 프로젝트 차례(왼 줄 5 → 오른 줄 5)로 놓고, 같은 종류는 번호를 붙인다("반지 1"·"임플란트 3").
  - 1차 스탯 칸 목록을 `PRIMARY_EQUIP_SLOTS` 하나로 모았다(팩 스키마·판정·아이템 편집기). 장갑·신발은 2차 수치(방어구), 토템·반지·목걸이·인공장기·임플란트는 1차 스탯.
  - 문구: 머리 → 헬멧, 몸 → 갑옷, 보조 → 보조무기, 장비 → 일반장비. 새 칸 이름 11개(ko·en).
- **사이보그 본체를 유닛 목록에**: `units.list`가 본체 줄을 함께 준다(`self: true`, 이름·레벨·환생·스탯은 만든 사이보그의 것). 목록 맨 위에 "본체" 표, 상세 머리에 사이보그 화면으로 가는 길. 보유 유닛 수(주거 상한)·유지비 셈은 바꾸지 않았다.
- **유닛 상세 = 사이보그 판**: 새 조회 `units.sheet`(유닛 하나의 핵심 사양 출처·상세 전투 스펙 풀이·공격 값·버프 몫·이동 속도·스킬 칸·속성·채집 예상). 유닛 상세가 사이보그 화면의 `CoreStats`·`CombatSpecs`·`SkillSlots`·`Elements`를 그대로 쓴다. 받는 동안·실패하면 옛 스탯 표를 보인다. 장비 칸은 인공장기 묶음 + 일반장비 묶음 두 줄 격자.
- **옛 저장 줄 읽기**: 세계 편집 자료에서 core@152까지 저장한 유닛 종류 줄의 옛 칸 배치는 지금 팩 배치로, 아이템 줄의 `accessory` → `ring`(크리쳐 전용은 그대로)·`organ` → `implant`로 읽는다(팩에 같은 항목이 있으면 팩의 칸).
- 팩 core@153: 유닛 종류 칸 배치, `test_ring`(반지 칸)·`test_heart`(심장 칸), 크리쳐 장신구 시험 항목 `test_charm`, 공방 수리 줄에 새 칸.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/roster.ts` | 칸 종류 11개, `PRIMARY_EQUIP_SLOTS`·`ORGAN_EQUIP_SLOTS`·`isOrganSlot`, 화면 차례 `EQUIP_SLOT_DISPLAY_ORDER`·`sortSlotsForDisplay`, `RosterUnit.self`, `RosterSheet`·`UnitSheetResponse` |
| `packages/shared/src/itemWeights.ts`, `itemEditor.ts` | 새 칸 무게 출발값, 1차 스탯 칸 목록을 한 곳에서 |
| `packages/content/src/schema/combat.ts`, `packages/sim/src/combat/equipment.ts` | 1차 스탯 칸 목록을 `PRIMARY_EQUIP_SLOTS`로 |
| `packages/sim/src/combat/catalog.ts` | 시험 묶음(`TEST_COMBAT_CATALOG`)을 팩과 같게: 칸 배치 20·10·13칸, `test_ring`·`test_heart` 칸, 크리쳐 장신구 `test_charm`(서버 `combatCatalog.test.ts`가 팩과 맞춰 본다) |
| `content/core/unit_kinds.json`, `items.json`, `facilities.json`, `manifest.json` | 칸 배치 20·10·13칸, 시험 아이템 칸, 수리 줄, 판 153 |
| `apps/server/src/roster/unitSheet.ts`(새 파일) | 몸 사양 → 상세 사양(`sheetOfSpec`). 사이보그 화면과 유닛 상세가 같이 쓴다 |
| `apps/server/src/roster/cyborgBody.ts` | 같은 셈을 `sheetOfSpec`으로 |
| `apps/server/src/roster/worldUnits.ts` | 본체 줄을 빼지 않고 `self`로 표시, 종류 코드 3 → 사이보그 |
| `apps/server/src/roster/services.ts`, `preview.ts` | 본체 줄 채우기, `unitSheet`(내 유닛·시안 유닛만), 채집 예상 도우미 |
| `apps/server/src/trpc/roster.ts`, `context.ts` | `units.sheet` 프로시저 |
| `apps/server/src/contentEdit/legacy.ts` | 옛 칸 배치·옛 아이템 칸 고쳐 읽기(core@153 전 저장 줄만) |
| `apps/server/src/itemEdit/preview.ts`, `codeRefs.ts`, `battleLab/samples.ts` | 사이보그 기본 장비 칸 표, 크리쳐 샘플은 `test_charm` |
| `apps/game/src/holdings/*`(`holdingsModel.ts`·`holdingsText.ts`·`HoldingParts.tsx`·`HoldingsDialogs.tsx`·`UnitHoldings.tsx`·`holdings.css`) | 칸 번호 붙이기·화면 차례·두 묶음(`slotGroups`), 두 줄 격자(`.slot-columns`) |
| `apps/game/src/cyborg/*`(`CyborgScreen.tsx`·`CoreStats.tsx`·`CombatSpecs.tsx`·`CyborgExtras.tsx`·`cyborgText.ts`) | 칸 묶음 10 + 10, 판이 `RosterSheet`도 받게 |
| `apps/game/src/units/UnitDetail.tsx`, `UnitList.tsx`, `units.css` | 사양 판·본체 표·`data-self` |
| `apps/game/src/roster/rosterText.ts`, `parts.tsx`, `useRosterQuery.ts` | 칸 이름(번호), 본체 맨 위 정렬, 시안 칸 목록 화면 차례, `unitSheetLoader` |
| `apps/game/src/home/cards/CyborgCard.tsx`, `editor/**/…Messages.ts` | 인공장기 칸 판정, 새 칸 이름 표 |
| `apps/game/messages/{ko,en}.json` | 칸 이름·본체 문구 |
| 시험: `packages/shared/src/rosterSlots.test.ts`(새), `roster.test.ts`·`unitBody.test.ts`·`cyborg.db.test.ts`·`legacy.test.ts`·`advice.test.ts`·`preview.test.ts`·`battleLab/build.test.ts`, `packages/sim` `equipment.test.ts`·`equipmentGear.test.ts`, `holdingsModel.test.ts`·`rosterText.test.ts`, `e2e/cyborg.spec.ts`·`units.spec.ts`·`equip-stats.spec.ts` | 새 칸·본체 줄·`units.sheet`·옛 줄 읽기 |

## 함께 바꿔야 하는 파일
- 칸 종류를 더하면: `EQUIP_SLOTS`(끝에만) + `EQUIP_SLOT_DISPLAY_ORDER`(`rosterSlots.test.ts`가 둘이 같은지 본다) + `ITEM_WEIGHT_BY_SLOT` + 칸 이름 표 넷(`rosterText.ts`·`itemMessages.ts`·`buildingMessages.ts`·`labMessages.ts`) + 메시지 ko·en. 1차 스탯 칸이면 `PRIMARY_EQUIP_SLOTS`, 몸에 넣는 칸이면 `ORGAN_EQUIP_SLOTS`.
- 팩 유닛 종류의 칸 배치를 바꿀 때는 **뒤에만 붙인다**(칸 번호가 저장돼 있다). 차례를 바꾸려면 `EQUIP_SLOT_DISPLAY_ORDER`만 고친다.
- 사이보그 판(`CoreStats`·`CombatSpecs`)을 바꾸면 유닛 상세도 같이 바뀐다. 새 칸은 `RosterSheet`(= `CyborgBody`의 일부)에 넣는다.

## 건드리지 말 것
- `packages/sim/src/combat/catalog.ts` 시험 묶음의 칸 배치는 팩 `unit_kinds`와 같아야 한다(`apps/server/src/world/combatCatalog.test.ts`). 한쪽만 바꾸지 않는다.
- `countsAsOwnedUnit`(본체는 보유 유닛 수에 세지 않는다 — D-445 178·D-453). 이번 지시는 목록·상세만이다.

## 미검증·TODO·알려진 문제
- 기획 미러(`docs/design/` 48 §5.1 · 49 N18, 결정 D-422 · D-445 178)는 옛 내용 그대로다. 기획 세션이 이 사용자 결정을 결정 로그에 옮겨야 한다(미러는 기술 세션이 고치지 않는다).
- 옛 인공장기 2·3번째 칸(7·8번)에 입혀 둔 인공장기는 새 배치에서 종류가 맞지 않아 빈 칸으로 셈한다(화면에서 그 칸을 눌러 벗기면 된다). 자동으로 옮기지 않았다 — Assumed: NAS 세계에 그런 장착이 거의 없다(인공장기 아이템은 시험용 하나).
- NAS 세계의 편집 자료(유닛 종류·아이템 덮어쓰기 줄)에 무엇이 있는지는 보지 못했다(Unknown). 옛 배치 그대로인 줄·옛 칸 아이템은 고쳐 읽게 했다(`legacy.test.ts`). 손으로 바꾼 칸 배치는 그대로 둔다.
- 본체가 아닌 세계 유닛(휴먼·융합 사이보그 유닛)의 사양은 `units.list`와 같은 [임시] 기본 몸(1차 모두 10) + 입은 장비다. 저장된 휴먼 레벨·스탯이 전투·화면에 들어오면 같이 바꾼다.
- 홈 카드·위 띠의 유닛 수는 `units.list` 줄 수라 본체만큼 1 는다. 사이보그 화면의 "보유 유닛"(주거 상한 셈)은 그대로다.
- 장갑·신발·토템·목걸이, 인공장기 네 부위·임플란트에 넣을 아이템이 아직 팩에 없다(칸만 있다).

## 검증
- 전체 `TEST_DATABASE_URL=… pnpm check`(DB 시험 포함) — Verified 실행: 포맷·린트·타입·모듈 경계·파일 크기·다국어·디자인 값·콘텐츠(core@153) 통과, 시험 파일 919/920·시험 6,560/6,561. 남은 하나(`cyborg/cyborg.db.test.ts` — 본체가 유닛 목록에 없다고 보던 옛 기대값)를 고친 뒤 그 파일만 다시 돌려 11/11 통과, 서버 타입 검사·그 폴더 린트 통과. 그 뒤 전체 검사는 다시 돌리지 않았다(시험 파일 하나만 바뀜 — 푸시 전 훅이 한 번 더 돈다).
- 앞선 판에서 걸린 것: 판정 시험 묶음 = 팩 맞춤 시험(`world/combatCatalog.test.ts`) → 시험 묶음을 새 칸으로 맞췄다. `packages/sim` 시험(골든 포함)은 그대로 통과. `metrics.test.ts` 한 번 실패는 부하 중 시간 재기 흔들림이었다(다시 돌려 통과).
- 화면 — Verified(로컬 `pnpm dev:local` + 앱 내장 브라우저, dev 시험 계정):
  - `/units`: 목록 맨 위에 본체 줄(`DevCyborg`, "본체" 표). 상세에 핵심 사양·스탯 기준 추천·상세 전투 스펙(줄 28)·스킬 칸 10·속성 12칸, 장비 = 인공장기 10(헤드·바디·심장·팔·다리 | 임플란트 1~5) + 일반장비 10(헬멧·갑옷·장갑·신발·토템 | 무기·보조무기·반지 1·2·목걸이).
  - `/cyborg`: 같은 20칸, 1440px(인공장기 | 그림 | 일반장비)·375px(두 줄 격자) 모두 가로 넘침 없음.
  - 시안 자료를 켠 `/units`: 본체 다음 줄이 Sora, Mina 상세 HP 281(사양 판), 일반장비 10칸.
- **미실행**: Playwright 화면 시험(`pnpm e2e` — `e2e/cyborg.spec.ts`·`units.spec.ts`·`equip-stats.spec.ts`를 새 칸·사양 판에 맞게 고쳤지만 이 PC에 `chromium-1243`이 없어 돌리지 못했다). 다크 한 가지 테마·한국어만 눈으로 봤다(파스텔·영어 사진 없음). 장착·해제 뒤 사양 판이 다시 받아지는 흐름은 눌러 보지 않았다(개발 DB를 바꾸지 않으려고 — 코드상 목록이 다시 오면 다시 받는다).

## 이어서 (같은 날 17시쯤): 사이보그 화면 없앰·유닛 초상
사용자 지시: "1. 사이보그 패널은 아예 없애라니까? 유닛에 넣었으니까 중복이라고. 왜 놔뒀는지 해명해라. 2. 유닛리스트에는 동그라미에 유닛의 초상화를 넣어라 D가 아니라"

- 왜 남겼었나: 처음 지시를 "목록에 본체를 넣고 상세를 같게"로만 읽고, 환생·랭킹·외형 고르기가 사이보그 화면에만 있어서 화면을 그대로 뒀다. 지우는 판단을 묻지도 않았다 — 잘못 읽은 것이다(ADR "바뀜" 절).
- 사이보그 메뉴 항목·화면을 없앴다. 옛 주소 `/cyborg` → `/units?unit=self`. 위 띠 얼굴·홈 사이보그 카드도 본체 줄로 간다.
- 옛 화면의 판은 유닛 상세의 본체 줄 안으로 옮겼다(`CyborgScreen.tsx` → `CyborgSheet.tsx`, 판·클래스 이름 그대로). 머리 판(초상·칸) 아래에 상태·부상·AI 작전 칸.
- 유닛 동그라미에 초상(본체 = 만든 외형, 사람형 = 유닛 번호 기본 외형, 크리쳐는 첫 글자).

| 파일 | 이유 |
|---|---|
| `packages/shared/src/navigation.ts`, `routes.ts`, `roster.ts` | 메뉴 항목 `cyborg` 뺌(ID 다시 안 씀), `units` 주소 `?unit=`, 옛 `cyborg` 주소 줄·랭킹 부모, `RosterUnit.look` |
| `apps/game/src/cyborg/CyborgSheet.tsx`(옛 `CyborgScreen.tsx`), `cyborg.css` | 화면 틀을 뗀 본체 판(`between` 자리), 상세 판 폭용 한 열 |
| `apps/game/src/units/UnitDetail.tsx`, `UnitList.tsx`, `UnitsScreen.tsx`, `units.css` | 본체 줄 = 본체 판, 초상 동그라미(`UnitAvatar`·`unitLookOf`), `?unit=`로 상세 열기·닫으면 주소에서 지움 |
| `apps/game/src/shell/menuItems.ts`, `routeViews.tsx`, `TopBar.tsx`, `layout.ts`, `home/cards/registry.tsx`, `sections/ComingSoon.tsx` | 메뉴 항목·넘김·위 띠 얼굴·탭 칸 계단(끝 6·5칸)·카드 길 |
| `apps/game/src/roster/roster.css`, `messages/{ko,en}.json` | 초상 동그라미 모양, 안 쓰는 본체 안내 문구 둘 뺌 |
| `apps/server/src/roster/services.ts` | 본체 줄 `look`, 시안 본체 줄(`p0`, 만든 사이보그가 없을 때만) |
| 시험: `navigation.test.ts`(항목 6개·뺀 ID)·`routes.test.ts`·`layout.test.ts`·`router.test.ts`·`roster.test.ts`, `e2e/units.spec.ts`·`shell.spec.ts` | 바뀐 메뉴·주소·목록 |

검증(이어서):
- 화면 — Verified(로컬 개발 서버 + 내장 브라우저, dev 계정): 메뉴에 사이보그 없음(홈·지도·유닛·경제·세력·인벤토리), `/cyborg` → `/units?unit=self`로 넘어가 본체 상세가 열림, [목록으로]를 누르면 `?unit=`이 지워짐, 위 띠 얼굴 → 본체 상세. 목록 동그라미: 본체·휴먼·안드로이드는 초상 그림, 크리쳐(시안)는 첫 글자. 본체 상세 = 초상·외형 고르기·인공장기 10·일반장비 10·상태·사양·환생·랭킹. 1440·375px 가로 넘침 없음. 시안을 켜면 본체 판이 시안 본체(Lv 23).
- 전체 `TEST_DATABASE_URL=… pnpm check`(DB 시험 포함, 이 판 전체) — Verified 실행: 포맷·린트·타입·모듈 경계·파일 크기·다국어·디자인 값·콘텐츠 통과, 시험 파일 920/920·시험 6,563/6,563. `pnpm build` + `pnpm check:bundle` 통과: 첫 화면 JS 113,568 B / 상한 131,416 B.
- **미실행**: Playwright 화면 시험. `/cyborg`로 들어가는 시험 파일 12개 가운데 `units.spec.ts`·`shell.spec.ts`만 손봤다. 나머지(`cyborg.spec.ts`·`equip-stats.spec.ts`·`sheet-buffs.spec.ts`·`vitals.spec.ts`·`character-3d.spec.ts`·`combat-life.spec.ts`·`gather-expect.spec.ts`·`production.spec.ts`·`ranking.spec.ts`·`first-login.spec.ts`)은 넘김과 같은 클래스 이름으로 그대로 돌 것으로 보지만(Assumed) 돌려 보지 못했다 — 브라우저가 있는 곳에서 한 번 돌려 고쳐야 한다. 유닛이 많을 때(수백) 목록 초상 그리기 비용은 재지 않았다(Unknown — 초상은 한 번 그려 기억하고, 기억은 48장까지).

## 이어서: 하단 탭 칸 폭을 같게
사용자 지적(화면 사진): "하단 탭 크기가 제각각이다 균일하게 나눠라" — 배치 C는 지도 양옆을 반씩 나눠서, 메뉴 항목이 6개가 된 뒤 왼쪽 2칸·오른쪽 3칸의 칸 폭이 달랐다.

- `apps/game/src/shell/tabbar.css`: 배치 C도 지도까지 모든 칸을 같은 폭으로 나눈다(양옆 묶음 `.tabbar-side`는 `display: contents`).
- `apps/game/src/shell/layout.ts`(주석)·`layout.test.ts`: C의 필요 폭 셈을 (칸 수 + 1) × 지도 칸 폭으로, 두 배치가 같은 폭 나누기인지 보는 시험. 칸 수 계단(380px부터 5칸)은 그대로.
- 검증 — Verified(로컬 화면에서 잰 칸 폭): 445px 6칸 모두 72.8px, 375px 5칸 모두 73.4px, 320px 5칸 모두 62.4px, 가로 넘침 없음. `layout.test.ts` 10/10, 린트·디자인 값 검사 통과. 그 뒤 마지막 상태로 전체 `TEST_DATABASE_URL=… pnpm check`(DB 시험 포함)를 한 번 더 돌렸다 — Verified 실행: 포맷·린트·타입·모듈 경계·파일 크기·다국어·디자인 값·콘텐츠 통과, 시험 파일 920/920·시험 6,564/6,564.

## 사용자 결정 대기
- 없음
