# 행성 편집기 1단계 WP-H: 개발자 홈(/dev), 셰이더 측정판을 /dev/gpu-bench로 옮김, 미리 캐시 규칙 DEV_ONLY_CHUNK

- 일시: 2026-10-30 02:20 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-planet-editor-stage1.md`(38, 제안) 1절(개발자 도구 한곳)·15절 WP-H 줄, ADR `2026-10-29-app-shell.md`(37, 제안) 1~3절(주소 표·뒤로·틀·사이드 메뉴), 작업 기록 `29-2310-app-shell-w1.md`(W1의 꽂는 줄)·`30-0120-app-shell-w1-review.md`·`30-0140-app-shell-w125-integration.md`, `29-2013-planet-editor-core.md`·`29-2010-editor-flatmap.md`(미리 캐시 대소문자)
- 작업 자리: 작업 트리 `.claude/worktrees/editor-devhome`, 가지 `work/editor-devhome`. main `51ddd5f`에서 시작했고, 끝내기 전에 main `51a14e5`(W3 합치기 뒤) 위로 옮겼다(`git rebase`, 충돌 없음). 푸시·합치기는 하지 않았다.

## 한 일
- 개발자 홈 `/dev`(주소 `dev`, 틀 있음, 부모 `home`, dev·admin): `apps/game/src/editor/DevHome.tsx`.
  - 도구 두 줄: 행성 편집기(`/dev/planet-editor`), 셰이더 측정(`/dev/gpu-bench`). 줄마다 아이콘·이름·한 줄 설명. 행성 편집기는 화면이 아직 준비 중 화면이라(WP-D 전) "준비 중" 칩을 붙였다.
  - 도구 목록은 주소 표에서 부모가 `dev`인 줄과 같다. 그런 줄이 늘면 도구 표(`DEV_TOOLS`)에서 타입 오류가 난다.
  - 도구 줄은 장난감 버튼처럼 아래 턱이 있고 누르면 들어간다(디자인 토큰만, `devHome.css`). 셰이더 측정 아이콘(속도계)·줄 끝 화살표는 이 폴더(`devIcons.tsx`)에 두었다(`ui/icons.tsx`는 첫 화면 묶음).
- 셰이더 측정판을 관리자 화면에서 개발자 영역으로 옮겼다(ADR 38 1절).
  - `git mv`: `admin/gpuBench/*` → `editor/gpuBench/*`, `admin/GpuBenchPanel.tsx` → `editor/GpuBenchPage.tsx`. 측정 코드 파일 이름(앞머리 `gpuBench`)은 그대로다. 시험 4개 파일(`gpuBench*.test.ts`)도 그대로 통과한다.
  - 화면 `/dev/gpu-bench`(주소 `dev_gpu_bench`, 틀 있음, 부모 `dev`): 제목(h1)은 주소 표 화면 이름, [뒤로], 촘촘 변형. 측정판 제목 키 `gpu_bench_title`을 지우고 결과 소제목을 h3 → h2로 올렸다. 판을 가르던 위 선(관리자 화면 안에서 쓰던 것)을 뺐다.
  - 화면 조각 진입은 `editor/gpuBench/gpuBenchScreen.ts`(GpuBenchPage를 다시 내보내기만 함)다. 아래 "정한 것" 참고.
  - 관리자 화면(`/admin`)에는 계정·운영 기능만 남았다. 준비 중 화면 표(`sections/ComingSoon.tsx`)에서 개발자 홈·셰이더 측정 줄을 뺐다(행성 편집기만 남음).
- 주소 → 화면 표(`shell/routeViews.tsx`)에는 `dev`·`dev_gpu_bench` 줄과 지연 로딩 두 줄만 고쳤다(머리 주석·처리함·홈 줄은 건드리지 않았다).
- 미리 캐시 규칙: `ADMIN_ONLY_CHUNK` → `DEV_ONLY_CHUNK` = `/^assets\/(gpuBench|[Pp]lanetEditor)[^/]*\.(js|css)$/`(ADR 38 1절 그대로). `vite.config.ts` `workbox.globIgnores`에 `assets/gpuBench*.{js,css}`·`assets/[Pp]lanetEditor*.{js,css}`. `scripts/pwa-build.test.mjs`를 고치고 시험 2개를 더했다(개발자 도구 진입 파일 이름).
- 화면 시험 `e2e/dev.spec.ts` 12개(W5 시험 틀).
- 문서: ADR 38 "구현하며 정한 것" WP-H, AGENTS.md 6장(Vite 조각 이름 확인 사항), 이 기록, 목차.

## 정한 것 (ADR 38 끝 "구현하며 정한 것 — WP-H 개발자 홈"에 옮겼다)
- 셰이더 측정 화면 조각의 진입 파일 `gpuBench/gpuBenchScreen.ts`: ADR 38 1절 정규식은 소문자 `gpuBench`만 맞는다. 1절이 정한 화면 파일 `GpuBenchPage.tsx`를 바로 `import()`하면 조각이 `GpuBenchPage-*.js`(대문자 G)가 되어 모든 플레이어에게 미리 캐시된다. 정규식("정확히 이 식")도 화면 파일 이름도 바꾸지 않고, 1절 "진입 파일 이름 앞머리를 지킨다"를 다시 내보내기 파일로 맞췄다. 빌드 조각은 `gpuBenchScreen-*.js`(GpuBenchPage·gpuBenchSummary·gpuBenchTypes와 문구 65개)·`gpuBenchScreen-*.css`다(Verified: 소스 맵).
- 개발자 홈 조각(`DevHome-*.js`·`.css`)은 1절 이름 규칙 밖이라 미리 캐시된다(gzip 약 1.2KB + 0.6KB).
- `globIgnores` 글롭은 `**/` 없이 `assets/…`로 써서 정규식과 같은 파일(dist 바로 아래 `assets/`)만 뺀다. 빌드 뒤 `check-pwa.mjs`가 한 방향(정규식에 걸리는 파일이 미리 캐시되지 않음)을 본다.
- 진입 파일 이름 시험(`scripts/pwa-build.test.mjs`): `apps/game/src/editor/` 아래 시험 아닌 `.ts`·`.tsx`와 `shell/routeViews.tsx`에서 `import("…")`·`new URL("…", import.meta.url)`이 가리키는 개발자 도구 폴더 안 파일의 이름(확장자 뺌)을 조각 이름 꼴로 만들어 `DEV_ONLY_CHUNK`에 대 본다. 개발자 홈(`DevHome.tsx`)만 뺀다. routeViews가 `GpuBenchPage.tsx`를 바로 가져오면 실패하는 것을 확인했다(Verified: 임시로 바꿔 돌림 → 2개 실패, 되돌림).
- 화면 문구 키 앞머리는 `dev_`(`dev_home_lead`·`dev_home_tools`·`dev_tool_planet_editor_desc`·`dev_tool_gpu_bench_desc`·`dev_tool_soon`). 홈 제목은 `shell_dev`, 도구 이름은 `shell_route_dev_*`를 다시 쓴다. 다국어 381개 키(376 + 6 − 1).
- 화면 시험 계정: 시험 틀에는 player·admin만 있다(`e2e/global-setup.ts`). dev 역할로는 화면을 열지 않았다. dev 역할이 개발자 영역을 여는 규칙은 주소 표 단위 시험(`packages/shared/src/routes.test.ts` `canOpenRoute`)이 본다.

## 확인 (Verified: 이 작업 트리, Node 24.22.1, pnpm 11.28.9, 헤드리스 Chromium 1243(Playwright 1.63), PostgreSQL 16 시험 클러스터 `127.0.0.1:55432`, 가짜 계정만. 부하 평균 5~15)
| 명령 | 결과 |
|---|---|
| `pnpm check`(main `51a14e5` 위로 옮긴 뒤, 2분 17초) | 통과: 포맷·린트·타입·경계·크기·다국어 418개 키·대비 136쌍(화면 CSS 16개)·콘텐츠 `core@3 (ca75451a06b5)`, 시험 파일 166개 통과·9개 건너뜀, 시험 1,638개 통과·81개 건너뜀(DB 없이) |
| 중간 커밋 3개(`51ddd5f` 위 처음 커밋들: 측정판 옮김·개발자 홈·미리 캐시 규칙) | 커밋마다 게임 앱 `typecheck`·`oxlint --type-aware --deny-warnings apps/game/src scripts`·`vitest run scripts/pwa-build.test.mjs apps/game/src/editor apps/game/src/shell`·`check-i18n` 통과(저장소 밖 작업 트리에서 커밋을 차례로 꺼내 돌림) |
| `pnpm --filter @terra/game build` + `node scripts/check-pwa.mjs` | 통과. 미리 캐시 43개 1,248.97KiB(main `51a14e5`: 42개 1,265.40KiB). 더한 것은 `DevHome-*.js`·`.css`, 빠진 것은 Paraglide `runtime` 조각(`index`에 들어감). `gpuBench*`는 0개(조각 `gpuBenchScreen`·`gpuBenchRunner`·`gpuBenchGlsl`·`gpuBenchScene`·`gpuBenchTsl`·`gpuBenchScreen.css` 모두 빠짐) |
| `pnpm check:bundle` | 126,051B / 131,416B(남음 5,365B). main `51a14e5` 126,188B(−137B). 첫 화면 소스 모듈 243개 그대로(소스 맵 비교, 개발자·관리자 모듈 없음). 조각 5개 → 4개(`runtime` 조각이 `index`로). 처음 바탕 `51ddd5f` 위에서는 123,416 → 123,847B(+431B, `index` + `device` → `index` + `jsx-runtime`, 모듈 237개 그대로). 상한은 올리지 않았다 |
| 조각 크기(main `51a14e5` 위) | `gpuBenchScreen` JS 17.56kB(gzip 6.78kB)·CSS 3.40kB, `DevHome` JS 2.52kB(gzip 1.22kB)·CSS 1.90kB(0.59kB), `AdminPage` JS 23.87 → 6.59kB·CSS 5.57 → 1.91kB, `gpuBenchRunner` 13.30kB, `gpuBenchTsl` 687.94kB |
| `TEST_DATABASE_URL=… pnpm e2e`(`51ddd5f` 위, 02:03 KST) | 29개 통과(3.1분: dev 12 + shell 15 + smoke 2). 빈 캐시 행성 굽기 59.7초 |
| `TEST_DATABASE_URL=… pnpm e2e`(main `51a14e5` 위로 옮긴 뒤) | 29개 통과(1.0분, 행성 캐시 있음) |
| break-ui 임시 시험(저장소 밖 `zz-breakui.spec.ts`, 시험 틀 위에서 돌리고 지움) | 9개 통과. 390·320px × 한국어·영어 × 글자 100%·200%, 셰이더 측정 진행 창(재는 중)과 멈춘 결과(빈 값 "–" 포함), 다크 결과 |

### 화면 시험 `e2e/dev.spec.ts` (12개)
- admin: 서랍 [개발자] → `/dev`(도구 2줄, 행성 편집기만 "준비 중" 칩, 설명 있음, 사이드 메뉴 [개발자]가 `aria-current="page"`) → [셰이더 측정] → `/dev/gpu-bench`(방식 3개·[측정 시작]) → [뒤로] `/dev` → [뒤로] `/`. 기기 오류 없음.
- admin: 행성 편집기 줄 → 준비 중 화면(틀 숨김) → [뒤로] `/dev`. 바로 연 `/dev/gpu-bench`의 [뒤로]는 부모 `/dev`로 바꾼다(기록 길이 그대로).
- admin: WebGL2 + GLSL만 골라 [측정 시작] → 측정 창이 열리고 진행 글이 보인다 → [멈춤] → 창이 닫히고 요약이 나온다, 고르기가 다시 열린다. 기기 오류 없음. 약 9초(전체 측정 약 2분은 돌리지 않았다).
- admin: `/admin`에 측정판(`.bench`·`.bench-modes`·측정 창)이 없다.
- admin: 320px 한국어·영어 — 개발자 홈·셰이더 측정에 가로 넘침 없음, 누르는 곳 44px 이상.
- admin: 390px 파스텔·다크 × 한국어·영어 사진 8장(가로 넘침도 본다).
- player: 서랍에 [개발자]가 없다. `/dev`·`/dev/planet-editor`·`/dev/gpu-bench`는 권한 없음 화면. 기기 오류 없음.

## 사진 (저장소 밖)
- `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/editor-devhome/shots/` — `dev-home-390-{pastel,dark}-{ko,en}.png`, `dev-gpu-bench-390-{pastel,dark}-{ko,en}.png`(8장, `51ddd5f` 위 빌드)
- `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/editor-devhome/shots-rebased/` — 같은 8장(main `51a14e5` 위로 옮긴 뒤)
- `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/editor-devhome/breakui/` — `bu-home-{390,320}-{ko,en}-200.png`, `bu-bench-hud-{390,320}-{ko,en}.png`(재는 중), `bu-bench-result-{390,320}-{ko,en}.png`·`-200.png`, `bu-bench-result-390-dark-en.png`(17장)

## 스킬 검토
- `web-design-guidelines`(규칙 원문을 받아 봄): 링크는 `<a href>`(AppLink), 꾸밈 아이콘 `aria-hidden`, 제목 차례 h1 → h2, 초점 테두리, 마우스 기기에서만 올림 색, `touch-action: manipulation`, 줄의 글자 칸 `min-width: 0`, 동작 줄이기면 시간 토큰 0, 알림 영역(측정판 그대로). 고친 것: 영어 칩을 Title Case로("Coming Soon", 기존 `shell_coming_soon`과 같게). 그대로 둔 것: 누름 움직임의 `box-shadow` 전이(디자인 시스템 버튼과 같다), 제품 이름(WebGL2·WebGPU)의 `translate="no"`(문구 문장 안이라 감싸지 않음).
- `break-ui`(390px 기준, 320px·글자 200%·다크도): 이 화면 값은 모두 정해진 문구다(사람이 넣는 값 없음). 빈 값은 멈춘 측정의 결과 칸("–")으로 봤다.

| # | 무게 | 값 | 생기는 일 | 고칠 안 |
|---|---|---|---|---|
| 1 | Ugly(320px + 글자 200%에서만) | 영어 도구 이름 "Shader Benchmark" | 줄의 아이콘 칩 44px·화살표 24px·틈이 글자 칸을 약 164px로 줄여 "Benchmar/k"로 끊긴다(`overflow-wrap: anywhere`). 390px에서는 200%에서도 끊기지 않는다 | 줄이 좁으면(목록 컨테이너 쿼리 약 14em 미만) 꾸밈 화살표를 숨긴다. 받아들이고 고치지 않았다(W1이 받아들인 200% 탭 이름 말줄임과 같은 극단 경우) |
| 2 | Fragile(그대로) | 결과 표 | 좁은 화면에서 오른쪽 열이 밀리는 영역 끝에서 잘린다(흐림·스크롤 표시 없음). 초점을 받는 이름 있는 영역이라 밀 수는 있다 | 측정판에 원래 있던 모양이다. 이 일에서는 바꾸지 않았다 |

  - 견딘 것: 390·320px 한국어·영어(글자 100%) 가로 넘침 0·작은 누르는 곳 0, 390px 글자 200%(한국어는 낱말 단위로 접힘), 긴 영어 제목에서 [뒤로]가 다음 줄로 내려감, "준비 중" 칩이 줄바꿈되지 않고 이름 다음 줄로 내려감, 측정 진행 창(320px에서 진행 글이 접히고 [멈춤]이 남음), 요약 글의 긴 기기 문자열(접힘), 빈 결과 값("–"), 다크 테마.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/editor/DevHome.tsx`·`devHome.css`·`devIcons.tsx`(새로) | 개발자 홈 화면·도구 줄·아이콘 |
