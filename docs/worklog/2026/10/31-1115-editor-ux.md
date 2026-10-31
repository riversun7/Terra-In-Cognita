# 행성 편집기 사용성 고침: 적용 단추, 칸 쉬운 설명, 지구본 옆 평면 미니맵

- 일시: 2026-10-31 11:15 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-planet-editor-stage1.md`(38) 3절 바뀜 표시, "구현하며 정한 것 (WP-D)"의 적용 단추·평면 미니맵 자리·칸 쉬운 설명. 앞 작업 기록 `2026/10/31-1005-editor-screen.md`. 가지 `work/editor-ux`(main `fee66f0`에서)

## 한 일
사용자가 PC에서 편집기를 보고 준 의견 셋(2026-10-31, 원문은 ADR 38 WP-D 절)을 고쳤다.
- 적용 단추: 슬라이더·프리셋 단계·시드·[되돌리기]는 "적용 전 변경"만 바꾼다. 미리보기(빠른 F5·본 F7)와 자동 저장은 [적용]을 누를 때 한다. 설정 판 아래에 붙은 줄이 "바뀐 값 N개 · 아직 적용 안 함"과 [취소]·[적용]을 보이고, 설정 탭에 N 배지를 단다. 시드 칸의 [적용] 단추는 없앴다(맞는 수를 넣으면 적용 전 변경). 적용 전 변경이 있으면 [뒤로]·창 닫기에서 묻는다.
- 칸 쉬운 설명: 칸 탭 맨 위에 문장 두세 개(고른 바이옴, 정한 조건 값과 범위, 아깝게 놓친 바이옴 하나와 바꿀 양). 값 표·판정 표·출처는 [자세히 보기](처음 접힘) 아래로.
- 평면 미니맵: 폭 37.5em 이상 그리고 높이 40em 이상이면 지구본 아래에 늘 보인다(어느 탭이든). 휴대폰 세로·낮은 가로 화면은 지구본 자리 위 [지구본·평면] 단추로 바꾼다(띠를 쓰지 않은 이유는 ADR).

## 검사·측정 (Verified, 이 가지에서 실행)
- 단위 시험: 새 `cellStory.test.ts`(6개), `editorModel.test.ts`에 적용 전 변경 수(2개). 편집기 폴더 시험 파일 23개·시험 226개 통과.
- 화면 시험 `e2e/planet-editor.spec.ts` 11개 통과(1.2분). admin 흐름에 더한 것: 슬라이더 → 바뀐 값 1개·설정 탭 배지, Enter로는 적용 안 됨, 2.5초 기다려도 새 미리보기·자동 저장 없음(판 0) → [적용] → 새 F7·판 1. 칸 탭: 쉬운 설명 먼저, [자세히 보기] 접힘 → 펼침, 판정 "저장 바이옴과 같음". 휴대폰 [평면] ↔ [지구본]. 데스크톱: 설정 탭에서도 지구본 아래 미니맵, 보기 단추·면적 탭 미니맵 없음.
- 사진: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/editor-ux/shots/` — 390px(설정·적용 대기·평면·면적) × 1440px(설정·면적·칸) × 파스텔·다크 × 한국어·영어.
- 고친 것(사진 보고): 휴대폰 보기 단추가 "지구\n본"으로 줄바꿈 → nowrap. 데스크톱 미니맵이 `.flat-map` 최대 폭(--content-max)에 걸려 작음 → 그 자리에서 풀었다. 보기 단추가 넓은 화면에서도 보임 → `.pe-segment`(뒤에 정의)보다 선택자를 높였다.
- 시험 DB(`127.0.0.1:55432`)가 꺼져 있어(컨테이너 다시 시작, 남은 pid 파일) `pg_ctl`로 같은 자료 폴더·포트(-p 55432 -k /tmp)로 다시 켰다.

## 결과
- `TEST_DATABASE_URL=… pnpm check` 통과: 시험 파일 200개·시험 1,913개.
- 전체 화면 시험 `pnpm e2e` 60개 통과(2.5분, 마지막 소스로 다시 빌드한 뒤).
- `pnpm check:bundle`: 첫 화면 JS 127,065B / 상한 131,416B(앞 가지 127,068B, 첫 화면 모듈 변화 없음).
- 미리 캐시 61개 그대로, 미리 캐시된 JS 소스 맵에 편집기·생성기 모듈 없음. 편집기 조각 `PlanetEditorScreen-*.js` 98,411 → 104,963B(쉬운 설명·적용 줄·미니맵 자리).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/editor/planet/EditorWorkspace.tsx` | 적용 전 변경 상태·[적용]·[취소], 떠날 때 묻기, 지구본 자리 미니맵·보기 단추, 설정 탭 배지 |
| `apps/game/src/editor/planet/SettingsPanel.tsx` | 바꿔도 미리보기 안 함, 적용 줄, 시드 칸 단추 정리 |
| `apps/game/src/editor/planet/editorModel.ts`·`editorModel.test.ts` | `pendingChangeCount` |
| `apps/game/src/editor/planet/cellStory.ts`(새)·`cellStory.test.ts`(새) | 쉬운 설명 재료(정한 조건, 앞 규칙 중 아깝게 놓친 바이옴, 바꿀 방향·양) |
| `apps/game/src/editor/planet/CellPanel.tsx` | 문장 + [자세히 보기] |
| `apps/game/src/editor/planet/AreaPanel.tsx` | 면적 탭 미니맵에 자리 이름(넓은 화면에서 숨김) |
| `apps/game/src/editor/planet/planetEditor.css` | 지구본 자리·미니맵 배치, 적용 줄(sticky), 탭 배지, 쉬운 설명·자세히 보기 |
| `apps/game/src/editor/planet/editorView.ts`·`previewJobs.ts` | 주석(끄는 동안 F5 → [적용] 때) |
| `apps/game/messages/ko.json`·`en.json` | 새 키 22개(적용·보기·쉬운 설명), `planet_editor_details_hint` 문구·변수 바꿈, `planet_editor_seed_apply` 지움 |
| `e2e/planet-editor.spec.ts` | 적용 흐름·쉬운 설명·미니맵 자리·사진 |
| `docs/adr/2026-10-29-planet-editor-stage1.md` | 3절 바뀜 표시, WP-D 절 |

## 함께 바꿔야 하는 파일
- 바이옴 규칙 축이 늘면 `cellStory.ts`의 단위 표(STEP)와 `CellPanel.tsx`의 문장 표(NEAR_TEXT)·값 단위를 같이 고친다.
- 세부 수치·프리셋 축이 늘면 `pendingChangeCount`는 공유 표를 따라간다(고칠 것 없음).

## 건드리지 말 것
- 미리보기 관리자·작업 줄(WP-C)은 바꾸지 않았다. [적용]이 예전 "놓음 + 프리셋"과 같은 두 줄 청을 한 번 한다.

## 미검증·TODO·알려진 문제
- 휴대폰 실기기에서 적용 줄(sticky)·보기 단추를 손으로 보지 않았다(헤드리스 390px만).
- 휴대폰 영어에서 머리 줄이 세 줄이 될 때가 있다(저장 상태 칩이 길 때, "Same as published (no server draft)"). 지구본 자리가 그만큼 준다. 그대로 두었다.
- 영어 쉬운 설명은 바이옴 이름을 대문자 그대로 넣는다("This is Deep ocean.").

## 사용자 결정 대기
- 없음.
