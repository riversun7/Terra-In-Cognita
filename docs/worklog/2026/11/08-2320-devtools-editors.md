# 아이템·스킬·건물 편집기 화면 개편(/dev/items·/dev/skills·/dev/buildings)

- 일시: 2026-11-08 23:20 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-item-editor.md`·`2026-11-01-skill-editor.md`·`2026-11-02-building-editor.md` "바뀜 (2026-11-08 화면 개편)"(상태 줄 그대로), 기준 화면 ADR `2026-11-01-dev-settings-panel.md` "바뀜 (2026-11-08 화면 개편)", ADR `2026-11-02-dev-ui.md`, 가지 `work/devtools-editors`(바탕 main b109825)

## 한 일
- 사용자 답("화면 개편 뒤 확정", 개발 도구가 개발자 친화적이지 않다는 판정)에 따라 세 편집기 화면을 설정 칸 패널(`/dev/tuning`) 개편 모양·조작으로 다시 짰다. 자료 모양·서버 API·덮어쓰기 층·감사 기록·내보내기(`pnpm tuning:apply` entries)·서버 검사·미리 보기는 그대로. 판정·프로토콜(19)·팩(core@57)·SIM(22) 판 그대로.
- 공용 틀 `apps/game/src/editor/content/`(셋이 같이 쓴다, 조각 이름 `contentEditor…` = 미리 캐시 규칙 그대로):
  - 왼쪽 항목 목록 `EntryList`: 찾기("/" 키·Esc·↓로 첫 줄, 낱말 여럿은 모두 맞는 것), 거르기(넓은 폭 늘 보임·휴대폰 [거르기 N] 접힘), 보이는 수·[거르기 지우기]·화면 동작, 두 줄 줄(분류 표지·이름·ID·표지 / 요약), 담은 줄·덮어쓴 줄 왼쪽 띠, ↑↓·Home·End·PageUp/Down 키(고른 줄만 Tab), 고른 줄이 목록 상자 밖이면 상자만 민다, 200줄씩 더 보기.
  - 화면 틀 `contentEditorLayout`: 머리 요약 칩 + 도구, 탭 줄(←→), 편집 판 머리(붙음: [← 목록]·이름·ID·표지·[‹][›]·동작), 구역 `FormSection`(접힘, 풀이·근거·담은 칸 수·팩과 다른 칸 수), 구역 바로 가기, 키 안내, 내보내기 판, 묻는 줄, 화면 키 훅(`/`·Ctrl/⌘+S·Alt+↑↓, 담은 변경이 있으면 beforeunload).
  - 칸 견주기 `contentEditorCompare` + 칸 경로 `contentEditorPaths`: 편집 판이 팩 항목·지금 실효 항목·초안을 주면 `path`를 받은 칸이 담음·팩과 다름 표지·띠, "팩 값 · 지금 값", [되돌리기]·[팩 값으로](칸 하나)를 스스로 그린다. 서버 검사 문구도 경로로 받는다.
  - 입력 칸(`contentEditorFields`): 풀이·단위·범위(정수 칸은 min~max 자동)·덧붙인 말 한 줄, 틀린 글자는 그 자리에 까닭(비었음·정수 아님·범위 밖).
  - 담은 변경 막대 `PendingBar`: 항목마다 이름·ID·무엇(N칸 고침·팩 값으로·새로 만듦·버림)·[열기]·[×], 검사 상태, 화면 도구(되돌리기·다시하기), 메모, [검사], [모두 취소](묻고), [적용](Ctrl/⌘+S).
- 아이템 편집기: 목록·막대·머리·내보내기·탭을 공용으로, 대분류 타일 → 개수를 단 고르기 상자, [더 거르기](중분류·칸·입을 종류·출처·켬·티어), 찾기에 대분류(ID·이름)·중분류, 칸마다 경로(기존 검사 경로 그대로) → 견주기, 구역 풀이·근거. 대량 도구 동작은 `itemBulkActions.ts`로 뺐다.
- 스킬 편집기: [저장] 하나씩 → 담은 변경 막대 한 묶음(`put_skill` 여럿, 서버는 원래 묶음을 받는다), 새 스킬·복제는 [적용] 전에도 목록에 담음으로, 거절(invalid_entry)의 팩 검사 줄을 스킬·칸으로 나눠(`issueLinesById`) 그 칸 옆에, [끄기/켜기] 단추 없앰(켜기 칸으로), 거르기에 모양·자원·담은 것만.
- 건물 편집기: 시설 표 → 목록(찾기는 재료 이름도, 거르기 덮어쓴 것·담은 것·채집 시설·단계), 탭 글을 메시지 키로, 구역 풀이·근거, 재료 줄·구간·수리 재료 칸까지 견주기, 검사 문제를 칸 옆에도.
- 결함 고침(건물 편집기): `cleanFacility`·`mergeFacility`가 건물 런타임 칸(`footprint`·`durability`·`storageKg`)을 빠뜨려 다른 칸만 고쳐 [적용]해도 그 세계 덮어쓰기에서 세 칸이 지워졌다 → 넣고 시험 더함.
- 스킬 순서(AGENTS 8장): 디자인 시스템이 정해져 있고 기준 화면(설정 칸 패널)이 있어 1·2단계(frontend-design·ui-ux-pro-max)는 건너뛰었다. `web-design-guidelines` 규칙으로 본 뒤 고친 것: 아래 붙은 막대·위 붙은 머리가 키로 옮긴 칸을 가리지 않게(scroll-margin), 담은 변경이 있으면 창 닫기 전에 묻기(beforeunload), ID에 `translate="no"`. `break-ui`는 아래 사진(390·한국어·영어·긴 이름)으로 대신했다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/editor/content/contentEditorList.tsx`(새) | 공용 왼쪽 목록·거르기 부품 |
| `apps/game/src/editor/content/contentEditorLayout.tsx`(새) | 공용 머리·탭·편집 판 머리·구역·바로 가기·키 안내·내보내기 판·묻는 줄·화면 키 |
| `apps/game/src/editor/content/contentEditorPending.tsx`(새) | 공용 담은 변경 막대 |
| `apps/game/src/editor/content/contentEditorCompare.tsx`(새) | 칸 견주기(팩·지금·초안), 칸 되돌리기 |
| `apps/game/src/editor/content/contentEditorPaths.ts`·`.test.ts`(새) | 칸 경로 읽기·넣기·끝 칸 차이 |
| `apps/game/src/editor/content/contentEditorShell.css`(새) | 공용 틀 CSS(@container ce-screen) |
| `apps/game/src/editor/content/contentEditorFields.tsx` | path·unit·desc, 범위 자동 글, 바로 검사 문구, 견주기 |
| `apps/game/src/editor/content/contentEditorEffects.tsx` | 효과 줄 칸 경로(`pathPrefix`)·제목 숨김 |
| `apps/game/src/editor/skills/SkillEditorScreen.tsx`·`SkillEntry.tsx`(새)·`SkillList.tsx`·`SkillForm.tsx`·`SkillParts.tsx`·`skillModel.ts`·`skillModel.test.ts`·`skillEditor.css` | 담은 변경 막대 흐름, 편집 판 머리, 목록, 구역·칸 경로·풀이, 거르기·검사 줄 나누기 |
| `apps/game/src/editor/buildings/BuildingEditorScreen.tsx`·`BuildingList.tsx`·`BuildingDetail.tsx`·`BuildingLevels.tsx`·`BuildingRepair.tsx`·`BuildingPanels.tsx`·`buildingModel.ts`·`buildingModel.test.ts`·`buildingEditor.css` | 목록·편집 판·구역·칸 경로·공용 막대, 런타임 칸 결함 |
| `apps/game/src/editor/items/ItemEditorScreen.tsx`·`ItemList.tsx`·`ItemDetail.tsx`·`ItemForm.tsx`·`ItemEquipFields.tsx`·`ItemWeaponFields.tsx`·`ItemUseFields.tsx`·`ItemStageBar.tsx`·`ItemEditorPanels.tsx`·`itemBulkActions.ts`(새)·`itemModel.ts`·`itemModel.test.ts`·`itemEditor.css`·`itemList.css` | 공용 틀로, 칸 경로, 찾기 넓힘, 막대 |
| `apps/game/messages/ko.json`·`en.json` | 새 문구 약 140개(공용 `dev_content_*`, 구역·칸 풀이, 거르기, 탭), 바꾼 문구 4개(스킬 이끄는 글·담기 취소·다시 얹기 안내) |
| `e2e/items.spec.ts`·`e2e/skills.spec.ts`·`e2e/buildings.spec.ts`·`e2e/dev-stagebar.spec.ts` | 새 표지·흐름, 견주기·키 시험, 사진 |
| `docs/adr/…item-editor.md`·`…skill-editor.md`·`…building-editor.md`, `docs/PLAN.md` | 바뀜 절, 14장 한 줄 |