| `apps/game/src/editor/GpuBenchPage.tsx`(← `admin/GpuBenchPanel.tsx`) | 셰이더 측정을 화면으로: 기본 내보내기, h1·[뒤로]·촘촘 변형, 소제목 h2 |
| `apps/game/src/editor/gpuBench/*`(← `admin/gpuBench/*`) | 옮김. 실행기·공용 모양 주석, CSS 머리 주석과 관리자용 위 선 지움 |
| `apps/game/src/editor/gpuBench/gpuBenchScreen.ts`(새로) | 화면 조각 진입(조각 이름 `gpuBench…` → 미리 캐시에서 빠짐) |
| `apps/game/src/admin/AdminPage.tsx` | 측정판을 뺌(계정·운영 기능만) |
| `apps/game/src/shell/routeViews.tsx` | `dev`·`dev_gpu_bench` 줄과 지연 로딩 두 줄(꽂는 줄) |
| `apps/game/src/sections/ComingSoon.tsx` | 준비 중 화면 표에서 개발자 홈·셰이더 측정 줄을 뺌 |
| `apps/game/messages/ko.json`·`en.json` | `dev_` 키 5개 더함, `gpu_bench_title` 지움 |
| `scripts/pwa-build.mjs`·`pwa-build.test.mjs` | `DEV_ONLY_CHUNK`와 시험(JS·CSS·대문자 편집기 화면, 진입 파일 이름) |
| `apps/game/vite.config.ts` | `workbox.globIgnores`를 같은 파일로 |
| `e2e/dev.spec.ts`(새로) | 개발자 영역 화면 시험 12개 |
| `docs/adr/2026-10-29-planet-editor-stage1.md` | "구현하며 정한 것" WP-H |
| `AGENTS.md` | 6장: Vite(rolldown) 다시 내보내기 진입의 조각 이름, 첫 화면 조각 나눔 변화(2026-10-30 확인) |
| `docs/worklog/2026/10/30-0220-editor-devhome.md`, `docs/WORKLOG.md` | 이 기록, 목차(`pnpm docs:index`) |

