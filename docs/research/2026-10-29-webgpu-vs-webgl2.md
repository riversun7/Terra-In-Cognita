> 조사 보고서 (작성: Claude Code 서브에이전트, 2026-10-29. 같은 날 리뷰를 반영해 측정판을 고치고 다시 쟀다). 패키지 코드와 공식 자료 파일을 읽고, 관리자 화면의 셰이더 측정판을 이 컨테이너에서 실행해 확인했다. 표기: **V** 확인함(Verified: 코드·자료 파일·실행) / **V\*** 공식 자료를 검색 결과의 주소·요약으로만 확인(이 세션에서 developer.chrome.com·webkit.org·caniuse.com이 막혀 원문을 읽지 못했다) / **A** 추정(Assumed) / **U** 모름(Unknown). 셰이더 언어는 사용자가 휴대폰 값을 본 뒤 정하고, ADR 36(`docs/adr/2026-10-29-s2-planet-lod.md`)에 남긴다.

# 셰이더 언어: WebGL2 + GLSL과 WebGPU + TSL (S2 측정, 2026-10-29)

PLAN 5.7 "WebGPU(Three.js WebGPURenderer + TSL)는 S2 1주차에 측정해 셰이더 언어를 확정한다"를 위한 조사와 측정이다. 비교한 방식은 3개다.

| 방식 | three 코드 | 셰이더 |
|---|---|---|
| WebGL2 + GLSL | `WebGLRenderer`(`three`) | `ShaderMaterial`에 GLSL을 직접 쓴다(S1 엔진·ADR 36 계획과 같다) |
| WebGPU + TSL | `WebGPURenderer`(`three/webgpu`) | TSL 노드(`three/tsl`) → 실행 중에 WGSL로 바뀐다 |
| WebGL2 + TSL | `WebGPURenderer({ forceWebGL: true })` | 같은 TSL → GLSL로 바뀐다. WebGPU가 없는 기기가 실제로 가는 길이다 |

## 요약
- **권고: 지금은 WebGL2 + GLSL을 유지한다.** 헤드리스 숫자로는 이쪽이 더 분명해졌다(프레임당 CPU). 다만 GPU 쪽은 휴대폰에서만 알 수 있어서, 휴대폰 값이 나오기 전까지는 가까운 판단으로 둔다. 사용자가 휴대폰 값을 보고 정한다.
- WebGL2 + GLSL이 앞서는 것(V)
  - 묶음: 같은 일을 하는 코드가 gzip 130.5KB, TSL 쪽은 241.1KB다(+110.6KB, brotli로는 +85.3KB).
  - 프레임당 CPU(`render()` 호출 시간): TSL이 약 2.5~3배다(160타일 중앙값 1.2ms 대 2.9~3.1ms, 320타일 2.2ms 대 6.3~6.6ms). TSL 두 방식도 카메라 기준 좌표 규칙(모델뷰를 CPU에서 64비트로)을 지킨 조건이다.
  - 성숙도: three 설명서가 `WebGPURenderer`를 "아직 실험 단계"라고 한다. `WebGLRenderer`는 "순수 WebGL 2 앱에 권하는 선택"이다.
  - 옮길 일이 없다: S1 엔진(`InstancedMesh` 포함), ADR 36 렌더러 계획(`ShaderMaterial`·`onBeforeCompile`), PLAN의 지도 라벨(troika-three-text)이 그대로 돈다. 카메라 기준 좌표도 기본으로 된다.
- 비슷한 것(V, 헤드리스): 셰이더 준비(컴파일 + 첫 그리기 중앙값 65~169ms, 순위가 타일 수마다 바뀐다). GPU 쪽(소프트웨어 GPU가 병목이라 고를 수 없다).
- WebGPU + TSL이 나을 수 있는 것(U, 휴대폰에서만 알 수 있다): 실제 GPU에서는 드라이버 부담이 줄어 프레임 시간이 낮을 수 있다. 컴퓨트 셰이더를 쓸 수 있다. three의 새 기능은 이쪽에만 들어간다(V: 설명서).
- 휴대폰에는 WebGPU를 못 쓰는 기기가 아직 많다: iOS 26 미만, 안드로이드 11 이하, 삼성 Xclipse GPU(엑시노스) 갤럭시 등. 이 기기에서 `WebGPURenderer`는 WebGL2 길로 바뀐다. 이 길도 헤드리스에서 CPU가 약 2.5~3배였다.

### 앞 판에서 바로잡은 것 (리뷰 반영, 2026-10-29)
- "TSL 컴파일이 GLSL의 약 5~8배"는 틀렸다. three가 일을 렌더러마다 다른 단계에 두어서 생긴 차이였다(2장). 같은 일을 재게 고치자 세 방식이 비슷했다.
- TSL 두 방식은 모델뷰를 셰이더(GPU 32비트)에서 곱하고 있었다(ADR 36 위반). `highPrecision`을 켜고 다시 쟀다. CPU 차이가 약 2배에서 2.5~3배로 커졌다.
- GPU 지연(p50·p95)을 API끼리 비교할 수 없는 방법으로 재고 있었다(WebGL2만 프레임 단위로 올라감). 두 API를 같은 방법으로 재게 고쳤고, API끼리는 GPU 완료/초로 비교한다.
- "초기화는 WebGPU가 빠르다(V)"는 순서·데움에 따른 값이라 근거가 못 된다(5장).
- 측정판이 모든 사용자에게 주는 비용을 적게 셌다. 서비스 워커를 설치할 때 모두가 약 +52.7KiB를 더 받는다(4장).
- 준비 합계에서 코드 받기를 뺐다. 조각마다 처음 쓴 줄만 받고, 두 TSL 방식은 같은 조각이다.

