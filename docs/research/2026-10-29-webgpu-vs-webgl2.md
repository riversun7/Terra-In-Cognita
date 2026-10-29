> 조사 보고서 (작성: Claude Code 서브에이전트, 2026-10-29). 패키지 코드와 공식 자료 파일을 읽고, 관리자 화면의 셰이더 측정판을 이 컨테이너에서 실행해 확인했다. 표기: **V** 확인함(Verified: 코드·자료 파일·실행) / **V\*** 공식 자료를 검색 요약으로만 확인(이 세션에서 caniuse.com이 열리지 않았고 webkit.org·developer.chrome.com 원문은 검색 요약만 받음) / **A** 추정(Assumed) / **U** 모름(Unknown). 셰이더 언어는 사용자가 휴대폰 값을 본 뒤 정하고, ADR 36(`docs/adr/2026-10-29-s2-planet-lod.md`)에 남긴다.

# 셰이더 언어: WebGL2 + GLSL과 WebGPU + TSL (S2 측정, 2026-10-29)

PLAN 5.7 "WebGPU(Three.js WebGPURenderer + TSL)는 S2 1주차에 측정해 셰이더 언어를 확정한다"를 위한 조사와 측정이다. 비교한 방식은 3개다.

| 방식 | three 코드 | 셰이더 |
|---|---|---|
| WebGL2 + GLSL | `WebGLRenderer`(`three`) | `ShaderMaterial`에 GLSL을 직접 쓴다(S1 엔진·ADR 36 계획과 같다) |
| WebGPU + TSL | `WebGPURenderer`(`three/webgpu`) | TSL 노드(`three/tsl`) → 실행 중에 WGSL로 바뀐다 |
| WebGL2 + TSL | `WebGPURenderer({ forceWebGL: true })` | 같은 TSL → GLSL로 바뀐다. WebGPU가 없는 기기가 실제로 가는 길이다 |

## 요약
- **권고: 지금은 WebGL2 + GLSL을 유지한다. 다만 가까운 판단이다.** 헤드리스에서 GPU 쪽 숫자(프레임 시간)는 세 방식이 오차 안에서 같아서, 빠르기로는 고를 수 없다. 사용자가 휴대폰 값을 보고 정한다.
- WebGL2 + GLSL이 분명히 앞서는 것(V)
  - 묶음: 같은 일을 하는 코드가 gzip 130.5KB, TSL 쪽은 241.1KB다(+110.6KB, brotli로는 +85.3KB).
  - 셰이더 준비: TSL 컴파일이 GLSL의 약 5~8배 걸렸다(헤드리스 중앙값 15~21ms 대 72~160ms).
  - 프레임당 CPU(`render()` 호출 시간): TSL이 약 2배였다(160타일 중앙값 1.1ms 대 2.2~2.7ms).
  - 성숙도: three 설명서가 `WebGPURenderer`를 "아직 실험 단계"라고 한다. `WebGLRenderer`는 "순수 WebGL 2 앱에 권하는 선택"이다.
  - 옮길 일이 없다: S1 엔진, ADR 36 렌더러 계획(`ShaderMaterial`·`onBeforeCompile`), PLAN의 지도 라벨(troika-three-text)이 그대로 돈다.
- WebGPU + TSL이 나을 수 있는 것(U, 휴대폰에서만 알 수 있다): 실제 GPU에서는 드라이버 부담이 줄어 프레임 시간이 낮을 수 있다. 컴퓨트 셰이더를 쓸 수 있다. three의 새 기능은 이쪽에만 들어간다(V: 설명서).
- 휴대폰에는 WebGPU를 못 쓰는 기기가 아직 많다: iOS 26 미만, 안드로이드 11 이하, 삼성 Xclipse GPU(엑시노스) 갤럭시 등. 이 기기에서 `WebGPURenderer`는 WebGL2 길로 바뀐다. 이 길은 헤드리스에서 `WebGLRenderer`보다 컴파일과 CPU가 느렸다.

