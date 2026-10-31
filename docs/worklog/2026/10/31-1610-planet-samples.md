# 행성 표본: 태양계 암석 행성 다섯(편집기 시작점, 서버는 굽지 않음)

- 일시: 2026-10-31 16:10 (KST)
- 작업 도구: Claude Code
- 관련: ADR 38 `2026-10-29-planet-editor-stage1.md` "바뀜: 행성 표본"(새 절), ADR `2026-10-31-continent-layouts.md` 한 줄, PLAN 6.2 표 한 줄. 가지 `work/planet-samples`(main `37aeac0`에서). 앞 기록 `31-1500-continent-layouts.md`

## 한 일
사용자 요구(원문은 ADR 38): 태양계를 참고한 행성 표본. 살 수 있게 바꾸되 각 행성의 특징은 살린다. 사용자 결정으로 지금은 암석 행성 다섯(수성·금성·지구·화성·명왕성)만. 가스 행성은 질문 103 뒤.
- 자료: 콘텐츠 팩 새 분류 `planet_templates`(`content/core/planet_templates.json`, 팩 판 3 → 4). 형식은 팩 행성 항목 + `description`(ko·en) 필수(`planetTemplateEntrySchema`). 바이옴 참조 검사는 `planets`와 같은 함수가 두 분류를 본다. 다른 자리(팩 `planets`에 굽지 않음 표시, 앱 코드 상수, 보관함 DB 행)를 버린 이유는 ADR.
- 서버: 정의 조회에 `templates`(항목·F5 확인 해시·정의 해시). 굽기·타일·디스크 캐시는 `planets`만. 보관함 시작점 종류 `["pack", "template"]`, `create`는 종류에 맞는 분류에서 ID를 찾는다(없으면 `unknown_base`). jsonb라 마이그레이션 없음.
- 기기: [새 행성] 시작점 고르기에 묶음 둘(팩 행성 / 태양계 표본(굽지 않음)), 값은 `"종류:ID"`. 표본을 고르면 아래에 한 줄 특징(`aria-describedby`). 기준 행성(미리보기 두 번째 결과·열 때 확인)은 `startPlanetOf`로 시작점의 정의를 찾는다.
- 표본 다섯: 프리셋·세부 수치·시드·면 레벨·대륙 모양만으로 만들었다(생성기 코드 변경 없음). 면 레벨은 실제 반지름에 log₂로 가장 가까운 단계(F9 = 지구). 시드는 F6에서 1031101~1031108을 훑고(땅덩어리 수·바이옴 몫) F7 그림 두 후보씩 보고 골랐다. 설정·이유 표는 ADR 38.
- 화면 시험: [새 행성] → 화성 표본 → 특징 줄 → [저장] → 보관함에 `base: { kind: "template", id: "solar_mars" }`(create 입력과 서버 목록 `planetEditor.library.list` 둘 다) → 지움(다른 시험의 첫 행성을 그대로 두려고). 사진 시험에 시작점 창 사진 둘(화성 표본 고른 모습, 목록 모양).

