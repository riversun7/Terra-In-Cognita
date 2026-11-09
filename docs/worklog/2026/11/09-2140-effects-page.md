# 효과 사전을 따로 화면(/dev/effects)으로 옮기고 아이템·스킬 편집기에서 잇기

- 일시: 2026-11-09 21:40 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-item-editor.md` "바뀜 (2026-11-09, 효과 사전을 따로 화면으로 — 사용자 결정 B)", `docs/adr/2026-11-01-skill-editor.md` "바뀜 (2026-11-09, 효과 사전 고리·`?skill=`)", 가지 `work/effects-page`

## 한 일
- 사용자 물음 "효과 사전은 스킬에디터로 묶여야하는거아니냐?"에 A(스킬 편집기로)·B(따로 화면 + 양쪽에서 잇기)·C(그대로)를 보이고 B를 권했다. 사용자 "추천대로 해봐라" → B.
- 아이템 편집기 [효과 사전] 탭을 `apps/game/src/editor/effects/`의 새 화면 `/dev/effects`로 옮겼다. 공용 편집기 틀(목록·구역·칸 견주기·담은 변경 막대)로 다시 짰고 동작(고치기·새로 만들기(꺼진 채)·끄기·[팩 값으로]/[지우기]·쓰는 곳 아이템·스킬·같은 `items.*` 묶음(분류 effects)·검사·entry_changed 다시 얹기·내보내기 `entries`·감사 기록)은 그대로다. 최근 바꿈(효과 줄만, [다시 담기])을 더했다.
- 쓰는 곳 고리: 아이템 → `/dev/items?item=<ID>`, 스킬 → `/dev/skills?skill=<ID>`(스킬 편집기에 `skill` 검색어를 더함).
- 아이템 편집기 사용 효과 줄·스킬 편집기 효과 줄마다 [효과 사전에서 열기](`/dev/effects?effect=<ID>`), 아래 [새 효과 만들기](`?create=1`)와 안내 한 줄. 아이템 편집기의 주는·쓰는 스킬 고리도 그 스킬을 바로 연다.
- 서버 `items.list`에 덮어쓴 효과의 팩 항목 `effectPack`(칸마다 팩 값 견주기).
- 개발자 홈 줄(시약병 아이콘), 미리 캐시 규칙 `[Ee]ffectDictionary`·개발 소스 `src/editor/effects/`.
- 메시지: `dev_items_fx_*` → `dev_effects_*`로 이름 바꿈(ko·en), `dev_items_tab_effects` 지움, 새 화면 키 더함.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/editor/effects/EffectDictionaryScreen.tsx` | 새 화면(목록·편집 판·막대·검사·적용·다시 얹기·내보내기·최근 바꿈) |
| `apps/game/src/editor/effects/EffectEntry.tsx`, `EffectForm.tsx`(옛 `items/ItemEffects.tsx`), `EffectDictionaryList.tsx`, `EffectNewForm.tsx` | 편집 판 머리·구역 칸·쓰는 곳 고리, 왼쪽 목록, 새 효과 칸 |
| `apps/game/src/editor/effects/effectDictionaryModel.ts`(+ 시험), `effectDictionaryText.ts` | 담기·묶음·거르기·다시 얹기 순수 함수, 수치·상태이상·거절 문구 표(아이템 편집기 폴더 모듈을 가져오지 않게) |
| `apps/game/src/editor/effects/EffectDictionaryLinks.tsx`, `effectDictionaryLinks.css`, `effectDictionary.css` | 두 편집기가 쓰는 고리, 화면 스타일(토큰만) |
| `apps/game/src/editor/content/contentEditorEffects.tsx` | `EffectRows`에 덧붙일 것 칸 `renderRowExtra`·`footer`만 더함 |
| `apps/game/src/editor/items/ItemEditorScreen.tsx`, `ItemTabPanel.tsx`, `itemRestage.ts`, `itemEditorTabs.css`, `itemEffectsText.ts` | 효과 사전 탭 없앰(탭 하나·한 줄씩), 효과 다시 담기는 막대에만, 효과 탭 CSS 지움, 효과 수치 문구는 effects로 |
| `apps/game/src/editor/items/ItemUseFields.tsx`, `skills/SkillParts.tsx` | 효과 줄 옆 고리·[새 효과 만들기] |
| `apps/game/src/editor/items/ItemSide.tsx`, `ItemEquipFields.tsx`, `skills/SkillEditorScreen.tsx` | 스킬 고리 `?skill=`, 스킬 편집기가 `initialId`로 그 스킬을 연다 |
| `packages/shared/src/routes.ts`(+ 시험), `apps/game/src/shell/routeViews.tsx`, `sections/ComingSoon.tsx` | 주소 `dev_effects`(`effect`·`create`), `dev_skills`에 `skill` |
| `apps/game/src/editor/DevHome.tsx`, `devIcons.tsx` | 개발자 홈 한 줄, 아이콘 |
| `apps/game/vite.config.ts`, `scripts/pwa-build.mjs`(+ 시험) | 미리 캐시에서 뺄 조각·개발 소스 |
| `packages/shared/src/itemEditor.ts`, `apps/server/src/itemEdit/services.ts`, `itemEdit.db.test.ts` | `effectPack` |
| `apps/game/messages/ko.json`, `en.json` | 키 이름 바꿈·새 키 |
| `e2e/effects.spec.ts`, `e2e/items.spec.ts` | 효과 사전 시험을 옮김 |
| `docs/adr/2026-11-01-item-editor.md`, `docs/adr/2026-11-01-skill-editor.md` | "바뀜 (2026-11-09)" |

