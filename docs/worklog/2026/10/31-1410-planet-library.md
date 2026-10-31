# 행성 보관함: 팀 공용 목록, [저장]만 서버에, 작업 사본은 기기에

- 일시: 2026-10-31 14:10 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-planet-editor-stage1.md`(38) 9절 바뀜 표시, "바뀜: 행성 보관함". 가지 `work/planet-library`(main `7439155`에서)

## 한 일
사용자 요청(2026-10-31, 원문은 ADR): 변화마다 판을 저장하지 말고 다 만든 행성을 저장, 행성을 "지구형행성1,2,3"처럼 여러 개. 고른 선택지: 팀 공용 목록.
- 서버: 표 `planet_library`·`planet_library_versions`(마이그레이션 `20261031044007_planet_library`, 더하기만), tRPC `planetEditor.library.list·get·versions·version·create·save·rename·remove`, 정의 검사는 초안과 같은 길(`validate.ts checkLibraryDefinition`), 이름 규칙·시작점 종류는 `@terra/shared planetLibraryApi.ts`. 지우기는 표시만(만든 사람·admin). 감사 기록: 만들기·저장·이름·지우기.
- 기기: 작업 사본(`workingCopy.ts`, localStorage), 보관함 문서(`useLibraryDocument.ts`: [저장]·충돌·[다른 이름으로 저장]·이름·지우기·판 불러오기), 머리 줄 행성 고르기·저장 상태·[저장], "행성" 탭(`LibraryPanel.tsx`, 내보내기·가져오기는 `TransferSection.tsx`로 떼어 냄), 이름 창(`PromptDialog.tsx`), 확인 창 세 번째 선택(충돌의 [다른 이름으로 저장]). 빈 보관함이면 [새 행성]부터.
- 지운 것: 기기의 서버 초안 동기화(`draftSync.ts`·`draftClient.ts`·`DraftPanel.tsx`와 시험). 서버 `planetEditor.drafts.*`와 `planet_drafts` 표는 직전 판 앱을 위해 남겼다.
- 다른 큰 요청(태양계 표본·항성계·은하 지도 등)은 하지 않았다. 표본은 시작점 목록에 자료로 더할 자리만 두었다(ADR).

## 정한 것 (ADR 38 "바뀜: 행성 보관함"에 적음)
- 지우기는 표시만(soft): ID를 가리킬 나중 항성계를 위해. 되살리는 화면은 없다.
- 옛 초안은 보관함으로 옮기지 않았다(NAS 시험 자료, 필요하면 JSON 내보내기·가져오기).
- 저장 판은 모두 남긴다(손으로 하는 저장이라 드물다). 판은 행성마다 1부터.
- 정의의 `id`는 시작한 팩 행성 ID를 그대로 둔다(형식만 검사, 반영 때 새 ID). 내보낸 JSON에 `library`(ID·이름·판)를 더했다.
- [다른 이름으로 저장]하면 원래 행성의 작업 사본을 지운다. 행성을 바꿀 때는 묻지 않는다(행성마다 사본이 남는다).
- 미리보기의 두 번째 결과는 "기준 행성"(시작한 팩 행성)으로 이름을 바꿨다(전 "공개본").

## 검사·측정 (Verified, 이 가지에서 실행)
- 단위 시험 새로: `planetLibraryApi.test.ts`(이름·시작점), `workingCopy.test.ts`(5), 라우터 시험에 보관함 프로시저 8개(권한 두 겹·속도 제한·입력 검사 차례), `draftExport.test.ts` `library` 칸.
- DB 시험 `planetLibrary.db.test.ts`(5): 만들기·팀 공용 목록·[저장]마다 판·충돌·판 목록과 판 하나·이름 규칙·정의 코드·시작점·이름 바꾸기·지우기(만든 사람·admin, 표시만, 판 남음)·감사 기록·player 거절.
- 화면 시험 `e2e/planet-editor.spec.ts` 11개 통과(1.8분): admin 흐름(빈 보관함 → [새 행성] → [저장] 판 1 → 슬라이더 [적용]은 서버에 쓰지 않음 → 새로고침해도 작업 사본 → 판 2 → 판 1 불러오기 → 판 3 → [다른 이름으로 저장] → 이름 바꾸기 → 다른 탭이 먼저 저장 → 충돌 [덮어쓰기] → 지우기 → 내보내기·가져오기 → 칸 설명 → [뒤로]), dev(admin 행성을 만든 사람과 함께 보고, 지우기 없음, 프리셋·시드 바로 적용, 저장하면 저장한 사람 e2e_dev), player 권한 없음, 사진.
- 사진: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/planet-library/shots/` — `planet-editor-*`(390px 설정·적용 대기·평면·면적·행성 탭·새 행성 창, 1440px 설정·적용 대기·면적·칸 × 파스텔·다크 × ko·en).