## 1. 출처 (모두 2026-10-29에 읽거나 실행)
| 출처 | 판·날짜 | 본 것 | 표기 |
|---|---|---|---|
| three 꾸러미 코드(`node_modules/three`) | 0.186.1(2026-09-24 공개, ADR 33) | 입구, 백엔드 고르기, 어댑터 요청, 내부 그리기 반복, 재질 바꾸기, 점 크기, 장치 잃음 | V |
| three.js 설명서 `manual/pages/webgpurenderer.html` | GitHub 태그 `r186` | 대체(fallback), 옮길 때 안 되는 것, 실험 단계, WebGLRenderer 앞으로 | V |
| gpuweb 위키 "Implementation Status" | GitHub 위키 원문(받은 날 2026-10-29) | 브라우저·OS·GPU별 지원 | V |
| MDN browser-compat-data `api/GPU.json`·`api/Navigator.json` | GitHub `main`(받은 날 2026-10-29) | 브라우저 판 | V |
| caniuse-lite(저장소 `node_modules`) | 1.0.30001819(2026-10-22 자료) | WebGPU 판별 지원, 한국·미국 사용 비율 | V |
| Chrome 개발자 블로그 "What's New in WebGPU (Chrome 121)" | 검색 요약 | 안드로이드 기본 켬 조건 | V\* |
| WebKit "WebKit features in Safari 26.0" | 검색 요약(버그 보고 인용 포함) | iOS·macOS 26 기본 켬 | V\* |
| 삼성 커뮤니티 글(2025-04) | 검색 요약 | One UI 7 삼성 인터넷에서 WebGPU가 안 됨, 운영자 "다음 판에 지원 예정" | V\* |
| troika-three-text 0.52.5·0.53.0, troika-three-utils 0.53.0 | npm 꾸러미 코드 | `onBeforeCompile` 사용 여부 | V |
| 셰이더 측정판(이 작업) | Chromium 153.0.8010.12(Playwright 1.63.0), 2026-10-29 11:15~12:10 KST | 아래 5장 | V |

