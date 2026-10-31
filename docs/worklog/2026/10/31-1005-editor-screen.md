# 행성 편집기 1단계 화면(WP-D)과 생성기 도우미(WP-A)

- 일시: 2026-10-31 10:05 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-planet-editor-stage1.md`(38) 2~13·15절, "구현하며 정한 것 (WP-A)·(WP-D)", ADR `2026-10-29-generator-variety.md`(출력 판 3), ADR `2026-10-29-app-shell.md`(37, 주소 → 화면 표). 가지 `work/editor-screen`(main `e4f8cd9`에서)

## 한 일
- WP-A: `@terra/planet/generator`에 `explainBiome`(바이옴 판정 설명: 조건마다 값·범위·통과·경계까지 거리·근접 실패, 처음 맞은 규칙, 마지막 육지 바이옴으로 떨어짐, 저장 바이옴과 같은지), `summarizePlanet`(칸 면적 가중 바이옴 몫·육지/호수/강/바다 등급 몫·평균 기온·고도 범위), `faceAreaTable(면 레벨)`을 더했다. 생성기 출력은 그대로다.
- 편집기 워커가 결과마다 요약을 붙인다. 메모리 추정표를 출력 판 3으로 다시 쟀다.
- WP-D: `/dev/planet-editor` 화면. 프리셋 6축 × 3단계(단계마다 정하는 값 표시)·세부 수치 13개 슬라이더·시드, 기기 워커 미리보기(빠른 F5·본 F7, F6·F8·F9 고르기, F9 확인 창, 꺼짐 감지 상한·[다시 허용]·[멈춤]), 결과마다 엔진을 다시 만드는 지구본, 칸 정보창(값 + 바이옴 판정 설명), 바이옴 면적표(공개본 대비 차이 열·아래 줄), 평면 미니맵, [초안·공개본] 보기, 서버 초안 자동 저장·충돌·판 기록·되돌리기·JSON 내보내기·가져오기·지우기, 열 때 기기 ↔ 서버 확인(판 다름·해시 다름이면 알리고 내보내기를 막음). 휴대폰 세로는 지구본 + 아래 판(탭 넷), 37.5em 이상은 옆 판.
- 주소 표의 `dev_planet_editor`를 이 화면에 잇고 준비 중 화면 줄을 지웠다. 개발자 홈의 "준비 중" 칩을 뗐다.
- 화면 시험 `e2e/planet-editor.spec.ts`(11개)와 `e2e/dev.spec.ts` 고침. 마무리 검토(web-design-guidelines, break-ui 가벼운 점검)로 고친 것: 진행 칩의 잦은 읽기(role=status) 뺌, 입력칸 name·translate=no, 칸 탭 제목 단계(h3 → h2), 지구본 위 칩을 작게(휴대폰에서 지구본을 덜 가림).

## 잰 값과 검사 (Verified 별도 표기 없으면 이 가지에서 실행)
- 메모리 추정(Node 24.22.1, 부하 0.7~1.3, `previewWork.ts runPreviewJob` + `summarizePlanet`, 레벨마다 새 프로세스, 단계 끝 `arrayBuffers` 최대): F4 0.67, F5 1.48, F6 7.05~7.25, F7 26.61~28.12, F8 64.04~65.97, F9 179.14~180.49MiB. 생성 시간 F7 0.82~0.85초, F9 9.3~9.4초. 넘긴 바이트는 판 2와 같다(F7 1,512,060B, F9 24,120,636B). 스크립트는 저장소 밖 임시(`memprobe.mjs`: 팩 `s2_test_planet` 정의로 `runPreviewJob`을 부르고 `onStage`마다 `process.memoryUsage().arrayBuffers − 시작 값`의 최댓값).
- `TEST_DATABASE_URL=… pnpm check` 통과: 시험 파일 199개·시험 1,905개, 다국어 709개 키, 디자인 값(화면 CSS 21개).
- `pnpm build && pnpm check:bundle`: 첫 화면 JS 127,068B / 상한 131,416B(main 126,808B, +260B). 첫 화면 소스 모듈 243개 그대로(소스 맵 비교). 늘어난 것은 주소 표의 지연 로딩 한 줄과 공용 조각 `utf8` 나눔이다.
- 미리 캐시(`dist/sw.js`): 57 → 61개, 바이트 합 1,696,083 → 1,699,071B. 새 항목은 공용 조각 `planet`(엔진·타일 코드, 전에는 1차맵 화면 조각 안)·`cameraMath`·`apiErrors`·`utf8`이다. 미리 캐시된 JS의 소스 맵에 `editor/planet`·`planet/src/generator` 모듈이 없다(개발자 홈 `DevHome`만, WP-H에서 정한 대로). 편집기 조각 `PlanetEditorScreen-*.js` 98.4kB(gzip 9단계 31,005B)·`.css`, 워커 `planetEditorWorker-*.js`는 미리 캐시 밖.
- 화면 시험 `e2e/planet-editor.spec.ts` 11개 통과(1.1분): admin 흐름(F5 확인 같음 → F7 지구본, 슬라이더 2번 → 새 F7·자동 저장 판 2개, 면적표, 판 되돌리기 → 새 판·그 값·기억한 결과, 내보내기 → 값 바꿈 → 가져오기 → 같은 항목, 미니맵 → 칸 정보 판정 "저장 바이옴과 같음", [뒤로]), dev 흐름, player 권한 없음(편집기 조각을 받지 않음), 사진 8장(390px 세로·1440px × 파스텔·다크 × 한국어·영어, 판 넘침·누르는 곳 44px 검사 포함). 데운 워커 F7 0.8~1.1초(지구본 칩).
- 전체 화면 시험 `TEST_DATABASE_URL=… pnpm e2e`: 60개 통과(2.5분, 마지막 소스로 다시 빌드한 뒤).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/planet/src/generator/explain.ts`(새) | `explainBiome`, 근접 실패 눈금 표 |
| `packages/planet/src/generator/summary.ts`(새) | `summarizePlanet` |
| `packages/planet/src/generator/grid.ts` | `faceAreaTable(면 레벨)` 내보내기(내부 표 함수 이름만 바꿈, 값 그대로) |
| `packages/planet/src/generator/surface.ts` | `inRange` 내보내기(판정 설명이 같은 함수를 쓰게) |
| `packages/planet/src/generator/index.ts` | 도우미 내보내기 |
| `packages/planet/src/generator/explain.test.ts`(새) | 모든 칸 다시 판정 = 저장 바이옴(F5·F6), 근접 실패·떨어짐, 요약 몫·면적 가중, 면적 표 |
| `apps/game/src/editor/planet/planetEditorWorker.ts`, `previewProtocol.ts`, `previewWork.test.ts` | 워커 요약(`PreviewSummary` = `PlanetSummary`) |
| `apps/game/src/editor/planet/memoryEstimate.ts`, `previewJobs.ts` | 출력 판 3 다시 잰 값 |
| `apps/game/src/editor/planet/PlanetEditorScreen.tsx`(새) | 진입 화면: 정의 조회·행성 고르기·실패/다시 시도 |
| `apps/game/src/editor/planet/EditorWorkspace.tsx`(새) | 편집 화면: 세션 잇기, 지구본 + 탭 판, 확인·내보내기 막기, 떠나기 확인 |
| `apps/game/src/editor/planet/useEditorSession.ts`(새) | 꺼짐 감지·초안 동기화·미리보기 관리자 수명, `useStore` |
| `apps/game/src/editor/planet/EditorGlobe.tsx`(새) | 결과마다 엔진 다시 만들기(보기 넘김), 누르기 → 위도·경도 |
| `apps/game/src/editor/planet/SettingsPanel.tsx`·`AreaPanel.tsx`·`CellPanel.tsx`·`DraftPanel.tsx`·`ConfirmDialog.tsx`(새) | 판 넷과 확인 창 |
| `apps/game/src/editor/planet/editorView.ts`(새)·`editorView.test.ts` | 보일 결과·면적 차이·열 때 확인·내보내기 막기·시드 글(순수) |
| `apps/game/src/editor/planet/draftClient.ts`(새)·`draftClient.test.ts` | tRPC `planetEditor.drafts.*` → `DraftClient`(오류 코드 → 충돌·받지 않음·다시 시도하지 않는 실패) |
| `apps/game/src/editor/planet/editorMessages.ts`(새) | 키로 고르는 이름표·수 모양(13절) |
| `apps/game/src/editor/planet/planetEditor.css`(새) | 화면 배치(토큰만, 촘촘 변형) |
| `apps/game/messages/ko.json`·`en.json` | `planet_editor_*` 231개 |
| `apps/game/src/shell/routeViews.tsx` | `dev_planet_editor` → 편집기 조각 |
| `apps/game/src/sections/ComingSoon.tsx` | 행성 편집기 줄·틀 숨김 처리 지움 |
| `apps/game/src/editor/DevHome.tsx` | 편집기 `ready: true` |
| `e2e/planet-editor.spec.ts`(새), `e2e/dev.spec.ts` | 편집기 화면 시험, 준비 중 기대 고침 |
| `docs/adr/2026-10-29-planet-editor-stage1.md` | "구현하며 정한 것 (WP-A)·(WP-D)" |