## 함께 바꿔야 하는 파일
- WP-D(편집기 화면)
  - `shell/routeViews.tsx`의 `dev_planet_editor` 줄(꽂는 줄 주석이 있다)을 편집기 조각으로. 지연 로딩 진입 파일 이름은 `planetEditor…` 또는 `PlanetEditor…`여야 한다(`scripts/pwa-build.test.mjs`가 막는다). 편집기 안에서 따로 지연 로딩하는 것(평면 미니맵 등)도 진입 이름을 `planetEditor…`로.
  - `editor/DevHome.tsx` `DEV_TOOLS.dev_planet_editor.ready`를 true로(칩이 빠진다).
  - `sections/ComingSoon.tsx`: `ComingSoonRoute`의 Exclude에 `dev_planet_editor`를 더하고 SECTIONS 줄을 뺀다(틀을 숨기는 화면 쪽 갈래도 그때 정리).
  - 빌드 뒤 `dist/sw.js` 미리 캐시 목록에 편집기 모듈이 든 조각이 없는지 소스 맵으로 본다(공용 조각 이름은 진입 파일 이름이 아니다, ADR 38 WP-H "남은 틈").
- 나중 도구(`/dev/<도구>`): 주소 표에 줄(부모 `dev`, dev_admin)을 더하면 `DEV_TOOLS`에서 타입 오류가 난다 → 한 줄(이름 `shell_route_dev_<도구>`, 설명 `dev_tool_<도구>_desc`, ko·en). 그 도구 조각을 미리 캐시에서 빼려면 진입 파일 앞머리와 `DEV_ONLY_CHUNK`·`globIgnores`를 함께 고친다(지금 식은 두 앞머리만이고 ADR 38 1절 문장이다).
- 통합: `shell/routeViews.tsx` 머리 주석 셋째 줄의 "개발자 영역 ADR 38 WP-H·WP-D"는 WP-D만 남겨도 된다. W4 합치기가 같은 줄("홈 W4")을 고칠 것이라 이 가지는 건드리지 않았다.
- 합칠 때 `docs/WORKLOG.md`는 main이 더 움직였으면 `pnpm docs:index`로 다시 만든다.