## 1. 출처 (모두 2026-10-29에 읽거나 실행)
| 출처 | 주소 | 판·날짜 | 본 것 | 표기 |
|---|---|---|---|---|
| three 꾸러미 코드(`node_modules/three`) | https://www.npmjs.com/package/three/v/0.186.1 | 0.186.1(2026-09-24 공개, ADR 33). 2026-10-29에 읽음 | 입구, 백엔드 고르기, 어댑터 요청, 내부 그리기 반복, 재질 바꾸기, 점 크기, 장치 잃음, 모델뷰 정밀도(`ModelNode.js`, `Renderer.js` `highPrecision`), 컴파일 단계(`WebGLRenderer.js`·`WebGLProgram.js`·`WebGLBackend.js`·`Renderer.js` `compileAsync`·`utils.js` `yieldToMain`) | V |
| three.js 설명서 `manual/pages/webgpurenderer.html` | https://github.com/mrdoob/three.js/blob/r186/manual/pages/webgpurenderer.html | 태그 `r186`(커밋 48dd7be). 2026-10-29에 받음 | 대체(fallback), 옮길 때 안 되는 것, 실험 단계, WebGLRenderer 앞으로 | V |
| gpuweb 위키 "Implementation Status" | https://github.com/gpuweb/gpuweb/wiki/Implementation-Status | 이 쪽의 마지막 수정 2026-10-02(위키 커밋 6e41fe1). 위키 저장소 `gpuweb.wiki.git` 703e9fb(2026-10-27)를 2026-10-29에 받아 읽음(웹 쪽은 이 세션 프록시에서 403) | 브라우저·OS·GPU별 지원 | V |
| MDN browser-compat-data `api/GPU.json`·`api/Navigator.json` | https://github.com/mdn/browser-compat-data/blob/main/api/GPU.json | `main` 커밋 09b6855(2026-10-28 22:20 UTC). 2026-10-29에 받음 | 브라우저 판 | V |
| MDN browser-compat-data `api/Scheduler.json` | https://github.com/mdn/browser-compat-data/blob/main/api/Scheduler.json | 같은 커밋 | `scheduler.yield`: 크롬 129+, 파이어폭스 142+, 사파리 없음(iOS 사파리 같음) | V |
| caniuse-lite(저장소 `node_modules`) | https://www.npmjs.com/package/caniuse-lite/v/1.0.30001819 | 1.0.30001819(2026-10-22 자료) | WebGPU 판별 지원, 한국·미국 사용 비율 | V |
| Chrome 개발자 블로그 "What's New in WebGPU (Chrome 121)" | https://developer.chrome.com/blog/new-in-webgpu-121 | 공개일 U(사이트가 막혀 못 봄). Chrome 121은 2024년 1월 판(A) | 안드로이드 기본 켬 조건(안드로이드 12 이상, Qualcomm·ARM GPU) | V\* |
| WebKit "WebKit features in Safari 26.0" | https://webkit.org/blog/17333/webkit-features-in-safari-26-0/ | 공개일 U(사이트가 막혀 못 봄). Safari 26.0은 2025년 9월 판(A). WebKit 버그 https://bugs.webkit.org/show_bug.cgi?id=299237 이 이 글을 인용 | iOS·iPadOS·macOS·visionOS 26에서 WebGPU 출시 | V\* |
| 삼성 커뮤니티 "삼성 브라우저에서 WebGPU가 작동하지 않습니다" | https://r1.community.samsung.com/t5/%EA%B0%A4%EB%9F%AD%EC%8B%9C-s/%EC%82%BC%EC%84%B1-%EB%B8%8C%EB%9D%BC%EC%9A%B0%EC%A0%80%EC%97%90%EC%84%9C-webgpu%EA%B0%80-%EC%9E%91%EB%8F%99%ED%95%98%EC%A7%80-%EC%95%8A%EC%8A%B5%EB%8B%88%EB%8B%A4/td-p/32766309 | 2025-04 글 | One UI 7 삼성 인터넷에서 안 됨, 운영자 "다음 판에 지원 예정" | V\* |
| 미코(meeco.kr) 사용자 글 | https://meeco.kr/mini/41460717 | 2026년 글(쪽·날짜 U) | 엑시노스 2400 S24+(One UI 8.5)에서 WebGPU 예제가 안 되고, 스냅드래곤 S24 Ultra는 됨 | V\* |
| troika-three-text 0.52.5·0.53.0, troika-three-utils 0.53.0 | https://www.npmjs.com/package/troika-three-text · https://www.npmjs.com/package/troika-three-utils | 0.53.0은 2026-07-24 | `onBeforeCompile` 사용 여부(꾸러미 코드) | V |
| 셰이더 측정판(이 작업) | `apps/game/src/admin/gpuBench/` | Chromium 153.0.8010.12(Playwright 1.63.0). 고친 뒤 2026-10-29 14:29~14:49 KST | 5장(셰이더 글 확인 포함) | V |

