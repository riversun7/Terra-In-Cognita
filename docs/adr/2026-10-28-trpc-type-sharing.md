# tRPC 도입과 서버 타입 공유(게임 앱 → 서버, 타입 전용)

- 상태: 확정
- 날짜: 2026-10-28
- 관련: docs/PLAN.md 3장·4.1·4.3, `2026-10-28-stack-baseline.md`(Zod 4 연동 확인 항목), `2026-10-28-m0-toolchain.md`(모듈 경계 검사 항목을 일부 대체)

## 배경
- tRPC는 서버의 라우터 타입(`AppRouter`)을 기기 쪽이 읽어야 클라이언트 타입이 생긴다.
- 그런데 의존 방향 규칙은 `apps/* → packages/*`만 허용한다. 게임 앱이 서버(`apps/server`)를 참조하려면 예외가 필요하다.
- 사용자 결정(2026-10-28): "tRPC를 쓰려면 게임 앱이 서버의 '타입 정보'를 읽어야 한다 → 타입만 예외로 허용(추천안)".
- 정할 것이 두 가지 남았다.
  - 타입을 어떻게 넘길지. TS 7은 서버 소스를 가져오면 그 파일들을 게임 앱 설정으로 다시 검사한다.
  - 값 import(서버 코드가 기기 번들에 들어가는 것)를 어떻게 막을지.
- stack-baseline ADR이 "Zod 4 + tRPC 11 연동은 골격 단계에서 확인"을 남겼다.

## 선택지
타입을 넘기는 방법:
1. 서버 소스를 바로 가져온다. 서버 `exports`가 `src/trpc/router.ts`를 가리킨다.
2. 서버가 선언 파일(d.ts, 타입만 담은 파일)을 따로 만든다. `exports`의 `types`가 그 파일을 가리킨다. 만드는 순서는 pnpm 실행 순서에 맡긴다.
3. **TS 프로젝트 참조**: 서버에 composite 설정(`tsconfig.api.json`)을 두고 게임 앱 tsconfig가 `references`로 가리킨다. `tsc -b`가 필요할 때 선언 파일을 만든다.

값 import를 막는 방법:
- 규칙 문서만 / **경계 검사 스크립트 + 실행 조건이 없는 `exports`**

## 결정
- 의존성(모두 MIT, 하위 의존성 없음 — Verified: npm 2026-10-28):
  - `@trpc/server` 11.19.0: 서버, 게임 앱. 게임 앱에도 넣는 이유는 `@trpc/client`가 실행 중에 `@trpc/server`의 공용 함수를 import하기 때문이다(peer 의존, Verified: `@trpc/client` 배포 코드).
  - `@trpc/client` 11.19.0: 게임 앱. 서버는 시험용 개발 의존성으로만.
  - `zod` 4.6.7: 서버(tRPC 입력 검사용). `@terra/protocol`과 같은 버전이라 잠금 파일에 새 패키지가 늘지 않는다.
  - TanStack Query는 아직 넣지 않는다(화면에서 쓸 때 넣는다).
- 서버
  - 공식 Fastify 어댑터(`@trpc/server/adapters/fastify`)로 `/api/trpc`에 붙인다. 경로 값은 `@terra/protocol`의 `TRPC_PATH`.
  - 첫 프로시저는 `system.info`(조회). `/health`와 WebSocket welcome이 이미 공개하는 값만 준다.
  - Fastify 생성 옵션에 `routerOptions.maxParamLength: 5000`.
  - 오류 응답에 스택을 넣지 않는다(`isDev: false`). 예상하지 못한 오류(`INTERNAL_SERVER_ERROR`)는 메시지를 `internal_error`로 바꾸고, 원문은 서버 로그에만 남긴다.
  - 텔레메트리(`/api/telemetry/*`)는 일반 POST 경로 그대로 둔다(sendBeacon).