## 2. three 0.186.1의 WebGPURenderer·TSL (V: 꾸러미 코드, 설명서 r186)
- **입구가 다르다.** `three` → `build/three.module.js`, `three/webgpu` → `build/three.webgpu.js`, `three/tsl` → `build/three.tsl.js`. 둘 다 `build/three.core.js`를 함께 쓴다. 그래서 한 앱이 두 길을 다 가져오면 공용 조각은 두 길이 쓰는 것의 합이 된다(4장).
- **초기화는 비동기다.** `await renderer.init()`(또는 `setAnimationLoop`)가 끝나야 그린다. WebGPU 백엔드 초기화가 예외를 내면(어댑터 없음, `navigator.gpu` 없음, 장치 요청 실패) WebGL2 백엔드로 바꾼다(`Renderer.js` `_getFallback`). 이때 콘솔에 "WebGPU is not available, running under WebGL2 backend."가 남는다. `forceWebGL: true`면 처음부터 WebGL2다. 바꾸기는 초기화 때 한 번뿐이다.
- **어댑터는 `featureLevel: "compatibility"`로 요청하고 지원하는 기능을 모두 켠다.** 장치에 `core-features-and-limits`가 없으면(호환 모드) MSAA를 끈다(`renderer._samples = 0`, `WebGPUBackend.js`). 측정판은 이 값을 "핵심 기능 / 호환 모드"로 적는다.
- **내부 그리기 반복이 늘 돈다.** `init()`이 `requestAnimationFrame` 반복을 시작하고 `dispose()` 전에는 멈추지 않는다. `setAnimationLoop(null)`은 콜백만 지운다(`Animation.js`). PLAN 5.7 "화면 변화가 없으면 렌더 중지"를 지켜도 기기는 화면 주사율마다 깨어난다. 그리는 것은 아니라서 부담은 작다(A).
- **안 되는 것**(설명서): `ShaderMaterial`, `RawShaderMaterial`, `onBeforeCompile()`로 고친 기본 재질, `EffectComposer`. 노드 재질과 TSL로 다시 써야 한다.
- **기본 재질은 그대로 된다.** `MeshLambertMaterial`·`MeshBasicMaterial`·`PointsMaterial` 등은 노드 재질로 자동으로 바뀐다(`StandardNodeLibrary.js`).
- **점 크기**: WebGPU는 1px 점만 그린다. 큰 점은 `Sprite` + 인스턴싱으로 그려야 한다(`PointsNodeMaterial.js` 주석). S1 엔진의 유닛 아이콘(`gl_PointSize`)이 여기에 걸린다.
- **장치를 잃으면** 기본 동작은 오류를 남기고 표시만 한다(`_onDeviceLost`). 다시 만드는 것은 앱 몫이다. WebGL처럼 `webglcontextrestored` 뒤 자원을 다시 올려 주지 않는다.
- **TSL은 실행 중에 WGSL·GLSL로 바뀐다.** 이 시간이 컴파일 시간에 들어간다(5장).
- **설명서의 상태 문구**: "The renderer itself is still in an experimental state … depending on your application and scene setup, you will encounter missing features or a better performance with `WebGLRenderer`." `WebGLRenderer`는 "still maintained and the recommended choice for pure WebGL 2 applications"이고, 큰 새 기능은 넣을 계획이 없다. WebGLRenderer에 제한된 노드 재질을 넣는 것을 "investigating"이라고 한다.
- **지도 라벨**: troika-three-text 0.52.5(PLAN 기술표)와 최신 0.53.0(2026-07-24) 모두 troika-three-utils의 `createDerivedMaterial`을 쓰고, 이것이 `onBeforeCompile`을 쓴다. 그래서 `WebGPURenderer`에서는 이 라벨을 쓸 수 없다(V: 꾸러미 코드 + 설명서). 변경 기록에 WebGPU 언급이 없다.

## 3. 브라우저·기기별 WebGPU
| 플랫폼 | 상태 | 출처 |
|---|---|---|
| iOS·iPadOS 사파리 | 26부터 기본으로 켜짐. 18 이하는 꺼짐(17.4~18은 설정에서만 켤 수 있음) | gpuweb 위키 V, caniuse-lite V, BCD V, WebKit 글 V\* |
| 안드로이드 크롬 | 121부터: 안드로이드 12 이상 + ARM·Qualcomm·Intel GPU. Imagination GPU는 안드로이드 16 이상 + 139부터. **삼성 Xclipse GPU는 아직(TBD)**, 그 밖의 GPU도 아직 | gpuweb 위키 V, Chrome 블로그 V\* |
| 삼성 인터넷 | caniuse-lite는 24부터 "지원". BCD는 크롬 안드로이드를 그대로 따른다. GPU 조건은 크롬과 같을 것이다(A: 같은 Chromium 엔진). 2025-04 One UI 7에서 안 된다는 사용자 글이 있었다 | caniuse-lite V, BCD V, 커뮤니티 V\* |
| 네이버 웨일(사용자 휴대폰, 4.0.1.15, Chrome 138 기반 — ADR 33) | 자료 없음 | U. 측정판이 알려 준다 |
| 안드로이드 파이어폭스 | 없음(설정에서만) | gpuweb 위키 V, BCD V |
| 데스크톱 | 크롬·엣지 113+(윈도·맥·크롬OS), 리눅스는 크롬 144+(Intel Gen12 이상 GPU 등), 맥 사파리 26+, 파이어폭스 141+(윈도)·145+(Apple 실리콘 맥) | gpuweb 위키 V, BCD V |

