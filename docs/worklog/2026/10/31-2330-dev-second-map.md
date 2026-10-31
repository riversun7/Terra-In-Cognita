# 개발자 2차맵 시험 화면(/dev/second-map)과 검은 2차맵 안내

- 일시: 2026-10-31 23:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-31-second-map-from-planet.md`(46) "구현하며 정한 것 (개발자 2차맵 시험)", ADR 38(개발자 영역), ADR 26(안개). 가지 `work/dev-second-map`(main `7b83dc1`에서)

## 한 일
- 왜: 사용자가 NAS에서 2차맵을 열었더니 검은 화면이었다(HUD "유닛 0 · 지역 13:00 · 해 75° · 달 38%"). 유닛도 탐사한 곳도 없는 계정이라 S3 시야 안개가 덮었다. 사용자는 시각·맵 정보를 바꿔 보는 개발 페이지를 바랐다. 12:1 축소라 고저가 안 느껴지는지도 보고 싶어 했다.
- 개발자 영역에 `/dev/second-map`(2차맵 시험)을 더했다. 틀을 숨긴 전체 화면이고 보기 전용이다.
  - 자리: 행성(팩 행성 둘 + 행성 표본 다섯), 빨리 가기(시험 2차맵·강·바닷가·호수·산·숲·초지), 면·i·j, 2차맵 키.
  - 시각: 낮밤 켜기·끄기, 지역 시각 0~24시(그 시각에 멈춤).
  - 고저: 높이 과장 ×1~×12(보기만, 기본 ×1).
  - 보기: 이웃 3×3, 격자, 나무·바위 모델 거리(화면 100~2,500m)·상한(0~20,000).
  - 칸 정보: 누른 곳(높이·경사·지표·물 깊이·엄폐·소품), 그 2차맵의 행성 칸(바이옴·고도·물·기온·강수·습도·숲).
  - 안개는 끄고, 유닛·건물은 없다.
- 자료는 두 길이다.
  - 월드 행성: 새 조회 `planetEditor.secondMap`이 지형 주소와 칸 값을 준다. 지형은 기존 지형 경로로 받는다.
  - 그 밖의 행성: WP-4 편집기 2차맵 미리보기 워커가 행성부터 만든다. 워커 부탁에 시험 자리·8이웃·칸 값을 더했다.
- 서버
  - `src/world/secondMapLab.ts`가 2차맵을 고른다. 칸 값은 행성 값 파일에서 그 칸만 읽고, 시험 자리는 처음 한 번 찾아 기억한다.
  - tRPC `planetEditor.secondMap`을 더했다. 권한·속도 제한은 편집기 읽기와 같다.
- 공용(`@terra/planet/secondMap`): `findMapPreset`(시험 자리 여섯), `planetCellValues`, `planetCellValuesFromFile`.
  - 행성 값 파일 머리 읽기를 나눴다(`readHeader`). 칸 하나 읽기 `readPlanetValuesCell`을 더했다.
- 엔진
  - `setViewOptions`: 격자 선, 소품 모델 거리·상한. 상한을 올리면 InstancedMesh를 다시 만든다.
  - `initialZoom` 선택: 이 화면은 화면 짧은 변 약 360m에서 시작한다(기본 약 70m라 고저가 안 보였다).
  - 요약에 `propSpanM`·`propCap`·`grid`를 더했다.
- 지도 화면(`/map`): 탐사한 시야 칸이 0이면 검은 화면 대신 까닭을 알린다. dev·admin에게는 [시험 일꾼 받기]·[전체 보기]와 [2차맵 시험 열기] 단추를 보인다.
  - 피드 요약에 `explored`(탐사 칸 수)를 더했다.
  - 알림은 오른쪽 가운데 1·2차맵 전환 단추를 피해 왼쪽에 붙인다.
- 감사 기록은 새로 쓰지 않는다(ADR 46 메모). 새 조회·지형 경로 읽기는 보기 전용이고 지형은 숨김 정보가 아니다. 행성 목록을 받는 편집기 정의 조회는 전처럼 기록을 남긴다(시드가 든 자료).
- 미리 캐시: 화면 조각 `SecondMapLabScreen-*`을 뺀다(`DEV_ONLY_CHUNK`·`DEV_ONLY_SOURCE`·Workbox `globIgnores`).
  - 처음 빌드에서 `check-pwa`가 실패했다. 편집기 모듈을 같이 써서 생긴 `libraryClient-*`·`workspaceParts-*` 조각이 미리 캐시됐다.
  - 이 화면이 편집기 모듈·생성기를 가져오지 않게 고쳤다(워커가 원본 항목에서 생성기 입력을 만든다, 확인은 지도 위 카드). 워커 손잡이는 `src/map/secondMapBuildClient.ts`로 옮겼다. 그 뒤 `check-pwa`가 통과했다.

## 잰 값
- 화면 시험(헤드리스 Chromium, 개발 컨테이너)(**Verified**: 이 환경)
  - 서버 길: 시험 2차맵이 열린다. 시각 6시로 바꾸면 빛 표지 지역 시각이 6이 된다. 낮밤을 끄면 지역 시각이 사라진다.
  - 서버 길: ×4, 격자, 이웃 8장, 모델 상한 0을 바꾸면 엔진 요약이 따른다.
  - 서버 길: 누르면 칸 정보 7줄과 행성 칸 값이 나온다. 산·면 i j로 다른 2차맵을 연다. 틀린 키는 `bad_key`.
  - 기기 길: 명왕성 표본 F7을 기기에서 만들고(약 3~4초, 행성 포함), 같은 행성의 다른 자리는 행성을 다시 만들지 않는다.
  - 사진: 390px 파스텔·다크 × 한국어·영어, 산 자리 ×1·×4+격자·칸 정보. 산 자리(S2 시험 행성 F9 면 3 (295, 247), 높이 약 289m)도 ×4에서 고저가 크게 달라 보이지 않았다. 사용자 판단 몫이다.
- 엔진 p95·휴대폰 프레임은 재지 않았다(**Unknown**).
- 서버 시험 자리 찾기(F9 행성 값 풀기 + 여섯 종류 훑기)의 이벤트 루프 시간은 재지 않았다(**Assumed**: 약 0.1~0.3초, 처음 한 번).

## 검사
- main `6c57543`(경제·세력·우편 화면, R4b)을 받은 뒤에 쟀다.
- `pnpm check`(DB 시험 포함): 2,479개 모두 통과.
- `pnpm e2e` 관련 넷(`second-map-lab`·`dev`·`vision`·`planet-editor`): 46개 중 45개 통과, 1개 건너뜀(측정 시험, `E2E_MEASURE=1`일 때만), 6.9분.
  - 그 전 실행에서 `dev.spec`의 player 시험이 `page.goto` ERR_ABORTED로 한 번 실패했다. 그 파일만 다시 돌려 12개 모두 통과했다(전부터 알려진 흔들림).
- `check-pwa` 통과(편집기 모듈을 떼어 낸 뒤).
- `pnpm check:bundle`: 첫 화면 JS 129,628B / 상한 131,416B. 화면 조각 `SecondMapLabScreen-*` 27,879B(gzip 9,519B)는 미리 캐시에서 빠진다. main만 따로 재지 않아 이 일로 는 몫은 모른다(**Unknown**: 주소 표 한 줄이라 수십 B로 봄).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/planet/src/secondMap/presets.ts`(새)·`presets.test.ts`(새)·`planetValues.ts`·`index.ts` | 시험 자리 찾기, 칸 값(값·파일에서 칸 하나) |
| `apps/server/src/world/secondMapLab.ts`(새)·`secondMapLab.test.ts`(새), `src/trpc/planetEditor.ts`·`context.ts`·`createContext.ts`·`planetEditorRouter.test.ts`, `src/planetEditor/types.ts`, `src/app.ts` | `planetEditor.secondMap` 조회 |
| `packages/engine/src/props/propView.ts`, `terrain/terrainMaterial.ts`(+시험)·`terrainView.ts`·`neighbourTerrains.ts`, `camera/cameraMath.ts`, `secondMapEngine.ts`·`engineParts.ts`·`engineTypes.ts`·`index.ts` | 보기 설정(격자·소품 모델 거리·상한), 처음 카메라 거리 |
| `apps/game/src/editor/secondMapLab/`(새: 화면·판·자료·순수 계산·문구·CSS·시험 둘) | 2차맵 시험 화면 |
| `apps/game/src/editor/planet/secondMapPreviewProtocol.ts`·`secondMapPreviewWork.ts`(+시험)·`SecondMapPreview.tsx`·`useSecondMapPreview.tsx`·`planetEditorSecondMapWorker.ts` | 워커 부탁에 시험 자리·8이웃·칸 값, 원본 항목(`definition`)으로 생성기 입력 만들기 |
| `apps/game/src/map/secondMapBuildClient.ts`(+시험, `editor/planet/secondMapPreviewClient.ts`에서 옮김) | 두 개발자 도구가 같이 쓰는 워커 손잡이를 개발자 소스 폴더 밖으로(미리 캐시 검사) |
| `apps/game/src/map/mapFeed.ts`(+시험)·`feedTypes.ts`·`SecondaryMapScreen.tsx`·`map.css` | 탐사 칸 수, 검은 2차맵 안내 |
| `packages/shared/src/routes.ts`(+시험), `apps/game/src/shell/routeViews.tsx`·`SideMenu.tsx`, `src/editor/DevHome.tsx`, `src/sections/ComingSoon.tsx` | 주소·개발자 도구 줄 |
| `apps/game/vite.config.ts`, `scripts/pwa-build.mjs`(+시험) | 미리 캐시에서 빼기 |
| `apps/game/messages/ko.json`·`en.json` | 화면·안내 문구 |
| `e2e/second-map-lab.spec.ts`(새)·`dev.spec.ts`·`vision.spec.ts` | 화면 시험 |
| `docs/adr/2026-10-31-second-map-from-planet.md` | 구현하며 정한 것 |