- 타입 공유는 **선택지 3(프로젝트 참조)**.
  - 서버 `package.json`: `"exports": { "./trpc": { "types": "./src/trpc/router.ts" } }`. 실행 조건(`import`·`default`)이 없어서 Vite는 값 import를 찾지 못해 빌드가 실패한다.
  - 게임 앱은 `@terra/server`를 `devDependencies`에만 둔다.
  - 게임 앱 `typecheck`는 `tsc -b tsconfig.json`. 선언 파일은 `apps/server/dist-types/`(git 제외)에 생긴다.
- 경계 검사(`scripts/check-boundaries.mjs`의 `TYPE_ONLY` 표)
  - 게임 앱 소스에서 `@terra/server`는 `import type … from`, `export type … from`으로만 쓴다.
  - 그 밖의 형태는 모두 실패: 값 import, `import { type X }`(빈 import가 남는다), 부수효과 import, 동적 `import()`, `require()`, `typeof import()`.
  - `@terra/server`를 게임 앱 `dependencies`·`peerDependencies`에 두면 실패.
- Node 전역: 게임 앱 소스(`apps/game/src`)에서 `process`, `Buffer`, `global`, `require` 등과 Node 내장 모듈 import를 oxlint로 막는다(`.oxlintrc.json` overrides).

## 이유
- 선택지 1을 고르지 않은 이유
  - 게임 앱 타입 검사가 라우터에서 이어지는 서버 소스 전부를 게임 앱 설정(DOM, ES2024 등)으로 다시 검사한다.
  - 지금은 오류가 없지만 우연이다. `@trpc/client` 타입이 Node 타입을 끌고 들어와서 통과한다. 클라이언트 없이 라우터 타입만 가져오면 `config.ts`에서 `NodeJS`·`process` 오류가 난다(Verified: TS 7.0.2).
  - 서버가 게임 앱과 다른 설정을 쓰면 게임 앱 검사가 서버 파일 오류로 깨진다. 예: 서버만 새 `lib`를 쓸 때, import하지 않는 전역 타입 보강 파일(Fastify·Better Auth에서 흔한 형태)을 쓸 때(Assumed).
- 선택지 2를 고르지 않은 이유
  - 선언 파일이 없으면 타입 인식 린트가 조용히 약해진다. 처리하지 않은 Promise를 놓쳤다(Verified: oxlint `no-floating-promises`).
  - 만드는 순서를 사람이 챙겨야 한다. 게임 앱만 따로 검사하면 실패한다.
- 선택지 3을 고른 이유(Verified: TS 7.0.2, 이 작업에서 실행)
  - 게임 앱 `tsc -b`는 서버 선언 파일 2개(`router.d.ts`, `context.d.ts`)만 읽는다(`--listFiles`). 서버 구현 파일은 게임 앱 설정으로 검사하지 않는다.
  - 서버 선언 파일이 없거나 오래되면 `tsc -b`가 먼저 만든다. 게임 앱만 따로 검사해도 된다.
  - oxlint 타입 인식 린트는 선언 파일이 없어도 참조를 따라 서버 소스로 타입을 읽는다.
  - pnpm 링크(`node_modules/@terra/server`)를 거친 참조도 선언 파일로 바뀐다. 선언 파일이 없을 때 `tsc -p`는 TS6305 오류로 알려 준다.
  - composite는 가져오는 파일을 모두 포함해야 한다(TS6307) → 서버 `src` 전체(시험 파일 제외)를 넣는다. `@terra/protocol` 같은 작업공간 패키지는 `node_modules`를 거쳐 읽혀서 포함하지 않아도 된다.
- tsconfig로는 Node 전역을 막을 수 없다 → 린트로 막는다
  - `@trpc/client` 타입이 `@types/node`를 불러온다: wsLink → `@trpc/server/adapters/ws` → `@types/ws` → node(Verified: `--explainFiles`). 선택지와 무관하다.
  - 이번 작업 전부터 게임 앱 tsconfig가 `vite.config.ts`를 포함해 `@types/node`가 들어와 있었다. 게임 코드에 `process.env`를 써도 타입 오류가 없었다(Verified: 기존 설정으로 시험).