## 2. three 0.186.1의 WebGPURenderer·TSL (V: 꾸러미 코드, 설명서 r186)
- **입구가 다르다.** `three` → `build/three.module.js`, `three/webgpu` → `build/three.webgpu.js`, `three/tsl` → `build/three.tsl.js`. 둘 다 `build/three.core.js`를 함께 쓴다. 그래서 한 앱이 두 길을 다 가져오면 공용 조각은 두 길이 쓰는 것의 합이 된다(4장).
- **초기화는 비동기다.** `await renderer.init()`(또는 `setAnimationLoop`)가 끝나야 그린다. WebGPU 백엔드 초기화가 예외를 내면(어댑터 없음, `navigator.gpu` 없음, 장치 요청 실패) WebGL2 백엔드로 바꾼다(`Renderer.js` `_getFallback`). 이때 콘솔에 "WebGPU is not available, running under WebGL2 backend."가 남는다. `forceWebGL: true`면 처음부터 WebGL2다. 바꾸기는 초기화 때 한 번뿐이다.
- **어댑터는 `featureLevel: "compatibility"`로 요청하고 지원하는 기능을 모두 켠다.** 장치에 `core-features-and-limits`가 없으면(호환 모드) MSAA를 끈다(`renderer._samples = 0`, `WebGPUBackend.js`). 측정판은 이 값을 "핵심 기능 / 호환 모드"로 적고, MSAA가 꺼진 줄에 `no_msaa`를 붙인다.
- **카메라 기준 좌표(모델뷰를 CPU에서 64비트로)는 따로 켜야 한다.** 기본 TSL은 `modelViewMatrix = cameraViewMatrix × modelWorldMatrix`를 셰이더에서 곱한다(GPU 32비트, `ModelNode.js` `mediumpModelViewMatrix`, `NodeMaterial.js` `setupPositionView`). `WebGLRenderer`는 늘 CPU에서 곱한다.
  - `renderer.highPrecision = true`: 물체마다 CPU에서 곱해 uniform으로 넘긴다(`highpModelViewMatrix`·`highpModelNormalViewMatrix`). 렌더러 전체 설정이다.
  - 재질 하나에만 켜는 길도 있다: `material.contextNode = context({ modelViewMatrix: highpModelViewMatrix, modelNormalViewMatrix: highpModelNormalViewMatrix })`(`NodeBuilder.js` `prebuild`가 재질 문맥을 합친다).
  - 세 경우의 셰이더 글을 만들어 확인했다(V: 실행, WGSL·GLSL 둘 다). 기본은 `modelViewMatrix = ( cameraViewMatrix * nodeUniform5 )`, 전역·재질 설정은 둘 다 `highpModelViewMatrix = object.nodeUniform4; modelViewMatrix = highpModelViewMatrix;`다.
  - **전역 설정은 `InstancedMesh`·`SkinnedMesh`와 함께 쓸 수 없다**(`Renderer.js` 설명: "64-bit precision is not compatible with `InstancedMesh` and `SkinnedMesh`"). S1 엔진은 `InstancedMesh`를 쓴다(`packages/engine/src/units/unitView.ts`, `buildings/buildingView.ts`). 렌더러가 하나라서 WebGPU로 가면 타일 재질에만 켜는 길을 써야 한다(8장).
  - 측정판은 전역 설정을 켠다(측정 장면에는 `InstancedMesh`가 없다). 앞 판은 켜지 않아 TSL 두 방식이 ADR 36 규칙을 어긴 채 쟀다.
- **"컴파일"에 드는 일이 렌더러마다 다르다.** 그래서 컴파일 칸만으로는 비교할 수 없다.
  - `WebGLRenderer.compileAsync`: `KHR_parallel_shader_compile`이 없으면 10ms 타이머 뒤 "준비됨"으로 풀린다. 링크 확인(`LINK_STATUS`)과 uniform·속성 위치 읽기는 첫 그리기에서 멈춰 기다린다(`WebGLProgram.js` `isReady`·`onFirstUse`). 확장이 있으면 10ms마다 완료를 묻는다. 지오메트리 버퍼는 첫 `render()`에서 올린다.
  - `WebGPURenderer.compileAsync`: 물체마다 노드를 짓고, 지오메트리 버퍼를 올리고(`_geometries.updateForRender`), 파이프라인을 기다린다. WebGL2 백엔드는 링크 확인까지 여기서 끝낸다(`WebGLBackend.js` `_completeCompile`. 확장이 있으면 프레임마다 묻는다).
  - 측정판은 WebGL에서도 링크 확인을 컴파일 단계에서 끝내고(`renderer.info.programs`의 `getUniforms()`), 조사는 "컴파일 + 첫 그리기"로 비교한다(5장).
