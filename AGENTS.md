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
- 검사는 모아서 한 번 돌린다(사용자 지시 2026-11-07 "불필요한 테스트를 줄이고 모아서 해라"):
  - 작업 중에는 고친 꾸러미 시험만 돌린다(`pnpm --filter <꾸러미> test`, `pnpm vitest run <파일>`).
  - 전체 `pnpm check`는 작업이 끝날 때 한 번 돌린다. 화면 시험은 바꾼 화면 spec만 한 번 돌린다.
  - main을 합친 뒤에는 코드 충돌을 손으로 풀었을 때만 다시 돌린다.
  - 여러 줄기를 main에 올릴 때는 끝난 줄기를 모아 한 번에 합친다. 전체 검사는 그 묶음에 한 번 돌린다. 빌드·`check-pwa`·`check:bundle`은 `apps/game`이 바뀐 묶음에만 돌린다. main 푸시도 한 번만 한다.

## 4. 코드 규칙

- 주석은 **한국어**, 이름(변수·함수·타입·파일)은 **영어**. 파일명은 영문 ASCII만.
- TypeScript strict. 의존성 버전은 **정확히 고정**한다(`^`, `~` 금지).
- **새 런타임 의존성 추가는 ADR 필수**(이유·대안·라이선스). 버전 올림·개발 도구는 제외.
- 파일 크기: 600줄 초과 경고, 1,000줄 초과 CI 실패(자동 생성 파일 제외). 넘으면 나눈다.
- 모듈 경계(도구로 강제):
  - `apps/*` → `packages/*` 방향만 허용(예외는 아래 게임 앱 → 서버 타입 하나).
  - `packages/engine`은 `apps/server`·`packages/sim`을 import하지 않는다.
  - `packages/sim`은 `packages/engine`·DOM API를 쓰지 않는다.
  - `@terra/planet`은 정수 진입점(`.`)과 실수 투영(`./projection`)을 나눈다. 투영은 `@terra/shared`의 결정적 근사(`detTan`·`detAtan`)를 써서 엔진과 무관하게 같은 값을 낸다. 패키지 전체(격자·투영·생성기)와 `@terra/shared`의 결정적 모듈(`detMath`·`rng`·`planetDefinition`·`planetPresets`·`planetCalendar`)의 결정성을 경계 검사가 본다(주석·문자열 안은 보지 않는다, `scripts/determinism-scan.mjs`. ADR `2026-10-29-cell-key-layout.md`, `2026-10-29-s2-planet-lod.md`). 시험 파일과 시험 도우미(`test` + 대문자로 시작하는 파일: `testFixtures.ts`·`testVariety.ts` 등)는 검사 밖이라, 시험이 아닌 파일은 시험 도우미를 가져오지 않는다(같은 검사가 막는다). 판정 코드는 칸 키·이웃(정수 진입점)을 쓴다.
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
  - 형식(스키마)은 `packages/content`. 이 패키지는 빌드 없이 `node`로 바로 실행되므로 지울 수 있는 TS 문법만 쓰고(`erasableSyntaxOnly`), Node API는 `src/node/`에서만 쓴다. 이 패키지가 실행 중에 가져오는 `packages/shared`도 `erasableSyntaxOnly`다.
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
- **PostgreSQL jsonb 글자** (16.15, 2026-10-30 확인: `psql`·DB 시험 `apps/server/src/settings/settings.db.test.ts`): jsonb는 글자 값·칸 이름의 `\u0000`과 짝 없는 대리 문자(`\ud800` 등)를 받지 않는다(넣으면 DB 오류 → 500). 짝이 맞는 대리 문자, NUL이 아닌 제어 문자, U+FFFF는 받는다. 그래서 jsonb에 넣을 값은 서버가 넣기 전에 보고 400으로 막는다(`@terra/shared` `hasUnstorableText`, 행성 초안은 `invalid_entry`). 18은 재지 않았다(Unknown).
- **Drizzle ORM**: 1.0 RC(`1.0.0-rc.x`)로 시작한다. 0.x 문서의 관계형 쿼리 예제는 1.0에서 바뀌었으니 1.0 문서를 본다. 1.0.0-rc.5에서 확인한 것(2026-10-28, 패키지 코드): 마이그레이션은 폴더 하나에 하나(`drizzle/<시각>_<이름>/migration.sql`)이고, 밀린 것은 트랜잭션 하나로 적용되며, 적용 여부는 이름으로만 판단한다. 연결 설정에 `casing`·`schema` 옵션이 없다(열 이름을 직접 쓴다). `db.execute` 결과 타입이 여러 문장용이라 단순 조회는 `db.$client.query`로 한다.
  - (2026-10-30 확인: 실행·패키지 코드 `migrator.js`·`migrator.utils.js`, drizzle-orm·drizzle-kit 1.0.0-rc.5) 두 가지가 같은 부모에서 마이그레이션을 하나씩 더한 갈래(두 스냅샷의 `prevIds`가 같음)를 받는다. 적용은 이름만 보므로 차례와 상관없다(뒤 이름을 먼저 적용한 DB에도 앞 이름을 적용한다). 합친 뒤 `db:generate`는 "No schema changes"이고, 다음 마이그레이션의 `prevIds`에 두 끝을 모두 적는다. 적용된 마이그레이션을 새 이름으로 다시 만들면 옛 이름을 적용한 DB가 다시 적용하다 실패하고 밀린 것 전체가 되돌려진다 → 갈래는 다시 만들지 않고 그대로 합친다(ADR `2026-10-29-app-shell.md` "구현하며 정한 것 (W2)").