## 검사·측정 (Verified, 이 작업 트리, Node 24.22.1)
- 표본별 결과(F7 그림, `samples.ts`): 수성 땅 83.9%·사막 72%·빙상 10%·−57~49°C / 금성 땅 22.3%·큰 땅덩어리 2·사바나 54%·열대우림 27%·−36~41°C(평균 30.3) / 지구 땅 29.1%·큰 땅덩어리 4·사바나 22·초원 18·사막 16·타이가 10%·−61~34°C(평균 12.1) / 화성 땅 61.6%·큰 땅덩어리 1·사막 26·빙상 24·초원 17%·−64~25°C / 명왕성 땅 64.1%·빙상 41·타이가 23·툰드라 19%·−71~15°C. 땅 무게중심 위도: 수성 −14, 금성 33, 지구 −20, 화성 10, 명왕성 −75(남극 쪽 빙상).
- 서버 표본 F5 확인 해시(e2e 서버 기록): 59.9~114.5ms씩, 합 약 0.37초. 정의 준비 전체 905.7ms(팩 행성 둘 포함). 팩 행성 F5 확인 해시 `884e2b28`·`95709b4b` 그대로(골든·서버 시험 통과). 팩 판이 올라도 행성 둘은 다시 굽지 않는다(캐시 키 = 생성기 판 + 정의 해시, e2e "준비 0.0초").
- 시험: 콘텐츠·보관함 API·서버 편집기(DB 포함)·생성기 시험 168개 통과(표본 검사, 표본 정의·해시, 굽는 목록에 없음, template 만들기·잘못된 종류 `unknown_base`, 표본마다 F4 생성). 전체 결과는 아래 "main을 합친 뒤".
- 화면 시험 `e2e/planet-editor.spec.ts`: 첫 실행 13개 중 3개 실패 → 고침. 원인: 새 행성을 저장하면 보관함 행성으로 옮겨 화면을 새로 만들어(설정 탭부터) [지우기]가 숨은 탭에 있었다. 화성 행성이 남아 뒤 시험 둘(대륙 모양·dev)이 다른 행성을 열었다. 고친 뒤 다시 돌려 앞 세 개 통과 확인(나머지는 문구를 줄이느라 멈추고 전체 실행에서 확인).
- main을 합친 뒤(`323f707`, 충돌 없음): `TEST_DATABASE_URL=… pnpm check` 통과(시험 파일 211개·시험 2,051개, DB 시험 포함), `pnpm check:content origin/main` 통과(core@4, 단계 1·2·4a·4b), `pnpm check:docs` 통과, `pnpm e2e` 전체 80개 통과(4.1분).
- 사진: 표본 그림(F7, 지구본 두 면 + 경위도 바이옴 지도 + 설명·범례, 영어) `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/planet-samples/shots/` — `solar_mercury.png`·`solar_venus.png`·`solar_earth.png`·`solar_mars.png`·`solar_pluto.png`, 한 장 `all-samples.png`. 편집기(전체 e2e 실행의 사진) `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/planet-samples/shots/editor/` — `planet-editor-390|1440-<테마>-<언어>-new-template.png`(화성 표본 고른 창), `…-new-list.png`(목록 모양: 사진에서만 고르기에 size를 주고 모서리를 폈다), 390은 `…-new.png`(처음 열린 창)도.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/planet_templates.json`(새)·`manifest.json` | 표본 다섯, 팩 판 4 |
| `packages/content/src/schema/planets.ts`·`categories.ts` | 행성 칸을 묶어 표본 형식(`description` 필수)과 같이 쓴다, 분류 `planet_templates` |
| `packages/content/src/validate/planets.ts`(+시험) | 바이옴 참조 검사가 `planets`·`planet_templates` 둘 다 본다 |
| `packages/shared/src/planetLibraryApi.ts`(+시험) | 시작점 종류 `template` |
| `apps/server/src/content.ts` | 팩 원본 항목에 `planet_templates.json` |
| `apps/server/src/planetEditor/types.ts`·`definitions.ts`(+시험) | 정의 조회 `templates`(F5 확인 해시·정의 해시, 굽지 않음), 시간 기록 |
| `apps/server/src/planetEditor/validate.ts`·`services.ts`·`trpc/planetEditor.ts`(+`planetLibrary.db.test.ts`) | 종류별 시작점 ID 확인, 입력 스키마가 공용 종류 목록을 쓴다 |
| `apps/game/src/editor/planet/PlanetEditorScreen.tsx`·`PromptDialog.tsx`·`workspaceParts.tsx`·`EditorWorkspace.tsx`·`LibraryPanel.tsx` | 시작점 묶음·특징 줄·`startPlanetOf`, 가져오기 확인의 팩 ID에 표본 ID, 주석 |
| `apps/game/messages/ko.json`·`en.json` | 묶음 이름 키 2개 |
| `packages/planet/src/generator/generate.test.ts` | 팩 표본마다 면 레벨 범위·F4 생성 |
| `e2e/planet-editor.spec.ts` | 화성 표본 시험, 시작점 고르기 값 `pack:…`, 시작점 창 사진 |
| `docs/adr/2026-10-29-planet-editor-stage1.md`·`2026-10-31-continent-layouts.md`·`docs/PLAN.md` | 행성 표본 절(자료 자리·서버·보관함·기기·설정 표·출처·남은 특징), 반구 방향 한 줄, PLAN 표 |
| `AGENTS.md` | 명령 표 `PLANET_CACHE_DIR` 줄: 표본은 굽지 않고 확인 해시만(약 0.4초) |

## 함께 바꿔야 하는 파일
- 표본을 더하거나 고치면 `content/core/manifest.json` 판을 올린다. 표본 ID를 지우거나 바꾸면 `id-changes.json`에 뒤로만 더한다(보관함 행성의 `base.id`가 가리킨다).
- 시작점 종류를 더하면 `PLANET_LIBRARY_BASE_KINDS`, 서버 `services.ts` create 확인, 기기 `startPlanetOf`·`startOptions`를 같이.

## 건드리지 말 것
- 서버 굽기 목록에 표본을 넣지 않는다(NAS 부하, 사용자 결정 "저장해도 서버 굽기 없음").
- 팩 행성 둘의 정의(F5·정의 해시가 캐시 키). 생성기 출력(`GENERATOR_VERSION` 3 그대로).

## 미검증·TODO·알려진 문제
- 출처: NASA 행성 자료표(nssdc.gsfc.nasa.gov, 프록시 403)·JPL(ssd.jpl.nasa.gov, 이름 풀이 실패)을 열지 못해 반지름과 행성 특징은 Assumed다. 세션 네트워크 설정에서 두 곳을 열면 다시 확인한다.
- 그림은 F7이다. 표본의 면 레벨(F8·F9)로 기기 미리보기 F8·F9를 돌리면 모양은 같고 세밀함만 다를 것이다(Assumed, F9는 재지 않음).
- 직전 판 앱이 새 서버에서 template 행성을 열면 기준 행성을 찾지 못한다(Assumed: 배포 사이 잠깐, 개발자 도구).
- 생성기에 새로 넣어야 살릴 특징(ADR 38 끝 줄): 운석 구덩이, 큰 협곡(마리너스), 중력에 따른 산 높이(올림푸스 산), 자전축 기울기·계절, 매끈한 얼음 평원(스푸트니크), 한쪽 반구 대륙의 방향(화성 남반구), 금성 대기·느린 자전, 수성 3:2 공명, 두 배 단계보다 고운 반지름(수성·화성이 둘 다 F8).
- 휴대폰에서 보지 않았다(Unknown).

## 사용자 결정 대기
- 표본 다섯의 모양·바이옴이 원하는 "특징"에 맞는지(그림 `all-samples.png`).
- 위 새 생성기 특징 중 무엇부터 할지.
