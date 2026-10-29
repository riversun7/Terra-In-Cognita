# S2 렌더러: 1차맵 행성 LOD 엔진, 가짜 행성, 임시 1차맵 시험 화면

- 일시: 2026-10-29 11:30 (KST)
- 작업 도구: Claude Code (서브에이전트, 작업 트리)
- 관련: ADR `2026-10-29-s2-planet-lod.md`(36, 제안. 끝에 "구현하며 정한 것 (렌더러)"를 덧붙임), `2026-10-28-s1-second-map.md`(33, 공용 렌더러·프레임 예약), `2026-10-29-cell-key-layout.md`(34), `2026-10-28-design-system.md`(30), PLAN 5.7·11장
- 작업 브랜치 `worktree-wf_855dd1b7-352-3`(main 577f74d에서 시작). 새 런타임 의존성 없음(`@terra/planet`은 작업공간 꾸러미).

## 한 일
- `packages/engine`에 1차맵 엔진을 만들었다. 새 진입점 `@terra/engine/planet`의 `createPlanetEngine`이고, React를 쓰지 않는다.
  - 나무(`tileTree.ts`): 면마다 쿼드트리, 맵 레벨 F−4 ~ F, 타일 = 그 맵 레벨의 32×32칸. 면이 32칸보다 작은 단계는 면 전체 타일이다. F > 9인 큰 행성은 맵 레벨 5 ~ F−5에 자료 없는 마디를 둬서 면마다 꼭대기가 하나다.
  - 고르기(`lodSelect.ts`, 순수 함수): 화면 오차(문턱 4 CSS px)로 나누기, 타일 상한(160), 부모 먼저 바꾸기, 절두체·지평선 거르기(`culling.ts`), 받을 목록 차례(거친 레벨 먼저).
  - 받기·만들기·올리기·버리기(`tilePipeline.ts`): 동시 받기 6, 원하지 않게 된 받기 0.5초 뒤 취소, 실패하면 1~30초 뒤 다시, 프레임당 올리기 4, GPU 추정 64MB(오래 안 쓴 것부터 버림, 맨 위 레벨은 지킴), 받은 타일 모양 확인.
  - 메시(`tileMesh.ts`, 워커 `tileWorker.ts` + 맡기기 `tileBuilder.ts`): 33×33 정점 + 치마, 카메라 기준 원점, 높이 기울기(법선용), 칸 자료 텍스처 배열. 결과 배열은 넘긴다(transfer). 워커를 못 쓰면 화면 스레드에서 만든다.
  - 장면(`planetView.ts`, `planetMaterials.ts`): 카메라 기준 좌표, 타일 셰이더(해수면 바다·고도 과장·치마·지형/기후 레이어·고른 칸 테두리), 바탕 구, 대기 띠, 같이 쓰는 인덱스.
  - 카메라·조작(`globeCamera.ts` 순수 함수, `globeControls.ts`): 잡은 땅이 따라오는 돌리기, 두 손가락 확대·방위·옮기기, 휠, 오른쪽 끌기 방위, 두 번 누르기 2.5배, 거리에 따른 기울기(0° → 40°), 가장 낮은 고도.
  - 누르기(`surfaceLookup.ts`): 보이는 높이와 시선이 만나는 점 → 가장 고운 받은 타일의 칸(면·i·j·맵 레벨·셀 키 + 칸 자료).
  - 엔진 묶기(`planetEngine.ts`): 2차맵과 같은 렌더러(`acquireRenderer`)·프레임 예약(`FrameScheduler`). 화면이 멈추면 그리지 않는다. 컨텍스트 손실·복구, 숨김 → 보임, 크기 바뀜. `stats()`(타일·상한 도달·GPU 추정·단계·카메라)와 `onStatus`.
