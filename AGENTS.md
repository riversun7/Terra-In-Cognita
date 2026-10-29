# AGENTS.md

이 파일은 이 저장소에서 일하는 모든 AI 에이전트(Claude Code, Antigravity, Gemini CLI 등)와 사람을 위한 공통 지침이다.
`CLAUDE.md`는 이 파일을 불러온다. 지침은 여기 한 곳에서만 고친다.

## 1. 프로젝트

**Terra In-Cognita** — 사이보그·미니언 기반 전략 게임. 단일 월드(EVE식 통합 경제), 3D 행성 지도(1차맵) + 주 활동 공간(2차맵), 자동 행동·자동전투 + 유저 개입, HTS급 거래창, 개발자용 행성 편집기.
모바일 웹 1순위, 데스크톱 2순위(PWA). 한국어 기본, 영어 필수.

## 2. 작업 전에 읽을 것

1. `docs/PLAN.md` — 계획서(무엇을, 왜). 구조·기술스택·규칙의 기준.
2. `docs/PROTECTED.md` — 승인 없이 바꾸면 안 되는 것.
3. `docs/worklog/` 최근 항목 — 직전 작업 상태와 남은 일.
4. 관련 `docs/adr/` — 그 영역의 결정과 이유.

기획(게임 규칙·수치)은 `docs/design/`에 있다. 기획 세션이 관리하는 원본의 복사본(미러)이라 내용을 고치지 않는다. 동기화(원본을 그대로 복사)는 기술 세션이 한다(기획 결정 D-132, 절차는 `docs/design/README.md`).

## 3. 작업 흐름

- 기본은 `main`에서 바로 작업한다(트렁크 기반). 여러 에이전트가 동시에 큰 작업을 할 때만 짧은 브랜치·worktree를 쓰고 빨리 합친다. 같은 브랜치를 동시에 쓰지 않는다.
- 푸시 전 `git pull --rebase`. **main의 CI가 실패 상태면 다른 일보다 먼저 고친다.**
- 커밋 메시지는 Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `perf:`, `build:`, `ci:`, `chore:`. 커밋 하나에 목적 하나.
- 한 작업이 끝나면 작업 기록을 남긴다(5장).

## 4. 코드 규칙

- 주석은 **한국어**, 이름(변수·함수·타입·파일)은 **영어**. 파일명은 영문 ASCII만.
- TypeScript strict. 의존성 버전은 **정확히 고정**한다(`^`, `~` 금지).
- **새 런타임 의존성 추가는 ADR 필수**(이유·대안·라이선스). 버전 올림·개발 도구는 제외.
- 파일 크기: 600줄 초과 경고, 1,000줄 초과 CI 실패(자동 생성 파일 제외). 넘으면 나눈다.
- 모듈 경계(도구로 강제):
  - `apps/*` → `packages/*` 방향만 허용(예외는 아래 게임 앱 → 서버 타입 하나).
  - `packages/engine`은 `apps/server`·`packages/sim`을 import하지 않는다.
  - `packages/sim`은 `packages/engine`·DOM API를 쓰지 않는다.
  - `@terra/planet`은 정수 진입점(`.`)과 실수 투영(`./projection`)을 나눈다. 투영은 `@terra/shared`의 결정적 근사(`detTan`·`detAtan`)를 써서 엔진과 무관하게 같은 값을 낸다. 패키지 전체(격자·투영·생성기)의 결정성을 경계 검사가 본다(ADR `2026-10-29-cell-key-layout.md`, `2026-10-29-s2-planet-lod.md`). 판정 코드는 칸 키·이웃(정수 진입점)을 쓴다.
  - `apps/game`은 `packages/sim`을 import하지 않는다(판정 코드를 기기로 보내지 않음).
  - `packages/protocol`·`packages/shared`는 다른 내부 패키지를 import하지 않는다.
  - `apps/game`은 `apps/server`를 **타입으로만** 가져온다(tRPC 라우터 타입): `import type { AppRouter } from "@terra/server/trpc"`. 값 import, `import { type X }`, 동적 `import()`는 검사에서 실패한다. `@terra/server`는 게임 앱 `devDependencies`에만 둔다(ADR `2026-10-28-trpc-type-sharing.md`).
  - 게임 앱 코드(`apps/game/src`)는 Node 전역(`process`, `Buffer` 등)과 Node 내장 모듈을 쓰지 않는다. 타입 검사로는 못 막아서(`@trpc/client` 타입이 `@types/node`를 불러온다) oxlint가 막는다.