## 함께 바꿔야 하는 파일
- 효과 칸을 더하면 `EffectForm.tsx`(path 칸)와 `effectDictionaryModel.ts` `isEffectJson`·`newEffectTemplate`.
- 새 개발 도구 폴더를 `editor/effects/`에서 가져오면 조각 이름이 `[Ee]ffectDictionary`에 걸리는지 `node scripts/check-pwa.mjs`로 본다.

## 건드리지 말 것
- 효과 사전 화면에서 `editor/items/` 모듈을 가져오지 않는다(공용 조각이 규칙 밖 이름이 될 수 있다).

## 검사 결과 (Verified)
- `pnpm check` 통과(시험 파일 564·시험 4,294, DB 시험 포함 `TEST_DATABASE_URL`).
- `pnpm build`, `node scripts/check-pwa.mjs` 통과(조각 `EffectDictionaryScreen-*`·`EffectDictionaryLinks-*` 미리 캐시 밖), `pnpm check:bundle` 첫 화면 JS 107,471 B / 상한 131,416 B.
- e2e: `e2e/effects.spec.ts` 6 통과, `e2e/items.spec.ts`+`e2e/skills.spec.ts` 53 통과.
- 사진(개발 테마 네온·라이트 × 1440 한국어, 네온 390 영어): 가로 넘침·작은 누르는 곳 없음.

## 미검증·TODO·알려진 문제
- 아이템·스킬 편집기에서 고리로 옮기면 그 편집기의 담은 변경은 남지 않는다(같은 탭 이동). 안내 한 줄만 둔다. 화면 안 이동 전에 묻기는 하지 않았다.
- 효과 사전 화면은 되돌리기·다시하기가 없다(스킬 편집기와 같다. 옛 탭은 아이템 편집기 막대의 것을 같이 썼다).
- 검사 문제는 서버 문구(`issue.message`) 그대로 보인다(아이템 편집기의 코드별 문장 표는 아이템 폴더라 쓰지 않음).
- 스킬 조건 "대상이 이 효과를 가짐"의 효과 고르기 옆에는 고리를 달지 않았다(효과 줄만).

## 사용자 결정 대기
- 없음(사용자 결정 B 반영. 화면을 본 뒤 통합 담당이 ADR 절을 확정).