- 한국 사용 비율(caniuse-lite 1.0.30001819 지역 자료, caniuse가 아는 사용의 88.50% 안에서, V)
  - 크롬(데스크톱) 32.26%(그중 98.7%가 지원 판), 크롬 안드로이드 18.00%(caniuse-lite는 최신 판 156만 적고 "지원"), iOS 사파리 15.87%(그중 76.7%가 26 이상, 18.5~18.7이 2.15%), 엣지 9.43%, 삼성 인터넷 9.21%(30이 8.89%), 맥 사파리 2.20%(부분 지원).
  - 지원 판 합계 80.95%(62.95% + 크롬 안드로이드 18.00%), 부분 지원 2.35%.
  - 이 표는 **브라우저 판**만 본다. 안드로이드는 OS·GPU 조건이 더 있어 실제로 WebGPU가 되는 비율은 더 낮다(U: 한국 기기의 GPU 비율 자료가 없다).
- 한국 갤럭시 중 Xclipse GPU 기종(A: 출시 자료 기억, 이번에 확인하지 않음): 갤럭시 S24·S24+ 국내판(엑시노스 2400), A55(엑시노스 1480), A56(엑시노스 1580), Z 플립7(엑시노스 2500). PLAN 11장의 기준 기기 "출시 3년 안의 중가 안드로이드"에 A5x가 들어갈 수 있다. 이 기기는 지금 WebGPU가 꺼져 있어 WebGL2 길로 간다(gpuweb 위키 "TBD").
- PWA ADR 지원 하한(iOS 16.4, 삼성 인터넷 22+, 크롬 111+)에서는 WebGPU가 "기능 확인 뒤에만 쓰는 기능"이다. 어느 쪽을 고르든 WebGL2 길은 남는다.

## 4. 묶음 크기 (V: 빌드, gzip 9단계·brotli 11단계는 직접 압축)
같은 일감 코드를 길마다 따로 묶었다(저장소 밖 분석 빌드, Vite 8.3.5, 대상 `baseline-widely-available`).

| 길 | 원본 | gzip | brotli |
|---|---|---|---|
| WebGL2 + GLSL(`three` + 측정 코드) | 527.66KB | 130.50KB | 107.04KB |
| WebGPU/WebGL2 + TSL(`three/webgpu` + `three/tsl` + 측정 코드) | 890.68KB | 241.05KB | 192.37KB |
| 차이 | +363.02KB | +110.55KB | +85.33KB |

- TSL 길은 기기마다 WebGPU·WebGL2 백엔드를 **둘 다** 받는다(한 조각). WebGPU가 없는 기기도 이 크기를 받는다.
- 앱 빌드에서 측정판의 영향(`pnpm build`, Vite가 보이는 gzip)
  - 첫 화면 JS: 368.36KB → 368.17KB(gzip 114.85 → 114.04KB). 측정 코드·three는 없다(V: 조각 내용 검색). rolldown이 공용 조각을 `useMountFocus`에서 `src`로 다시 나눴다. 관리자 조각이 성능 보고 코드(`telemetry/reporter.ts`)를 가져와서다.
  - 관리자 조각: 6.64KB → 22.72KB(gzip 2.72 → 8.16KB). CSS 1.91 → 5.57KB.
  - 측정판 조각(누를 때만 받음): 실행기 12.23KB, 장면 2.21KB, GLSL 2.51KB, TSL 687.91KB(gzip 192.32KB). 서비스 워커 미리 캐시에서 뺐다(`check-pwa`가 막는다).
  - **2차맵 화면이 커졌다**: 585.37KB(gzip 151.67KB) 한 조각 → `SecondaryMapScreen` 50.85 + `three.core` 215.43 + `three.module` 352.33 = 618.61KB(gzip 159.56KB). TSL 길을 뺀 실험 빌드는 586.49KB(gzip 152.05KB)였다. 즉 TSL 길이 같은 빌드에 있어서 2차맵이 +32KB(gzip +7.5KB) 더 받는다(V: 실험). 측정판을 지우면 사라진다.
