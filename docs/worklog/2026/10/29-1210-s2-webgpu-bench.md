# S2 셰이더 측정판: WebGL2 + GLSL과 WebGPU + TSL을 같은 행성 타일로 재기(관리자 화면), 헤드리스 측정, 조사

- 일시: 2026-10-29 12:10 (KST)
- 작업 도구: Claude Code (서브에이전트, 작업 트리)
- 관련: ADR `2026-10-29-s2-planet-lod.md`(36, 제안 — 끝에 "구현하며 정한 것 (셰이더 측정)"을 덧붙임), 조사 `docs/research/2026-10-29-webgpu-vs-webgl2.md`, ADR `2026-10-28-s1-second-map.md`(33, 엔진), `2026-10-28-pwa-and-browser-baseline.md`, `2026-10-28-stack-baseline.md`, PLAN 5.7·11장
- 의존성: `apps/game`에 `three` 0.186.1·`@types/three` 0.186.0을 직접 적었다. 엔진과 같은 판이라 새로 받는 꾸러미는 없다(잠금 파일은 `apps/game` 링크 6줄만). `check-docs`는 새 런타임 의존성으로 보므로 ADR 36에 적었다.
- `packages/engine`·`apps/server`·`packages/protocol`·`packages/planet`·`packages/shared`·`packages/content`·`content/`·`apps/game/src/map/`·`App.tsx`·`AccountBar.tsx`는 바꾸지 않았다.

## 한 일
- 측정판(`apps/game/src/admin/GpuBenchPanel.tsx`): 관리자 화면 아래 "셰이더 측정 (S2)".
  - 방식 고르기(체크 3개), API 안내, [측정 시작], 결과 표(방식·타일·p95·fps·GPU/초·컴파일·준비·그리기), 복사할 요약 글 + [복사](막히면 글을 골라 둔다).
  - 재는 동안 화면 전체를 덮는 창(`dialog`)에 캔버스와 진행 판(몇 번째·방식·단계, 남은 초, [멈춤]). Esc·[멈춤]·앱 전환(화면 숨김)으로 멈춘다.
  - 누르기 전에는 아무것도 받거나 재지 않는다. 재는 동안 성능 보고에 쪽 이름 `#gpu-bench`를 붙인다(`setTelemetryView`).
  - 문구 66개(ko·en). 화면 값은 토큰만, 촘촘 변형 그대로.
- 측정 코드(`apps/game/src/admin/gpuBench/`, 모두 지연 조각)
  - `gpuBenchWorkload.ts`: 행성 LOD 모양 일감. 면 6개 쿼드트리에서 카메라 쪽을 잘게 나눠 정확히 N개(40·160·320) 고른다. 타일 33×33 정점 + 치마, 정점 색(바이옴 비슷), 법선, 원점 기준 좌표. 인덱스는 하나를 함께 쓴다. 카메라 길(12초 한 바퀴, 반지름 1.75~4.25배).
  - `gpuBenchScene.ts`: 두 three 입구가 함께 쓰는 장면(타일 메시 + 바다 구, 카메라 기준 빛 방향).
  - `gpuBenchGlsl.ts`: `WebGLRenderer` + GLSL `ShaderMaterial`. `gpuBenchTsl.ts`: `WebGPURenderer` + TSL(`forceWebGL`로 WebGL2 + TSL도). 둘 다 같은 빛 공식.
  - `gpuBenchGpuDone.ts`: GPU 완료 시간. WebGL2는 fence를 차례로 보고, WebGPU는 `onSubmittedWorkDone`. 실패 수를 센다.
  - `gpuBenchRunner.ts`: 방식 × 타일 수마다 받기 → 초기화 → 장면 → 컴파일 → 첫 프레임 → 몸풀기 1초 + 재기 6초 → GPU 비우기 → 버리기. 단계별 시간 상한. WebGPU가 WebGL2로 바뀌면 "WebGL2로 바뀜" + 뒤 WebGPU 측정 건너뜀. 장치·컨텍스트 잃음, 완료 알림 전부 실패는 "실패".
  - `gpuBenchSummary.ts`: 복사할 요약 글(기기·화면·하드웨어·WebGPU 어댑터·WebGL GPU 이름·줄마다 27칸).