- **서버 권위**: 자원 획득, 전투 결과, 거래·잔고, 아이템 생성, 조우, 소유권 판정은 서버만 한다.
- 판정 코드(`packages/sim` 등)에서는 `Math.random`, `Date.now`, `Math.sin/cos/tan/exp/log/pow` 같은 초월함수와 `**` 연산자를 쓰지 않는다. 시드 난수(`createRng`)와 `packages/shared`의 결정적 수학 함수(`detSin`·`detCos`·`detTan`·`detAtan`·`detAtan2`·`detAsin`·`detExp`, 오차 1~3ulp)를 쓴다.
- 금액은 최소 단위 정수(`BigInt`, DB `int8`). 소수점 실수 계산 금지.
- DB 표 정의는 `apps/server/src/db/schema.ts`. 바꾸면 `pnpm --filter @terra/server db:generate`로 마이그레이션을 만들어 함께 커밋한다. 마이그레이션은 **직전 버전 앱이 그대로 돌 수 있게** 만든다(추가 → 코드 전환 → 다음 배포에서 정리). 올라간 마이그레이션은 고치지 않는다(ADR `2026-10-28-db-access-and-migrations.md`).
- 게임 상태를 바꾸는 명령은 WebSocket 프로토콜(`packages/protocol`)로만 보낸다. tRPC는 조회와 비실시간 기능용(프로시저는 `apps/server/src/trpc/`, 기기 클라이언트는 `apps/game/src/net/api.ts`).
- UI 문자열은 메시지 키로만 쓰고, 한국어와 영어를 **함께** 추가한다(영어 누락 시 빌드 실패).
- 콘텐츠 팩(`content/<팩 ID>/`, ADR `2026-10-28-content-pack-format.md`):
  - ID는 영어 snake_case(`^[a-z][a-z0-9_]{1,47}$`), 분류 안에서 하나. 한 번 쓴 ID는 다시 쓰지 않는다.
  - 이름·설명은 `{"ko": …, "en": …}` 둘 다 적는다.
  - 내용을 바꾸면 `manifest.json`의 `version`을 올린다. ID를 지우거나 바꾸면 `id-changes.json`에 기록을 **뒤에 추가만** 한다(고치거나 지우지 않음).
  - 게임 규칙·수치는 기획(`docs/design/`)에서 정한 것만 넣는다. 지금 팩은 형식 확인용 임시 데이터(`placeholder: true`)다.
  - 형식(스키마)은 `packages/content`. 이 패키지는 빌드 없이 `node`로 바로 실행되므로 지울 수 있는 TS 문법만 쓰고(`erasableSyntaxOnly`), Node API는 `src/node/`에서만 쓴다.
- 비밀값(비밀번호, 토큰, `.env`)을 커밋하지 않는다. 관리자 화면 코드에도 비밀값·시드를 넣지 않는다.

## 5. 기록 규칙

| 문서 | 언제 | 규칙 |
|---|---|---|
| `docs/worklog/YYYY/MM/DD-HHMM-<slug>.md` | 작업이 끝날 때마다 1개 | 일시(KST), 작업 도구, 한 일, 바꾼 파일과 이유, 함께 바꿔야 하는 파일, 건드리지 말 것, 미검증·TODO, 관련 ADR. 템플릿: `docs/worklog/TEMPLATE.md` |
| `docs/WORKLOG.md` | 자동 생성 | 직접 고치지 않는다(목차) |
| `docs/adr/YYYY-MM-DD-<slug>.md` | 결정할 때 | 확정된 ADR은 고치지 않는다. 바꾸려면 새 ADR을 쓰고 옛 ADR에 "대체됨" 표시만 한다. 템플릿: `docs/adr/README.md` |
| `docs/PLAN.md` | 결정이 바뀔 때 | 요약 문서. 이유는 ADR에 |
| `docs/DECISION_LOG.md` | 수정 금지 | 계획 세션의 질문·답변 원문. 새 결정은 ADR로 |
| `CHANGELOG.md` | 버전 태그 때 | git-cliff로 자동 생성 |

확인 표기: 확인한 사실은 **Verified**, 추정은 **Assumed**, 모르면 **Unknown**. 실행하지 않은 코드는 "동작한다"고 쓰지 않는다("미실행").

## 6. 버전 주의 (AI 학습 데이터보다 새로운 것)

아래는 확인된 사항만 적는다. 새로 확인하면 출처와 날짜를 붙여 추가한다.