- 전송: 앱 서버는 정적 JS를 압축하지 않는다(V: 서버 코드). NAS 역방향 프록시(DSM)가 압축하는지는 U다. 측정판의 "JS KB(전송/원본)" 열이 휴대폰에서 알려 준다. GLSL 길의 three 파일은 서비스 워커 미리 캐시에서 오므로 전송 = 원본으로 보일 수 있다(A). TSL 조각은 미리 캐시에 없어 처음에는 네트워크에서 받는다.

## 5. 헤드리스 측정 (휴대폰 값이 아니다)
### 조건 (V)
- 기기: 이 컨테이너(4 vCPU 공유), Chromium 153.0.8010.12(Playwright 1.63.0), 빌드한 앱·서버(`NODE_ENV=` 비움), 가짜 관리자 계정.
- 화면: 390×844, 기기 픽셀 3 → 픽셀 비율 상한 1.5(엔진과 같은 규칙) → 그리기 585×1266, MSAA 4.
- 일감(행성 LOD 모양): 33×33 정점 타일(치마 포함 정점 1,221개·삼각형 2,304개, 인덱스는 모든 타일이 함께 씀) 40·160·320개 + 바다 구(96×48). 정점마다 색, 빛은 셰이더에서(주변광 0.32 + 확산 0.78). 타일 원점은 메시 위치(카메라 기준 좌표와 같은 꼴), 화면 밖 자르기는 껐다. 카메라는 12초에 한 바퀴 돌며 반지름의 1.75~4.25배로 오간다. 몸풀기 1초 + 재기 6초.
- 그리기 수는 세 방식 모두 41·161·321번, 삼각형 101k·378k·746k개로 같다.
- **헤드리스 WebGPU는 쓸 수 없었다.**
  - 기본: `navigator.gpu`는 있지만 어댑터가 없다 → three가 WebGL2로 바꿨다(측정판 "WebGL2로 바뀜", 뒤 WebGPU 측정은 "건너뜀").
  - `--enable-unsafe-webgpu`: 어댑터(google / swiftshader)는 생기지만 캔버스에 아무것도 안 나오고, 완료 알림이 모두 "A valid external Instance reference no longer exists."로 실패했다. fps는 가짜 60이다. 측정판은 이 경우를 "실패"로 적는다(완료 알림 실패 ×359~362).
  - 화면 있는 Chromium(Xvfb) + `--enable-unsafe-webgpu --enable-features=Vulkan --use-vulkan=swiftshader --use-webgpu-adapter=swiftshader --use-angle=swiftshader`: 둘 다 같은 소프트웨어 GPU(SwiftShader, Vulkan)로 그려진다. 아래 숫자는 이 조건이다.
- 측정판이 한 페이지에서 방식을 차례로 재므로 JS 힙에는 앞 방식의 코드가 남아 있다. 힙은 비교하지 않는다.

