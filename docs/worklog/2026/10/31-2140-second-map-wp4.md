# 2차맵 생성 WP-4: 기기 그림·미리보기 — 소품 모델·땅 색, 나침반, 경계 너머 보기(이웃 2차맵), 편집기 2차맵 미리보기

- 일시: 2026-10-31 21:40 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-31-second-map-from-planet.md`(46, 제안) "구현하며 정한 것 (WP-4)", 사용자 결정 U1·U5 (가), ADR 38 D6a, 기획 D-106·D-139. 가지 `work/second-map-v2`(main `f38e088`까지 받은 뒤. main이 WP-3을 이미 합쳐 빨리 감기였다)

## 한 일
- 소품 그리기(U5 (가))
  - 멀리: 지형 재질이 배치 칸 256² 소품 색 텍스처를 땅 색에 섞는다(차폐 190·은폐 160·그 밖 60).
  - 가까이: 화면 짧은 변 420m 아래에서 카메라 둘레에 모델을 세운다(`engine/props/propView.ts`). 모양마다 InstancedMesh 하나, 최대 2,500개다.
  - 모델 표(`propLook.ts`)는 그림 이름으로 찾는다. 모르는 그림은 그리지 않는다.
- 나침반(U1 (가)): 2차맵 화면 머리에 바늘을 둔다. 엔진 `onView`가 카메라가 바뀐 프레임마다 바늘을 돌린다.
- 경계 너머 보기(리드 요청)
  - 이웃 2차맵 지형을 받아 둘레에 그린다(`engine/terrain/neighbourTerrains.ts`, 기기 `map/secondMapNeighbours.ts`·`secondMapNeighbourLoader.ts`).
  - 카메라를 경계 너머 이웃 위로 옮길 수 있다. 목표가 변의 20% 안에 오면 그쪽 이웃을 받는다. `?second-map-neighbours=all`이면 8장을 다 받는다(개발자 3×3 이어 보기).
  - 이음매가 보이던 것 셋을 고쳤다.
    - 가장자리 벽: 이웃이 있으면 숨긴다.
    - 밝기 계단: 이웃도 지금 2차맵 높이 범위를 쓴다.
    - 모델이 경계에서 멈춤: 이웃에도 세운다.
  - 지형 재질은 지표·안개·소품을 2차맵 안 좌표로, 잔무늬 노이즈를 세계 좌표로 읽는다.
- 유닛이 넘을 때의 화면 바꿈(D-106) 메모를 ADR 46에 적었다.
  - 짧은 흐리기를 하면서 이웃을 구독하고, 이미 받은 이웃 메시를 지금 2차맵으로 올린다.
  - 끊김 없는 화면은 잰 뒤에만 한다.
- 편집기 2차맵 미리보기(ADR 38 D6a)
  - 칸 정보창에 [2차맵 미리보기]를 두었다. 누르면 행성 진짜 면 레벨의 그 칸 2차맵을 만들어 창에서 2차맵 엔진으로 보인다.
  - 전용 워커(`planetEditorSecondMapWorker.ts`)가 행성 값을 들고 있어 같은 행성이면 다시 쓴다.
  - 서버 정의 조회가 `map_props` 원본 항목(`mapProps`)을 함께 보낸다. 기기는 `@terra/planet/secondMap` `mapPropInputsFromJson`으로 읽는다. 서버 시험이 규칙 해시가 서버 지형 워커와 같은지 본다.
  - F9 이상이고 들고 있지 않은 행성이면 F9 미리보기와 같은 확인 창을 띄운다(`workspaceParts.tsx` `heavyConfirm`로 옮김).
  - 렌더러가 하나라서 창이 열린 동안 지구본 엔진을 내렸다가 닫으면 같은 보기로 다시 만든다.
- 엔진 `secondMapEngine.ts`에서 통계 빛 요약·빈 엔진을 `engineParts.ts`로 나눴다(파일 크기, 동작 그대로).
- 측정 시험(`E2E_MEASURE=1`일 때만): 이웃 0·8장 × 가까이·멀리에서 끄는 동안 엔진 p95.

## 잰 값
- 엔진 p95(화면 시험 측정, 헤드리스 Chromium SwiftShader, 개발 컨테이너). **휴대폰 값이 아니다.** 시험 2차맵(초지) 처음 화면에서 좌우로 6초 끄는 동안 1초마다 읽었다(**Verified**: 이 환경).

  | 이웃 | 거리 | 소품 모델 | p95 중앙값 | p95 최대 |
  |---|---|---|---|---|
  | 0장 | 가까이 | 7 | 1.4ms | 1.9ms |
  | 0장 | 멀리 | 121 | 1.2ms | 2.8ms |
  | 8장 | 가까이 | 7 | 1.1ms | 1.1ms |
  | 8장 | 멀리 | 125 | 1.1ms | 1.5ms |

  - 이웃 8장을 더해도 엔진 화면 스레드 시간은 흔들림 안이었다.
  - GPU 시간은 이 값에 없다(SwiftShader는 CPU 그리기라 따로 잴 수 없음). 휴대폰 프레임은 재지 않았다(**Unknown**).
  - 시험 2차맵은 초지라 모델이 적다(7~125개). 빽빽한 숲에서 상한 2,500개일 때는 재지 않았다(**Unknown**).
- 편집기 2차맵 미리보기(화면 시험, 명왕성 표본 F7, 헤드리스 Chromium 워커): 행성 1.0~1.1초, 2차맵 60~115ms. 두 번째 열기는 행성 값을 다시 써 행성 시간이 없다(**Verified**: 이 환경). F9 행성은 재지 않았다(Assumed: 10~20초).
- `pnpm check:bundle`: 첫 화면 JS 127,843B / 상한 131,416B(main `f38e088` 위). main을 받기 전에는 127,846B였다(낮밤 작업 기록 127,777B, +69B: 주소 표의 새 주소 값). 새 조각은 둘이다(**Verified**: 빌드).
  - `planetEditorSecondMap-*.js` 3,494B(gzip 1,736B).
  - `planetEditorSecondMapWorker-*.js` 82,710B(gzip 30,407B).
  - 두 조각 모두 미리 캐시에서 빠진다(`check-pwa` 통과).
- 화면 시험(새로 더한 것)
  - `vision.spec.ts` "경계 너머 보기": 8장을 받고 끌어서 동쪽 이웃 위로 간다. 사진 `second-map-neighbours-3x3`·`second-map-neighbour-edge`에서 지형·숲이 경계를 넘어 이어졌다.
  - `planet-editor.spec.ts` "2차맵 미리보기" 파스텔·다크: 땅 칸을 고르면 2차맵이 그려지고, 다시 열면 같은 해시이며 행성 값을 다시 쓴다. 사진 `planet-editor-second-map-{pastel,dark}`·`-cell`.
- 시험 `pnpm check`·`pnpm e2e` 전체 결과는 아래 "검사"에 적는다.

## 검사
- `pnpm check`(DB 시험 포함): main을 받기 전 2,248개, main `f38e088`을 받은 뒤 2,316개 모두 통과.
- `pnpm e2e` 전체(main을 받은 뒤): 89개 중 88개 통과, 1개 건너뜀(측정 시험, `E2E_MEASURE=1`일 때만), 10.1분.
- 그 뒤 손잡이를 고쳤다(버린 뒤 다시 부탁하면 새 워커. 개발 중 React StrictMode가 효과를 두 번 돌려 영영 닫히던 것). 단위 시험, 편집기 2차맵 미리보기 화면 시험 2개(다시 빌드), 게임 앱 린트·타입은 다시 돌려 통과했다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/props/propLook.ts`(새)·`propLook.test.ts`(새)·`propView.ts`(새) | 소품 겉모습 표·땅 색 텍스처, 가까이 모델(U5) |
| `packages/engine/src/terrain/neighbourTerrains.ts`(새)·`neighbourTerrains.test.ts`(새) | 이웃 2차맵 지형 놓기·높이·범위 |
| `packages/engine/src/terrain/terrainMaterial.ts`(+시험)·`terrainView.ts`·`terrainData.ts`·`terrainMesh.ts` | 소품 색 섞기, 2차맵 안 좌표·세계 좌표 나누기, 벽 숨기기, 높이 밝기 범위, 소품 층 확인 |
| `packages/engine/src/secondMapEngine.ts`·`engineParts.ts`(새)·`engineTypes.ts`·`index.ts` | 이웃·소품 연결, `onView`, `setNeighbours`, 통계, 파일 나누기 |
| `apps/game/src/map/secondMapNeighbours.ts`(새)·`secondMapNeighbourLoader.ts`(새)·`secondMapCompass.ts`(새)(+시험 셋) | 이웃 놓는 자리·받기, 나침반 |
| `apps/game/src/map/SecondaryMapScreen.tsx`·`map.css`·`mapWire.ts`(+시험) | 나침반·이웃 받기 연결, 소품·엄폐 층 넘기기 |
| `packages/shared/src/routes.ts`(+시험) | 주소 값 `second-map-neighbours` |
| `apps/game/src/editor/planet/SecondMapPreview.tsx`(새)·`planetEditorSecondMap.ts`(새)·`planetEditorSecondMapWorker.ts`(새)·`secondMapPreviewProtocol.ts`(새)·`secondMapPreviewWork.ts`(새)·`secondMapPreviewClient.ts`(새)·`useSecondMapPreview.tsx`(새)(+시험 둘) | 편집기 2차맵 미리보기 |
| `apps/game/src/editor/planet/CellPanel.tsx`·`EditorWorkspace.tsx`·`workspaceParts.tsx`·`planetEditor.css` | 단추·창 연결, 확인 창 옮김, 정의의 `mapProps` |
| `apps/game/messages/ko.json`·`en.json` | 나침반·미리보기 문구 |
| `packages/planet/src/secondMap/props.ts`(+시험)·`index.ts` | `mapPropInputsFromJson`(원본 JSON → 소품 입력) |
| `apps/server/src/content.ts`, `src/planetEditor/types.ts`·`definitions.ts`(+시험) | 정의 조회에 `map_props` 원본 항목 |
| `e2e/vision.spec.ts`·`e2e/planet-editor.spec.ts` | 경계 너머 보기·측정, 편집기 2차맵 미리보기 |
| `docs/adr/2026-10-31-second-map-from-planet.md`, `docs/PLAN.md`, `AGENTS.md` | 구현하며 정한 것(WP-4)·D-106 메모, 지도 줄기 상태, 측정 시험 명령 |