- **TypeScript 7.0** (2026-10 기준 7.0.2): Go로 다시 만든 컴파일러. 컴파일러 API가 필요한 도구는 `@typescript/typescript6` 별칭을 쓴다.
- **Node.js**: 24 LTS 사용. 26은 LTS 전환 릴리스가 나온 뒤 전환한다. Node 25+는 corepack을 포함하지 않으므로 pnpm은 `npm i -g pnpm@<버전>`으로 설치한다.
- **PostgreSQL 18 Docker 이미지**: 데이터 경로가 `/var/lib/postgresql/18/docker`로 바뀌었다. 볼륨은 `/var/lib/postgresql`에 마운트한다(또는 `PGDATA`를 명시).
- **Drizzle ORM**: 1.0 RC(`1.0.0-rc.x`)로 시작한다. 0.x 문서의 관계형 쿼리 예제는 1.0에서 바뀌었으니 1.0 문서를 본다. 1.0.0-rc.5에서 확인한 것(2026-10-28, 패키지 코드): 마이그레이션은 폴더 하나에 하나(`drizzle/<시각>_<이름>/migration.sql`)이고, 밀린 것은 트랜잭션 하나로 적용되며, 적용 여부는 이름으로만 판단한다. 연결 설정에 `casing`·`schema` 옵션이 없다(열 이름을 직접 쓴다). `db.execute` 결과 타입이 여러 문장용이라 단순 조회는 `db.$client.query`로 한다.
- **tRPC 11** (11.19.0, 2026-10-28 확인: 패키지 코드·시험): Fastify 어댑터는 Fastify 5 이상이 필요하다. `fastifyTRPCPlugin`을 `prefix: "/api/trpc"`로 등록한다. 묶음 요청은 경로에 프로시저 이름을 쉼표로 이어서 Fastify 기본 상한(경로 매개변수 100자)에 걸린다 → `Fastify({ routerOptions: { maxParamLength: 5000 } })`. 최상위 `maxParamLength`는 Fastify 5.12에서 사용 중단 경고(FSTDEP022)가 난다. 어댑터는 자기 플러그인 범위에서만 JSON 파서를 바꾼다(다른 경로는 그대로). `@trpc/client`는 실행 중에 `@trpc/server`를 import하므로 게임 앱에도 `@trpc/server`가 필요하다. `httpBatchLink`의 `fetch` 옵션 타입은 `typeof fetch`와 맞지 않는다(`exactOptionalPropertyTypes`) → `Parameters<typeof httpBatchLink<AppRouter>>[0]["fetch"]`를 쓴다.
- **Zod 4 + tRPC 11** (zod 4.6.7, 2026-10-28 확인: 패키지 코드·시험): 입력·출력 타입은 Standard Schema로 추론된다(`transform`이 있으면 입력과 출력 타입이 다르다). 실행 검사는 Standard Schema가 아니라 Zod `parseAsync`를 쓰므로 `error.cause`는 `ZodError`다. 틀린 입력은 HTTP 400 `BAD_REQUEST`. 오류 메시지는 Zod의 영어 문제 목록(JSON 문자열)이라 화면에 쓰지 않는다(`error.data.code`로 판단).
- **TS 7 프로젝트 참조** (7.0.2, 2026-10-28 확인): `tsc -b`, composite, pnpm 링크를 거친 참조가 동작한다. composite는 가져오는 파일을 모두 `include`해야 한다(TS6307). `node_modules`를 거쳐 읽는 작업공간 패키지(`@terra/protocol` 등)는 넣지 않아도 된다. 게임 앱 `typecheck`는 `tsc -b`라서 서버 선언 파일(`apps/server/dist-types/`, 저장소에 올리지 않음)을 필요할 때 만든다. oxlint 타입 인식 린트는 선언 파일이 없어도 참조를 따라 서버 소스를 읽는다.
- **Node 24 타입 지우기** (24.22.1, 2026-10-28 확인): `node`가 `.ts`를 바로 실행한다(경고 없음). `.mjs` 검사 스크립트가 작업공간 패키지(`@terra/content`)의 `.ts`를 pnpm 링크로 가져와도 된다. enum·namespace·생성자 매개변수 속성은 안 된다 → tsconfig `erasableSyntaxOnly`(TS 7.0.2가 TS1294로 막는 것 확인). `JSON.parse` 오류 문구에는 `(line N column M)`이 있을 때도 없을 때도 있다.
- **vite-plugin-pwa 2.0.0 + workbox-window 7.4.1** (2026-10-28 확인: 패키지 코드·빌드·Playwright):
  - Vite 8.3.5(rolldown)에서 `generateSW`가 동작한다. `workbox-window`는 게임 앱 직접 의존성이어야 한다(pnpm).
  - 타입은 tsconfig `types`에 `vite-plugin-pwa/vanillajs`를 넣는다. 개발 서버의 `virtual:pwa-register`는 아무것도 하지 않는다.
  - `onNeedReload`는 SW가 바뀔 때(controlling, 원래 SW 아래 있던 화면)만 불린다. 플러그인 `updateServiceWorker()`는 등록(페이지 load 뒤) 전에는 SKIP_WAITING을 보내지 않는다.
  - workbox-window는 밖에서 생긴 첫 새 버전 뒤로 `updatefound`를 알려 주지 않는다 → `apps/game/src/pwa/updates.ts`가 직접 본다.
  - `sw.js`는 `workbox-<해시>.js`를 따로 불러온다. Vite `baseline-widely-available` = chrome111·edge111·firefox114·safari16.4·ios16.4(`toSorted`는 Firefox 115부터).
