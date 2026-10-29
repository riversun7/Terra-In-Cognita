# 2차맵 선명도: 지형 재질 셰이더, 휴대폰 픽셀 비율 상한 2, 아이콘 점·캡슐, ?pixel-ratio

- 일시: 2026-10-29 21:20 (KST)
- 작업 도구: Claude Code
- 검토 뒤 고침: 작업 기록 `2026/10/29-2350-second-map-sharpness-review.md`(지적 9개 처리. 아래 줄 중 바뀐 것은 "(검토 뒤 고침)" 표시)
- 관련: ADR `2026-10-28-s1-second-map.md`(33, 제안) "구현하며 정한 것 (2026-10-29, 2차맵 선명도)", ADR `2026-10-29-s2-planet-lod.md`(36, 제안) 렌더러 줄, PLAN 5.7, 사용자 의견 "2. 2차맵이 너무 저해상도에 뿌옇다."(웨일 4.0.1.15, 412×892, 픽셀 비율 3.5), 커밋 5b614a5(아이콘 점·캡슐)·e299ad6(상한 2·그리기 버퍼)·96aac7f(지형 재질)·d6efa5f(?pixel-ratio·HUD), 가지 `work/second-map-sharpness`

## 한 일
- 조사 결론(같은 세션의 조사 단계, Verified: 헤드리스 사진 비교)을 따랐다.
  - 큰 몫은 지형 색이다. 꼭짓점 색(칸 11.7m마다 둘레 칸 평균)이 삼각형을 따라 섞여 지표 경계가 칸 1~2개 폭의 흐린 띠가 됐다. 픽셀 비율 1.5와 3.5에서 같았다.
  - 다음 몫은 휴대폰 픽셀 비율 상한 1.5다(그리기 618×1338을 화면이 2.33배로 늘였다). 아이콘 점의 계단(discard)과 캡슐(3 × 10)의 각도 보탰다.
- 지형 재질 셰이더(PLAN 5.7 "셰이더 디테일")를 새로 넣었다(`terrainMaterial.ts`). MeshLambertMaterial의 색 단계만 바꾼다(onBeforeCompile).
  - 칸 자료 텍스처(128², rgb = 지표 색, a = 지표 코드, 모르는 코드는 회색)를 조각마다 둘레 4칸 읽는다(texelFetch). 같은 지표끼리 이중선형 무게를 더하고 지표마다 다른 잡음을 더한다.
  - 가장 큰 지표를 soft-argmax로 고른다. 경계 폭은 "코드가 작은 지표 − 큰 지표" 무게 차이의 fwidth로 화면 한 점 남짓에 맞춘다(칸 기울기로 위아래를 묶는다).
  - 잔결: 0.6·2·6m 세 겹, 밝기 약 ±8%. 화면 한 점이 덮는 땅(fwidth(xz))이 겹 크기의 반을 넘으면 그 겹을 줄여 무늬 크기에서 0이 된다.
  - 잡음은 셰이더 계산이 아니라 이어 붙는 256² RGBA8 텍스처(밉맵, 이방성 4)에서 겹마다 한 번 읽는다(세 번). 경계 흔들기는 6·2m 겹의 지표별 채널을, 잔결은 네 채널 평균을 쓴다(채널 차이와 상관이 없어 잔결이 경계 모양을 따라가지 않는다).
  - 잡음 텍스처는 흰 잡음(정수 해시)을 상자 흐림 세 번으로 만든다(`terrainNoise.ts`). 시제품의 값 잡음은 돌려 읽으면 비스듬한 줄무늬가 보여 바꿨다. 지형 워커가 처음 한 번 만들어 지형과 함께 보낸다(`terrainBuilder.ts`, 화면 스레드에서 처음 돌리면 수십 ms였다). (검토 뒤 고침: 빌더를 만들 때 워커에 먼저 부탁해 지형 자료를 기다리는 동안 만든다)
  - 가장자리 벽(법선 y = 0)은 꼭짓점 색 그대로다. 높이 밝기·물 아래 어둡게는 꼭짓점 색과 같은 식(`HEIGHT_SHADE`)을 조각마다 계산한다. 색표는 `terrainTextures.ts` 하나를 꼭짓점 색과 함께 쓴다.
