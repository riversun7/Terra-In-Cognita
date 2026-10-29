# S2 셰이더 측정판 리뷰 반영: TSL 모델뷰 정밀도, 같은 일을 재는 컴파일, GPU 지연, 순서·멈춤, 다시 잰 헤드리스 수치

- 일시: 2026-10-29 15:05 (KST)
- 작업 도구: Claude Code (서브에이전트, 작업 트리)
- 관련: 앞 기록 `2026/10/29-1210-s2-webgpu-bench.md`, ADR `2026-10-29-s2-planet-lod.md`(36, 제안 — "구현하며 정한 것 (셰이더 측정)"을 고침), 조사 `docs/research/2026-10-29-webgpu-vs-webgl2.md`(고침), PLAN 5.7
- `packages/engine`·`apps/server`·`packages/protocol`·`packages/planet`·`packages/shared`·`packages/content`·`content/`·`apps/game/src/map/`·`App.tsx`·`AccountBar.tsx`는 바꾸지 않았다. 의존성도 그대로다.

## 한 일
리뷰 지적 11개(같은 내용 2쌍 포함)를 three 0.186.1 코드와 실행으로 확인했다. 모두 맞았고 모두 고쳤다(거절 0개).
1. **TSL 모델뷰 정밀도**(지적 1·4, 주요): three 기본 TSL은 모델뷰를 셰이더(GPU 32비트)에서 곱한다. TSL 세션에서 `renderer.highPrecision = true`를 셰이더를 만들기 전에 켠다. 만든 셰이더 글로 확인했다(기본·전역·재질마다 켜기, WGSL·GLSL). 장면 주석을 바로잡았다. 조사 2·8장과 ADR에 전역 설정의 `InstancedMesh`·`SkinnedMesh` 제한, S1 엔진의 `InstancedMesh`(유닛·건물), 재질마다 켜는 길(`material.contextNode`)을 적었다.
2. **컴파일 비교**(지적 2, 주요): GLSL은 `compileAsync` 뒤 `renderer.info.programs`의 `getUniforms()`로 링크 확인까지 컴파일 단계에서 끝낸다. 두 방식 모두 재질마다 물체 하나(첫 타일 + 바다)만 컴파일하고 나머지는 `fill()`로 넣는다. 이유를 찾다가 three `compileAsync`가 물체마다 쉬어 가고(`scheduler.yield`, 없으면 `requestAnimationFrame`), 사파리에는 `scheduler.yield`가 없다는 것을 확인했다(MDN BCD). 비교는 "컴파일 + 첫 그리기"로 한다. 준비 합계에서 받기를 뺐고, 두 TSL 방식이 같은 조각이라 받기·JS 크기는 처음 쓴 줄에만 적는다.
3. **GPU 지연**(지적 3·10, 주요·사소): WebGPU도 약속이 풀리면 표시만 하고 시각은 다음 프레임 시작(collect)에 잰다. 이제 두 API가 같은 방법(프레임 단위로 올림)이다. 요약 맺음말과 조사 6장에 "API끼리는 GPU 완료/초로 비교"를 적었다.
4. **타일 고르기 초점**(지적 5, 사소): `selectTiles`가 넘긴 초점을 쓴다. 시험 1개.
5. **미리 캐시 비용**(지적 6, 사소): ADR·조사·이 기록에 "모든 사용자가 서비스 워커를 설치·갱신할 때 +52.7KiB(2차맵 +33.2KB, 관리자 +17.3KB, CSS +3.7KB)"를 적었다. 측정판 화면을 지연 조각으로 빼는 것은 하지 않았다(아래 정한 것).
6. **호환 모드 MSAA**(지적 7·10, 사소): WebGPU 호환 모드라 MSAA가 꺼진 줄에 `no_msaa`. 조사 6장에 "×0 줄과 ×4 줄을 바로 비교하지 않는다".
7. **순서 의존**(지적 8, 사소): 타일 수마다 방식 순서를 한 칸씩 돌린다. 그 API를 처음 켠 줄에 `first_use`. 첫 어댑터 요청 시간을 재서 요약 "WebGPU:" 줄에 적는다. 조사 5·7장의 "초기화는 WebGPU가 빠르다(V)"를 "순서·데움에 따라 달라 근거가 못 된다"로 고쳤다.
8. **멈춤·시간 넘김 누수**(지적 9, 사소): 어댑터 확인·초기화·컴파일·첫 프레임 기다림을 `guard()`(시간 상한 + 멈춤)로 감싼다. 그만둔 뒤 늦게 생긴 렌더러는 버린다(three 내부 rAF 반복·장치가 남지 않게). 멈췄으면 GPU 비우기를 기다리지 않는다.
9. **출처 주소·날짜**(지적 11, 사소): 조사 1장 표에 주소, 공개·수정일, 판(태그·커밋)을 넣었다. Chrome·WebKit 글은 이 세션에서 사이트가 막혀 주소만 확인했다(공개일 U).
10. 헤드리스를 다시 쟀다: Xvfb + SwiftShader 6번, 기본 헤드리스 1번(영어 320px), `--enable-unsafe-webgpu` 헤드리스 1번, 재는 중 멈춤 1번(영어). 사진은 파스텔·다크.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/admin/gpuBench/gpuBenchTsl.ts` | `highPrecision` 켬, 재질마다 컴파일한 뒤 나머지 타일 넣기 |
| `apps/game/src/admin/gpuBench/gpuBenchGlsl.ts` | 링크 확인을 컴파일 단계에서 끝냄, 재질마다 컴파일한 뒤 나머지 타일 넣기 |
| `apps/game/src/admin/gpuBench/gpuBenchScene.ts` | 처음에는 첫 타일 + 바다만 장면에, `fill()`. 주석(카메라 기준 좌표, 컴파일 이유) |
| `apps/game/src/admin/gpuBench/gpuBenchGpuDone.ts`, `gpuBenchGpuDone.test.ts` (새) | 두 API가 같은 방법으로 완료 시각을 잼. 작은 타입(`FenceContext`·`WorkDoneDevice`)과 시계를 받아 가짜로 시험(5개) |
| `apps/game/src/admin/gpuBench/gpuBenchPlan.ts`, `gpuBenchPlan.test.ts` (새) | 순수 도우미: 순서 돌리기(`modeOrder`), 메모(`addNote`·`startNotes`), 시간 상한·멈춤 기다림(`guard`). 시험 10개 |
| `apps/game/src/admin/gpuBench/gpuBenchRunner.ts` | 조각 단위 받기, `guard`, 늦은 렌더러 버리기, 순서 돌리기, `first_use`·`no_msaa`, 첫 어댑터 요청 시간, 멈추면 GPU 비우기 생략 |
| `apps/game/src/admin/gpuBench/gpuBenchTypes.ts` | `adapterMs`, 어댑터 `unknown`, 필드 설명 |
| `apps/game/src/admin/gpuBench/gpuBenchSummary.ts`, `gpuBenchSummary.test.ts` | 준비 합계에서 받기 뺌, 어댑터 첫 요청 시간·모름. 시험 1개 추가 |
| `apps/game/src/admin/gpuBench/gpuBenchWorkload.ts`, `gpuBenchWorkload.test.ts` | `selectTiles` 초점. 시험 1개 추가 |
| `apps/game/messages/ko.json`, `en.json` | `gpu_bench_sum_webgpu`에 `{ms}`, 표 머리 "준비 합계(받기 뺌)", 맺음말(줄 순서, 컴파일·첫 그리기, GPU 지연, 메모 뜻) |
| `docs/research/2026-10-29-webgpu-vs-webgl2.md` | 바로잡은 것, 출처 주소·날짜, three 사실 추가(정밀도·컴파일 단계·물체별 쉼), 미리 캐시 비용, 새 수치, 휴대폰에서 볼 것, 권고·옮길 것 |
| `docs/adr/2026-10-29-s2-planet-lod.md` | "구현하며 정한 것 (셰이더 측정)"을 새 사실·수치로 고침(상태는 제안 그대로) |
| `docs/worklog/2026/10/29-1210-s2-webgpu-bench.md` | 이 기록이 바로잡는다는 줄 하나 |

## 정한 것 (ADR 36에 없던 것)
| 항목 | 정한 값 | 이유 |
|---|---|---|
| GPU 지연 재기 | 두 API 모두 프레임 시작에서 완료를 확인(프레임 단위로 올림). API끼리는 GPU 완료/초 | 리뷰는 fence를 프레임 사이에 묻기·타이머 쿼리도 제안했다. 프레임 사이 묻기는 화면 스레드를 자주 깨워 CPU·프레임 측정을 흔들고, 타이머 쿼리(`EXT_disjoint_timer_query_webgl2`·`timestamp-query`)는 휴대폰에 없을 때가 많다(A). 같은 방법으로 보는 쪽이 비용 없이 공평하다 |
| 컴파일 | 재질마다 물체 하나, WebGL은 링크 확인 포함 | three `compileAsync`가 물체마다 쉬고(사파리는 한 프레임), WebGLRenderer는 링크 확인을 첫 그리기로 미룬다 |
| 비교 기준 | 컴파일 + 첫 그리기 | 버퍼 올리기 단계가 렌더러마다 다르다(TSL은 `compileAsync`, GLSL은 첫 `render()`) |
| 잴 순서 | 타일 수마다 한 칸씩 돌림, `first_use` 표시, 첫 어댑터 요청 따로 | 처음 켜는 API의 한 번뿐인 비용이 한 방식에만 몰리지 않게 |
| 호환 모드 | MSAA를 맞추지 않고 `no_msaa`만 표시 | WebGL 쪽 MSAA를 끄면 엔진과 다른 조건이 된다. 사용자가 그 줄을 따로 읽게 한다 |
| 미리 캐시 | 측정판 화면을 따로 지연 조각으로 빼지 않음 | 관리자 쪽 +21KB를 줄이지만 조각을 못 받을 때의 오류 처리가 더 필요하다. 임시 도구라 지우면 사라진다 |

## 확인 (Verified: 이 컨테이너 4 vCPU 공유, Node 24.22.1, pnpm 11.28.9, TS 7.0.2, vitest 5.0.5, Chromium 153.0.8010.12(Playwright 1.63.0), PostgreSQL 16)
| 명령·확인 | 결과 |
|---|---|
| `pnpm --filter @terra/game typecheck` | 통과 |
| `TEST_DATABASE_URL=… pnpm check` | 통과. 시험 파일 85개, 시험 715개(새 17개: 계획 10, GPU 완료 5, 요약 1, 일감 1). 다국어 키 252개, 파일 크기 경고 없음 |
| `node scripts/check-docs.mjs origin/main`, `pnpm docs:index --check` | 통과(이 기록을 넣고 목차를 다시 만든 뒤) |
| `pnpm build`, `node scripts/check-pwa.mjs` | 통과. 미리 캐시 26개(1,088.62KiB), `gpuBench` 0개. 첫 화면 JS 368,176B(측정 코드 없음) |
| 셰이더 글(three 빌드 파일을 직접 연 시험 쪽, Xvfb) | 기본 `modelViewMatrix = ( cameraViewMatrix * nodeUniform5 )`, 전역 `highPrecision`·재질 `contextNode`는 `modelViewMatrix = highpModelViewMatrix`(WebGPU·WebGL2 백엔드 모두) |
| 누르기 전 받은 측정 파일 | 0개(모든 실행에서 Resource Timing으로 확인) |
| 쪽 가로 넘침 | 390px·320px 모두 없음(`scrollWidth` = `clientWidth`) |
| 사진(파스텔·다크) | 저장소 밖 작업 폴더 `s2-webgpu/fix-*.png`: 판, 재는 중(9장, WebGPU·WebGL2 + TSL 모두 행성이 그려짐), 결과 |
| 헤드리스 기본(영어 320px) | 어댑터 없음(첫 요청 4.8ms) → "WebGL2 fallback"(초기화 23.4ms) → 뒤 WebGPU 2개 "Skipped" |
| 헤드리스 `--enable-unsafe-webgpu` | WebGPU 3줄 "실패"(완료 알림 361~362개 모두 실패, fps 가짜 60) |
| Xvfb + SwiftShader | 6번 모두 9줄 "됨". `first_use`는 40타일 GLSL·WebGPU 줄, 줄 순서는 타일 수마다 돌아감 |
| 재는 중 멈춤(영어) | 2번째 측정 중 [멈춤] → 16.6초에 끝, 잰 2줄(둘째 "Stopped") + "Stopped. Showing the results so far." |

## 잰 값 (요약, 휴대폰 값이 아니다. 중앙값, 6번)
- 컴파일 + 첫 그리기: 40타일 83·87·65ms, 160타일 125·110·81ms, 320타일 117·130·169ms(GLSL·WebGPU·WebGL2 + TSL). 비슷하다. 앞 기록의 "TSL 컴파일 5~8배"는 측정 방법 탓이었다.
- `render()` CPU: 160타일 1.2 대 3.1·2.9ms, 320타일 2.2 대 6.3·6.6ms(TSL 약 2.5~3배). `highPrecision`을 켜서 앞 기록(약 2배)보다 커졌다.
- GPU 쪽: GPU 완료/초 ≈ fps, 세 방식이 오차 안에서 같다(소프트웨어 GPU 병목).
- 초기화: WebGPU 9~17ms + 첫 어댑터 요청 33~87ms, WebGL2 첫 컨텍스트 40~70ms·그 뒤 24~32ms. 순서·데움에 따라 달라 비교하지 않는다.
- 미리 캐시: main 대비 +52.7KiB(모든 사용자, 서비스 워커 설치·갱신 때). 측정 조각(TSL 687.94KB 등)은 누를 때만 받는다.
- 권고는 그대로: 지금은 WebGL2 + GLSL 유지. 헤드리스로는 더 분명해졌지만 GPU 쪽은 휴대폰에서만 알 수 있어 사용자가 정한다.

## 함께 바꿔야 하는 파일
- `packages/engine`의 `three` 판을 올리면 `apps/game`의 `three`·`@types/three`도 같은 판으로 올린다. 다르면 three가 두 벌 묶인다.
- three 판을 올리면 측정판이 기대는 three 내부 동작을 다시 본다: `highPrecision`, `compileAsync`의 물체별 쉼(`yieldToMain`), `WebGLProgram` 링크 확인 시점, 호환 모드 MSAA.
- 측정판을 지울 때(결정 뒤): `GpuBenchPanel.tsx`, `admin/gpuBench/`(새 `gpuBenchPlan.ts` 포함), `AdminPage.tsx`의 import·자리, 문구 `gpu_bench_*`(ko·en), `vite.config.ts`의 `globIgnores` 줄, `apps/game`의 `three`·`@types/three`(다른 곳에서 안 쓰면), `scripts/pwa-build.mjs`의 `ADMIN_ONLY_CHUNK`와 시험(남겨도 해는 없다).
- WebGPU를 고르면: 조사 문서 8장(S1 엔진 4파일, 재질마다 카메라 기준 좌표, ADR 36 렌더러, 지도 라벨 대안).

## 건드리지 말 것
- TSL 세션의 `highPrecision`을 끄지 않는다. 끄면 TSL 줄이 카메라 기준 좌표 규칙을 어긴 채 잰다.
- 컴파일 장면을 "모든 타일"로 되돌리지 않는다. 사파리에서 물체마다 한 프레임 기다리는 시간이 컴파일로 잡힌다.
- 두 GPU 완료 재기의 시각 재는 방법을 따로 바꾸지 않는다(API끼리 비교가 깨진다).
- 첫 화면 코드에서 `three`·측정판을 정적으로 import하지 않는다. `globIgnores`의 첫 항목(`**/node_modules/**/*`)은 Workbox 기본값이라 지우지 않는다.

## 미검증·TODO·알려진 문제
- **휴대폰 측정이 남았다**(조사 문서 6장): 사용자 휴대폰(웨일 + 같은 기기 크롬·삼성 인터넷), 중가 안드로이드(가능하면 Xclipse 1대·Snapdragon 1대), 아이폰(iOS 26). 배포는 메인 세션 몫이다.
- `no_msaa`(WebGPU 호환 모드) 줄은 이 컨테이너에 그런 어댑터가 없어 실제로 본 적이 없다(코드와 시험만).
- 사파리에서 `compileAsync`가 물체마다 한 프레임 기다린다는 것은 코드로 계산한 값이다(아이폰 미실행).
- 재질마다 켜는 `contextNode`와 `InstancedMesh`를 한 장면에서 그려 보지 않았다(미실행).
- `KHR_parallel_shader_compile`이 있는 기기에서 컴파일 칸이 어떻게 나오는지 재지 않았다(이 SwiftShader에는 없다).
- 이 세션에서 developer.chrome.com·webkit.org·caniuse.com이 막혀 두 블로그 글의 공개일은 U다.
- AGENTS.md 6장에 넣을 만한 확인 사항 후보(메인 세션이 정한다, 앞 기록의 후보에 더해)
  - three 0.186.1 TSL: 모델뷰 기본은 셰이더 32비트 곱셈. `renderer.highPrecision = true`면 CPU 64비트(three 설명: `InstancedMesh`·`SkinnedMesh`와 함께 못 씀). 재질마다는 `material.contextNode = context({ modelViewMatrix: highpModelViewMatrix, modelNormalViewMatrix: highpModelNormalViewMatrix })`.
  - three 0.186.1 `WebGPURenderer.compileAsync`: 물체마다 노드 짓기·버퍼 올리기·파이프라인 기다리기 뒤 `scheduler.yield`(없으면 `requestAnimationFrame`, 사파리)로 쉰다. `WebGLRenderer.compileAsync`는 `KHR_parallel_shader_compile`이 없으면 10ms 뒤 풀리고 링크 확인은 첫 그리기에서 한다.
- 시험 DB(`terra_s2fix`, 이 컨테이너의 임시 PostgreSQL)와 가짜 관리자 계정은 저장소 밖이다. 비밀번호는 커밋하지 않았다.

## 사용자 결정 대기
- 셰이더 언어(WebGL2 + GLSL 유지 / WebGPU + TSL로 옮기기): 휴대폰 측정 값을 본 뒤. 권고는 WebGL2 + GLSL 유지이고, GPU 쪽을 모르는 동안은 가까운 판단으로 둔다.