## 건드리지 말 것
- `editor/gpuBench/gpuBenchScreen.ts`를 지우거나 routeViews가 `GpuBenchPage.tsx`를 바로 `import()`하게 바꾸지 않는다(화면 조각이 미리 캐시된다. 시험이 막는다).
- 측정 코드 파일 이름 앞머리 `gpuBench`(조각 이름 → 미리 캐시 규칙).
- `DEV_ONLY_CHUNK` 식은 ADR 38 1절 문장이다. 바꾸려면 ADR에 적는다.

## 미검증·TODO·알려진 문제
- dev 역할 계정으로 화면을 열어 보지 않았다(시험 틀 계정이 player·admin뿐). 화면 가림은 주소 표의 같은 규칙(`canOpenRoute`)이고 단위 시험이 본다.
- 실제 휴대폰(웨일·iOS Safari)에서 보지 않았다(Unknown). 셰이더 측정 전체(약 2분)는 이번에 돌리지 않았다(헤드리스에서 시작 → 멈춤만, WebGL2 + GLSL만).
- 320px + 글자 200%에서 "Shader Benchmark"가 낱말 가운데서 끊긴다(위 break-ui 1).
- 결과 표 오른쪽 열이 잘려 보인다(위 break-ui 2, 원래 모양).
- 공용 조각 틈(Assumed): 개발자 조각끼리 함께 쓰는 모듈만 든 조각은 진입 파일이 아니라 안의 모듈 이름을 딴다. 앞머리 없는 이름이면 미리 캐시된다. 시험은 진입 파일 이름만 본다(위 WP-D 할 일).
- 저장소 밖에 남긴 것: 비교용 작업 트리 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/editor-devhome/base-tree`(detached, 끝낼 때 지운다), 임시 시험 `zz-breakui.spec.ts`·도구 `first-screen-modules.cjs`.

## 사용자 결정 대기
- 없음.