- **Better Auth 1.7.14** (2026-10-28 확인: 패키지 코드·시험):
  - import는 `better-auth/minimal`, Drizzle 어댑터는 `@better-auth/drizzle-adapter/relations-v2`(옛 `better-auth/adapters/drizzle`는 Drizzle 1.0 RC와 안 맞는다).
  - pg에서 `generateId: "uuid"`면 Better Auth가 id를 보내지 않는다 → 표에 `uuid().defaultRandom()`.
  - 표 정의 확인(`explicitSchemaCheck`)은 열 이름이 아니라 Drizzle 속성 이름을 비교한다.
  - `minPasswordLength: 0`은 기본값 8로 바뀐다(`|| 8`).
  - `NODE_ENV=test`에서는 출처 확인과 속도 제한이 꺼진다(시험에서 켜려면 따로 설정).
  - 서버에서 `auth.api`를 부르면 HTTP 보호(출처 확인, CSRF, 속도 제한, `disabledPaths`)가 돌지 않는다. 우리 경로가 직접 막는다.
  - get-session 원래 응답에는 세션 토큰과 이메일이 있다 → 다리(`src/auth/bridge.ts`)가 본문을 다시 만든다.
  - `listUsers`는 DB 오류를 삼킨다. sign-out은 JSON만 받는다(폼 본문은 415).