- Zod 4 + tRPC 11 연동(stack-baseline의 확인 항목, Verified: `@trpc/server@11.19.0` 코드와 `apps/server/src/trpc/zod.test.ts`)
  - 타입: 입력·출력 타입이 Standard Schema 경로로 추론된다. 변환(`transform`)이 있으면 입력 타입(변환 전)과 프로시저가 받는 타입(변환 뒤)이 다르다. 기본값(`default`)이 있는 필드는 입력에서 생략할 수 있다.
  - 실행: tRPC는 Zod 스키마를 Standard Schema가 아니라 Zod의 `parseAsync`로 검사한다(검사 함수 선택에서 `parseAsync` 확인이 Standard Schema 확인보다 앞). 그래서 실패 원인(`error.cause`)은 `ZodError`다. Standard Schema로만 검사되는 라이브러리라면 `StandardSchemaV1Error`가 된다.
  - HTTP: 틀린 입력은 400 `BAD_REQUEST`(조회 GET, 변경 POST 모두).
  - 주의: 오류 메시지는 Zod가 만든 영어 문제 목록(JSON 문자열)이다. 화면에 그대로 보여 주지 않는다. 기기는 `error.data.code`로 판단하고, 문구는 메시지 키로 만든다(다국어 ADR).
- Fastify 어댑터(Verified: 어댑터 코드와 시험)
  - 어댑터 플러그인은 자기 범위 안에서만 JSON 본문 파서를 바꾼다. 텔레메트리 경로는 그대로 JSON을 받는다.
  - 묶음 요청은 프로시저 이름을 경로에 쉼표로 잇는다(`/api/trpc/a,b,c`). Fastify 기본 경로 매개변수 상한 100자에 걸려, 상한을 100으로 두면 12개 묶음이 실패했다.
  - Fastify 5.12에서 최상위 `maxParamLength`는 사용 중단 경고(FSTDEP022)가 난다 → `routerOptions` 안에 쓴다.
- 기기 번들(Verified: 빌드 결과 검색)
  - 클라이언트를 실제로 부르게 바꿔 빌드한 결과에 서버 코드가 없었다. 서버 로그 문구, Fastify 어댑터, `initTRPC`를 찾아 0건.
  - 크기는 318.6kB → 335.2kB(gzip 97.7kB → 103.3kB).

## 결과
- 게임 앱 `typecheck`는 `tsc -b`다. 처음에는 서버 선언 파일을 만드느라 조금 더 걸린다.
- 서버 `tsconfig.api.json`은 서버 `src` 전체의 선언 파일을 만든다. 서버가 커져 느려지면 그때 범위를 다시 본다.
- tRPC 맥락 타입(`TrpcContext`)과 프로시저 입출력 타입은 게임 앱이 읽는 선언 파일에 들어간다. 맥락에 DB 연결 같은 큰 타입을 넣으면 게임 앱 검사가 그 선언도 읽는다(선언 파일은 검사하지 않으므로 오류는 나지 않는다). 타입은 빌드 때 지워져 기기로 가지 않는다.
- 경계 검사는 문법 분석 없이 글자를 찾는다. 주석 안의 이름은 무시하고, 문자열 안의 이름은 위반으로 센다(엄격한 쪽). 막히는 정당한 경우가 생기면 ADR로 정한다.
- Node 전역 금지는 린트가 맡는다. `globalThis.process`처럼 돌려 쓰는 경우는 잡지 못한다.
- `2026-10-28-m0-toolchain.md`의 "모듈 경계 검사" 항목을 일부 대체한다: package.json 비교에 더해, 타입 전용 의존은 소스의 import 형태도 검사한다.
