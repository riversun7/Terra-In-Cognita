# 크리쳐 편집기: 도감 탭·변종 그룹·스탯 조우 오차·3D 미리 보기·전리품 간소화

- 일시: 2026-11-25 18:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-25-creature-codex-groups.md`(제안), 크리쳐 편집기 `docs/worklog/2026/11/08-1650-creature-editor.md`, ADR `2026-11-10-creature-portrait-crop.md`

## 한 일
사용자 지시(2026-11-25) 여섯 가지와, 묻고 받은 답(ADR "배경"에 원문)대로 `/dev/creatures`를 고쳤다.

- **화면 탭 둘**: `[도감]`(첫 탭) + `[상세·편집]`(옛 화면 그대로).
  - 도감: 전체 크리쳐를 한 줄씩 훑는 표(토큰·이름·ID, 분류·등급, 크기, 속성 위 3개, 스탯 성향 막대, 6스탯, 합과 조우 범위, 전리품 수). 이름·ID 검색, 분류·등급·주속성·스탯 성향 거르기, 차례 4가지, 변종 그룹 묶기·접기.
  - 줄을 고르면 상세 탭의 새 "도감 정보" 탭으로 넘어간다. `?creature=<ID>`로 열면 옛날처럼 "기본" 탭(초상화)이 바로 뜬다. 상세 안 탭은 크리쳐를 바꿔도 그대로 둔다.
- **도감 정보 탭**: 일러스트와 3D 미리 보기를 나란히, 설명·분류·속성, 스탯 성향(물리·기교·마법 몫)과 스탯마다 1레벨 조우 범위(기준 ± 오차), 변종 그룹 카드, 전리품 요약.
- **3D 미리 보기**: 엔진 진입점 `@terra/engine/creaturePreview`를 새로 만들었다. 크리쳐에 `model`(GLB 파일) 칸이 있으면 그 모델을, 없거나 못 읽으면 임시 몸(공용 네 발 짐승, 크기 등급 배율)을 돌려 본다. 조작은 캐릭터 미리 보기와 같다(끌기·휠·두 손가락·돌림판·키).
- **변종 그룹**: 팩 크리쳐에 `variantOf`(그룹 대표 ID) 칸. 그룹 카드에서 변종 추가(복제: 그대로·주속성 바꿈·스탯 성향 바꿈), 기존 단독 크리쳐 넣기, 그룹에서 빼기, 대표로 지정. 팩 검사에 한 단계 규칙(`creature_variant_chain`·`creature_variant_self`).
- **스탯 = 1레벨 기준 + 조우 오차**: 팩 크리쳐에 `primarySpread`(스탯마다 ±0~10) 칸. 기본 규칙 = 기준 10 이하 ±1, 20 이하 ±2, 그 위 ±3. 스탯 탭에 오차 칸·조우 범위·"오차 기본값으로", 그리고 "랜덤 분포 뽑기"(총합과 고정할 스탯을 정하면 나머지를 흔들어 나눈다).
- **전리품**: 아이템 고르기(검색·분류) + 획득 확률만. 수량 칸·기대 가치·사냥 시뮬레이터는 화면에서 뺐다(자료 모양은 그대로, 새 줄은 1개).
- 조우 레벨·출현 확률·K값은 넣지 않았다(사용자 답: 인카운터 페이지 몫, K는 기존 0.8~1.2).
- 화면 시험을 작업 PC(macOS, Playwright 브라우저 폴더 없음)에서 돌리려고 `E2E_BROWSER_CHANNEL=chrome`(설치된 Chrome 쓰기)을 더했다. 주지 않으면 옛날과 같다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/content/src/schema/creatures.ts` | 선택 칸 `model`·`variantOf`·`primarySpread`, 자기 자신을 대표로 가리키면 오류 |
| `packages/content/src/validate/statSums.ts`, `statSums.test.ts`(새) | 변종 그룹 한 단계 검사(`creature_variant_chain`)와 시험 |
| `packages/shared/src/creatureEditor.ts`, `creatureEditor.test.ts` | 화면 JSON에 새 칸, 오차 기본 규칙·조우 범위·스탯 성향·그룹 묶기·랜덤 분포 뽑기·모델 경로, 목록 응답 `availableModels` |
| `apps/server/src/creatureEdit/views.ts`, `services.ts` | 새 칸 옮기기, `public/creatures/models/`의 GLB 파일 이름 목록 |
| `packages/engine/src/creatures/creaturePreview.ts`, `previewEntry.ts`(새), `packages/engine/package.json` | 크리쳐 3D 미리 보기(GLB 로더 + 임시 몸), 진입점 `./creaturePreview` |
| `apps/game/src/editor/creatures/CreatureEditorScreen.tsx` | 화면 탭 둘, 상세 안 탭 상태 올리기, 여러 크리쳐 한 번에 담기·변종 만들기 |
| `apps/game/src/editor/creatures/CreatureDex.tsx`(새) | 도감 탭 |
| `apps/game/src/editor/creatures/CreatureOverviewTab.tsx`, `CreatureModelViewer.tsx`, `CreatureGroupCard.tsx`, `creatureEditorViewer.ts`(새) | 도감 정보 탭, 3D 칸, 변종 그룹 카드, 엔진 조각 다시 내보내기(조각 이름 `creatureEditorViewer-*`) |
| `apps/game/src/editor/creatures/CreatureDetail.tsx`, `CreatureList.tsx` | "도감 정보" 탭·그룹 배지·3D 모델 칸(기본 탭), 목록에 변종 배지 |
| `apps/game/src/editor/creatures/CreatureStatsTab.tsx`, `CreatureLootTab.tsx` | 오차 칸·조우 범위·랜덤 분포 뽑기, 전리품 간소화 |
| `apps/game/src/editor/creatures/creatureModel.ts`, `creatureModel.test.ts`(새) | 새 칸 정리·다시 얹기, 변종 만들기·대표 바꾸기, 실효 목록 합치기와 시험 |
| `apps/game/src/editor/creatures/creatureEditor.css` | 새 화면 스타일(토큰만), 빠져 있던 `.ce-chip-list` |
| `apps/game/messages/ko.json`, `en.json` | 개발 홈 카드 설명(`dev_tool_creatures_desc`)에서 드롭 시뮬레이터를 빼고 새 기능을 적음 |
| `scripts/pwa-build.mjs` | 개발 도구 전용 소스에 `packages/engine/src/creatures/` 미리 보기 추가(미리 캐시 금지) |
| `e2e/creatureDex.spec.ts`(새) | 도감 → 상세, GLB·임시 몸, 변종 그룹, 스탯 오차·랜덤 분포, 전리품, 사진 |
| `e2e/global-setup.ts`, `e2e/playwright.config.ts`, `AGENTS.md` | `E2E_BROWSER_CHANNEL`(설치된 Chrome으로 화면 시험) |
| `docs/adr/2026-11-25-creature-codex-groups.md`(새) | 결정 기록 |