- **tRPC 11** (11.19.0, 2026-10-28 확인: 패키지 코드·시험): Fastify 어댑터는 Fastify 5 이상이 필요하다. 어댑터는 앞머리 `/api/trpc` 범위(`app.register(…, { prefix })`) 안에 붙인다: ESM 빌드의 어댑터는 자기 `prefix` 옵션을 쓰지 않고 Fastify 범위 앞머리를 따르고, 그 범위의 훅·404 처리기가 tRPC 경로에만 걸린다(`apps/server/src/trpc/plugin.ts`). 묶음 요청은 경로에 프로시저 이름을 쉼표로 이어서 Fastify 기본 상한(경로 매개변수 100자)에 걸린다 → `Fastify({ routerOptions: { maxParamLength: 5000 } })`. 최상위 `maxParamLength`는 Fastify 5.12에서 사용 중단 경고(FSTDEP022)가 난다. 어댑터는 자기 플러그인 범위에서만 JSON 파서를 바꾼다(다른 경로는 그대로). `@trpc/client`는 실행 중에 `@trpc/server`를 import하므로 게임 앱에도 `@trpc/server`가 필요하다. `httpBatchLink`의 `fetch` 옵션 타입은 `typeof fetch`와 맞지 않는다(`exactOptionalPropertyTypes`) → `Parameters<typeof httpBatchLink<AppRouter>>[0]["fetch"]`를 쓴다.
  - (2026-10-29 확인: 패키지 코드·시험 `plugin.test.ts`) 어댑터는 `multipart/form-data` 본문을 Fastify 본문 상한(1MiB) 없이 스트림으로 넘기고, tRPC가 입력을 읽을 때 `Request.formData()`로 끝까지 모은다 → 쓰기 본문은 `onRequest`에서 JSON만 받는다(그 밖은 415). `text/plain`·`x-www-form-urlencoded`·`octet-stream`은 Fastify가 맥락 전에 415. `maxBatchSize`를 넘는 묶음은 맥락을 만들기 전에 400이다. 맥락 만들기가 던지면 묶음의 프로시저마다 그 오류가 간다(errorFormatter를 거친다).
- **Zod 4 + tRPC 11** (zod 4.6.7, 2026-10-28 확인: 패키지 코드·시험): 입력·출력 타입은 Standard Schema로 추론된다(`transform`이 있으면 입력과 출력 타입이 다르다). 실행 검사는 Standard Schema가 아니라 Zod `parseAsync`를 쓰므로 `error.cause`는 `ZodError`다. 틀린 입력은 HTTP 400 `BAD_REQUEST`. 오류 메시지는 Zod의 영어 문제 목록(JSON 문자열)이라 화면에 쓰지 않는다(`error.data.code`로 판단).
- **Zod 4.6.7 객체 검사 순서** (2026-10-29 확인: 실행): 객체 스키마의 `superRefine`은 필드 검사가 실패해도 불리고, 틀린 값을 그대로 받는다(타입은 출력 타입이지만 믿을 수 없다). 여러 필드를 함께 보는 검사는 값의 모양·범위를 다시 확인하고 틀리면 건너뛴다(필드 검사가 따로 알린다, `packages/content/src/schema/planets.ts`).
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
  - (2026-10-29 확인: 패키지 코드·DB 시험 `planetEditorGuards.db.test.ts`) 세션을 확인하는 `auth.api` 호출(`userHasPermission`, 관리자 미들웨어)은 하루 넘게 쓴 세션을 늘리고 새 쿠키를 응답 머리글에 싣는다. 그 머리글을 버리면 DB 만료만 늘고 쿠키는 그대로 끝난다. `userHasPermission`은 `query: { disableRefresh: true }`로 끈다. `listUsers`는 끌 수 없어(질의 스키마가 모르는 값을 버린다) `returnHeaders: true`로 받아 Set-Cookie를 tRPC 응답에 싣는다(Fastify `reply.send(Response)`는 앞서 단 Set-Cookie를 남긴다).
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
- **1차맵 엔진·묶음 확인 사항** (2026-10-29 확인: S2 렌더러·통합 구현 중 패키지 코드·빌드·Playwright, three 0.186.1, Vite 8.3.5, Playwright 1.63)
  - three: 지오메트리를 버리면(`dispose`) 그 인덱스·속성 GPU 버퍼를 지운다. 같은 `BufferAttribute`를 다른 지오메트리가 쓰고 있어도 지운다(`WebGLGeometries.js` `onGeometryDispose`). 인덱스를 같이 쓰면 버리기 전에 `setIndex(null)`로 뗀다(`packages/engine/src/planet/planetView.ts`).
  - three: `ShaderMaterial`(Raw가 아닌 것)은 늘 `#version 300 es`로 컴파일된다. 그래서 `texelFetch`·정수 비트 연산·`fwidth`를 `glslVersion` 없이 쓴다(`WebGLProgram.js`, 빌드한 화면에서 실행).
  - Vite(rolldown): 지연 조각 둘만 같이 쓰는 모듈(three 등)은 따로 한 조각으로 묶이고, 첫 화면은 미리 받지 않는다(빌드 소스 맵, Playwright 요청 기록). 다만 첫 화면이 가져오는 작업공간 묶음 진입점(`@terra/shared`·`@terra/protocol`의 `index.ts`)에 든 모듈은 지연 조각만 써도 첫 화면 조각이나 첫 화면이 미리 받는 공용 조각에 들어갔다(`detMath.ts`, `planetTile.ts`·`planetManifest.ts`, 빌드 소스 맵). 두 꾸러미 `package.json`에 `"sideEffects": false`를 두자 빠졌다(첫 화면 JS 372,600 → 368,388바이트, 2026-10-29 확인: 빌드 소스 맵). 그래서 두 꾸러미 모듈은 맨 위에서 부르는 코드(전역 등록 등)를 두지 않는다. 두면 그 모듈을 가져오지 않는 묶음에서 말없이 빠진다.
  - Vite(rolldown) 워커: 워커가 작업공간 묶음 진입점에서 함수 하나만 가져와도 그 묶음의 다른 모듈(zod 메시지 스키마 등)이 워커 묶음에 들어간다(1차맵 메시 워커 103kB). 워커가 쓰는 것은 진입점을 따로 둔다(`@terra/protocol/planetTile`, 8.1kB).
  - (2026-10-30 확인: 빌드 소스 맵·조각 이름) Vite(rolldown) 조각 이름: 다시 내보내기만 하는 파일(`export { default } from "../GpuBenchPage.tsx"`)을 `import()`하면 조각 이름은 그 파일 이름을 따르고, 조각에는 다시 내보낸 화면의 코드·CSS가 든다(`editor/gpuBench/gpuBenchScreen.ts` → `gpuBenchScreen-*.js`·`.css`). 조각 이름으로 미리 캐시를 가르는 규칙(`scripts/pwa-build.mjs` `DEV_ONLY_CHUNK`)에 화면 파일 이름을 바꾸지 않고 맞출 때 쓴다. 또 지연 조각을 더하면 첫 화면 모듈이 그대로여도 공용 조각 나눔이 바뀌어 gzip 합이 수백 바이트 오르내린다(main `51ddd5f` 위 `index` + `device` → `index` + `jsx-runtime` +431B, `51a14e5` 위 5개 → 4개 −137B, `acd651d` 위 3개 → 5개 +814B). `pnpm check:bundle` 값이 바뀌면 소스 맵의 모듈 목록부터 본다.
  - Playwright + 헤드리스 Chromium: `mouse.wheel`을 잇달아 보내면 휠 이벤트가 합쳐진다. 휠 단계를 세는 시험은 150ms씩 띄운다.