- 서비스 워커: `assets/gpuBench*.js`를 미리 캐시에서 뺐다(`vite.config.ts` `globIgnores`). `scripts/pwa-build.mjs`가 sw.js에 들어가면 실패시킨다(시험 1개 추가).
- 헤드리스 측정(Playwright, 저장소 밖 스크립트, 가짜 계정): 기본·`--enable-unsafe-webgpu` 헤드리스, 화면 있는 Chromium(Xvfb) + SwiftShader. 파스텔·다크, 한국어·영어, 390px·320px, 중간 멈춤.
- 조사 문서와 ADR 36 덧붙임(셰이더 언어는 사용자 결정 대기).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/admin/GpuBenchPanel.tsx` (새) | 측정판 화면 |
| `apps/game/src/admin/gpuBench/*.ts`, `gpuBench.css` (새) | 일감·장면·두 렌더러·GPU 완료·실행기·요약·타입, 화면 CSS |
| `apps/game/src/admin/gpuBench/gpuBenchWorkload.test.ts`, `gpuBenchSummary.test.ts` (새) | 타일 고르기(정확한 수·겹침 없음·넓이·LOD 순서), 자료(정점·삼각형 수, 원점, 법선, 색, 결정성), 카메라, 요약 글 줄(글자 그대로) |
| `apps/game/src/admin/AdminPage.tsx` | 측정판을 아래에 붙임 |
| `apps/game/messages/ko.json`, `en.json` | `gpu_bench_*` 66개 |
| `apps/game/package.json`, `pnpm-lock.yaml` | `three`·`@types/three`(엔진과 같은 판) 직접 표기 |
| `apps/game/vite.config.ts` | 측정 조각을 미리 캐시에서 뺌 |
| `scripts/pwa-build.mjs`, `scripts/pwa-build.test.mjs` | 측정 조각이 미리 캐시에 들어가면 실패 |
| `docs/research/2026-10-29-webgpu-vs-webgl2.md` (새) | 조사: three API 상태, 브라우저·기기, 묶음, 헤드리스 수치, 휴대폰에서 잴 것, 권고·맞바꿈, 옮길 것 |
| `docs/adr/2026-10-29-s2-planet-lod.md` | "구현하며 정한 것 (셰이더 측정)" |

## 정한 것 (ADR 36에 없던 것)
| 항목 | 정한 값 | 이유 |
|---|---|---|
| 측정판 자리 | 관리자 화면 아래, 측정 코드는 누를 때 `import()` | 첫 화면 묶음에 영향 없게, 관리자만 |
| 일감 | 33×33 + 치마, 인덱스 공유, 40·160·320개, 화면 밖 자르기 끔 | ADR 36 타일(32×32 칸)·상한 160개와 같은 모양. 세 방식이 같은 수를 그리게 |
| 시간 | 몸풀기 1초 + 재기 6초, 9번 ≈ 1~2분 | 휴대폰에서 한 번에 끝나게. 발열은 따로(20분 연속) |
| GPU 시간 | fence / `onSubmittedWorkDone`, 완료/초 | rAF 간격만으로는 GPU가 못 따라오는지 모른다 |
| 완료 알림이 모두 실패 | "실패" + 이유 | 헤드리스 WebGPU는 가짜 60fps를 낸다 |
| 방식 사이 | GPU 비우기 + 장치 잃음 대기(최대 1.5초) + 0.5초 쉼 | 앞 방식의 남은 GPU 일이 다음 초기화를 부풀렸다(15~33ms로 돌아옴, Verified) |
| 결과 | 표 + 복사 글. 서버로 보내지 않음 | 임시 측정이다. 저장 표·API를 만들지 않는다 |
| 미리 캐시 | `gpuBench*` 뺌 + 검사 | TSL 조각 약 690KB를 모든 사용자가 받지 않게 |

## 확인 (Verified: 이 컨테이너 4 vCPU 공유, Node 24.22.1, pnpm 11.28.9, TS 7.0.2, vitest 5.0.5, Chromium 153.0.8010.12(Playwright 1.63.0), PostgreSQL 16)
| 명령·확인 | 결과 |
|---|---|
| `pnpm --filter @terra/game typecheck` | 통과 |
| `TEST_DATABASE_URL=… pnpm check` | 통과. 시험 파일 83개, 시험 698개(새 21개: 일감 16, 요약 4, PWA 1). 다국어 키 252개, 디자인 값(화면 CSS 6개), 파일 크기 경고 없음 |
| `pnpm build`, `node scripts/check-pwa.mjs` | 통과. 미리 캐시 26개(1,087.43KiB), `gpuBench` 0개 |
| 누르기 전 받은 측정 파일 | 0개(모든 실행에서 Resource Timing으로 확인) |
| 쪽 가로 넘침 | 390px·320px 모두 없음(`scrollWidth` = `clientWidth`). 320px 영어에서는 표만 자기 칸 안에서 옆으로 민다 |
| 사진(파스텔·다크, 한국어) | 저장소 밖 작업 폴더(`s2-webgpu/xvfb-swiftshader-both-{pastel,dark}-ko-*.png`): 판·재는 중(9장)·결과. 영어 320px 대체·건너뜀 줄 |
| 헤드리스 기본 | WebGPU 어댑터 없음 → "WebGL2로 바뀜"(초기화 약 21ms) → 뒤 WebGPU "건너뜀" |
| 헤드리스 `--enable-unsafe-webgpu` | 어댑터 google / swiftshader, 캔버스 빈 화면, 완료 알림 359~362개 모두 실패 → "실패"로 적음 |
| Xvfb + SwiftShader(두 API) | 세 방식 모두 그려짐(사진으로 확인). 4번 실행 수치는 조사 문서 5장 |
| 중간 멈춤 | 320px 영어: 측정 사이에 누름 → 창 닫힘, 잰 4개까지 표·요약 글 + "Stopped. Showing the results so far.". 390px 한국어: 재는 중(5초)에 누름 → 그 줄이 "멈춤"(잰 데까지 숫자) + "측정을 멈췄습니다. 잰 데까지 보여 줍니다." |

## 잰 값 (요약, 휴대폰 값이 아니다)
- GPU 쪽은 세 방식이 오차 안에서 같다(소프트웨어 GPU가 병목, 실행마다 fps 약 2배 흔들림).
- 컴파일: GLSL 15~21ms, TSL 72~160ms(중앙값, 약 5~8배). `render()` CPU: 160타일 1.1ms 대 2.2~2.7ms(약 2배). 준비 합계는 모두 100~200ms대.
- 묶음(같은 일감, 길마다 따로): GLSL 길 gzip 130.50KB, TSL 길 241.05KB(+110.55KB, brotli +85.33KB).
- 앱 빌드: 첫 화면 JS 368.36 → 368.17KB(측정 코드 없음, 공용 조각 이름만 `useMountFocus` → `src`). 관리자 조각 6.64 → 22.72KB. 2차맵 화면 585.37 → 618.61KB(+32KB, gzip +7.5KB): TSL 길이 같은 빌드에 있어 `three.core`가 두 길의 합이 됐다(TSL 길을 뺀 실험 빌드 586.49KB로 확인).
- 권고: 지금은 WebGL2 + GLSL 유지. 가까운 판단이라 휴대폰 값으로 사용자가 정한다(조사 문서 7장).

## 함께 바꿔야 하는 파일
- `packages/engine`의 `three` 판을 올리면 `apps/game`의 `three`·`@types/three`도 같은 판으로 올린다. 다르면 three가 두 벌 묶인다.
- 측정판을 지울 때(결정 뒤): `GpuBenchPanel.tsx`, `admin/gpuBench/`, `AdminPage.tsx`의 import·자리, 문구 `gpu_bench_*`(ko·en), `vite.config.ts`의 `globIgnores` 줄, `apps/game`의 `three`·`@types/three`(다른 곳에서 안 쓰면), `scripts/pwa-build.mjs`의 `ADMIN_ONLY_CHUNK`와 시험(남겨도 해는 없다).
- WebGPU를 고르면: 조사 문서 8장(S1 엔진 4파일, ADR 36 렌더러, 지도 라벨 대안).

## 건드리지 말 것
- 첫 화면 코드에서 `three`·측정판을 정적으로 import하지 않는다(첫 화면 묶음이 커진다). 측정 코드는 `GpuBenchPanel`의 `import()`로만 들어온다.
- `globIgnores`의 첫 항목(`**/node_modules/**/*`)은 Workbox 기본값이다. 덮어쓰므로 지우지 않는다.

## 미검증·TODO·알려진 문제
- **휴대폰 측정이 남았다**(조사 문서 6장): 사용자 휴대폰(웨일 + 같은 기기 크롬·삼성 인터넷), 중가 안드로이드(가능하면 Xclipse 1대·Snapdragon 1대), 아이폰(iOS 26). 배포는 메인 세션 몫이다.
- 헤드리스 수치는 소프트웨어 GPU라 휴대폰 기준이 아니다. 휴대폰 GPU에서 WebGPU가 나은지는 Unknown.
- 2차맵 화면 +32KB(gzip +7.5KB)는 측정판이 있는 동안 남는다. 피하려면 TSL 길에 three 공용 조각을 따로 묶는 빌드 설정이 필요하다(하지 않음, 임시 도구라서).
- NAS 역방향 프록시가 JS를 압축하는지 Unknown. 측정판 "JS KB(전송/원본)"로 본다.
- 320px 영어에서 결과 표가 옆으로 밀린다는 표시(그림자 등)는 없다. 칸이 초점을 받아 키보드로도 민다. 관리자 화면이라 그대로 둔다.
- 이 SwiftShader에는 `KHR_parallel_shader_compile`이 없어 GLSL 병렬 컴파일은 재지 못했다.
- AGENTS.md 6장에 넣을 만한 확인 사항(메인 세션이 정한다):
  - three 0.186.1 `WebGPURenderer`: WebGPU 초기화가 실패하면 WebGL2 백엔드로 바꾼다(초기화 때 한 번). 어댑터는 `featureLevel: "compatibility"`, 호환 모드면 MSAA를 끈다. `init()` 뒤 내부 rAF가 `dispose()`까지 돈다. 장치를 잃어도 되살리지 않는다. WebGPU 점은 1px뿐(큰 점은 Sprite + 인스턴싱). 기본 재질은 노드 재질로 자동으로 바뀐다. `three`와 `three/webgpu`는 `three.core.js`를 함께 쓴다.
  - Chromium 153 헤드리스: 기본은 WebGPU 어댑터가 없다. `--enable-unsafe-webgpu` 헤드리스는 어댑터가 생겨도 그려지지 않고 `onSubmittedWorkDone`이 "A valid external Instance reference no longer exists."로 실패한다. Xvfb 화면 + `--enable-features=Vulkan --use-vulkan=swiftshader --use-webgpu-adapter=swiftshader --use-angle=swiftshader`면 두 API 모두 그려진다.
  - Playwright 사진은 화면을 읽어 와(ReadPixels) 재는 프레임을 흔든다. 재는 동안에는 찍지 않는다.
- 시험 DB(`terra_s2bench`, 이 컨테이너의 임시 PostgreSQL)와 가짜 관리자 계정은 저장소 밖이다. 비밀번호는 커밋하지 않았다.

## 사용자 결정 대기
- 셰이더 언어(WebGL2 + GLSL 유지 / WebGPU + TSL로 옮기기): 휴대폰 측정 값을 본 뒤. 권고는 WebGL2 + GLSL 유지이고, 가까운 판단이다.