### 결과 (중앙값, 괄호는 최소~최대, 4번 실행: 11:43·11:45·11:48·11:50 KST 시작, 같은 빌드)
| 방식 | 타일 | 초기화 ms | 컴파일 ms | 준비 합계 ms | fps | 프레임 p95 ms | CPU p50 ms | CPU p95 ms | GPU 완료/초 |
|---|---|---|---|---|---|---|---|---|---|
| WebGL2 + GLSL | 40 | 45 (41~48) | 15.1 (14.8~16.2) | 158 (148~176) | 9.8 (7.7~10.6) | 158 (133~183) | 0.4 (0.4~0.4) | 1.6 (1.2~2.4) | 9.6 (7.4~10.3) |
| WebGPU + TSL | 40 | 8.6 (7.4~11.4) | 72 (66~81) | 162 (152~165) | 8.6 (5.4~9.0) | 250 (233~450) | 0.8 (0.8~1.0) | 3.0 (1.3~6.6) | 8.3 (5.0~8.7) |
| WebGL2 + TSL | 40 | 26 (22~34) | 75 (53~96) | 122 (87~134) | 9.5 (7.4~11.6) | 175 (117~200) | 0.9 (0.8~1.2) | 3.4 (1.4~4.1) | 9.2 (7.1~11.3) |
| WebGL2 + GLSL | 160 | 30 (28~39) | 17 (14~24) | 142 (118~415) | 3.2 (2.1~4.3) | 508 (367~1017) | 1.1 (0.9~1.2) | 3.4 (2.3~4.5) | 2.9 (1.8~3.9) |
| WebGPU + TSL | 160 | 10.2 (5.3~15.9) | 82 (75~101) | 99 (91~134) | 2.1 (1.6~3.5) | 900 (400~1283) | 2.7 (2.4~4.6) | 7.9 (4.1~8.1) | 1.8 (1.4~3.2) |
| WebGL2 + TSL | 160 | 23 (14~39) | 110 (96~137) | 154 (123~228) | 3.0 (1.9~3.7) | 550 (350~1033) | 2.2 (2.0~3.7) | 8.1 (4.8~16.1) | 2.6 (1.6~3.4) |
| WebGL2 + GLSL | 320 | 31 (27~40) | 21 (19~38) | 173 (135~294) | 1.1 (1.0~1.9) | 1234 (1100~2717) | 3.0 (2.3~3.3) | 5.1 (3.9~6.4) | 0.9 (0.7~1.6) |
| WebGPU + TSL | 320 | 10.4 (7.2~17.7) | 134 (130~205) | 166 (144~235) | 1.1 (0.5~1.7) | 1442 (783~3033) | 5.9 (3.8~8.9) | 12 (6~20) | 0.9 (0.3~1.4) |
| WebGL2 + TSL | 320 | 25 (21~36) | 160 (118~248) | 206 (158~410) | 1.6 (0.9~1.8) | 1066 (817~1983) | 4.7 (4.2~5.2) | 10.1 (6.8~17.2) | 1.3 (0.6~1.5) |

- 준비 합계 = 받기 + 초기화 + 장면 + 컴파일 + 첫 프레임. 40타일 줄만 받기(처음 받는 시간, 같은 기기 서버 36~73ms)가 들어 있다.
- 4번 중 2번은 재는 동안 사진을 찍지 않았다(사진은 화면을 읽어 와 프레임을 흔든다). 사진을 찍은 2번과 뚜렷한 차이는 없었다.

### 읽는 법
- **GPU 쪽은 판단할 수 없다.** 모든 방식에서 GPU 완료/초 ≈ fps다. 즉 소프트웨어 GPU가 병목이고, 두 API가 같은 래스터라이저(SwiftShader)를 쓴다. 같은 방식도 실행마다 fps가 약 2배까지 흔들렸고, 순위가 실행마다 바뀌었다(160·320타일). 실제 GPU에서 WebGPU가 나은지는 휴대폰에서만 알 수 있다(U).
- **CPU는 TSL이 약 2배다.** `render()` 시간 중앙값이 160타일 1.1ms 대 2.2~2.7ms, 320타일 3.0ms 대 4.7~5.9ms다. 그리는 물체마다 드는 JS 일이 노드 체계에서 더 많다(A). 휴대폰 JS가 이 컨테이너보다 몇 배 느리면 160타일에서 몇 ms 차이가 되고, 120Hz 휴대폰(프레임 8.3ms)에서는 의미가 있다(A).
- **컴파일은 TSL이 약 5~8배다.** 그래도 준비 합계는 세 방식이 100~200ms대로 비슷했다. GLSL은 첫 그리기에 버퍼 올리기가 들어가고(41~343ms), TSL은 그것이 컴파일 안에 들어가는 것으로 보인다(A). 이 SwiftShader에는 `KHR_parallel_shader_compile`이 없어 GLSL 병렬 컴파일은 재지 못했다(V: 콘솔 경고).
- **초기화는 WebGPU가 빠르다**(5~18ms 대 WebGL2 14~48ms). 한 번뿐이라 차이가 작다.