- **`WebGPURenderer.compileAsync`는 물체마다 한 번 쉬어 간다**(`utils.js` `yieldToMain`): `scheduler.yield()`가 있으면 그것, 없으면 `requestAnimationFrame`이다. 사파리에는 `scheduler.yield`가 없다(BCD). 그래서 사파리에서 물체 N개를 한 번에 `compileAsync`하면 N프레임 넘게 걸린다(A: 코드로 계산, 아이폰에서 재지 않음). 측정판은 재질마다 물체 하나(첫 타일 + 바다)만 `compileAsync`하고 나머지 타일은 그 뒤 넣는다. 모든 타일이 같은 프로그램·파이프라인을 쓴다(three 캐시 키에 물체 번호가 없다, `RenderObject.js`).
- **내부 그리기 반복이 늘 돈다.** `init()`이 `requestAnimationFrame` 반복을 시작하고 `dispose()` 전에는 멈추지 않는다. `setAnimationLoop(null)`은 콜백만 지운다(`Animation.js`). PLAN 5.7 "화면 변화가 없으면 렌더 중지"를 지켜도 기기는 화면 주사율마다 깨어난다. 그리는 것은 아니라서 부담은 작다(A). 그래서 초기화가 늦게 끝난 렌더러도 꼭 버려야 한다(측정판은 시간 상한·[멈춤] 뒤 늦게 생긴 렌더러를 버린다).
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
- 한국 갤럭시 중 Xclipse GPU 기종(A: 출시 자료 기억, 이번에 확인하지 않음): 갤럭시 S24·S24+ 국내판(엑시노스 2400), A55(엑시노스 1480), A56(엑시노스 1580), Z 플립7(엑시노스 2500). PLAN 11장의 기준 기기 "출시 3년 안의 중가 안드로이드"에 A5x가 들어갈 수 있다. 이 기기는 지금 WebGPU가 꺼져 있어 WebGL2 길로 간다(gpuweb 위키 "TBD"). 2026년 미코 사용자 글(엑시노스 2400 S24+는 안 되고 스냅드래곤 S24 Ultra는 됨)도 이와 맞는다(V\*).
- PWA ADR 지원 하한(iOS 16.4, 삼성 인터넷 22+, 크롬 111+)에서는 WebGPU가 "기능 확인 뒤에만 쓰는 기능"이다. 어느 쪽을 고르든 WebGL2 길은 남는다.

## 4. 묶음 크기 (V: 빌드, gzip 9단계·brotli 11단계는 직접 압축)
같은 일감 코드를 길마다 따로 묶었다(저장소 밖 분석 빌드, Vite 8.3.5, 대상 `baseline-widely-available`).

| 길 | 원본 | gzip | brotli |
|---|---|---|---|
| WebGL2 + GLSL(`three` + 측정 코드) | 527.66KB | 130.50KB | 107.04KB |
| WebGPU/WebGL2 + TSL(`three/webgpu` + `three/tsl` + 측정 코드) | 890.68KB | 241.05KB | 192.37KB |
| 차이 | +363.02KB | +110.55KB | +85.33KB |

- TSL 길은 기기마다 WebGPU·WebGL2 백엔드를 **둘 다** 받는다(한 조각). WebGPU가 없는 기기도 이 크기를 받는다.
- 앱 빌드에서 측정판의 영향(`pnpm build`, Vite가 보이는 gzip, 고친 뒤 다시 빌드해 확인)
  - 첫 화면 JS: 368.36KB → 368.18KB(368,176B = `index` + `json` + `src`). 측정 코드·three는 없다(V: 조각 내용 검색). rolldown이 공용 조각을 `useMountFocus`에서 `src`로 다시 나눴다(관리자 조각이 성능 보고 코드 `telemetry/reporter.ts`를 가져와서).
  - **서비스 워커 미리 캐시는 모든 사용자가 설치·갱신할 때 받는다.** main(1c566bf) 24개 1,035.94KiB → 이 가지 26개 1,088.62KiB(+52.7KiB, V: 빌드 출력). 2차맵을 열지 않는 사용자도 받는다. 앞 판은 "2차맵 화면이 더 받는다"고만 적어 받는 사람을 적게 셌다.
    - 2차맵 화면: 585.37KB 한 조각 → `SecondaryMapScreen` 50.85 + `three.core` 215.43 + `three.module` 352.33 = 618.61KB(+33.2KB). TSL 길이 같은 빌드에 있어서 공용 `three.core`가 두 길의 합이 됐다. TSL 길을 뺀 실험 빌드는 586.49KB였다(V: 실험).
    - 관리자 조각 6.64 → 23.94KB(+17.3KB: 측정판 화면과 ko·en 문구), CSS 1.91 → 5.57KB(+3.7KB).
    - gzip으로는 약 +14.6KB(Vite 표기 합: 2차맵 +7.9, 관리자 +6.0, CSS +0.7).
  - 측정 조각(누를 때만 받음): 실행기 13.37KB, 장면·GPU 완료 2.41KB, GLSL 2.58KB, TSL 687.94KB(gzip 192.35KB). 서비스 워커 미리 캐시에서 뺐다(`check-pwa`가 막는다).
  - 줄이는 법(하지 않음, 임시 도구라서): 측정판 화면을 따로 지연 조각으로 빼면 관리자 쪽 +21KB는 미리 캐시에서 빠진다(조각을 못 받을 때의 오류 처리가 필요하다). `three.core` +33KB는 TSL 길을 다른 three 사본으로 묶어야 없어진다. 결정 뒤 측정판을 지우면 모두 사라진다.