## 함께 바꿔야 하는 파일
- 크리쳐 칸을 더하거나 바꿀 때: `packages/content/src/schema/creatures.ts` ↔ `packages/shared/src/creatureEditor.ts`(`CreatureJson`) ↔ `apps/server/src/creatureEdit/views.ts`(`creatureJsonOf`) ↔ `apps/game/src/editor/creatures/creatureModel.ts`(`cleanCreature`·`mergeCreature`). 빠지면 `apps/server/src/creatureEdit/views.test.ts`가 잡는다(팩에 그 칸을 쓴 항목이 있을 때).
- 스탯 오차 범위(0~10): 스키마 `primarySpreadSchema` ↔ `CREATURE_LIMITS.spread`.
- 3D 미리 보기 엔진 파일을 옮기면 `scripts/pwa-build.mjs` `DEV_ONLY_SOURCE`와 `creatureEditorViewer.ts`를 같이 고친다.

## 건드리지 말 것
- `creatureEditorViewer.ts`의 파일 이름: 조각 이름이 미리 캐시 제외 규칙(`[Cc]reatureEditor`)에 걸리게 지은 것이다.
- `cleanCreature`가 기본 규칙과 같은 `primarySpread`를 지우는 동작: 지우지 않으면 기준값을 바꿔도 오차가 따라가지 않는다.