## 6. 휴대폰에서 잴 것
측정판은 관리자 화면에 있다. 결과를 복사해 개발 대화에 붙이면 된다(9장). 기기마다 2번 이상 잰다(헤드리스에서 실행마다 크게 흔들렸다).
1. **사용자 휴대폰(웨일)**: 세 방식 모두. 요약 글의 "WebGPU:" 줄(어댑터 유무·이름·호환 모드)과 "WebGL GPU:" 줄(GPU 이름)을 본다. 같은 휴대폰의 크롬·삼성 인터넷에서도 1번씩(브라우저마다 WebGPU가 다를 수 있다).
2. **중가 안드로이드**(PLAN 11장 기준 기기): 가능하면 Xclipse 갤럭시 1대와 Snapdragon 1대. Xclipse면 "WebGL2로 바뀜"이 나올 것이다(A). 그때는 WebGL2 + TSL 줄이 그 기기의 실제 길이다.
3. **아이폰**(iOS 26 이상 1대, 있으면 iOS 18 1대): 사파리와 홈 화면 앱 둘 다.
4. 볼 숫자(160타일이 ADR 36의 "보이는 타일 160개" 상한이다)
   - 프레임 p95(통과 기준 33ms 이하)와 50ms 넘는 프레임 수
   - CPU p50·p95(`render()` 시간): TSL이 2배라는 헤드리스 결과가 휴대폰에서도 같은지
   - GPU p50·p95와 GPU 완료/초: fps보다 낮으면 GPU 병목이다. 여기서 WebGPU가 낮으면 WebGPU의 이점이다
   - 컴파일·준비 합계(첫 표시 3초 기준의 일부)
   - JS KB(전송/원본): NAS 프록시가 압축하는지
5. 조건: 저전력 모드 끔(iOS는 30fps로 묶인다, PLAN 11장), 충전기 뺌, 화면 세로, 밝기 같게. 6초씩이라 발열로 느려지는 것은 못 본다. 20분 연속은 S2 렌더러로 따로 잰다(ADR 36 측정).
6. 메모리를 비교하려면 방식 하나만 고르고, 새로고침 뒤 따로 잰다.

## 7. 권고와 맞바꿈
### 선택지 1: WebGL2 + GLSL 유지 (권고)
- 장점(V): 묶음 gzip 약 111KB 작다. 컴파일 5~8배 빠르고 CPU 약 절반(헤드리스). 모든 기기가 같은 길이다(iOS 16.4~18, Xclipse 갤럭시 포함) → 시험·디버깅이 한 길이다. S1 엔진·ADR 36 렌더러·troika 라벨을 그대로 쓴다. three가 계속 관리한다.
- 단점: three의 큰 새 기능은 `WebGPURenderer`에만 들어간다(V: 설명서). 컴퓨트 셰이더가 없다. 나중에 옮기면 그때는 셰이더가 더 많아 비용이 커진다(A).
### 선택지 2: WebGPU + TSL (`WebGPURenderer`, WebGPU 없으면 WebGL2 백엔드)
- 장점: 실제 GPU에서 더 빠를 수 있다(U). 셰이더를 TSL로 한 번 쓰면 두 백엔드에서 돈다(V). 컴퓨트·새 후처리를 쓸 수 있다(V: 설명서). 초기화가 빠르다(V, 작은 차이).
- 단점(V 헤드리스·코드): 2차맵·1차맵 화면이 gzip 약 +111KB(첫 진입 3초 기준에 부담, 4G에서 대략 0.1초 + 해석 시간, A). 실험 단계(설명서). troika 라벨을 못 쓴다 → 지도 라벨을 다른 방법으로 다시 정해야 한다. 내부 그리기 반복이 늘 돈다. WebGPU가 없는 기기(4장·3장)는 WebGL2 백엔드로 가는데, 이 길은 `WebGLRenderer`보다 컴파일·CPU가 느렸다. 두 백엔드를 모두 시험해야 한다.
### 선택지 3: 기기에 따라 두 렌더러를 나눠 쓰기
- 권하지 않는다. "렌더러는 앱에 하나"(PLAN 5.7, ADR 36)를 어기고, 셰이더를 두 벌(GLSL·TSL) 관리해야 한다.
### 다시 볼 때
- 휴대폰(WebGPU가 되는 기기)에서 160타일 프레임 p95와 CPU p95가 둘 다 WebGPU + TSL이 확실히 낮을 때(예: 20% 이상, A: 제안 값). 이 경우는 사용자가 정할 일이다.
- 기획에 GPU 계산(컴퓨트)이 꼭 필요한 기능이 생길 때.
- three가 `WebGLRenderer`에 노드 재질을 넣어 옮기는 비용이 줄 때(설명서 "investigating").
- 셰이더가 적은 지금이 옮기기에 가장 싸다. 바꿀 거라면 S2 렌더러가 커지기 전에 정하는 편이 낫다(A).