- 전송: 앱 서버는 정적 JS를 압축하지 않는다(V: 서버 코드). NAS 역방향 프록시(DSM)가 압축하는지는 U다. 측정판의 "JS KB(전송/원본)" 열이 휴대폰에서 알려 준다. GLSL 길의 three 파일은 서비스 워커 미리 캐시에서 오므로 전송 = 원본으로 보일 수 있다(A). TSL 조각은 미리 캐시에 없어 처음에는 네트워크에서 받는다.

## 5. 헤드리스 측정 (휴대폰 값이 아니다)
### 조건 (V)
- 기기: 이 컨테이너(4 vCPU 공유), Chromium 153.0.8010.12(Playwright 1.63.0), 빌드한 앱·서버(`NODE_ENV=` 비움), 가짜 관리자 계정.
- 화면: 390×844, 기기 픽셀 3 → 픽셀 비율 상한 1.5(엔진과 같은 규칙) → 그리기 585×1266, MSAA 4.
- 일감(행성 LOD 모양): 33×33 정점 타일(치마 포함 정점 1,221개·삼각형 2,304개, 인덱스는 모든 타일이 함께 씀) 40·160·320개 + 바다 구(96×48). 정점마다 색, 빛은 셰이더에서(주변광 0.32 + 확산 0.78). 타일 원점은 메시 위치(카메라 기준 좌표), 화면 밖 자르기는 껐다. 카메라는 12초에 한 바퀴 돌며 반지름의 1.75~4.25배로 오간다. 몸풀기 1초 + 재기 6초.
- 그리기 수는 세 방식 모두 41·161·321번, 삼각형 101k·378k·746k개로 같다.
- 고친 측정판(리뷰 반영)
  - TSL 두 방식은 `highPrecision`을 켠다(모델뷰를 CPU에서 64비트로, GLSL 방식과 같은 일).
  - 컴파일 = 재질마다 물체 하나(첫 타일 + 바다). WebGL은 링크 확인까지 한다. 나머지 타일은 그 뒤 넣으므로 첫 그리기에 버퍼 올리기·물체 준비가 든다.
  - 방식 순서를 타일 수마다 한 칸씩 돌린다(40: GLSL → WebGPU → WebGL2 + TSL, 160: WebGPU → WebGL2 + TSL → GLSL, 320: WebGL2 + TSL → GLSL → WebGPU). 40타일의 GLSL·WebGPU 줄은 이 쪽에서 그 API를 처음 켠 줄(`first_use`)이다.
  - GPU 지연은 두 API 모두 프레임 시작에서 완료를 확인한다(프레임 단위로 올린 값).
- **헤드리스 WebGPU는 쓸 수 없었다**(고친 뒤 다시 확인).
  - 기본: `navigator.gpu`는 있지만 어댑터가 없다(첫 요청 4.8ms) → three가 WebGL2로 바꿨다(측정판 "WebGL2로 바뀜", 초기화 23.4ms, 뒤 WebGPU 2개는 "건너뜀").
  - `--enable-unsafe-webgpu`: 어댑터(google / swiftshader)는 생기지만 캔버스에 아무것도 안 나오고, 완료 알림이 모두 "A valid external Instance reference no longer exists."로 실패했다. fps는 가짜 60이다. 측정판은 WebGPU 3줄을 "실패"로 적었다(완료 알림 실패 ×361~362).
  - 화면 있는 Chromium(Xvfb) + `--enable-unsafe-webgpu --enable-features=Vulkan --use-vulkan=swiftshader --use-webgpu-adapter=swiftshader --use-angle=swiftshader`: 둘 다 같은 소프트웨어 GPU(SwiftShader, Vulkan)로 그려진다(사진으로 확인). 아래 숫자는 이 조건이다.
- 측정판이 한 페이지에서 방식을 차례로 재므로 JS 힙에는 앞 방식의 코드가 남아 있다. 힙은 비교하지 않는다.

### 결과 (중앙값, 괄호는 최소~최대, 6번 실행)
6번: 14:30·14:32·14:33·14:35·14:36·14:49 KST에 시작, 앞 2번은 재는 동안 사진을 찍었고 마지막 1번은 영어·최종 빌드다. 컴파일 + 첫 그리기 = 셰이더 준비부터 첫 `render()`가 돌아올 때까지(받기·초기화·장면 제외). 준비 합계 = 초기화 + 장면 + 컴파일 + 첫 프레임.