- [임시] `@terra/engine/mock`에 가짜 행성을 더했다(`createMockPlanet`): 같은 시드면 같은 타일. 기울기 노이즈(정수 해시)로 대륙·산맥·언덕, 위도 기온 띠·고도 기온 감소, 습도 띠, 바이옴 14개, 호수, 강, 해안, 수심 등급. 타일은 워커에서 만들고, 취소한 요청은 AbortError로 거절한다.
- 게임 앱: 1차맵 시험 화면(`apps/game/src/map/PlanetMapScreen.tsx`, 지연 로딩 조각).
  - [임시] 계정 줄에 [1차맵] 버튼을 [2차맵] 앞에 두었다. `App.tsx`의 `OpenView`에 "planet"을 더했다. 지도가 열린 동안 계정 줄은 내린다.
  - HUD(불투명 판, 토큰만): 뒤로, 제목, 성능(앱 fps·p95·메모리, 타일 그림/상한·올림·대기, 그리기·삼각형·GPU, 엔진 몫, 상한 도달, 첫 표시), 안내, 누른 칸 정보, 단계 표시(1~5 점), 레이어 [지형]·[기후](눌림 표시), 고도 과장 슬라이더(×1~×20), 기후 범례.
  - 문구 31개(ko·en). 시험용 `data-*` 값을 1초마다 단다. 텔레메트리 화면 이름은 `planet-map`이다. `?planet-debug=cracks`면 틈 찾기 모드(시험 전용)다.
- 단위 시험 11개 파일(시험 103개 추가): 나무, 고르기(상한·부모 먼저·지평선), 절두체·지평선 수학, 카메라 기준 좌표 떨림(수치), 메시(같은 레벨 이웃은 면 경계 너머까지 변 꼭짓점의 자리·높이가 같다, 치마, 감는 방향, 기울기), 타일 관리자(동시 상한·취소·다시 받기·메모리 버리기·닫기), 워커 맡기기, 카메라·조작 계산, 누르기, 가짜 행성 결정성, 칸 문구.
- 빌드한 앱·서버 + 일회용 DB(가짜 계정만)로 Playwright 시험 5묶음을 돌렸다(아래 확인). 시험 스크립트·사진은 저장소 밖이다.

## 확인 (Verified: 이 컨테이너, Node 24.22.1, pnpm 11.28.9, Playwright 1.63 Chromium(SwiftShader WebGL), PostgreSQL 16)
| 항목 | 결과 |
|---|---|
| `pnpm install` | 통과(잠금 파일에 `@terra/planet` 연결 3줄) |
| `pnpm --filter @terra/game typecheck` | 통과 |
| `TEST_DATABASE_URL=… pnpm check` | 통과. 시험 파일 92개, 시험 780개(작업 전 81개·677개). 다국어 키 217개(186 + 31). 대비 136쌍, 화면 CSS 6개 |
| `pnpm build`, `node scripts/check-pwa.mjs` | 통과 |
| 빌드 서버 + 새 DB | `NODE_ENV` 비움, `BETTER_AUTH_URL=http://127.0.0.1:4380`, 무작위 비밀값(저장소 밖). `cli.js create-user`로 `fake_s2pastel`·`fake_s2dark`·`fake_s2en`·`fake_s2loop`·`fake_s2perf` |
| Playwright 기본 묶음(390×844, 파스텔·다크·영어) | 32개 모두 통과 |
| 틈 묶음 | 3개 통과(사진 21장 자홍 화소 0) |
| 열기·닫기·성능 묶음 | 8개 통과 |
| 사진 묶음(파스텔·다크, 거리 5곳 + 고른 칸 + 과장 15 + 기후) | 2개 통과(오류 없음) |
| 계정 줄 묶음(파스텔·다크 한국어, 파스텔 영어) | 3개 통과 |

