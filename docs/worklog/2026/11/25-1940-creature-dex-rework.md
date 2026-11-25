# 크리쳐 도감 다시 짜기: 스탯 합 앞·6스탯 분포·정렬·필터·기술 슬롯·속성 아이콘·분류 대·중·소

- 일시: 2026-11-25 19:40 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-25-creature-codex-groups.md` 6절("바뀜 (2026-11-25, 도감 다시 짜기)"), 앞 작업 `docs/worklog/2026/11/25-1830-creature-codex-groups.md`

## 한 일
사용자 지시(2026-11-25, 도감 첫 판을 본 뒤 — "예전 프로젝트에 비해 UI가 너무 별로다" + 여섯 가지)대로 고쳤다.

1. **스탯 성향 → 6스탯 분포**: 세 묶음(물리·기교·마법) 성향 표시를 없애고 6스탯 몫 막대(`StatShareBar`)와 스탯 여섯 칸으로 보인다(도감·도감 정보·스탯 탭·그룹 카드). 공용 `creatureStatProfile`(성향)은 지우고 `creatureStatShares`로 바꿨다.
2. **속성 아이콘**: 기존 12속성 아이콘(`apps/game/src/ui/elementIcons.tsx`)으로 보인다. 그러려고 속성 칸 차례를 바로잡았다(아래 "속성 칸 차례").
3. **스탯 합을 맨 앞으로**: 도감 표 칸 차례 = 크리쳐 → 스탯 합 → 6스탯 분포 → 스탯 여섯 → 기술 슬롯 → 속성 → 크기 → 분류 → 등급 → 전리품. 합은 등급 기준 예산(36·48·62·72·78)으로 여섯 단계 색(`creatureSumTier`).
4. **정렬·필터**: 칸 머리를 누르면 합·스탯 여섯·기술 슬롯·이름으로 줄을 세운다(큰 것부터 → 작은 것부터 → 도감 차례). 필터 = 분류 띠, 등급, 크기, 주속성(아이콘 단추), 주력 스탯, 합 범위, 스탯 하나의 최소값, 기술 슬롯 최소, [필터 초기화].
5. **기술 슬롯**: 표에 기본/최대와 눈금 10칸. 도감 정보에도 배지.
6. **분류 대·중·소**: 새 팩 분류 `creature_classes`(트리). 크리쳐 `category`를 14종 enum에서 이 트리의 참조로 바꿨다. 도감에 대분류 카드 띠(→ 중·소분류 칩)와 [분류 편집](더하기·이름·그림 글자·위 분류 바꾸기(옮기기)·지우기·팩 원본으로), 표에서 크리쳐 여럿을 골라 분류 옮기기.

### 속성 칸 차례 (팩 자료 바꿈)
- 팩 크리쳐 91종의 `elements`·`naturalWeapon.skillElementsPm`이 옛 프로젝트에서 옮길 때의 차례였다(`scripts/oneoff-import-creatures.mjs` `buildElements12`: 물·불·바람·땅·빛·어둠·크리스탈·크리스탈 보탬·빙결·번개·사령·빈칸). 편집기 이름표는 그것을 나무·금속·얼음·독·산으로 잘못 적었다 — **Verified**(스크립트·자료 대조).
- 판정 코드의 칸 차례(`@terra/shared` `ELEMENT_CODES`: 물·빙결·불·폭렬·바람·번개·땅·크리스탈·빛·성·어둠·사령)로 옮겼다. 크리스탈 보탬 칸(골렘 둘·메탈 슬라임, 값 2)은 크리스탈에 더했다. 종마다 속성 합은 그대로다. 팩 판 154 → 155.
- 이 세계의 크리쳐 덮어쓰기(DB `content_overrides`)에 옛 차례로 저장한 `elements`가 있으면 손으로 다시 맞춰야 한다. 로컬은 덮어쓰기가 없었다(판 #0). NAS는 보지 못했다 — **Unknown**.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/content/src/schema/creatureClasses.ts`(새), `schema/categories.ts`, `index.ts` | 분류 트리 스키마·등록·내보내기 |
| `packages/content/src/schema/creatures.ts` | `category` = `ref("creature_classes")`, 14종 enum 제거, 속성 칸 차례 주석 |
| `packages/content/src/validate/creatureClasses.ts`(새), `validate/pack.ts`, `validate/statSums.test.ts` | 트리 깊이(셋)·고리 검사와 시험 |
| `packages/content/src/tuningDiff.ts`, `scripts/apply-tuning-diff.mjs` | 내보내기·적용 분류에 `creature_classes`(크리쳐보다 먼저) |
| `content/core/creature_classes.json`(새), `creatures.json`, `manifest.json` | 대분류 14종 씨앗, 속성 칸 차례 옮김, 판 155 |
| `packages/shared/src/contentEdit.ts`, `creatureEditor.ts`, `creatureEditor.test.ts` | 덮어쓰기 분류, 분류 트리 타입·도우미(길·아래 분류·옮길 수 있는지·트리 차례), 합 단계, 주속성(강화형 2배), 6스탯 몫 |
| `apps/server/src/db/contentEditSchema.ts`, `drizzle/20261125101938_content_overrides_creature_classes/` | 덮어쓰기·은퇴 ID 표의 분류 검사에 `creature_classes`(넓히기만) |
| `apps/server/src/contentEdit/core.ts`, `state.ts` | 실효 팩에 분류 트리 |
| `apps/server/src/creatureEdit/views.ts`, `services.ts`, `apps/server/src/trpc/creatures.ts` | 목록 응답에 분류 트리, 묶음에 `put_class`·`revert_class` |
| `apps/game/src/editor/creatures/CreatureDex.tsx` | 도감 표 다시 씀(칸 차례·정렬·필터·기술 슬롯·분류 옮기기) |
| `apps/game/src/editor/creatures/CreatureClassPanel.tsx`(새) | 분류 띠·분류 편집기 |
| `apps/game/src/editor/creatures/creatureBits.tsx`(새) | 속성 아이콘 줄·6스탯 분포 막대·합 배지·분류 길 글 |
| `apps/game/src/editor/creatures/creatureModel.ts`, `creatureModel.test.ts` | 분류 담기(stage), 정식 12속성 이름표, 성향 이름표 제거 |
| `apps/game/src/editor/creatures/CreatureEditorScreen.tsx`, `CreatureDetail.tsx`, `CreatureList.tsx`, `CreatureOverviewTab.tsx`, `CreatureStatsTab.tsx`, `CreatureGroupCard.tsx` | 분류 트리·6스탯 분포·속성 아이콘에 맞춤 |
| `apps/game/src/editor/creatures/creatureEditor.css` | 새 화면 스타일 |
| `e2e/creatureDex.spec.ts` | 정렬·필터·속성·기술 슬롯, 분류 편집(중·소분류 더하기 → 옮기기 → 적용) 시험 |

