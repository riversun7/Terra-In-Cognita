# 아이템 편집기 분류 나무·대분류 타일(옛 편집기 모양 되살림)

- 일시: 2026-11-09 21:50 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-item-editor.md` "바뀜 (2026-11-09 분류 나무·대분류 타일)", 질문 `docs/questions/2026-11-09-item-classes.md`(895~899), 가지 `work/item-classes`

## 한 일
- 사용자 지적 둘을 넣었다. ① [아이템 분류] 탭(원문 "분류도 엉망이네 중분류랑 무기 종류가 왜 같이 있냐?"): 나란한 세 칸(중분류·무기 종류·태그)을 대분류 타일 → 분류 나무(대분류 → 중분류 → 무기 종류) → 고른 마디로 바꾸고, 태그는 나무 밖 따로 판으로 뺐다. ② [아이템] 탭(원문 "예전 아이템 에디터는 대분류를 직관적으로 아이콘으로 표시하고 하위 분류를 선택하여 그곳에 포함된 아이템 리스트를 보여주는 아주 좋은 인터페이스이다. 지금 왜 이렇게 쓰레기같이했냐?"): 옛 편집기처럼 대분류 타일(그림·개수) → 대분류 › 중분류 › 무기 종류 잇따른 거르기 · 찾기 · 수 · 목록/격자 · 표(티어 표지·분류 사슬·무게·쌓기 상한·빠른 동작)로 되돌렸다. 아이템을 고르면 공용 편집 판(견주기·담은 변경 막대) 그대로.
- 자료(팩)는 바꾸지 않았다. 자료가 단계를 섞은 곳(보조 칸 종류가 "무기 종류"에, 무기 종류가 중분류가 아니라 칸에 묶임, 중분류 없는 아이템 25개)은 화면에 "자료 이상"과 질문 번호를 달고 기획 질문 895~899를 썼다.
- 나무 계산은 순수 함수 하나(`itemTree.ts`)로 두 탭이 같이 쓴다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/editor/items/itemTree.ts`·`itemTree.test.ts` | 분류 나무(대분류 9 → 중분류 → 칸 관례로 무기 종류), 마디 수·마디의 아이템, 담은 초안 얹기. 시험 6개 |
| `apps/game/src/editor/items/ItemCategoryTiles.tsx`·`itemIcons.tsx` | 대분류 타일(두 탭 공용)과 인라인 SVG 그림(대분류 9 + 전체, 빠른 동작·보기 바꿈) |
| `apps/game/src/editor/items/ItemBrowseBar.tsx` | [아이템] 탭 위 띠: 타일·잇따른 거르기·찾기·정렬·목록/격자·[새 아이템]·[편집 판 닫기]·[더 거르기] |
| `apps/game/src/editor/items/ItemList.tsx` | 공용 `EntryList` 대신 표/격자 목록(티어·그림·이름·사슬·무게·쌓기 상한·빠른 동작), 키 이동은 그대로 |
| `apps/game/src/editor/items/ItemEditorScreen.tsx` | 위 띠 + 목록/편집 판 배치(고르지 않으면 목록이 넓게), 줄 [복제]·[팩 값으로]/[지우기], 분류 탭 마디 열기·[아이템 탭에서 거르기] |
| `apps/game/src/editor/items/ItemTaxonomy.tsx`·`ItemTaxonomyNode.tsx`·`ItemTaxonomyFields.tsx` | 분류 탭: 타일 → 나무 → 고른 마디(공용 견주기 칸·든 아이템·그 자리의 새로 만들기), 태그 판. 옛 칸 부품은 Fields로 옮기고 `path`를 달았다 |
| `apps/game/src/editor/items/ItemTabPanel.tsx`·`ItemEffects.tsx` | 분류 탭에 마디 열기·아이템 열기·거르기 연결, `NewEntryForm` 가져오는 곳 |
| `apps/game/src/editor/items/itemModel.ts`·`itemModel.test.ts` | 거르기 칸 `weaponType`, 중분류 없음 `"-"`(나무와 같은 규칙) |
| `apps/game/src/editor/items/itemTree.css` | 타일·위 띠·표/격자·나무·마디(토큰만, 티어 색은 있는 글자색 토큰) |
| `packages/shared/src/itemEditor.ts`·`apps/server/src/itemEdit/views.ts` | 목록 줄 `stackMax`(표의 쌓기 상한 칸, 읽기만) |
| `apps/game/messages/ko.json`·`en.json` | 새 화면 문구(한국어·영어) |
| `e2e/items.spec.ts` | 새 시험 둘(아이템 탭 거르기·줄 복제, 분류 탭 나무·마디·태그 판·무기 종류 만들기), 배치 사진(넓은 목록·격자·나무·방패 마디), 옛 자원 시험의 중분류 고르기 |
| `docs/questions/2026-11-09-item-classes.md` | 기획 질문 895~899 |
| `docs/adr/2026-11-01-item-editor.md`·`docs/PLAN.md` | 바뀜 절, 14장 줄 |

## 함께 바꿔야 하는 파일
- 무기 종류의 부모 중분류가 자료가 되면(질문 896 나) `itemTree.ts`의 `WEAPON_SLOT_SUBCATEGORY` 관례를 그 칸으로 바꾼다.
- 대분류 그림을 바꾸면 `itemIcons.tsx` 하나. 대분류가 늘면(899 나) `ITEM_CATEGORY_IDS`·`CATEGORY_TEXT`·그림·`treeCounts`·`DEFAULT_STORAGE`를 함께.

## 건드리지 말 것
- 공용 편집기 틀(`apps/game/src/editor/content/`)은 바꾸지 않았다(건물 편집기 줄기가 고치는 중). 아이템 목록은 공용 `EntryList`를 더는 쓰지 않는다(스킬·건물 편집기는 그대로 쓴다).
- 팩 자료(`content/core/`)는 질문 답 전까지 그대로.

## 미검증·TODO·알려진 문제
- 실행한 검사(Verified): `pnpm vitest run apps/game/src/editor` 41파일 356개 통과(작업 중), `pnpm check`(DB 시험 포함) 564파일 4,289개 통과, `pnpm build` + `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 107,242 B / 상한 131,416 B(목록·분류 코드는 지연 조각 `ItemEditorScreen-*`이라 첫 화면은 그대로), `e2e/items.spec.ts`·`e2e/dev-stagebar.spec.ts`·`e2e/dev.spec.ts` 66개 중 65 통과. 실패 하나는 이 줄기와 상관없는 `e2e/dev.spec.ts:47`(개발자 홈 도구 수 기대 13, 실제 14 — main c296a43에서 이미 다른 줄기가 도구를 더함).
- 사진(개발 테마 둘 × 390·1440 × 한국어·영어)은 세션 임시 폴더에만 두었다. 고치기 전 1440 네온 다크 사진도 같은 곳.
- 빠른 동작 단추는 Tab 차례 밖이다(같은 동작이 편집 판 머리에 있다). 키보드만으로 줄에서 바로 복제하는 길은 없다.
- 분류 탭 수는 담은 초안 포함, [아이템] 탭 수는 목록 줄(적용된 값) 기준이다(보이는 줄과 같게).

## 사용자 결정 대기
- 질문 895~899(기획 세션).