- 기본 묶음에서 확인한 것
  - 지연 로딩: [1차맵]을 누르기 전에는 1차맵 조각·three 조각·워커를 받지 않는다. 누르면 1차맵 조각·같이 쓰는 지도 조각·메시 워커·가짜 행성 워커를 받는다.
  - 누름 → 준비 2,018ms(조각 받기 포함), 첫 표시 1,430ms. 캔버스 1개, 그리기 버퍼 585×1266(픽셀 비율 상한 1.5). 제목에 초점, 계정 줄은 내려간다.
  - 궤도: 그린 타일 60/160, 구멍 없음, 받기 끝, 기울기 0°. HUD 누름 영역 44px 이상, 가로 넘침 없음.
  - 마우스 끌기 → 경도 30.00 → −6.04. 터치 끌기(아래) → 위도 24.96 → 52.91.
  - 휠로 가까이: 단계 1 → 5, 그린 타일은 늘 상한 이하. 가장 가까이는 거리 12,005m, 고도 9,252m, 기울기 40°.
  - 두 손가락 오므리기 → 멀리(12,005 → 33,615m), 벌리기 → 가까이(→ 14,006m). 두 번 누르기 → 2.5배 가까이(34,450 → 13,780m).
  - 누르기 → 가장 고운 받은 단계의 칸(면·칸·단계, 바이옴·높이 또는 수심 등급·수심, 기온·습도).
  - 레이어 [기후] 눌림 표시·범례, 끝까지 멀리 → 궤도(기울기 0°), 고도 과장 20 → 문구·다시 그림.
  - 컨텍스트 손실(`WEBGL_lose_context`) → 안내 → 복구 → 다시 그림. 뒤로 → 캔버스 뗌, 계정 줄 돌아옴.
  - 1차맵 → 2차맵 → 1차맵: 렌더러를 넘겨 써도 둘 다 그린다.
  - 다크 테마, 영어 문구·칸 정보. 세 경우 모두 콘솔·페이지 오류 없음(SwiftShader의 "GPU stall due to ReadPixels" 경고는 뺐다. 사진을 찍을 때 난다).
- 틈: 틈 찾기 모드(바탕 구·하늘이 자홍색)에서 받기가 끝난 화면 21장(거리 2,835 → 130km 15단계 + 과장 20에서 162 → 488km 6단계)의 자홍 화소가 모두 0이다. 순수 자홍과 섞인 자홍을 함께 센다. 치마를 끈 대조 빌드에서는 4개가 나왔다(검사가 틈을 찾는다).
  - 16:00 검토 반영: 이 확인은 레벨 경계에 틈이 없다는 증거가 아니었다. 가짜 행성은 꼭짓점이 방향의 점 값이라 레벨 사이 높이 차가 없었고, 21장 중 15장은 한 레벨만 그렸다. 서버 타일과 감도를 확인한 시험으로 다시 잰 값은 작업 기록 `2026/10/29-1600-s2-renderer-review.md`.
- 사진은 눈으로 봤다(파스텔·다크 각 8장, 영어 1장, 계정 줄 3장). 틈 사진은 자홍 화소 세기로 봤다. 처음에 보인 문제는 고쳤다: 바다 칸에 바다 이름이 두 번 나옴, 다크 기본 슬라이더 바탕이 안 보임, 높낮이가 밋밋함(가짜 행성 세부 + 음영).
- 성능(참고용, 헤드리스 SwiftShader라 휴대폰 값이 아니다)
  - 열기·닫기 10번: 누름 → 준비 1,415~2,094ms, 첫 표시(엔진 생성 → 맵 레벨 5·6 + 첫 프레임) 787~1,272ms. 닫으면 캔버스 0개. JS 힙(GC 전) 17.5 → 24.0 → 19.2 ~ 19.7MB로 멈춤.
  - 누름 → 준비와 첫 표시의 차이(약 0.6초)는 엔진 밖 시간이다(누름 → 엔진 생성, 준비 → 시험 도구가 알아챔). 소프트웨어 그리기 중에 시험 도구가 상태를 알아채는 시간이 크다고 본다(Assumed).
  - 궤도에서 15초 돌리기: 그린 타일 최대 62, 앱 fps 6~9, 엔진 몫 p95 1.4~3.5ms.
  - 지역(궤도에서 휠 6칸 가까이)에서 10초 빠르게 끌기: 그린 타일 최대 109, 끝나면 대기 0. 상한 도달은 타일 0·받기 42·올리기 58·메모리 0, 올린 타일 327개, GPU 추정 15.6MB.
  - 휠을 계속 돌리며 7초: 프레임 간격 p50 216.7ms·p95 550.1ms(29프레임), 엔진 몫 p95 3ms, 그리기 110번, 삼각형 266,880개.
  - 거리별 그린 타일: 궤도 60, 1,800km 72, 750~850km 139~148(삼각형 약 34만 개, 가장 많음), 400km 40, 67km 8, 12km 4.