- **Node 24 서버 확인 사항** (2026-10-29 확인: S1 서버 구현·시험·빌드 실행, Node 24.22.1)
  - `node:worker_threads`는 `.ts` 진입 파일을 그대로 띄운다: Node 타입 지우기, tsx(워커가 부모 `execArgv`의 tsx 로더를 물려받음), vitest 모두. 서버 빌드는 Vite 입력에 따로 넣어 `dist/pathWorker.js`로 만들고, 시작점(`src/main.ts`)이 `import.meta.url` 기준으로 고른다.
  - Vite 8.3.5 SSR 빌드는 `new URL("…", import.meta.url)`을 고치지 않는다(자산 플러그인은 client 환경에만 돈다).
  - `perf_hooks.monitorEventLoopDelay`는 지연이 아니라 타이머 사이 간격을 적는다(쉬어도 resolution 근처, 20ms면 약 20.1ms). 지연 = 값 − resolution(`src/metrics.ts`).
  - 전역 `fetch`는 `origin` 머리글을 그대로 보내고, 전역 `WebSocket`은 `new WebSocket(url, { headers: { cookie, origin } })`를 받는다(`ops/s1-probe.mjs`).
  - `@fastify/websocket` 11.3.4 `injectWS`의 가짜 요청에는 `socket`이 없어 `request.ip`가 오류를 낸다 → 시험은 `injectWS(path, { headers, socket })`에 `remoteAddress`를 단 `net.Socket`을 넣는다.
  - `Buffer#slice`는 복사가 아니라 보기를 돌려준다. 이진 해석기는 받은 값을 일반 `Uint8Array` 보기로 바꾼 뒤 자른다(`packages/protocol` `decodeTerrain`).
  - oxlint 1.89.0 `unicorn(require-post-message-target-origin)`은 worker_threads의 `worker.postMessage`도 잡는다(브라우저 window 규칙이라 해당 없음) → 보내는 도우미 하나에서만 끈다(`src/world/pathPool.ts`의 `post`).
  - (2026-11-07 확인: 재현·core 덤프, Node 24.22.1 = V8 13.6.233.17) Node 타입 지우기로 `.ts` 진입 워커를 띄우면 워커마다 타입 지우개(amaro, WebAssembly)가 돈다. 한 프로세스에서 그런 워커를 띄우고 끝내기를 되풀이하면, 새 워커가 이미 지워진 wasm 모듈의 코드를 다시 풀어 프로세스 전체가 SIGSEGV·SIGTRAP("Check failed: jit_page.has_value()")으로 가끔 죽는다(V8 버그, vitest 시험 프로세스에서 봄). 메인 스레드가 타입 지우개를 한 번 써 두면 재현에서 죽지 않았다 → 서버 시험은 워커 주소를 `tsWorkerUrl`(`apps/server/src/testWorkers.ts`)로 만든다(`testWorkers.test.ts`가 본다). `terminate` 대신 워커가 스스로 끝나게 해도 고쳐지지 않는다(더 자주 죽었다). 운영 빌드 워커(`dist/*.js`)는 타입 지우기를 쓰지 않는다.
- **Node 24 워커 메모리·fetch** (2026-10-29 확인: S2 타일·서버 구현 중 시험 스크립트·빌드한 서버, Node 24.22.1)
  - 워커 안 `process.memoryUsage()`의 `rss`는 프로세스 전체 값이고, `heapUsed`·`external`·`arrayBuffers`는 그 스레드 값이다(워커가 200MB 버퍼를 들면 워커는 arrayBuffers 200MB, 메인은 0).
  - `resourceLimits.maxOldGenerationSizeMb`는 JS 객체 힙만 막는다. 타입 배열(ArrayBuffer)은 막지 않는다(상한 64MB 워커가 200MB 타입 배열은 만들고, 객체 500만 개에서는 `ERR_WORKER_OUT_OF_MEMORY`. 메인 스레드는 `error` 이벤트만 받는다).
  - 전역 `fetch`는 `Content-Encoding: gzip` 응답을 스스로 푼다. `content-length`는 압축된 크기다(`ops/s2-probe.mjs`).