## 함께 바꿔야 하는 파일
- 분류 깊이 상한(3): `packages/content/src/schema/creatureClasses.ts` `CREATURE_CLASS_MAX_DEPTH` ↔ `packages/shared/src/creatureEditor.ts` `CREATURE_CLASS_MAX_DEPTH`.
- 덮어쓰기 분류를 더할 때: `packages/shared/src/contentEdit.ts` ↔ `apps/server/src/db/contentEditSchema.ts`(검사 두 곳 + 마이그레이션) ↔ `apps/server/src/contentEdit/core.ts`(rawOf)·`state.ts` ↔ `packages/content/src/tuningDiff.ts` ↔ `scripts/apply-tuning-diff.mjs`.
- 속성 이름표(`creatureModel.ts` `ELEMENT_LABELS`)의 차례는 `@terra/shared` `ELEMENT_CODES`와 같아야 한다.

## 건드리지 말 것
- 마이그레이션 `20261125101938_content_overrides_creature_classes`(올린 뒤에는 고치지 않는다).
- 도감 정렬 열쇠 `"codex"`(도감 차례): 스탯 코드 `dex`와 겹치면 DEX로 줄을 세울 수 없다(처음에 겹쳐서 고쳤다, 화면 시험이 본다).

## 미검증·TODO·알려진 문제
- 이 작업 도중 다른 세션이 `creatureBits.tsx`·`creatureEditor.css`의 속성 아이콘 모양을 고쳤다(유닛창과 같은 `--element-color` 토큰·아이콘). 그 상태를 그대로 뒀다. 그 판에는 강화형을 따로 표시하는 테두리가 없다(아이콘 모양·색으로만 가른다, `data-enhanced` 표지는 남아 있다).
- 팩에 든 분류(대분류 14종)는 편집기에서 지울 수 없다(이름·자리만). 지우려면 팩 파일과 ID 변경표에서 한다.
- 직전 판 앱으로 되돌리면: `creature_classes` 덮어쓰기 줄은 잠든 줄이 되고, 새 분류를 가리키는 크리쳐 덮어쓰기는 옛 스키마(enum)에 맞지 않아 잠든다.
- 최근 바꿈(history)은 크리쳐 줄이 든 묶음만 보인다(분류만 바꾼 묶음은 안 보인다).
- 대분류 14종의 그림 글자(이모지)·한국어 이름은 옛 화면을 따라 넣은 임시 값이다.

## 검증
- **Verified** 화면 시험(`E2E_BROWSER_CHANNEL=chrome TEST_DATABASE_URL=… pnpm e2e e2e/creatureDex.spec.ts`): 11/11 통과 — 앞 작업의 9개 + 정렬(STR·DEX·합: 큰 것부터 → 작은 것부터 → 도감 차례)·합 범위·주속성 필터·속성 아이콘·기술 슬롯, 분류 편집(중·소분류 더하기, 셋째 단계에는 하위 분류 단추 없음, 크리쳐 둘 옮기기 → 적용 4건 → 분류 띠로 거르기). 사진(1440 네온·라이트, 390 네온)으로 확인. 초상화 시험 `e2e/creatures.spec.ts` 8개도 같은 묶음에서 통과(DEX 정렬 열쇠를 고치기 전 실행 — 그 뒤 고친 것은 도감 표뿐이다).
- **Verified** 포맷·타입·린트·모듈 경계·파일 크기·다국어(9,542키)·디자인 값(746쌍)·콘텐츠(core@155, 직전 판 호환 4b 포함) 통과.
- **Verified** 단위·DB 시험 `TEST_DATABASE_URL=… pnpm test`: 파일 929/929·시험 6,625/6,625 통과(앞 작업 때 실패하던 나라·가문 DB 시험 27개는 그사이 다른 작업에서 고쳐져 지금은 통과).
- **Verified** `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 통과(첫 화면 JS 113,783 B / 상한 131,416 B) — 화면 시험이 만든 빌드 기준.
- 마이그레이션은 화면 시험의 새 DB에서 적용됐다(분류 저장·적용 시험이 통과). 로컬 개발 DB·NAS 적용은 따로 보지 않았다 — **미실행**.
- 커밋하지 않았다.

## 사용자 결정 대기
- 없음.