- 묶음 크기(빌드 결과, gzip은 9단계로 잼)
  - 첫 화면 JS: 368.38 → 368.58kB(gzip 113.63 → 112.56kB). three·엔진 코드는 첫 화면 조각에 없다(소스 맵으로 확인). rolldown이 공용 조각을 `json`·`useMountFocus`에서 `src`(프로토콜 + zod)로 바꿨다.
  - 1차맵 조각 55.19kB(gzip 21.42kB) + CSS 2.81kB, 메시 워커 5.53kB, 가짜 행성 워커 5.71kB.
  - 두 지도가 같이 쓰는 조각 `map-*.js`(three, 공용 렌더러, 프레임 예약, 카메라 계산, 지도 문구 몇 개) 541.42kB(gzip 134.13kB). 2차맵 조각은 585.38 → 45.87kB라서, 2차맵을 열 때 받는 JS는 거의 그대로다(585.38 → 587.29kB).
  - 미리 캐시: 24개 1,035.94KiB → 28개 1,105.37KiB(빌드 출력).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/package.json`, `pnpm-lock.yaml` | `./planet` 진입점, `@terra/planet` 연결(투영·셀 키) |
| `packages/engine/src/index.ts` | 1차맵 엔진은 다른 진입점이라는 주석 |
| `packages/engine/src/planet/planetTypes.ts`, `index.ts` | 바깥 모양(타일 원천·`DecodedTile`·행성 설명·상한·상태·통계·엔진), 진입점 |
| `packages/engine/src/planet/{tileTree,tileShape,vec3}.ts` | 타일 나무·키, 타일 모양(경계구·활꼴 깊이·칸 크기), 벡터 |
| `packages/engine/src/planet/{lodSelect,culling}.ts` | 고르기(화면 오차·상한·부모 먼저), 절두체·지평선 |
| `packages/engine/src/planet/{tileMesh,tileWorker,tileBuilder}.ts` | 메시 배열(워커), 워커 맡기기(화면 스레드 대체) |
| `packages/engine/src/planet/tilePipeline.ts` | 받기·만들기·올리기·버리기 관리 |
| `packages/engine/src/planet/{planetView,planetMaterials,cameraRelative}.ts` | three 장면·셰이더, 카메라 기준 좌표(시험용 32비트 흉내 포함) |
| `packages/engine/src/planet/{globeCamera,globeControls,surfaceLookup}.ts` | 지구본 카메라 계산·조작, 땅 읽기·누르기 |
| `packages/engine/src/planet/planetEngine.ts` | 엔진 묶기(프레임 순서, 크기, 입력, 컨텍스트, 통계, WebGL이 없을 때 빈 엔진) |
| `packages/engine/src/planet/*.test.ts`, `testSupport.ts` | 단위 시험과 시험용 타일 |
| `packages/engine/src/mock/{mockNoise,mockPlanet,mockPlanetSource,mockPlanetWorker}.ts`(+시험), `mock/index.ts` | [임시] 가짜 행성과 그 타일 원천 |
| `apps/game/src/map/PlanetMapScreen.tsx`, `planetMap.css`, `planetText.ts`(+시험) | 1차맵 시험 화면, HUD 꾸밈(토큰만), 누른 칸 문구 |
| `apps/game/src/App.tsx`, `src/auth/AccountBar.tsx` | [임시] 여는 곳(`OpenView` "planet", [1차맵] 버튼) |
| `apps/game/messages/{ko,en}.json` | 새 문구 31개 |
| `docs/adr/2026-10-29-s2-planet-lod.md` | "구현하며 정한 것 (렌더러)" 덧붙임(상태는 제안 그대로) |

## 함께 바꿔야 하는 파일
- 서버 타일을 이을 때(메인 세션): 시험 화면의 `createMockPlanet()`을 서버 원천으로 바꾼다. 원천은 `TileSource`(`(request, signal) => Promise<DecodedTile>`)이고, 행성 설명(`PlanetDescription`)은 목록 정보에서 만든다.
  - ADR 36의 타일 ID = `cellKey(face, mapLevel − 5, i0 / 32, j0 / 32)`(F ≥ 9, 맵 레벨 5 이상).
  - 맵 레벨 5 미만(F < 9 행성의 면 전체 타일)은 이 규칙으로 ID가 겹친다. 타일 작업이 정한 ID를 따른다.
- 이진 타일을 워커에서 풀려면: `tileWorker.ts`·`tileBuilder.ts`의 요청에 `{kind: "encoded", bytes}`를 더하고 워커 안에서 `packages/protocol` 해석기를 부른다. 결과는 지금 모양(`DecodedTile` + 메시)으로 돌려준다.
- 타일 모양(`DecodedTile`)을 바꾸면: `planetTypes.ts`, `tileMesh.ts`(`decodedTileProblem`·`buildTileMesh`), `surfaceLookup.ts`, `mock/mockPlanet.ts`, 시험.
- 물 비트·수심 등급을 바꾸면: `planetTypes.ts`의 `WATER_BITS`·`WATER_DEPTH_SHIFT`, `planetMaterials.ts` 셰이더, `apps/game/src/map/planetText.ts`.
- 생성기 작업이 `@terra/planet/projection`을 결정적 근사로 바꾸면: `tileMesh.test.ts`의 면 경계 꼭짓점 시험(허용 1cm, 반지름 531km)이 근사 오차를 본다. 근사가 대칭(st ↔ 1 − st)과 끝값을 지키면 그대로 통과할 것이다(Assumed).
- 1차맵 화면을 앱 화면 흐름(아래 탭)으로 옮기면: `App.tsx`의 `PlanetMapScreen` lazy·`OpenView` "planet", `AccountBar.tsx`의 `onOpenPlanet` 버튼을 지운다.
- 상한·문턱을 바꾸면: `planetTypes.ts`의 `DEFAULT_PLANET_BUDGETS`, `planetEngine.ts`의 `DEFAULT_MAX_SCREEN_ERROR_PX`, ADR 36.

## 건드리지 말 것
- 1차맵 엔진은 `@terra/engine/planet`에서만 가져온다. `@terra/engine`(2차맵 진입점)에 다시 내보내면 2차맵 조각에 1차맵 코드가 들어간다. 첫 화면 코드에서 정적으로 import하지 않는다(`PlanetMapScreen`만 `React.lazy`).
- 워커 만드는 모양 `new Worker(new URL("./tileWorker.ts", import.meta.url), { type: "module" })`(가짜 행성 워커도 같음)을 바꾸지 않는다. Vite가 이 모양만 따로 묶는다.
- 타일 지오메트리를 버리기 전에 같이 쓰는 인덱스를 뗀다(`planetView.ts`). three는 지오메트리를 버릴 때 그 인덱스 GPU 버퍼도 지운다. 다른 타일이 아직 쓰고 있어도 지운다.
- 셰이더의 바다 처리 `max(높이, 0) × 과장`과 누르기·카메라 높이(`displayedHeightAt`)는 같은 식이어야 한다. 하나만 바꾸면 누른 칸과 보이는 땅이 어긋난다.
- 치마 깊이 식(`planetView.ts` `updateSkirt`)을 줄이지 않는다. 틈 묶음 21장이 이 값으로 0이다.
  - 16:00 검토 반영: 이 식은 고운 타일 변이 거친 이웃 변보다 높으면 못 막았다. 지금은 모든 타일이 같은 바닥까지 내린다(`tileShape.ts` `skirtDepthM`). `updateSkirt`는 지웠다.
- 화면 CSS에 색·px 값을 직접 쓰지 않는다(`pnpm check:contrast`). 행성 색(바이옴·바다·우주)은 세계 색이라 테마와 상관없다(D-070).

## AGENTS.md 6장 후보(메인 세션이 옮길지 정한다)
- three 0.186.1: 지오메트리를 버리면(`dispose`) 그 인덱스·속성 GPU 버퍼를 지운다. 같은 `BufferAttribute`를 다른 지오메트리가 쓰고 있어도 지운다(Verified: `WebGLGeometries.js` `onGeometryDispose`). 인덱스를 같이 쓰면 버리기 전에 `setIndex(null)`로 뗀다.
- three 0.186.1: `ShaderMaterial`(Raw가 아닌 것)은 늘 `#version 300 es`로 컴파일된다. 그래서 `texelFetch`·정수 비트 연산·`fwidth`를 `glslVersion` 없이 쓴다(Verified: `WebGLProgram.js`, 빌드한 화면에서 실행).
- Vite 8.3.5(rolldown): 지연 조각 둘이 같이 쓰는 모듈(three 등)은 따로 한 조각으로 묶인다. 첫 화면에서 미리 불러오지 않는다(Verified: 빌드 소스 맵, Playwright 요청 기록).
- Playwright 1.63 + 헤드리스 Chromium: `mouse.wheel`을 잇달아 보내면 휠 이벤트가 합쳐진다. 휠 단계를 세는 시험은 150ms씩 띄웠다(Verified: 이 작업 시험).

## 미검증·TODO·알려진 문제
- 실제 휴대폰으로 확인하지 않았다(Unknown): 프레임 p95, 첫 표시(4G·서버 타일), 메모리, 20분 연속, iOS 사파리 손가락 동작, iOS 앱 전환 뒤 컨텍스트 복구, 삼각형 약 34만 개(750~850km)를 그리는 비용. 힘들면 `maxScreenErrorPx`(4 → 6~8)를 먼저 올리고, 그다음 `visibleTiles`를 낮춘다.
- 타일 경계에서 음영 선이 살짝 보인다(가까이서 비탈). 타일에 테두리 칸이 없어 가장자리 기울기가 한쪽 차분이기 때문이다. 고치려면 타일 형식에 테두리 1칸을 넣거나(타일·프로토콜 작업), 이웃 타일 자료로 가장자리를 다시 계산해야 한다.
- [임시] 시험 화면을 여는 곳(계정 줄 [1차맵] + `App.tsx` `OpenView` "planet"). 영어 390px에서는 계정 줄 버튼이 두 줄이 된다(넘침·누름 영역은 통과).
- [임시] 가짜 행성(`@terra/engine/mock`). 실제 생성기·서버 타일이 오면 화면에서 뺀다. 바이옴 14개·색도 임시다.
- 이진 타일 해석은 아직 잇지 않았다(자리만 있다, 위 "함께 바꿔야 하는 파일").
  - 16:00 검토 반영: 통합(main `9baf2f1`)에서 이었다. 메시 워커가 `decodePlanetTile`로 푼다.
- 없는 것: 관성, 키보드 조작, 2차맵으로 들어가기(1차맵 칸 → 2차맵), 바다 밑 지형.
- 누른 칸은 그곳을 덮은 가장 고운 받은 타일의 칸이다. 고운 타일이 오는 중이면 거친 단계 칸이 나온다(칸 정보에 단계가 나온다).
- `pnpm dev:game`(Vite 개발 서버)과 개발 모드 두 번 마운트(StrictMode)는 미실행. WebGL을 못 쓰는 기기 안내(unsupported)도 화면으로는 미실행.
- 서비스 워커가 설치 때 1차맵 조각·워커도 미리 캐시한다(+69KiB, 2차맵과 같은 정책).
- 고도 과장 기본 ×6, 슬라이더 ×1~×20(엔진은 1~50을 받는다)은 보기 좋게 고른 값이다(Assumed).
- Vite가 같이 쓰는 지도 조각 500kB 초과 경고를 낸다. 지연 조각이라 그대로 둔다.

## 사용자 결정 대기
- ADR 36 확정(휴대폰 측정 뒤): 상한(타일 160·받기 6·올리기 4·64MB), 화면 오차 문턱 4px, 고도 과장 기본값, 기울기·거리 범위.
- 칸 경계가 또렷한 색(지금)과 부드럽게 섞은 색 중 무엇을 쓸지.