## 결과
- `TEST_DATABASE_URL=… pnpm check` 통과: 시험 파일 201개·시험 1,929개(DB 시험 포함).
- 전체 화면 시험 `pnpm e2e` 60개 통과(2.9분, 마지막 소스로 다시 빌드한 뒤).
- `pnpm check:bundle`: 첫 화면 JS 127,357B / 상한 131,416B(앞 가지 127,075B, +282B). 첫 화면 소스 모듈은 243개 그대로이고, 편집기 조각과 같이 쓰게 된 작은 모듈 둘(`net/json.ts`, `packages/shared/src/settings.ts`)이 공용 조각 `json-*`·`settings-*`로 나뉜 이음새다(소스 맵).
- 미리 캐시 61 → 62개(위 공용 조각), 미리 캐시된 JS 소스 맵에 편집기·생성기 모듈 없음. 편집기 조각 `PlanetEditorScreen-*.js` 105,169 → 113,008B.
- 시험 DB(55432)가 다시 꺼져 있지 않았다(앞 작업에서 켠 그대로).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/planetLibraryApi.ts`(새)·`.test.ts`·`index.ts` | 이름 규칙·시작점 종류·이유 코드(서버·기기 같이) |
| `apps/server/src/db/schema.ts`, `drizzle/20261031044007_planet_library/` | 보관함 표 두 개 |
| `apps/server/src/planetEditor/library.ts`(새) | 보관함 DB 작업 |
| `apps/server/src/planetEditor/validate.ts` | 초안·보관함 정의 검사 공통 바탕, `checkLibraryDefinition` |
| `apps/server/src/planetEditor/services.ts`·`types.ts`, `src/trpc/context.ts`·`planetEditor.ts`·`planetEditorRouter.test.ts` | 보관함 서비스·프로시저·시험 |
| `apps/server/src/planetEditor/planetLibrary.db.test.ts`(새) | DB 시험 |
| `apps/game/src/editor/planet/libraryClient.ts`·`workingCopy.ts`(+시험)·`useLibraryDocument.ts`(새) | 보관함 호출·작업 사본·편집 상태 |
| `apps/game/src/editor/planet/PlanetEditorScreen.tsx`·`EditorWorkspace.tsx`·`workspaceParts.tsx`(새) | 목록·고르기·[새 행성]·머리 줄 [저장]·충돌 |
| `apps/game/src/editor/planet/LibraryPanel.tsx`·`TransferSection.tsx`·`PromptDialog.tsx`(새), `ConfirmDialog.tsx` | 행성 탭·이름 창·세 번째 선택 |
| `apps/game/src/editor/planet/useEditorSession.ts`·`editorMessages.ts`·`draftExport.ts`(+시험)·`planetEditor.css` | 초안 동기화 빼기, 문구, 내보내기 `library` |
| `apps/game/src/editor/planet/draftSync.ts`·`draftClient.ts`·`DraftPanel.tsx`(+시험) 지움 | 보관함이 대신한다 |
| `apps/game/messages/ko.json`·`en.json` | 보관함 문구 더함, 초안 동기화 문구 지움, 역할 이름(편집 중·기준 행성) |
| `e2e/planet-editor.spec.ts` | 보관함 흐름 |
| `docs/adr/2026-10-29-planet-editor-stage1.md` | 9절 바뀜, "바뀜: 행성 보관함" |

## 함께 바꿔야 하는 파일
- 시작점 종류를 더하면(표본 "template"): `planetLibraryApi.ts` `PLANET_LIBRARY_BASE_KINDS`, 서버 `services.ts` create 검사·`trpc/planetEditor.ts` `libraryBase`, 기기 `PlanetEditorScreen.tsx startOptions`·미리보기 기준(지금은 팩 행성 정의로 연다).
- 다음 정리 배포: 화면이 쓰지 않는 `planetEditor.drafts.*`·`planet_drafts`·`planet_draft_revisions`를 지운다(직전 판 앱이 더는 없을 때).

## 건드리지 말 것
- `packages/shared/src/planetDefinition.ts`·생성기·설정 판 세부 수치 줄(다른 줄기 `work/continent-shapes`가 고친다). 보관함은 새 수치를 그대로 따라간다.

## 미검증·TODO·알려진 문제
- 휴대폰 실기기에서 보지 않았다(헤드리스 390px). 휴대폰 머리 줄이 세 줄(뒤로·제목 / 행성 고르기 / 저장 상태·[저장])이라 지구본 자리가 그만큼 준다.
- 저장하지 않은 새 행성의 이름을 [이름 바꾸기]로 바꾸면 머리 줄 고르기의 그 줄 글은 다시 열 때 바뀐다.
- 같은 기기 두 탭이 같은 행성을 고치면 작업 사본(localStorage)을 같이 쓴다(마지막에 고친 탭의 값이 남는다). 서버 충돌 확인은 그대로 돈다.
- `useLibraryDocument`는 단위 시험이 없다(화면 시험이 덮는다).

## 사용자 결정 대기
- 없음(지우기 방식은 표시만으로 정했다. 되살리기 화면이 필요하면 알려 달라).