- 휴대폰 픽셀 비율 상한을 1.5에서 2로 올렸다(`DEFAULT_MAX_PIXEL_RATIO`, 1차맵·2차맵 같이). PLAN 5.7 "1.5~2" 안이다. 관리자 GPU 시험(`gpuBenchRunner.ts`)의 옮겨 적은 값도 2로 맞췄다.
- 아이콘 점: 알파 = 1 − smoothstep(0.5 − fwidth(r), 0.5, r), 채움과 테두리 사이도 smoothstep(재질은 원래 반투명 목록). (검토 뒤 고침: 이 식은 테두리를 얇게 했다. 띠를 경계 가운데에 두고 점을 양쪽 1점씩 크게 그린다)
- 캡슐: CapsuleGeometry 조각 (3, 10) → (6, 20). 꼭짓점 88 → 294개, 삼각형 140 → 520개(Verified: three 0.186.1). 인스턴스이고 화면 안 유닛만 그린다.
- 재기 훅: 주소 `?pixel-ratio=<1~4>`(1차맵·2차맵, 범위 밖·숫자가 아니면 무시)를 엔진 `maxPixelRatio`로 넘긴다. HUD에 쓰는 픽셀 비율·그리기 버퍼 크기 줄(`map_perf_pixels`, ko·en)과 `data-pixel-ratio`·`data-buffer`를 더했다. 엔진 요약에 `drawingBufferWidth`·`drawingBufferHeight`(WebGL drawingBuffer)를 더했다.
- 확인(Verified: 빌드한 앱·서버, Playwright 1.63 헤드리스 Chromium + SwiftShader, 412×892·dpr 3.5·터치, 봇 1,000개, 가짜 계정)
  - 같은 카메라 앞뒤 사진(처음, 섞인 곳 70m, 40m, 4배, 전체 × 상한 1.5·2): 경계가 상한 1.5에서도 날카롭다. 전 사진은 흐린 띠다. 평균 색은 그대로(40m 풀밭 R·G·B 154.7·221.0·124.0 → 154.3·220.1·124.2), 표준편차는 잔결로 1.5·2.2·1.2 → 4.5·6.4·3.6 단계.
  - 기본 상한: 전 1.5(618×1338) → 뒤 2(824×1784). `?pixel-ratio=1.5·3·4` → 1.5·3·3.5(min(dpr, 상한)), `0.5`·`abc` → 기본 2. 1차맵도 기본 2, `?pixel-ratio=3` → 3(1236×2676). 콘솔 오류 0(셰이더 컴파일 오류 없음).
  - 반짝임: 카메라를 그리기 버퍼 1점씩 옮겨 찍은 화면 가운데의 남는 차이(가장 잘 맞춘 밀림 뒤, 회색 단계 RMS)가 뒤 0.40~0.52, 전 0.27~0.47이다. 조사 시제품의 줄이지 않은 셰이더 계산 잔결은 전체 보기에서 1.21이었다(재는 법이 점무늬를 잡는지 확인). 그래서 시험 지형에서는 점무늬·반짝임이 없다고 본다. (검토 뒤 고침: 아주 평평한 지형에서는 높이 밝기 배율 1 / 1e-6 때문에 점무늬·줄무늬가 났다. 칸 가운데 줄의 옅은 1점 직선도 있었다) 1/4점씩 옮긴 값은 8비트 양자화 바닥(0.2~0.5)이라 차이를 못 가린다.
  - 아이콘 점 계단·캡슐 각이 없어졌다(사진). HUD 새 줄: 영어 390px(dpr 3)에서 패널 오른쪽 280px·넘친 줄 0, 다크 테마(한국어 412px)에서도 패널 안에 든다(사진).
  - 지형 메시(워커): 첫 열기 124ms(잡음 포함), 다시 열기 63~75ms. 전 44~58ms(바쁜 공유 CPU라 흔들린다). (검토 뒤 고침: 잡음을 먼저 만들어 첫 열기도 다시 열기와 비슷해졌다)
  - 그리기 비용(참고용, SwiftShader는 텍스처 읽기를 CPU가 흉내 내서 GPU 기준이 아니다): 섞인 곳 70m에서 render + 1점 readPixels 15번의 최솟값. 상한 1.5: 정점 색 53~90ms, 시제품(셰이더 계산 잡음) 115~168ms, 뒤 157~202ms. 상한 2: 79~105 / 173~207 / 253~338ms. 이방성 1로 바꾸면 뒤가 대개 6~21% 준다(한 번은 거꾸로 늘었다). 기계 부하(평균 3~20)로 회차마다 크게 흔들렸다.
  - 묶음 크기(Verified: vite build): 2차맵 조각 46.61 → 55.95kB(gzip 17.69 → 21.52kB), 1차맵 조각 62.01 → 62.43kB, 지형 워커 3.05 → 3.95kB, 첫 화면 조각 그대로(262.97kB), 미리 캐시 1,161.72 → 1,172.45KiB.
  - GPU 메모리(계산): 잡음 텍스처 256² × 4B + 밉맵 약 349KB, 칸 자료 텍스처 64KB. 픽셀 비율 3.5 휴대폰의 그리기 버퍼는 0.83 → 1.47MP.