- **watchtower**: 개발이 중단됐다. 쓰지 않는다.
- **pnpm 11** (11.28.9, 2026-10-28 설치로 확인): `minimumReleaseAge: 1440` 때문에 공개된 지 하루가 안 된 버전은 설치되지 않는다. "버전을 찾을 수 없음"이 나오면 하루 기다리거나 그 전 버전을 쓴다. 설치 스크립트는 `pnpm-workspace.yaml`의 `allowBuilds`에 적은 패키지만 실행된다(추가: `pnpm approve-builds <이름>`). Dependabot PR이 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`으로 실패하면 하루 뒤 CI를 다시 실행한다. `minimumReleaseAge`는 낮추지 않는다(ADR `2026-10-28-dependency-updates.md`). `--frozen-lockfile` 설치는 package.json이 없는 작업공간 묶음도 잠금 파일대로 링크·설치한다(2026-10-29 확인: Docker 설치 단계 흉내).
- **Biome 2.6**: Markdown도 포맷한다. 보호 문서가 바뀌지 않게 `biome.json`에서 `**/*.md`를 뺐다. 이 제외를 지우지 않는다(2026-10-28 확인).
- **oxlint 타입 인식 린트**: `--type-aware`는 `oxlint-tsgolint` 패키지가 있어야 동작한다(2026-10-28 확인).
- **화면 빌드·시험 도구 확인 사항** (2026-10-28 확인: 디자인 시스템 구현 중 빌드·시험으로 실행)
  - Vitest 5.0.5: CSS를 `?raw`로 읽으면 기본은 빈 문자열이다. 내용이 필요한 파일은 `vitest.config.ts`의 `test.css.include`에 넣는다.
  - Paraglide 2.29.2: `getLocale()`은 처음 정한 언어(기기 언어 등)도 localStorage에 저장한다. "사용자가 고른 언어"는 따로 적어야 한다.
  - Vite 8.3.5(rolldown): 첫 화면과 지연 조각이 같이 쓰는 모듈은 별도 조각이 되고 미리 불러와진다.
  - Vite 플러그인 `transform`은 CSS 안의 `@import`로 불러온 파일에는 돌지 않는다. 고쳐 써야 하는 CSS는 JS에서 import한다.
  - Workbox 7.4.1: 미리 캐시 목록에 같은 주소·판이 두 번 있으면 하나로 친다.
  - Playwright 1.63: `context.setOffline(true)`는 이미 열린 WebSocket을 끊지 않는다. 끊김 시험은 서버를 다시 켜거나 `page.routeWebSocket` + `connectToServer()`로 한다(쿠키가 실린 채 이어진다, 2026-10-29 확인: S1 기기 연결 시험).
  - `@fastify/static` 10.1.7: `setHeaders(reply, path, stat)`는 Fastify `reply`를 받고 기본 머리글 뒤에 불린다. 그래서 `cache-control`을 덮어쓸 수 있다(패키지 코드 `index.js`).
- **three 0.186.1 + Vite 8.3.5 엔진** (2026-10-29 확인: 2차맵 엔진 구현·시험)
  - `CapsuleGeometry`의 `height`는 가운데(원기둥) 부분 길이다. 전체 키 = height + 2 × 반지름.
  - 컨텍스트를 잃으면 three는 console.log만 남긴다. 복구되면 자원을 다시 올린다. 화면은 `webglcontextlost`·`restored`를 직접 듣는다.
  - 버퍼 일부만 올릴 때는 `addUpdateRange`·`clearUpdateRanges`를 쓴다.
  - Vite는 작업공간 패키지 안의 `new Worker(new URL(…, import.meta.url), { type: "module" })`를 따로 조각으로 묶는다.
  - 헤드리스 Chromium의 WebGL은 소프트웨어(SwiftShader)라 프레임 수치는 휴대폰 기준이 아니다. 정확한 JS 메모리는 `--enable-precise-memory-info`가 있어야 보인다.
- **Node 24 서버 확인 사항** (2026-10-29 확인: S1 서버 구현·시험·빌드 실행, Node 24.22.1)
  - `node:worker_threads`는 `.ts` 진입 파일을 그대로 띄운다: Node 타입 지우기, tsx(워커가 부모 `execArgv`의 tsx 로더를 물려받음), vitest 모두. 서버 빌드는 Vite 입력에 따로 넣어 `dist/pathWorker.js`로 만들고, 시작점(`src/main.ts`)이 `import.meta.url` 기준으로 고른다.
  - Vite 8.3.5 SSR 빌드는 `new URL("…", import.meta.url)`을 고치지 않는다(자산 플러그인은 client 환경에만 돈다).
  - `perf_hooks.monitorEventLoopDelay`는 지연이 아니라 타이머 사이 간격을 적는다(쉬어도 resolution 근처, 20ms면 약 20.1ms). 지연 = 값 − resolution(`src/metrics.ts`).
  - 전역 `fetch`는 `origin` 머리글을 그대로 보내고, 전역 `WebSocket`은 `new WebSocket(url, { headers: { cookie, origin } })`를 받는다(`ops/s1-probe.mjs`).
  - `@fastify/websocket` 11.3.4 `injectWS`의 가짜 요청에는 `socket`이 없어 `request.ip`가 오류를 낸다 → 시험은 `injectWS(path, { headers, socket })`에 `remoteAddress`를 단 `net.Socket`을 넣는다.
  - `Buffer#slice`는 복사가 아니라 보기를 돌려준다. 이진 해석기는 받은 값을 일반 `Uint8Array` 보기로 바꾼 뒤 자른다(`packages/protocol` `decodeTerrain`).
  - oxlint 1.89.0 `unicorn(require-post-message-target-origin)`은 worker_threads의 `worker.postMessage`도 잡는다(브라우저 window 규칙이라 해당 없음) → 보내는 도우미 하나에서만 끈다(`src/world/pathPool.ts`의 `post`).
- **oxlint 1.89.0 규칙** (2026-10-28 확인: 시험 파일로 실행): 네임스페이스 import를 계산해서 읽으면(`m[key]`) `import(namespace)` 오류다. 키로 고르는 화면 문구는 `apps/game/src/ui/messageTable.ts` 표에 적는다. 효과(`useEffect`) 안에서 바로 setState하면 `react(set-state-in-effect)`, 그리는 중에 `ref.current`를 읽으면 `react(refs)` 오류다.
- **결정적 계산** (2026-10-29 확인: tc39/ecma262 `spec.html` main, Node 24.22.1, TS 7.0.2, oxlint 1.89.0 — 행성 생성기 구현)
  - 명세가 결과를 정확히 정하는 것: 사칙연산(IEEE 754 배정밀도, 가장 가까운 값), `Math.sqrt`·`floor`·`ceil`·`round`·`trunc`·`abs`·`min`·`max`·`sign`·`fround`·`imul`. "구현이 근사한 값"(implementation-approximated)인 것: `Math.sin`·`cos`·`tan`·`asin`·`atan`·`atan2`·`exp`·`log`·`pow`·`hypot`·`cbrt` 등과 `**` 연산자(Number::exponentiate). `Math.PI`·`E`·`LN2`·`LOG2E`·`SQRT2` 등은 "가장 가까운 Number 값"으로 정한 상수라 써도 된다.
  - Node 24.22.1의 `Math.sin`·`cos`·`tan`·`atan`·`exp`는 잰 점에서 4배 정밀도 값과 1ulp 이내였다. 브라우저 엔진은 재지 않았다(Unknown). 판정·생성 코드는 `@terra/shared` `det*` 함수를 쓴다.
  - TS 7.0.2: 타입 인수 없는 `Float32Array`는 `Float32Array<ArrayBufferLike>`이고 `new Float32Array(n)`은 `Float32Array<ArrayBuffer>`다. 두 배열을 맞바꿔 쓰는 코드(`[a, b] = [b, a]`)는 `Float32Array<ArrayBuffer>`로 적는다.
  - `pnpm check`의 oxlint는 `--deny-warnings`라 경고도 실패다. 자주 걸리는 것: `typescript(no-unsafe-type-assertion)`(`unknown`을 `as`로 좁힘 → 타입 가드나 `satisfies`), `unicorn(consistent-function-scoping)`(바깥 변수를 쓰지 않는 안쪽 함수 → 밖으로), `oxc(approx-constant)`(π 리터럴 → `Math.PI`), `unicorn(no-new-array)`(`new Array(n)` → `Array.from({ length: n })`).
- **Paraglide JS 2** (2.29.2): 메시지 원본은 `apps/game/messages/{ko,en}.json`. 코드에서는 `import { m } from "./paraglide/messages.js"` 후 `m.app_title()`, 변수는 `m.fps({ fps })`. 언어는 `./paraglide/runtime.js`의 `getLocale`·`setLocale`·`isLocale`. `src/paraglide/`는 생성 파일(git 제외)이라 `pnpm --filter @terra/game typecheck`·`dev`·`build` 때 다시 만들어진다. 메시지 플러그인은 CDN이 아니라 설치된 `@inlang/plugin-message-format`에서 읽는다(2026-10-28 확인).

## 7. 명령어

준비: Node 24, pnpm 11.28.9(`npm i -g pnpm@11.28.9`). `pnpm install` 때 git 훅(lefthook)도 설치된다.

| 명령 | 하는 일 |
|---|---|
| `pnpm install` | 의존성 설치 + git 훅 설치 |
| `pnpm dev:server` | 서버 개발 실행 (`http://127.0.0.1:4100`, `/health`, `/ws`) |
| `pnpm dev:game` | 게임 앱 개발 실행 (Vite, `/health`·`/api`·`/ws`는 서버로 넘김. 서버 주소는 `TERRA_SERVER_URL`) |
| `pnpm check` | 포맷·린트·타입·모듈 경계·파일 크기·다국어·디자인 값(테마 대비·직접 쓴 값)·콘텐츠 팩(호환 검사 제외)·단위 테스트 (CI와 같은 검사) |
| `pnpm check:contrast` | 디자인 값 검사만: 테마 4개의 대비 쌍, 화면 CSS에 직접 쓴 색·px 값. `--print`는 대비 표 출력 |
| `pnpm format` | 포맷 자동 수정 |
| `pnpm test` | 단위 테스트만 |
| `pnpm --filter @terra/sim bench` | 판정 코어 벤치마크(임시 지형에서 경로 1,000개, 통과 폭·배치·이동 계산). `pnpm test`에는 없다. 공유 CPU에서는 값이 흔들린다 |
| `pnpm --filter @terra/planet bench [면 레벨 …]` | 행성 생성기 벤치마크(콘텐츠 팩의 S2 시험 행성, 기본 6 7 9): 단계별 시간·RSS·타입 배열·최대 RSS. 레벨마다 새 프로세스로 잰다. `pnpm test`에는 없다 |
| `pnpm --filter @terra/planet render <출력 폴더> [면 레벨] [시드]` | 생성 결과 그림(S2 시험 행성, 기본 면 레벨 7, 시드는 팩 값): 면마다 고도·바이옴·기온 PNG, 경위도 전체 5장(고도·바이옴·기온·강수·습도), 요약 수치. 출력 폴더는 저장소 밖 절대 경로로 준다(명령은 `packages/planet`에서 돈다) |
| `pnpm build` | 전체 빌드 |
| `pnpm docs:index` | 작업 기록을 추가한 뒤 `docs/WORKLOG.md` 목차를 다시 만든다 |
| `pnpm check:docs` | 코드 변경 → 작업 기록(의존성 버전만 올린 변경은 제외), 새 런타임 의존성 → ADR, 올라간 마이그레이션 수정 금지 |
| `pnpm check:content [기준 커밋]` | 콘텐츠 팩 검증: 스키마·참조·ID 변경표 + 기준 커밋(기본 upstream)의 팩과 호환. `--no-compat`은 호환 검사 빼기, `--print`는 서버 팩의 버전·해시 출력 |
| `SMOKE_URL=http://127.0.0.1:4100 node ops/smoke.mjs` | 배포 자동 점검(`/health`, WebSocket 접속 인사). 기대값은 `EXPECT_DB`·`EXPECT_CONTENT_VERSION`·`EXPECT_CONTENT_HASH`(비우면 비교 안 함) |
| `pnpm changelog --tag vX.Y.Z` | 버전 태그 직전에 `CHANGELOG.md`를 만든다(git-cliff, 설정 `cliff.toml`) |
| `pnpm --filter @terra/server db:generate` | 표 정의(`src/db/schema.ts`)에 맞는 마이그레이션을 만든다(DB 접속 없음) |
| `pnpm --filter @terra/server db:migrate` | 밀린 마이그레이션 적용(`DATABASE_URL` 필요) |
| `TEST_DATABASE_URL=postgres://… pnpm test` | DB 통합 테스트 포함(없으면 DB 테스트는 건너뜀. 접속 계정에 CREATEDB 권한 필요) |
| GitHub Actions `account-admin` (수동 실행) | NAS 운영 컨테이너에서 계정 만들기·역할 바꾸기·비밀번호 바꾸기(`dist/cli.js`, 감사 기록 남음). 비밀번호는 로그에 가려진다 |
| GitHub Actions `nas-metrics` (수동 실행) | NAS 운영 지표를 Summary에 모은다(읽기만): 서버 1분 지표, 컨테이너 CPU·메모리, 기기 성능·오류. 입력은 최근 몇 분(1~1440). 배포로 앱 컨테이너가 바뀌면 그 전 서버 지표 줄은 없다 |
| `BETTER_AUTH_URL=http://localhost:5173 pnpm dev:server` | 개발 중 로그인 시험(같은 출처 검사가 Vite 개발 서버 주소를 기준으로 하게). DB(`DATABASE_URL`)가 있어야 인증이 켜진다 |
| `NODE_ENV= PORT=4320 STATIC_DIR=apps/game/dist DATABASE_URL=… BETTER_AUTH_SECRET=… BETTER_AUTH_URL=http://127.0.0.1:4320 node apps/server/dist/main.js` | 빌드한 앱·서버로 화면 시험(Playwright 등). 운영 모드(`NODE_ENV=production`)는 https 주소를 요구하므로 비운다. 먼저 `pnpm build`, `DATABASE_URL=… node apps/server/dist/migrate.js`. 시험 계정은 `node apps/server/dist/cli.js create-user`(가짜 자료만) |
| `S1_TEST_BOTS=1000 PATH_WORKERS=1 pnpm dev:server` | S1 시험 2차맵(키 `S1_TEST_MAP_KEY`)에 서버가 움직이는 봇 수(기본 0 = 봇 없음, 최대 20,000)와 경로 워커 스레드 수(기본 1, 최대 8). 2차맵·경로 워커는 늘 켜진다. 빌드한 서버(`node apps/server/dist/main.js`)도 같다. NAS는 `ops/compose.yml`에서 1,000 |
| `S1_URL=http://127.0.0.1:4320 S1_ID=… S1_PASSWORD=… node ops/s1-probe.mjs` | S1 측정 클라이언트: 들어가기 → 구독 → 스냅샷 크기·받는 시간·갱신 양·경로 지연·rev 빠짐. `S1_SECONDS`(기본 60), `S1_CLIENTS`(동시 연결), `S1_MOVE_MS`(관리자 이동 명령 간격, admin 계정만). `S1_URL`은 서버 `BETTER_AUTH_URL`과 같아야 한다. 저장소에서 `pnpm install` 뒤 실행(가짜 계정만) |

git 훅: 커밋 전(포맷·비밀값), 커밋 메시지(Conventional Commits), 푸시 전(`pnpm check` + 문서 규칙 + 콘텐츠 호환 + 목차 최신 여부).
새 패키지를 만들면 `scripts/check-boundaries.mjs`의 `ALLOWED` 표에 넣는다. 배포·NAS는 `ops/nas-setup.md`.

## 8. UI·디자인 작업과 스킬

스킬은 `.claude/skills/`에 있다(Claude Code). Antigravity는 같은 폴더를 `.agent/skills`(링크)로 읽는다. 구성과 이유는 ADR `docs/adr/2026-10-28-agent-skills.md`.

화면을 만들거나 고칠 때는 이 순서로 스킬을 쓴다. 디자인 시스템이 정해졌으므로(ADR 30) 1·2단계는 새 시각 방향이 필요할 때만 쓴다. 5단계는 `web-design-guidelines`와 `break-ui`(390px, 한국어·영어)를 기본으로 하고, `impeccable`·`review-animations`는 큰 화면을 새로 만들 때만 쓴다(빠르게 진행, 위 사용자 결정).
1. 방향: `frontend-design` — 분위기·글꼴·색의 방향을 코드보다 먼저 정한다.
2. 디자인 시스템·규칙: `ui-ux-pro-max` — 스타일, 색 조합, 글꼴 조합, UX 규칙을 검색한다(스택은 `react`, `python3` 필요). 기본 스타일 엔진은 이것 하나다.
3. 움직임: 새로 만들 때 `animate`, 끊길 때 `animation-performance`, 다듬을 때 `emil-design-eng`.
4. React 코드: `react-best-practices`(Next.js 서버 전용 규칙은 해당 없음).
5. 마무리 검토: `web-design-guidelines`(접근성·UX 규칙) → `impeccable`(audit·polish) → `review-animations` → `break-ui`(긴 한국어·영어, 빈 값, 큰 숫자).
6. 한국어 문구·문서·보고: `korean-writing`.

- `hallmark`, `taste-skill`은 다른 시각 방향을 시험할 때나 사용자가 이름을 말할 때만 쓴다. `find-animation-opportunities`, `improve-animations`, `animation-vocabulary`는 필요할 때.
- 디자인 시스템은 ADR `2026-10-28-design-system.md`(후보 A 새싹 장난감)다. 화면 스타일은 `apps/game/src/styles/tokens.css`의 `var(--…)`만 쓴다(직접 쓴 색·px 값은 `pnpm check:contrast`가 막는다). 화면을 바꾸면 기본 테마 2개(파스텔·다크)에서만 눈으로 확인하고 사진을 찍는다. 선명·정거장은 자동 검사(`pnpm check:contrast`)로만 지킨다. 새 화면은 디자인 후보를 따로 만들지 않고 이 디자인 시스템으로 바로 만든다(사용자 결정 2026-10-28: "디자인 작업이 너무 오래걸리므로 다음부터는 기본 두가지만 만들고 진도를 빠르게 나가보자"). 관리자·거래창처럼 빽빽한 화면은 `data-density="compact"`.
- **스킬보다 이 문서가 우선한다.** 모바일 우선, 화면 문구는 메시지 키(ko·en 함께), 성능 기준(PLAN 11장). 스킬이 권하는 새 런타임 의존성(Tailwind, framer-motion, shadcn 등)은 ADR을 먼저 쓴다.
- 스킬이 훅을 설치하거나 설정 파일(`.claude/settings.json` 등)을 바꾸려 하면 사용자 승인 뒤에만 한다(`hallmark`의 install-hook, `/impeccable hooks on`).
- `impeccable`의 일부 명령은 처음 실행할 때 GitHub에서 실행 파일을 내려받는다(체크섬 검증). 환경이 막으면 그 명령은 건너뛰고 문서 기반 규칙만 쓴다.
- 외부 스킬 폴더는 고치지 않는다(PROTECTED). 갱신은 원본에서 다시 복사하고 `THIRD_PARTY_NOTICES.md`의 커밋을 바꾼다.

개발 흐름 스킬(Matt Pocock):
- 새 판정·프로토콜·공용 로직은 `tdd`로 테스트부터 쓴다. 원인을 모르는 버그·성능 저하는 `diagnosing-bugs`.
- 모듈 설계·경계는 `codebase-design`, 구조 개선 후보 찾기는 `/improve-codebase-architecture`.
- 용어를 정리할 때는 `domain-modeling`, 계획을 다듬으며 결정·용어를 함께 남길 때는 `/grill-with-docs`(그냥 다듬을 때는 `/grill-me`).
- 실험 코드는 `prototype`: main에 남기지 않고 버리는 브랜치에 두며, main에는 확정된 결정만 남긴다.
- 출처가 필요한 조사는 `research`: 결과는 `docs/research/YYYY-MM-DD-<slug>.md`.
- 기획 세션 등 다른 사람에게 물을 것은 `/to-questionnaire`: 파일은 `docs/questions/YYYY-MM-DD-<slug>.md`에 둔다.
- 다른 에이전트에게 넘길 때 `/handoff`(임시 폴더에 저장). 작업 기록은 따로 남긴다.
- 설명이 와닿지 않으면 사용자는 `/wait-what`으로 다시 설명을 요청한다. AGENTS.md·스킬을 고칠 때는 `writing-for-agents`.
- **이 저장소 규칙이 우선한다.** ADR은 `docs/adr/README.md` 형식(파일명 `YYYY-MM-DD-<slug>.md`, 한국어 상태값)으로 쓰고, 스킬의 번호식 ADR(`0001-…`)은 쓰지 않는다. 용어집은 루트 `GLOSSARY.md`(처음 필요할 때 만든다. 한국어 용어와 코드 이름을 함께 적는다). 게임 규칙 용어는 `docs/design`이 기준이다.