| 방식 | 타일 | 초기화 ms | 컴파일 ms | 첫 그리기 ms | 컴파일 + 첫 그리기 ms | 준비 합계 ms | fps | 프레임 p95 ms | CPU p50 ms | CPU p95 ms | GPU 완료/초 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| WebGL2 + GLSL | 40 | 46 (40~70) | 64 (50~96) | 18 (14~23) | 83 (64~119) | 146 (124~171) | 8.1 (6.7~10.1) | 200 (133~217) | 0.4 (0.4~0.6) | 2.2 (1.2~3.1) | 7.8 (6.3~9.8) |
| WebGPU + TSL | 40 | 9.1 (7.2~13.4) | 64 (57~82) | 27 (18~31) | 87 (74~114) | 104 (86~133) | 7.3 (5.2~8.9) | 283 (167~400) | 1.1 (0.9~1.1) | 5.5 (2.7~11.3) | 7.1 (4.9~8.5) |
| WebGL2 + TSL | 40 | 24 (18~30) | 38 (30~43) | 25 (15~36) | 65 (52~76) | 97 (90~111) | 7.8 (5.9~10.0) | 200 (133~417) | 1.1 (0.8~1.2) | 4.0 (2.5~5.3) | 7.5 (5.6~9.5) |
| WebGL2 + GLSL | 160 | 32 (25~40) | 46 (14~75) | 65 (51~125) | 125 (96~150) | 176 (136~198) | 3.1 (2.4~3.5) | 533 (467~883) | 1.2 (1.0~1.6) | 2.3 (2.0~4.6) | 2.6 (2.1~3.2) |
| WebGPU + TSL | 160 | 17 (11~29) | 40 (23~65) | 67 (42~87) | 110 (65~152) | 136 (87~187) | 2.3 (1.7~3.2) | 1042 (800~1350) | 3.1 (2.9~4.0) | 8 (6~22) | 2.1 (1.4~2.8) |
| WebGL2 + TSL | 160 | 26 (24~32) | 16 (14~25) | 66 (61~119) | 81 (77~144) | 118 (112~186) | 2.8 (2.0~3.5) | 575 (417~917) | 2.9 (2.2~3.4) | 7 (4~40) | 2.4 (1.7~3.2) |
| WebGL2 + GLSL | 320 | 29 (25~43) | 45 (34~72) | 73 (62~97) | 117 (97~158) | 162 (137~214) | 1.2 (1.0~1.8) | 1284 (717~1783) | 2.2 (1.8~3.2) | 11 (4~75) | 0.9 (0.7~1.5) |
| WebGPU + TSL | 320 | 17 (7~21) | 34 (32~45) | 96 (84~127) | 130 (116~162) | 151 (138~188) | 1.1 (0.8~1.5) | 1625 (1200~2567) | 6.3 (4.1~8.0) | 13 (9~58) | 0.9 (0.5~1.2) |
| WebGL2 + TSL | 320 | 26 (23~41) | 35 (30~49) | 130 (101~195) | 169 (131~244) | 220 (169~281) | 1.2 (1.1~1.7) | 1234 (833~1800) | 6.6 (4.8~9.5) | 13.1 (9.6~15.4) | 0.8 (0.6~1.3) |

- 첫 어댑터 요청(확인 단계)은 33~87ms였다(6번, 중앙값 약 38ms). WebGPU 초기화 칸에는 이 시간이 빠져 있다.

### 읽는 법
- **셰이더 준비는 비슷하다.** 컴파일 + 첫 그리기 중앙값이 40타일 83·87·65ms, 160타일 125·110·81ms, 320타일 117·130·169ms다(GLSL·WebGPU·WebGL2 + TSL 순). 순위가 타일 수마다 바뀌고 범위가 겹친다. 컴파일만 보아도 16~64ms로 비슷하다. 앞 판의 "5~8배"는 GLSL의 링크 확인과 버퍼 올리기가 첫 그리기에 들어가 있던 탓이다(2장). 이 SwiftShader에는 `KHR_parallel_shader_compile`이 없다(V: 콘솔 경고). 휴대폰에 이 확장이 있으면 완료를 묻는 간격(GLSL 10ms, WebGL2 백엔드 한 프레임)이 컴파일에 더해질 수 있다(A).
- **CPU는 TSL이 약 2.5~3배다.** `render()` 중앙값이 40타일 0.4 대 1.1ms, 160타일 1.2 대 2.9~3.1ms, 320타일 2.2 대 6.3~6.6ms다. 앞 판(160타일 1.1 대 2.2~2.7ms)보다 차이가 커졌다. `highPrecision`을 켜면 물체마다 노드 uniform 두 개(모델뷰·법선 행렬)를 CPU에서 계산해 올리므로 그만큼 늘어난 것으로 보인다(A). 켜지 않은 값은 카메라 기준 좌표 규칙을 어기므로 비교에 쓰지 않는다. 휴대폰 JS가 이 컨테이너보다 몇 배 느리면 160타일에서 몇 ms 차이가 되고, 120Hz 휴대폰(프레임 8.3ms)에서는 의미가 있다(A).
- **GPU 쪽은 판단할 수 없다.** 모든 방식에서 GPU 완료/초 ≈ fps다. 소프트웨어 GPU가 병목이고, 두 API가 같은 래스터라이저(SwiftShader)를 쓴다. 같은 방식도 실행마다 fps가 1.5~2배쯤 흔들렸다. 160타일에서 WebGPU의 fps 중앙값이 낮지만(2.3 대 3.1·2.8) 범위가 겹친다. 실제 GPU에서 WebGPU가 나은지는 휴대폰에서만 알 수 있다(U).
- **초기화 비교는 순서와 데움에 따라 달라 근거가 못 된다.** WebGPU 초기화 9~17ms는 첫 어댑터 요청(33~87ms)을 뺀 값이다. WebGL2는 이 쪽의 첫 컨텍스트(`first_use`)가 40~70ms, 그 뒤 24~32ms다. 어느 쪽이든 한 번뿐이고 작다(A: 휴대폰에서도 작을 것).