## 8. WebGPU를 고르면 옮길 것 (S1 엔진 + S2 렌더러, 렌더러 하나)
S1 엔진(`packages/engine/src`, 약 3,000줄)에서 WebGL에 묶인 곳은 4파일이다(V: 코드 읽음).
1. `render/sharedRenderer.ts`: `WebGLRenderer` → `WebGPURenderer`. 빌리기가 비동기(`init()`)가 된다. 컨텍스트 잃음 검사(`getContext().isContextLost()`)와 `forceContextLoss()`를 장치 잃음 처리로 바꾼다.
2. `secondMapEngine.ts`: `webglcontextlost`·`webglcontextrestored` 대신 `onDeviceLost`. three가 자동으로 되살리지 않으므로 렌더러와 화면 자원을 다시 만든다. `renderer.info.render.calls`의 뜻이 다르다(WebGPU에서는 render 호출 수다. 그리기 수는 `drawCalls`).
3. `units/unitMaterials.ts`: GLSL `ShaderMaterial` 2개(화면 px 굵기 외곽선, `gl_PointSize` 점) → TSL 노드 재질.
4. `units/unitView.ts`: 아이콘 `Points`의 크기 → WebGPU는 1px 점만 그리므로 `Sprite` + 인스턴싱으로 구조를 바꾼다.
- 그 밖: 건물(`MeshLambertMaterial`)은 자동으로 바뀐다(V). ADR 36 렌더러(다른 에이전트가 만드는 중)의 `ShaderMaterial`·`onBeforeCompile`도 TSL로 바꾼다. 지도 라벨(troika) 대안을 정한다. 엔진 시험과 Playwright 화면 시험을 두 백엔드로 돌린다.
- 규모(A): 파일 몇 개와 라벨 대안이라 며칠 단위다. 셰이더가 늘수록 커진다.

## 9. 측정판 쓰는 법 (휴대폰)
1. 이 작업을 main에 합쳐 NAS에 배포한다(메인 세션).
2. 관리자 계정으로 로그인 → 계정 줄 [관리자] → 아래 "셰이더 측정 (S2)".
3. 잴 방식을 고른다(기본 3개 모두) → [측정 시작]. 그때 측정 코드를 받고, 약 1~2분 동안 화면 전체를 덮어 그린다. [멈춤]이나 앱 전환으로 멈춘다.
4. 끝나면 결과 표와 요약 글이 나온다. 요약 글 아래 [복사] → 개발 대화에 붙여 넣는다. 복사가 막히면 글이 골라진 채로 남으니 길게 눌러 복사한다. 결과는 서버로 보내지 않는다. 재는 동안의 기기 성능 보고에는 쪽 이름 뒤에 `#gpu-bench`가 붙는다(다른 화면 수치와 섞이지 않게).