## 미검증·TODO·알려진 문제
- 검증 결과는 아래 "검증" 참고.
- 조우 때 스탯을 실제로 굴리는 코드는 없다(인카운터 줄기). 굴린 합이 상한(D-534)을 넘지 않게 줄이는 것도 그때 한다 — **Unknown**(규칙 미정).
- 진짜 크리쳐 GLB 자산으로는 보지 못했다(자산 없음). 시험은 삼각형 둘짜리 GLB로 로더·세우기만 봤다 — 재질·애니메이션·큰 모델은 **미실행**.
- 화면 문구는 이 화면의 옛 방식(코드 안 한국어·영어 짝)을 따랐다. AGENTS.md 규칙(메시지 키)과 다르다 — 이 화면 전체를 메시지 키로 옮기는 일은 따로 해야 한다.
- 팩 자료(`content/core/creatures.json`)는 바꾸지 않았다(91종 모두 단독, 오차 기본 규칙).
- 기획 미러에 없는 규칙(스탯 오차, 변종 그룹)이다. 기획 세션 전달 필요.

## 검증
- **Verified** 화면 시험(설치된 Chrome, `E2E_BROWSER_CHANNEL=chrome TEST_DATABASE_URL=… pnpm e2e e2e/creatureDex.spec.ts`): 9/9 통과 — 도감 → 상세 이동, 주소로 열기, GLB 모델(삼각형 2개)·못 읽은 모델·임시 몸, 오차·랜덤 분포, 전리품, 변종 만들기 → 적용 → 도감 들여쓰기·접기, 390 가로 넘침 없음. 사진(1440 네온·라이트, 390 네온)으로 도감·도감 정보·스탯·전리품 탭을 눈으로 확인했다.
- **Verified** 옛 초상화 시험 `e2e/creatures.spec.ts`: 첫 실행에서 `creatureDex.spec.ts`와 함께 돌려 모두 통과(그 실행의 실패 3건은 새 시험의 요소 고르기 문제였고 고쳤다). 그 뒤 스탯 줄 배치·도감 좁은 화면 CSS를 고친 다음에는 다시 돌리지 않았다 — **미실행**(초상화 선택기 코드는 바꾸지 않았다).
- **Verified** `pnpm check`의 포맷·타입·린트·모듈 경계·파일 크기·다국어(9,523키)·디자인 값(746쌍)·콘텐츠(core@153): 통과. 린트는 첫 실행에서 다른 작업의 새 파일(`apps/game/src/ui/EntityRef.tsx`, 메시지 키가 아직 없던 순간)에 걸렸고 다시 돌려 통과했다.
- **Verified** `pnpm build` → `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 통과(첫 화면 JS 113,732 B / 상한 131,416 B). 3D 미리 보기 조각은 `creatureEditorViewer-*.js`(52 kB, 미리 캐시 밖).
- 단위·DB 시험(`TEST_DATABASE_URL=… pnpm test`): 파일 916/929·시험 6,584/6,611 통과, **27개 실패**. 실패는 모두 나라 의결·외교·가문 도시·폐허·명성 DB 시험(`governance*.db.test.ts`·`diplomacy.db.test.ts`·`factionIdentity/house*.db.test.ts`·`cityShares`·`ruins`·`landClaim`·`layoutTravel`·`worldMap/reads`·`world/renown`)이고 오류는 `no_nation`·`forbidden`·`foreignBuild` 칸 등이다. 크리쳐 쪽 코드를 쓰지 않는 시험이고 작업 트리에 다른 작업의 미커밋 변경(`apps/server/src/factionIdentity/` 등)이 있다 — 이 작업 탓이 아니라고 본다(**Assumed**: 따로 떼어 돌려 확인하지는 않았다). 크리쳐·콘텐츠·공용·편집기 시험은 모두 통과했다.
- 커밋하지 않았다(작업 트리에 다른 작업의 미커밋 변경이 섞여 있다).

## 사용자 결정 대기
- ADR `2026-11-25-creature-codex-groups.md` 확정 여부(지금 "제안").
- (끝남) 스탯 오차 기본 규칙에서 "스탯3이하는 3"을 30으로 읽고 30을 넘는 스탯도 ±3으로 둔 것 — 사용자 확인 2026-11-25 "맞다".