## 함께 바꿔야 하는 파일
- 소품 그림을 더하면(`@terra/shared` `MAP_PROP_ARTS`) 엔진 `propLook.ts` 이름표에 겉모습을 더한다. 더하지 않으면 그 그림은 그려지지 않는다.
- 정의 조회 모양(`PlanetEditorDefinitions`)을 바꾸면 기기 `EditorDefinitions`(`workspaceParts.tsx`)도 맞춘다.
- 편집기 지연 조각·워커 파일 이름은 앞머리 `planetEditor`를 지킨다(미리 캐시 규칙 `DEV_ONLY_CHUNK`).

## 건드리지 말 것
- 엄폐 층 형식(256² u8, 0·1·2, R3 시선 판정).
- `second_map_pins` 행(PROTECTED).

## 미검증·TODO·알려진 문제
- 휴대폰 프레임·GPU 시간은 재지 않았다. 빽빽한 숲(모델 2,500개)에서도 재지 않았다. 휴대폰을 본 뒤 `PROP_MODEL_SPAN_M`·`MAX_PROPS`를 정한다.
- 편집기 미리보기 F9: 브라우저 워커에서 재지 않았다. 행성 미리보기 워커와 따로 행성을 한 번 더 만든다(처음 한 번). 행성 미리보기가 도는 중에 열면 두 워커가 같이 돈다(메모리).
- 이웃 2차맵은 지형만 보인다. 유닛이 넘는 이동(D-139)은 규칙 줄기와 함께 한다(PLAN 11장).
- `packages/shared/src/routes.test.ts`가 605줄이 됐다(경고, 600줄 권장). 주소 값 한 줄이 포맷으로 일곱 줄이 됐다.

## 사용자 결정 대기
- 2차맵 밤 깊이(낮밤 작업 기록 `31-1740`)는 휴대폰을 본 뒤 사용자가 정한다.