- **docker compose 설정 검사** (클라이언트 29.9.2, 2026-10-29 확인): `docker compose -f ops/compose.yml config`는 데몬 없이 파일·변수 치환을 검사한다(필수 변수 `TERRA_TAG`·`POSTGRES_PASSWORD`·`BETTER_AUTH_SECRET`는 가짜 값을 준다).
- **oxlint 1.89.0 규칙** (2026-10-28 확인: 시험 파일로 실행): 네임스페이스 import를 계산해서 읽으면(`m[key]`) `import(namespace)` 오류다. 키로 고르는 화면 문구는 `apps/game/src/ui/messageTable.ts` 표에 적는다. 효과(`useEffect`) 안에서 바로 setState하면 `react(set-state-in-effect)`, 그리는 중에 `ref.current`를 읽으면 `react(refs)` 오류다. 효과 안에서 쓰지 않는 값을 다시 실행 신호로 의존성 배열에 넣으면 `react(exhaustive-effect-dependencies)` 경고다(`pnpm check`는 `--deny-warnings`라 실패) → 다시 만들 화면은 `key`를 바꾼다(2026-10-29 확인: 1차맵 시험 화면 `PlanetMapScreen.tsx`).
- **결정적 계산** (2026-10-29 확인: tc39/ecma262 `spec.html` main, Node 24.22.1, TS 7.0.2, oxlint 1.89.0 — 행성 생성기 구현)
  - 명세가 결과를 정확히 정하는 것: 사칙연산(IEEE 754 배정밀도, 가장 가까운 값), `Math.sqrt`·`floor`·`ceil`·`round`·`trunc`·`abs`·`min`·`max`·`sign`·`fround`·`imul`. "구현이 근사한 값"(implementation-approximated)인 것: `Math.sin`·`cos`·`tan`·`asin`·`atan`·`atan2`·`exp`·`log`·`pow`·`hypot`·`cbrt` 등과 `**` 연산자(Number::exponentiate). `Math.PI`·`E`·`LN2`·`LOG2E`·`SQRT2` 등은 "가장 가까운 Number 값"으로 정한 상수라 써도 된다.
  - Node 24.22.1의 `Math.sin`·`cos`·`tan`·`atan`·`exp`는 잰 점에서 4배 정밀도 값과 1ulp 이내였다. 브라우저 엔진은 재지 않았다(Unknown). 판정·생성 코드는 `@terra/shared` `det*` 함수를 쓴다.
  - TS 7.0.2: 타입 인수 없는 `Float32Array`는 `Float32Array<ArrayBufferLike>`이고 `new Float32Array(n)`은 `Float32Array<ArrayBuffer>`다. 두 배열을 맞바꿔 쓰는 코드(`[a, b] = [b, a]`)는 `Float32Array<ArrayBuffer>`로 적는다.
  - `pnpm check`의 oxlint는 `--deny-warnings`라 경고도 실패다. 자주 걸리는 것: `typescript(no-unsafe-type-assertion)`(`unknown`을 `as`로 좁힘 → 타입 가드나 `satisfies`), `unicorn(consistent-function-scoping)`(바깥 변수를 쓰지 않는 안쪽 함수 → 밖으로), `oxc(approx-constant)`(π 리터럴 → `Math.PI`), `unicorn(no-new-array)`(`new Array(n)` → `Array.from({ length: n })`).
  - det 함수를 엔진 `Math`로 바꿔도 생성기 정수 출력(골든 해시)은 그대로였다(일곱 함수 모두, 2026-10-29 실행). Float32 저장과 정수 반올림이 1ulp 차이를 흡수한다. 그래서 det 값의 변경은 골든 비트(엔진 `Math`와 다른 점을 넣었다)와 64비트 실수 지문(`generate.test.ts`)이 잡고, 엔진 `Math`를 쓰는 것은 경계 검사가 막는다.
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
| `pnpm --filter @terra/sim sim <시나리오> [--seed N] [--days D] [--out 줄.jsonl] [--summary 요약.json] [--units N]` | 규칙 시뮬레이터(가상 시계, DB 없음, ADR `2026-10-31-rules-simulator.md`): `packages/sim/scenarios/<시나리오>.json`(`stub16`·`econ16`·`war16`·`synthetic`, 또는 `.json` 경로)을 돌려 D-391 지표 JSON 줄과 요약을 낸다(`economy` 칸이 있는 시나리오는 콘텐츠 팩 경제 분류로 생산·유지비·거래소·환전·중앙은행까지 돌리고 하루마다 `econ` 줄을 더 쓴다, ADR `2026-10-31-economy-core.md`. `combat` 칸이 있는 시나리오는 도시 빼앗기를 공성 전투로, 세력 판단마다 확률로 조우 전투를 빨리감기로 돌려 `battle` 줄을 쓴다, ADR `2026-10-31-combat-core.md`)(요약은 `--summary`가 없으면 표준 출력, 걸린 시간·배속은 표준 오류). 세력 생김·사라짐·기술·도시 몫은 진짜 세력·사회 규칙이 정하고(점령·반란·독립·마을·구인·수명·연구, 하루 줄에 만족도·체제·그날 구인 수, 요약 `society`, ADR `2026-10-31-faction-society-core.md`. 출생은 없다 — 인구는 행정 건물 구인 카드로만, D-469), 무엇을 해 볼지는 NPC 판단 틀(성향 가중 점수 + 규칙식, `packages/sim/src/npc/`, ADR `2026-11-01-npc-brain-r5.md`)이 고른다. 요약 `npc` 칸 = 행동 수·강화 거절·세율 바꿈·구인 카드 수. 정원사(칸 오염·도시 웨이브·유목 부대, ADR `2026-11-01-gardener-r5b.md`)는 기본 켬(시나리오 `"gardener": {"enabled": false}`로만 끈다, 출시 관문 D-460 199): 하루 끝 `gardener` 줄, 웨이브 예고·결과 `wave` 줄, 웨이브 공성 전투 `battle` 줄(`kind: "wave"`), 요약 `gardener` 칸·`society.ruins`(폐허·떠도는 세력). 설정 칸 값은 팩 `tuning`. 같은 시드면 바이트까지 같다. 불변 조건 위반이면 종료 코드 3. 상대 경로는 `packages/sim` 기준 |
| `pnpm --filter @terra/sim gardener:cal [--seeds 1,2,…] [--sums …] [--defenders 10] [--tech 3] [--cities 4] [--humans 40] [--set 항목ID=값,…] [--grid base:…/divisor:…]` | 정원사 웨이브 결과 맞추기(D-468, 49 C16a, ADR `2026-11-01-gardener-r5b.md` "바뀜 (D-468)"): 시뮬·서버와 같은 웨이브 함수(세기 → 물리형 → 웨이브 공성 전투)로 영향권 오염 합마다 웨이브 승률을 전투 시드 여러 개로 잰다. 목표 = 합 ≥ `c16a_target_sum`인 도시 웨이브의 `c16a_target_win`‰. `--grid`는 세기 기본(C16) × 물리형 나눗수(C17) 조합의 목표 구간 승률. 크리쳐 에디터 값이 생기면 이것으로 다시 맞춘다. 전투가 많아 몇 분 걸린다. `pnpm test`에는 없다 |
| `pnpm --filter @terra/sim sim:speed [--units 1000,10000,100000] [--days 30,7,2] [--war-days 30]` | 시뮬레이터 속도 표(synthetic 이동 부하를 유닛 수별로 새 프로세스에서 + stub16·econ16 180일 + war16 `--war-days`일): 예약/초·가상 시간/실제 초·배속·최대 RSS. `pnpm test`에는 없다 |
| `pnpm --filter @terra/planet bench [면 레벨 …] [--continents <배치>[:대륙 수]]` | 행성 생성기 벤치마크(콘텐츠 팩의 S2 시험 행성, 기본 6 7 9): 단계별 시간·RSS·타입 배열·최대 RSS. 레벨마다 새 프로세스로 잰다. `--continents`는 대륙 배치를 얹는다(`supercontinent`·`earthlike`·`scattered`·`hemisphere`, 예: `earthlike:4`, ADR `2026-10-31-continent-layouts.md`). `pnpm test`에는 없다 |
| `pnpm --filter @terra/planet render <출력 폴더> [면 레벨] [시드] [--continents <배치>[:대륙 수]]` | 생성 결과 그림(S2 시험 행성, 기본 면 레벨 7, 시드는 팩 값, `--continents`는 bench와 같다): 면마다 고도·바이옴·기온 PNG, 경위도 전체 5장(고도·바이옴·기온·강수·습도), 요약 수치. 출력 폴더는 저장소 밖 절대 경로로 준다(명령은 `packages/planet`에서 돈다) |
| `pnpm --filter @terra/planet variety [면 레벨] [시드 목록] [--json <경로>] [--compare bench/variety-baseline.json] [--strict] [--continents <배치>[:대륙 수]]` | 행성 생성 결과의 반복·단조로움 검사(S2 시험 행성 설정, 기본 F9 × 시드 `pack,1,42,2718281828`. `--continents`는 대륙 배치를 얹는다. 시드마다 큰 땅덩어리 수·섬 수·땅 반구 몫도 찍는다): 지표 표(문서 `docs/questions/2026-10-29-special-terrain.md` 4.1의 14개 + 보고용), 땅 바이옴 몫. 모은 맵 레벨 L5~L7 지표도 낸다. `--json`은 결과 파일, `--compare`는 기준(출력 판 3, F9. 출력 판 2는 `bench/variety-baseline-v2.json`)보다 문턱 쪽으로 10% 넘게 나빠진 지표와 바이옴 몫 차이(%p)를 알린다(`--strict`면 종료 코드 1). F9 × 4는 약 2분. 상대 경로는 `packages/planet` 기준. `pnpm test`의 `variety.test.ts`(F7 × 3)는 막는 지표 11개(`VARIETY_TARGETS`의 `gate`)가 문턱을 넘으면 실패하고 나머지는 보고만 한다 |
| `pnpm --filter @terra/planet second-map <출력 폴더> [면 레벨] [river·coast·lake·mountain·forest·면,i,j] [격자 수]` | 2차맵 생성기 측정·그림(ADR `2026-10-31-second-map-from-planet.md`): 콘텐츠 팩 S2 시험 행성(기본 F9)을 생성하고 고른 자리의 격자 수²(기본 4×4) 2차맵을 만들어(소품 규칙 = 팩 `map_props`) 이어 붙인 PNG(높이 음영·지표·물·엄폐·소품, 배치 칸 1화소), 2차맵마다 생성 ms(p50·p95·최대), 이웃 공유 변이 같은지(다르면 종료 코드 1), 엄폐 몫·소품 그림별 칸 수를 낸다. 출력 폴더는 저장소 밖 절대 경로. `pnpm test`에는 없다 |
| `pnpm --filter @terra/server bench:second-map [면 레벨] [2차맵 수]` | 숲 지형 경로 측정(ADR 35 "경로탐색", ADR 46 WP-2): 팩 S2 시험 행성(기본 F9)에서 숲 밀도가 높은 땅 2차맵(기본 6장)을 생성기 → sim 지형 비용 → 배치 격자로 만들고, 2차맵마다 생성·비용·격자 ms, 막힌 칸 몫, 경로 1,000개(크기 등급 분포는 sim 벤치와 같음)를 엄폐 포함·뺀 격자와 노드 예산 16,384로 잰다. `@terra/sim`이 `@terra/planet`을 가져올 수 없어 서버 꾸러미(`apps/server/bench/`)에 있다. `pnpm test`에는 없다 |
| `pnpm build` | 전체 빌드 |
| `pnpm check:bundle` | 첫 화면 JS 크기 검사(빌드한 뒤에. CI는 빌드 다음 단계): 빌드한 `index.html`의 모듈 + modulepreload 조각, 파일마다 gzip 9단계 합 ≤ `apps/game/bundle-budget.json`. 상한을 올리면 늘어난 까닭과 잰 값을 작업 기록에 적는다(ADR `2026-10-29-app-shell.md` 11절) |
| `pnpm tuning:apply <차이.json> [--pack content/<팩 ID>] [--force] [--dry-run]` | 개발자 설정 칸 패널(`/dev/tuning`) [내보내기] 차이(`terra-tuning-diff`)를 팩 `tuning.json`에 넣는다(차이의 `statRows` = 밸런스 화면 `/dev/balance`의 가중치 칸은 `stat_rows.json`에, ADR `2026-11-01-balance-screen.md`. `entries` = 스킬 편집기 `/dev/skills`의 스킬·무기·유닛 종류 항목과 아이템 편집기 `/dev/items`의 아이템·중분류·태그·무기 종류·효과 항목은 그 분류 파일에 통째로(만든 항목은 파일 끝에 ID 차례로), 지금 팩 항목 해시 = `from`일 때만, ADR `2026-11-01-skill-editor.md`·`2026-11-01-item-editor.md`. `retiredIds` = 그 세계에서 만든 뒤 지운 ID는 새 항목으로 넣지 않는다): 칸마다 팩에 있는지·지금 팩 값 = `from`인지(아니면 건너뜀, `--force`면 넣음)·기술 범위 안인지 본 뒤 그 값만 바꾸고 `manifest.json` 판을 한 번 올린다. 건너뛴 칸이 있으면 종료 코드 1. 그다음 `pnpm check:content`·작업 기록·커밋(ADR `2026-11-01-dev-settings-panel.md` 11절). 시뮬레이터는 같은 파일을 `pnpm --filter @terra/sim sim <시나리오> --tuning <차이.json>`으로 받는다(상대 경로는 `packages/sim` 기준) |
| `pnpm settings:cells [--check]` | 기획 49(`docs/design/40_Systems/49_Settings.md`) 칸 표에서 설정 칸 패널의 "49 칸 중 N개 연결" 목록 JSON(`apps/game/src/editor/tuning/settingsCells.json`)을 다시 만든다(D-462). 손으로 고치지 않는다. 49 미러를 동기화한 뒤 돌린다(안 돌리면 `pnpm test`의 시험이 실패한다) |
| `pnpm docs:index` | 작업 기록을 추가한 뒤 `docs/WORKLOG.md` 목차를 다시 만든다 |
| `pnpm check:docs` | 코드 변경 → 작업 기록(의존성 버전만 올린 변경은 제외), 새 런타임 의존성 → ADR, 올라간 마이그레이션 수정 금지 |
| `pnpm check:content [기준 커밋]` | 콘텐츠 팩 검증: 스키마·참조·ID 변경표 + 기준 커밋(기본 upstream)의 팩과 호환. `--no-compat`은 호환 검사 빼기, `--print`는 서버 팩의 버전·해시 출력 |
| `SMOKE_URL=http://127.0.0.1:4100 node ops/smoke.mjs` | 배포 자동 점검(`/health`, WebSocket 접속 인사). 기대값은 `EXPECT_DB`·`EXPECT_CONTENT_VERSION`·`EXPECT_CONTENT_HASH`(비우면 비교 안 함) |
| `pnpm changelog --tag vX.Y.Z` | 버전 태그 직전에 `CHANGELOG.md`를 만든다(git-cliff, 설정 `cliff.toml`) |
| `pnpm --filter @terra/server db:generate` | 표 정의(`src/db/schema.ts`)에 맞는 마이그레이션을 만든다(DB 접속 없음) |
| `pnpm --filter @terra/server db:migrate` | 밀린 마이그레이션 적용(`DATABASE_URL` 필요) |
| `TEST_DATABASE_URL=postgres://… pnpm test` | DB 통합 테스트 포함(없으면 DB 테스트는 건너뜀. 접속 계정에 CREATEDB 권한 필요) |
| GitHub Actions `account-admin` (수동 실행) | NAS 운영 컨테이너에서 계정 만들기·역할 바꾸기·비밀번호 바꾸기(`dist/cli.js`, 감사 기록 남음). 비밀번호는 로그에 가려진다 |
| GitHub Actions `world-reset` (수동 실행, 입력 `RESET-WORLD`) | NAS 시험 세계 새로 시작(ADR `2026-11-08-world-reset.md`): 백업 `reset-*.dump` → 앱만 멈춤 → `node dist/cli.js reset-world --confirm RESET-WORLD`(남길 표 목록 `WORLD_RESET_KEEP` 밖의 public 표를 모두 TRUNCATE, 감사 기록 `world.reset`) → 앱 켬 → 월드 ready·`check-world`·자동 점검. 세계 밖 표(계정·개발 도구·운영 기록)를 더하면 `apps/server/src/cli/resetWorld.ts`의 남길 표 목록에 넣는다(안 넣으면 새로 시작 때 비워진다) |
| GitHub Actions `nas-metrics` (수동 실행) | NAS 운영 지표를 Summary에 모은다(읽기만): 서버 1분 지표, 컨테이너 CPU·메모리, 기기 성능·오류. 입력은 최근 몇 분(1~1440). 배포로 앱 컨테이너가 바뀌면 그 전 서버 지표 줄은 없다 |
| GitHub Actions `s3-ramp` (수동 실행) | 규모 계단 시험(S3 ADR 6·7절): 같은 이미지로 짧게 사는 컨테이너(`tic-s3-ramp`, 공개 포트 없음)를 따로 띄우고 시험 전용 DB 컨테이너(`tic-s3-ramp-db`, 전용 네트워크)를 잠깐 띄워, 봇 수를 1천 → 10만까지 올리며 처음 무너지는 계단(루프 p99 > 50ms·RSS > 900MB·죽음)에서 멈춘다. 계단마다 SIGKILL 복구도 잰다. 끝나면 시험 컨테이너·DB·네트워크를 지운다. 입력은 계단·분·이미지 태그. 결과 표는 Summary. 스크립트 `ops/s3-ramp.sh`, 요약 `ops/s3-ramp-summary.mjs`. 운영 컨테이너는 건드리지 않는다 |
| `BETTER_AUTH_URL=http://localhost:5173 pnpm dev:server` | 개발 중 로그인 시험(같은 출처 검사가 Vite 개발 서버 주소를 기준으로 하게). DB(`DATABASE_URL`)가 있어야 인증이 켜진다 |
| `TEST_DATABASE_URL=postgres://… pnpm e2e [시험 파일·--grep …]` | 화면 시험(Playwright, `e2e/`). 화면을 고친 줄기가 돌리고 결과(통과·실패, 잰 값)를 작업 기록에 적는다. CI 밖이다(ADR `2026-10-29-app-shell.md` [결정 3]). 전역 준비가 빌드(없거나 소스보다 오래되면 `pnpm build`) → 새 DB → 가짜 계정 player·dev·admin → 빌드한 서버(빈 포트 4400~4599)를 만들고 끝나면 지운다. 작업 트리의 첫 실행은 빌드와 행성 굽기(빈 캐시, 행성마다 약 20초) 때문에 1~2분 걸린다(부하가 크면 더): 도구 시간 제한을 길게 주거나 뒤에서 돌린다(굽다가 끊기면 캐시가 남지 않아 다음에 또 굽는다). 그 뒤(빌드 최신·캐시)는 약 10~15초. 한 작업 트리에서는 한 번에 하나만 돈다(설정을 읽을 때 잠금, 두 번째 실행은 바로 멈춘다). 브라우저는 개발 환경에 있는 것만 쓴다(`PLAYWRIGHT_BROWSERS_PATH`, `@playwright/test` 1.63.0 = chromium-1243. 내려받지 않는다). 시험 쓰는 법은 `e2e/helpers/test.ts` 머리 주석, 사진 폴더는 `E2E_SHOTS_DIR`. `E2E_MEASURE=1`이면 측정 시험(2차맵 이웃·소품 엔진 p95, 헤드리스라 휴대폰 값 아님)도 돈다 |
| `NODE_ENV= PORT=4320 STATIC_DIR=apps/game/dist DATABASE_URL=… BETTER_AUTH_SECRET=… BETTER_AUTH_URL=http://127.0.0.1:4320 node apps/server/dist/main.js` | 빌드한 앱·서버로 화면 시험(Playwright 등). 운영 모드(`NODE_ENV=production`)는 https 주소를 요구하므로 비운다. 먼저 `pnpm build`, `DATABASE_URL=… node apps/server/dist/migrate.js`. 시험 계정은 `node apps/server/dist/cli.js create-user`(가짜 자료만) |
| `S1_TEST_BOTS=1000 PATH_WORKERS=1 pnpm dev:server` | S1 시험 2차맵(키 `S1_TEST_MAP_KEY`)에 서버가 움직이는 봇 수(기본 0 = 봇 없음, 최대 100,000. 10만은 규모 계단 시험용)와 경로 워커 스레드 수(기본 1, 최대 8). `S1_TEST_MAPS`(기본 6, 최대 64 — 세계 씨앗: 고정 국가의 시작 도시를 나눈다, ADR `2026-11-07-play-flow.md` WP1)개 시험 2차맵에 봇을 나눈다. 2차맵·경로 워커는 늘 켜진다. 시험 2차맵 지형은 S2 시험 행성 값에서 만든 2차맵이다(지형 워커, ADR `2026-10-31-second-map-from-planet.md` WP-3): 서버가 듣기(listen) 전에 그 행성의 캐시 읽기·굽기를 기다린다(빈 캐시면 약 11~14초 더). `DATABASE_URL`이 있으면 유닛·건물을 DB에 저장하고 켤 때 복구한다(S3 ADR `2026-10-31-s3-server-stage.md`). DB 몫 불변 조건 검사: `DATABASE_URL=… node apps/server/dist/cli.js check-world`. 빌드한 서버(`node apps/server/dist/main.js`)도 같다. NAS는 `ops/compose.yml`에서 1,000 |
| `NPC_SOCIETY=1 NPC_TEST_NATIONS=4 pnpm dev:server` | NPC 사회 런타임(ADR `2026-11-01-npc-brain-r5.md` 7절, 기본 켬, DB가 있을 때만): 시험 국가 넷(시험 NPC 세력 + 팩 국가 프리셋 셋, 고정, 이름 = 팩 국가 프리셋 — 시험 NPC 세력은 16번째)과 국가마다 시작 도시 2~4곳(팩 국가 프리셋 성격 칸을 설정 칸 `d6041_start_cities_*` 안으로, 시험 2차맵들에 고르게, 도시 이름 = 프리셋 `cityNames`)·시작 도시마다 기본 시설(행정 건물·창고 + 둘레 행성 값에 맞는 농장·벌목장·광산, 설정 칸 `npc_seed_*`, 다 지은 채)을 켤 때 모자란 것만 만들고(ADR `2026-11-07-play-flow.md` WP1·WP5) 시험 봇을 가장 가까운 도시의 휴먼으로 들여, 시뮬레이터와 같은 세력·사회 규칙(`attachSociety`)과 NPC 판단(`decide`)을 실제 시각으로 돌린다(판단마다 구인 규칙식이 행정 건물 구인 카드를 산다, 하루 끝 = UTC 0시: 만족도·수명·반란·독립·백지 강화·연구, 7일마다 배당·공물). 바뀜은 월드 쓰기 대기열로(`world_humans`·`recruit_draws`·`faction_wars`·`npc_society`, `factions`·`world_cities` 칸). 1분 지표에 `npcDecisions`·`npcDecideMs`·`npcDayMs`·`npcPersistMs`·`npcRecruited`·`npcHumans`·`npcFactions`, 서버 기록에 시뮬과 같은 `day`·`born`·`died`·`tech` 줄(`npcMetrics`). `NPC_SOCIETY=0`이면 봇만 걷는다. `NPC_DAY_MS`(기본 86,400,000, 최소 60,000)는 측정용으로만 하루를 줄인다. 서버 NPC 공격은 아직 전투 없이 점령한다(실시간 공성은 다음 줄기). 정원사(ADR `2026-11-01-gardener-r5b.md` 5절)도 같은 런타임에서 돈다: 하루 끝 칸 오염(`planet_pollution`)·도시 웨이브 굴림, 웨이브 도착은 전투 서비스의 공성 전투(`world_battles`, 빨리감기는 10틱 조각마다 이벤트 루프에 양보, 이길 수 없게 된 웨이브는 멈춤), 결과는 `gardener_waves`·`world_cities.wave_cooldown_until_ms`, 예고는 처리할 일 `wave_incoming`(마감 = 도착). 1분 지표 `gardenerMs`·`gardenerWaves`·`gardenerWaveResults`·`pollutionCells`, 서버 기록 `battle computed`(틱·조각·CPU ms). `NPC_DAY_MS`를 줄이면 웨이브 예고·쉬는 시간도 같은 배율로 준다. `GARDENER_WAVES`(기본 0 = 끔, 1 = 켬)를 끄면 오염은 쌓이지만 도시 웨이브 확률이 0이다(사용자 결정 2026-11-01 "합치되 웨이브 끔", NAS는 `ops/compose.yml`에서 0) |
| `S1_URL=http://127.0.0.1:4320 S1_ID=… S1_PASSWORD=… node ops/s1-probe.mjs` | S1 측정 클라이언트: 들어가기 → 구독 → 스냅샷 크기·받는 시간·갱신 양·경로 지연·rev 빠짐. `S1_SECONDS`(기본 60), `S1_CLIENTS`(동시 연결), `S1_MOVE_MS`(관리자 이동 명령 간격, admin 계정만). `S1_URL`은 서버 `BETTER_AUTH_URL`과 같아야 한다. 저장소에서 `pnpm install` 뒤 실행(가짜 계정만) |
| `DATABASE_URL=postgres://… node ops/s3-crash.mjs` | S3 kill -9 복구 시험: 빌드한 서버를 띄우고 무작위 시각에 SIGKILL → 다시 켜서 `/health` `world: "ready"`까지 시간·`worldIssues`·`check-world`를 `CYCLES`번(기본 5) 본다(복구 ≥ 60초나 위반이면 종료 코드 1). 먼저 `pnpm build`와 빈 DB에 `node apps/server/dist/migrate.js`. `BOTS`(기본 1000), `PORT`(기본 4391), `PLANET_CACHE_DIR` |
| `PLANET_CACHE_DIR=/경로 pnpm dev:server` | 1차맵 행성 타일 디스크 캐시 폴더(기본 `apps/server/.planet-cache`, 이미지 `/app/planet-cache`, NAS는 `ops/compose.yml` 볼륨). 시작하면 콘텐츠 팩 행성(`planets`)마다 캐시를 읽거나 워커에서 차례로 굽는다(S2 시험 행성 `s2_test_planet`·편집 전용 행성 `s2_editor_planet`, 생성기 1판 출력 판 3(`GENERATOR_VERSION` 3), 둘 다 F = 9. 빈 캐시면 개발 컨테이너에서 행성마다 약 11~14초(기계 부하에 따라). 캐시로 켜면 약 1~3초). 요청을 받기 전에 행성마다 편집기 확인 해시(F5)도 만든다(두 행성 약 0.3~0.9초). 행성 표본(`planet_templates`, 편집기 시작점)은 굽지 않고 확인 해시만 만든다(다섯 약 0.4초, ADR 38 "바뀜: 행성 표본"). 행성마다 2차맵 생성기 입력인 행성 값 파일(`.values`, F9 약 22MB)도 같이 둔다. 그 아래 `second-maps/`는 2차맵 지형 디스크 캐시다(2차맵 하나 약 40~60KB, 판 표지가 바뀌면 옛 파일을 지운다, 4,000장까지). 지워도 된다(다음 시작 때 다시 굽는다). 빌드한 서버도 같다 |
| `S2_URL=http://127.0.0.1:4320 S2_ID=… S2_PASSWORD=… node ops/s2-probe.mjs` | S2 타일 측정 클라이언트: 들어가기 → 목록 정보(준비까지 기다림) → 처음 화면 타일(맵 레벨 F−4·F−3) 시간·크기, 머리 값·이음매 확인(어긋나면 종료 코드 1). `S2_ALL=1`(모든 타일), `S2_CONCURRENCY`(기본 6), `S2_PLANET`(기본 `s2_test_planet`). `S2_URL`은 서버 `BETTER_AUTH_URL`과 같아야 한다(가짜 계정만) |

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
- 개발·관리자 화면(`/dev`, `/dev/…`, `/admin`)은 개발 화면 층을 쓴다(`<html data-surface="dev">`, 촘촘한 토큰·`.dev-table`, 테마는 네온 다크(기본)·라이트 둘만, 게임 테마와 상관없음). 이 화면을 바꾸면 그 두 테마에서 사진으로 확인한다 — ADR `2026-11-02-dev-ui.md`.
- 화면 가시성: 톤(새싹 장난감)은 그림(지도·캐릭터)에 쓰고, 화면은 옛 프로젝트처럼 수·색 막대·펼치는 공식으로 더 보이게 만든다(토큰 규칙은 그대로). 1차 스탯은 STR·VIT, INT·WIS, DEX·AGI 묶음과 `--color-stat-*`, 정거장은 네온 SF 테마, 선명은 지금 그대로 둔다 — ADR `2026-11-01-ui-visibility.md`(D-448). 사이보그 스탯 판은 옛 프로젝트 모양 그대로, 2차 스탯 색(`--color-sec-*`)은 1차 스탯 색과 다른 계열 — ADR `2026-11-01-cyborg-sheet-old-look.md`.
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