## 6. 휴대폰에서 잴 것
측정판은 관리자 화면에 있다. 결과를 복사해 개발 대화에 붙이면 된다(9장). 기기마다 2번 이상 잰다(헤드리스에서 실행마다 크게 흔들렸다).
1. **사용자 휴대폰(웨일)**: 세 방식 모두. 요약 글의 "WebGPU:" 줄(어댑터 유무·첫 요청 시간·이름·호환 모드)과 "WebGL GPU:" 줄(GPU 이름)을 본다. 같은 휴대폰의 크롬·삼성 인터넷에서도 1번씩(브라우저마다 WebGPU가 다를 수 있다).
2. **중가 안드로이드**(PLAN 11장 기준 기기): 가능하면 Xclipse 갤럭시 1대와 Snapdragon 1대. Xclipse면 "WebGL2로 바뀜"이 나올 것이다(A). 그때는 WebGL2 + TSL 줄이 그 기기의 실제 길이다.
3. **아이폰**(iOS 26 이상 1대, 있으면 iOS 18 1대): 사파리와 홈 화면 앱 둘 다.
4. 볼 숫자(160타일이 ADR 36의 "보이는 타일 160개" 상한이다)
   - 프레임 p95(통과 기준 33ms 이하)와 50ms 넘는 프레임 수.
   - CPU p50·p95(`render()` 시간): TSL이 2.5~3배라는 헤드리스 결과가 휴대폰에서도 같은지.
   - **GPU 완료/초: API끼리는 이것으로 비교한다.** fps보다 낮으면 GPU가 못 따라온 것이다.
   - GPU p50·p95는 두 API 모두 프레임 시작에서 완료를 확인하므로 프레임 간격 단위로 올린 값이다(GPU 시간이 아니다). 같은 방식 안에서 타일 수끼리 GPU가 몇 프레임 밀렸는지 볼 때만 쓴다. 한 프레임(120Hz 8.3ms, 60Hz 16.7ms) 근처면 GPU가 따라오고 있다는 뜻일 뿐이다.
   - 컴파일 + 첫 그리기, 준비 합계(받기 뺌). 받기는 조각마다 처음 쓴 줄에만 있다.
   - 메모: `first_use` 줄의 초기화에는 이 쪽에서 그 API를 처음 켜는 한 번뿐인 비용이 들어 있다. **`no_msaa` 줄(WebGPU 호환 모드, `×0`)은 WebGL `×4` 줄과 프레임 수치를 바로 비교하지 않는다**(MSAA가 없으면 채우기 비용이 적다). 호환 모드 휴대폰이 얼마나 되는지는 U다.
   - 아이폰 사파리: TSL 컴파일이 재질마다 한 프레임쯤 더 걸릴 수 있다(`scheduler.yield`가 없어 three가 `requestAnimationFrame`으로 쉬어 간다, 2장). 컴파일 칸이 1~2프레임 길어도 셰이더 탓이 아닐 수 있다(A).
   - JS KB(전송/원본): NAS 프록시가 압축하는지.
5. 조건: 저전력 모드 끔(iOS는 30fps로 묶인다, PLAN 11장), 충전기 뺌, 화면 세로, 밝기 같게. 6초씩이라 발열로 느려지는 것은 못 본다. 20분 연속은 S2 렌더러로 따로 잰다(ADR 36 측정).
6. 메모리를 비교하려면 방식 하나만 고르고, 새로고침 뒤 따로 잰다.

## 7. 권고와 맞바꿈
### 선택지 1: WebGL2 + GLSL 유지 (권고)
- 장점(V): 묶음 gzip 약 111KB 작다. 프레임당 CPU가 TSL의 약 1/3~1/2.5다(헤드리스, 두 쪽 모두 카메라 기준 좌표를 지킨 조건). 모든 기기가 같은 길이다(iOS 16.4~18, Xclipse 갤럭시 포함) → 시험·디버깅이 한 길이다. S1 엔진(`InstancedMesh` 포함)·ADR 36 렌더러·troika 라벨을 그대로 쓴다. 카메라 기준 좌표가 기본으로 된다. three가 계속 관리한다.
- 비슷한 것(V, 헤드리스): 셰이더 준비 시간. 장점으로 치지 않는다.
- 단점: three의 큰 새 기능은 `WebGPURenderer`에만 들어간다(V: 설명서). 컴퓨트 셰이더가 없다. 나중에 옮기면 그때는 셰이더가 더 많아 비용이 커진다(A).
### 선택지 2: WebGPU + TSL (`WebGPURenderer`, WebGPU 없으면 WebGL2 백엔드)
- 장점: 실제 GPU에서 더 빠를 수 있다(U). 셰이더를 TSL로 한 번 쓰면 두 백엔드에서 돈다(V). 컴퓨트·새 후처리를 쓸 수 있다(V: 설명서).
- 단점(V 헤드리스·코드): 2차맵·1차맵 화면이 gzip 약 +111KB(첫 진입 3초 기준에 부담, 4G에서 대략 0.1초 + 해석 시간, A). 프레임당 CPU 2.5~3배(WebGL2 백엔드도 같다). 실험 단계(설명서). troika 라벨을 못 쓴다 → 지도 라벨을 다른 방법으로 다시 정해야 한다. 카메라 기준 좌표를 따로 켜야 하고, 전역 `highPrecision`은 S1 엔진의 `InstancedMesh`와 함께 못 쓴다 → 재질마다 켠다(2장). 내부 그리기 반복이 늘 돈다. WebGPU가 없는 기기(3장)는 WebGL2 백엔드로 가므로 두 백엔드를 모두 시험해야 한다. 초기화는 이 기기에서 조금 짧았지만 순서·데움에 따른 값이라 장점으로 치지 않는다.
### 선택지 3: 기기에 따라 두 렌더러를 나눠 쓰기
- 권하지 않는다. "렌더러는 앱에 하나"(PLAN 5.7, ADR 36)를 어기고, 셰이더를 두 벌(GLSL·TSL) 관리해야 한다.
### 다시 볼 때
- 휴대폰(WebGPU가 되는 기기)에서 160타일 GPU 완료/초와 프레임 p95가 WebGPU + TSL이 확실히 좋고(예: 20% 이상, A: 제안 값), TSL의 CPU p95가 그 기기의 프레임 시간(120Hz면 8.3ms) 안에 넉넉히 들 때. 이 경우는 사용자가 정할 일이다.
- 기획에 GPU 계산(컴퓨트)이 꼭 필요한 기능이 생길 때.
- three가 `WebGLRenderer`에 노드 재질을 넣어 옮기는 비용이 줄 때(설명서 "investigating").
- 셰이더가 적은 지금이 옮기기에 가장 싸다. 바꿀 거라면 S2 렌더러가 커지기 전에 정하는 편이 낫다(A).