## 함께 바꿔야 하는 파일
- 공용 문구(`dev_content_*`)를 바꾸면 세 e2e의 `message(...)` 비교를 본다.
- 편집기 칸을 더하면 `path`(팩 검사 경로와 같은 모양)를 주어야 견주기·칸 옆 서버 문구가 붙는다. 구역 세기는 `FormSection`의 `paths`.
- 개발 화면을 새로 만들면 `vite.config.ts` `globIgnores`·`scripts/pwa-build.mjs` `DEV_ONLY_CHUNK`·`DEV_ONLY_SOURCE`(이번 파일은 모두 기존 폴더·이름 안이라 고치지 않았다).

## 건드리지 말 것
- 서버 `items.*`·`skills.*`·`buildings.*`·덮어쓰기 층·내보내기 형식(이번 개편은 화면만, 결함 하나는 화면 모델).
- 설정 칸 패널(`editor/tuning/`) — 같은 모양을 공용 CSS로 따로 만들었다(조각을 섞지 않게).

## 미검증·TODO·알려진 문제
- 사진은 헤드리스 Chromium(390 휴대폰 터치 프리셋, 1440: 아이템·건물은 데스크톱 프리셋, 스킬은 옛 시험대로 390 프리셋 그대로 폭만 1440). 실제 휴대폰은 미확인(Unknown).
- 건물 편집기 1차 생산 티어 확률 탭(`GatherProbTab.tsx`) 안의 글이 화면 코드에 한국어·영어로 박혀 있다(메시지 키 규칙 위반, 다른 줄기가 넣음). 이 줄기는 탭 이름만 키로 옮겼다(TODO).
- `e2e/buildings.spec.ts` 첫 시험은 바탕(main b109825)에서도 시설 9개를 기대해 실패했을 것이다(팩 core@57 = 17개, Assumed — 바탕에서 돌리지 않음). 서버 목록 수와 견주게 고쳤다.
- 아이템 편집기 화면 파일 663줄(600줄 경고, 1,000줄 아래).
- 스킬 저장 거절 줄 나누기는 팩 검사 줄 글 모양(`formatIssue`)에 기댄다. 모양이 바뀌면 칸 옆 문구 대신 위 알림만 남는다.

## 검사
- (아래 "마지막 검사" 줄에 적는다)

## 사용자 결정 대기
- 화면 개편을 사용자가 본 뒤 세 ADR 상태 확정(통합 담당).