## 함께 바꿔야 하는 파일
- 생성기 중간 배열이 바뀌면 `memoryEstimate.ts` 표를 다시 잰다(F9 확인 창 문구가 이 값을 쓴다).
- 바이옴 판정 규칙(`surface.ts` `landBiome`·`compileBiomes`·`inRange`)을 바꾸면 `explain.ts`도 같은 차례로 고친다(시험이 잡는다).
- 문구 키를 더하면 ko·en 함께. 키로 고르는 것은 `editorMessages.ts` 표에.
- 편집기 조각 진입 파일 이름 앞머리(`PlanetEditor…`·`planetEditor…`)를 바꾸지 않는다(미리 캐시 규칙 `DEV_ONLY_CHUNK`).

## 건드리지 말 것
- 생성기 출력(골든 해시)과 엔진 코드는 바꾸지 않았다. 편집기 때문에 바꾸지 않는다(ADR 38 12절·5절).
- `PlanetEditorScreen.tsx` 파일 이름(조각 이름 → 미리 캐시 제외).

## 미검증·TODO·알려진 문제
- 휴대폰 실기기(시간·메모리·F8/F9 꺼짐, 원격 개발자 도구)는 재지 않았다(Unknown, ADR 38 4절 "사용자 휴대폰에서 한 번 손으로 잰다").
- F8·F9 화면 흐름(확인 창·[멈춤]·꺼짐 표시·[다시 허용])은 화면 시험에 넣지 않았다(느림). 순수 부분은 WP-C 단위 시험, 화면 연결은 미실행.
- 충돌 화면([그쪽 불러오기]·[이걸로 덮기])·받지 않음·로그인 만료 문구는 단위 시험(동기화·어댑터)만 있고 화면 시험은 없다.
- 판 기록 목록은 되돌린 뒤 저절로 다시 받지 않는다([판 기록 보기]를 다시 누른다).
- Safari·Firefox에서 기기 해시가 서버와 같은지는 모른다(Unknown).
- `impeccable`·`review-animations`는 돌리지 않았다(빠르게 진행, 움직임 없음).

## 사용자 결정 대기
- 탭·보기·행성 고르기를 주소에 남길지(지금은 화면 상태만).