## 8. WebGPU를 고르면 옮길 것 (S1 엔진 + S2 렌더러, 렌더러 하나)
S1 엔진(`packages/engine/src`, 약 3,000줄)에서 WebGL에 묶인 곳은 4파일이다(V: 코드 읽음).
1. `render/sharedRenderer.ts`: `WebGLRenderer` → `WebGPURenderer`. 빌리기가 비동기(`init()`)가 된다. 컨텍스트 잃음 검사(`getContext().isContextLost()`)와 `forceContextLoss()`를 장치 잃음 처리로 바꾼다. **전역 `highPrecision`은 켜지 않는다**(아래 5번).
2. `secondMapEngine.ts`: `webglcontextlost`·`webglcontextrestored` 대신 `onDeviceLost`. three가 자동으로 되살리지 않으므로 렌더러와 화면 자원을 다시 만든다. `renderer.info.render.calls`의 뜻이 다르다(WebGPU에서는 render 호출 수다. 그리기 수는 `drawCalls`).
3. `units/unitMaterials.ts`: GLSL `ShaderMaterial` 2개(화면 px 굵기 외곽선, `gl_PointSize` 점) → TSL 노드 재질.
4. `units/unitView.ts`: 아이콘 `Points`의 크기 → WebGPU는 1px 점만 그리므로 `Sprite` + 인스턴싱으로 구조를 바꾼다. 인스턴싱(`InstancedMesh`)이라 이 재질에는 전역 `highPrecision`을 쓸 수 없다(three 설명).
5. **카메라 기준 좌표**(PLAN 5.7 행성 LOD): 1차맵 행성 타일·바다 재질마다 `material.contextNode = context({ modelViewMatrix: highpModelViewMatrix, modelNormalViewMatrix: highpModelNormalViewMatrix })`를 넣는다. 재질마다 켜는 것은 셰이더 글로 확인했다(V: 실행). `InstancedMesh`와 같은 장면에서 그려 보지는 않았다(미실행).
- 그 밖: 건물(`MeshLambertMaterial`)은 자동으로 바뀐다(V). 건물도 `InstancedMesh`라(`buildings/buildingView.ts`) 전역 `highPrecision`과는 못 쓴다. ADR 36 렌더러(다른 에이전트가 만드는 중)의 `ShaderMaterial`·`onBeforeCompile`도 TSL로 바꾼다. `compileAsync`는 재질마다 대표 물체 하나로 부른다(사파리는 물체마다 한 프레임, 2장). 지도 라벨(troika) 대안을 정한다. 엔진 시험과 Playwright 화면 시험을 두 백엔드로 돌린다.
- 규모(A): 파일 몇 개와 라벨 대안이라 며칠 단위다. 셰이더가 늘수록 커진다.

## 9. 측정판 쓰는 법 (휴대폰)
1. 이 작업을 main에 합쳐 NAS에 배포한다(메인 세션).
2. 관리자 계정으로 로그인 → 계정 줄 [관리자] → 아래 "셰이더 측정 (S2)".
3. 잴 방식을 고른다(기본 3개 모두) → [측정 시작]. 그때 측정 코드를 받고, 약 1~2분 동안 화면 전체를 덮어 그린다. [멈춤]이나 앱 전환으로 멈춘다(어댑터 확인·초기화·컴파일 중에도 바로 멈춘다).
4. 끝나면 결과 표와 요약 글이 나온다. 줄은 잰 순서다(타일 수마다 방식 순서가 한 칸씩 바뀐다). 요약 글 아래 [복사] → 개발 대화에 붙여 넣는다. 복사가 막히면 글이 골라진 채로 남으니 길게 눌러 복사한다. 결과는 서버로 보내지 않는다. 재는 동안의 기기 성능 보고에는 쪽 이름 뒤에 `#gpu-bench`가 붙는다(다른 화면 수치와 섞이지 않게).