## 함께 바꿔야 하는 파일
- 정의 조회·`planetEditor.secondMap` 모양을 바꾸면 기기 `labSource.ts`의 `LabAnswer`·`LabTarget`도 맞춘다.
- 개발자 도구 조각 이름 규칙을 바꾸면 `vite.config.ts` `globIgnores`와 `scripts/pwa-build.mjs`를 함께 바꾼다.

## 건드리지 말 것
- 높이 과장은 보기만이다. 생성기·서버 지형·고정본에 넣지 않는다(사용자가 기본값을 정한 뒤 화면 바꾸기로만).

## 미검증·TODO·알려진 문제
- 휴대폰에서 이 화면을 열어 보지 않았다(390px 헤드리스 사진만). 기기 길의 F9 행성(편집 전용 행성)은 휴대폰에서 시간·메모리를 모른다. F9 확인 창을 띄운다.
- 높이 과장 기본값(지금 ×1)은 사용자가 시험한 뒤 정한다. 지도 화면(`/map`)에는 아직 넣지 않았다.
- `packages/shared/src/routes.test.ts` 608줄(경고).

## 사용자 결정 대기
- 높이 과장 기본값(×1 그대로, 또는 ×2~×4)과 그것을 실제 지도 화면에도 쓸지.
- 2차맵 밤 깊이(낮밤 작업 기록 `31-1740`).