- 사진·스크립트(저장소 밖 스크래치): `sharp2/impl/cmp/`(full-*.png 전체 비교, crop-*.png 1:1·2배, e2e-themes.png, dark-hud.png), `sharp2/impl/shots/`, `sharp2/impl/pan1f/`(반짝임 사진, 최종 셰이더), 스크립트 capture·pan·shimmer.py·rendercost·e2e.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/terrain/terrainMaterial.ts` | 새 파일. 지형 재질(칸 자료 텍스처·잡음 텍스처·셰이더 덧붙이기) |
| `packages/engine/src/terrain/terrainTextures.ts` | 새 파일. 지표 색표·높이 밝기 값(꼭짓점 색과 함께 씀), 칸 자료 텍스처 자료(순수 함수) |
| `packages/engine/src/terrain/terrainNoise.ts` | 새 파일. 이어 붙는 잡음 텍스처 자료(순수 함수, 결정적) |
| `packages/engine/src/terrain/terrainTextures.test.ts` | 새 시험: 칸 자료(색·코드·모르는 코드 회색·크기), 꼭짓점 색과 같은 색표, 잡음(결정성·이어 붙음·방향 무늬 없음·평균·퍼짐·채널 상관) |
| `packages/engine/src/terrain/terrainView.ts` | 지형 재질을 쓴다. `set(mesh, terrain, noise)` |
| `packages/engine/src/terrain/terrainMesh.ts` | 색표를 terrainTextures.ts에서 가져온다. 윗면 꼭짓점 색은 예비용이라고 적음 |
| `packages/engine/src/terrain/terrainBuilder.ts`, `terrainWorker.ts` | 처음 요청에 잡음 자료도 워커가 만든다(`withNoise`), 화면 스레드가 들고 있다가 다음 지형·화면에도 준다 |
| `packages/engine/src/secondMapEngine.ts` | 지형에 잡음 자료를 넘긴다. 요약에 그리기 버퍼 크기 |
| `packages/engine/src/planet/planetEngine.ts`, `planetTypes.ts` | 요약에 그리기 버퍼 크기, 상한 설명(2) |
| `packages/engine/src/engineTypes.ts` | 요약에 그리기 버퍼 크기, 상한 설명(2) |
| `packages/engine/src/render/sharedRenderer.ts` | 휴대폰 상한 1.5 → 2(`DEFAULT_MAX_PIXEL_RATIO`) |
| `packages/engine/src/units/unitMaterials.ts` | 아이콘 점 가장자리·테두리 안티에일리어싱 |
| `packages/engine/src/units/unitView.ts` | 캡슐 조각 6 × 20 |
| `apps/game/src/map/pixelRatioParam.ts`, `pixelRatioParam.test.ts` | 새 파일. `?pixel-ratio` 읽기(1~4, 틀리면 무시)·HUD 표시 글자, 시험 |
| `apps/game/src/map/SecondaryMapScreen.tsx`, `PlanetMapScreen.tsx` | `?pixel-ratio`를 엔진에 넘긴다. HUD 줄·`data-pixel-ratio`·`data-buffer` |
| `apps/game/messages/ko.json`, `en.json` | `map_perf_pixels` |
| `apps/game/src/admin/gpuBench/gpuBenchRunner.ts` | 옮겨 적은 상한을 2로(상수) |
| `docs/adr/2026-10-28-s1-second-map.md` | ADR 33(제안): 상한 줄 고침 + "2차맵 선명도" 절 |
| `docs/adr/2026-10-29-s2-planet-lod.md` | ADR 36(제안): 1차맵도 상한 2·`?pixel-ratio` |

## 함께 바꿔야 하는 파일
- 픽셀 비율 상한: `sharedRenderer.ts` `DEFAULT_MAX_PIXEL_RATIO` ↔ `gpuBenchRunner.ts` `MAX_PIXEL_RATIO`(관리자 조각에 엔진이 묶이지 않게 옮겨 적음) ↔ `engineTypes.ts`·`planetTypes.ts` 설명.
- 지표 코드(`terrainData.ts` `SURFACE`)를 늘리면 `terrainTextures.ts` 색표에 색을 더한다(셰이더는 코드를 그대로 쓴다).
- 워커 메시지 모양: `terrainBuilder.ts` `TerrainWorkerRequest`·`TerrainWorkerReply` ↔ `terrainWorker.ts`(검토 뒤 고침: 하는 일은 `terrainJob.ts`, 부탁은 잡음·메시 두 가지).
- 높이 밝기: `terrainTextures.ts` `HEIGHT_SHADE` 하나를 꼭짓점 색과 셰이더가 같이 쓴다(값만 바꾸면 둘 다 바뀐다). 배율도 `heightShadeScale` 하나다(검토 뒤 고침).
- main을 합칠 때(검토 뒤 고침): main의 `apps/game/src/editor/planet/flatMapRender.ts`(`FLAT_MAP_PHONE_PIXEL_RATIO` 1.5, `flatMapPixelRatioLimit`)·`FlatMap.tsx`(`pixelRatio`)는 휴대폰 1.5 규칙을 옮겨 적고 "엔진 `defaultMaxPixelRatio`와 같은 규칙"이라고 주석에 쓴다. 합친 뒤에는 틀린 말이 된다. 둘 중 하나를 한다: 휴대폰도 2로 올리고 `flatMapRender.test.ts`의 기대값(1.5)을 고친다, 또는 주석을 "엔진과 따로 정한 규칙(CPU로 칠하는 그림이라 점 수가 곧 메모리·시간)"으로 고친다. `docs/WORKLOG.md`는 충돌하면 `pnpm docs:index`로 다시 만든다.

## 건드리지 말 것
- 셰이더의 미분(fwidth)·밉맵 읽기는 분기 밖에서 한다(`terrainSurfaceColor`를 늘 부르고 결과만 고른다). 분기 안으로 옮기면 GLSL에서 값이 정해지지 않는다.
- 경계 폭에 쓰는 차이는 "코드가 작은 지표 − 큰 지표"(부호가 경계를 가로지르며 바뀐다)다. 가장 큰 값 − 둘째 값으로 바꾸면 경계에서 V자라 fwidth가 0에 가까워진다.
- 잔결은 네 채널 평균을 쓴다. 한 채널을 쓰면 그 지표의 경계 흔들기와 상관이 생긴다.
- 조사용 훅(`__terraDbg`, 스크래치 `debug-hook.patch`)은 저장소에 넣지 않았다. 사진을 다시 찍을 때만 잠깐 붙인다.

## 미검증·TODO·알려진 문제
- 휴대폰(Unknown): 웨일 3.5배 휴대폰에서 상한 2 + 지형 셰이더로 120fps가 유지되는지, 중가 안드로이드, iOS, 배터리·열. 배포 뒤 HUD(프레임·엔진·픽셀 비율 줄)와 `?pixel-ratio=2·2.5·3·3.5`로 잰다. 헤드리스 비용 값은 GPU 기준이 아니다.
- GPU 비용 추정(Assumed): 조각마다 칸 자료 texelFetch 4번 + 삼선형·이방성 읽기 3번 + 계산 약 100번. 고급 휴대폰에서 상한 2일 때 프레임당 약 1~3ms로 본다(잰 값 아님).
- 지표 코드 4 이상(모르는 코드, 회색·두 채널 섞은 흔들기)은 시험 지형에 없어 화면으로 보지 않았다(칸 자료 텍스처 값은 단위 시험으로 확인).
- 기기 성능 보고(`client_perf_samples`)에는 기기 dpr만 있고 엔진이 쓴 픽셀 비율은 없다. `?pixel-ratio`로 바꿔 잰 표본을 서버에서 가를 수 없다 — 지금은 HUD를 사진으로 받는다. 필요하면 성능 보고에 픽셀 비율을 더한다(프로토콜·서버 표 변경).
- 물 코드 칸이 물 높이보다 높으면 물가에 청록 띠가 보인다(자료가 그렇다, 시험 지형).
- `pnpm check`의 서버 굽기 시험(`apps/server/src/planet/bake.test.ts`)이 기계 부하(평균 약 20)로 5초 제한을 한 번 넘었다. 따로 돌리면 통과한다(이번 변경과 상관없음).
- 시험 2차맵 지형(128칸)은 임시다. 행성에서 나온 2차맵(특수 지형 문서 4.3 "5단계")이 오면 칸 자료 텍스처 모양(지표 코드 → 재질 표)을 다시 본다.

## 사용자 결정 대기
- 휴대폰 상한을 2보다 올릴지(설정·자동 조절·기기 등급, PLAN 5.7 밖이라 새 결정), 지형 그림 방향(경계 흔들림·잔결 세기. 검토 뒤: 흔들기가 보이는 경계를 판정 칸에서 옮기는 맞바꿈도 함께 묻는다), 손대지 않을 때 60fps로 낮출지, 빛(해·하늘빛 세기). 통합 세션이 휴대폰 측정과 함께 묻는다.
