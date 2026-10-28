# 인증 서버: Better Auth 연결, 들어가기·비밀번호 찾기, 관리자 역할, 감사 기록, 관리 명령

- 일시: 2026-10-28 21:00 (KST)
- 작업 도구: Claude Code (클라우드 세션, 서브에이전트 worktree)
- 관련: ADR `2026-10-28-auth-and-accounts.md`(제안 → 이 구현으로 확인), `2026-10-28-db-access-and-migrations.md`(ADR 22), `2026-10-28-trpc-type-sharing.md`(ADR 23), 조사 `docs/research/2026-10-28-better-auth-integration.md`·`2026-10-28-username-login.md`, 작업 기록 `28-1935-proxy-trust-static-404.md`·`28-2010-auth-pwa-deps.md`
- 의존성은 앞 커밋(a05659d)에서 이미 넣었다. 이번에는 `package.json`·잠금 파일을 바꾸지 않았다.

## 한 일
- 아이디 규칙(`packages/shared/src/loginId.ts`): 앞뒤 공백 제거 → NFKC → 영문·숫자·_ 3~20자 → 소문자 키. 예약어는 없다(아이디는 남에게 안 보임). 역할 목록(`roles.ts`)과 계정 HTTP API 약속(`accountApi.ts`: 경로·형식·오류 코드)도 공용 패키지에 두었다. 화면 작업이 그대로 쓴다.
- DB 표(`src/db/schema.ts`) + 마이그레이션 2개
  - `20261028112454_auth`: `users`·`sessions`·`accounts`·`verifications`(UUID 기본 키, timestamptz, snake_case 열), `account_recovery`(복구 이메일), `audit_log`.
  - `20261028112504_audit_log_append_only`(직접 쓴 SQL, `drizzle-kit generate --custom`): UPDATE·DELETE·TRUNCATE를 문장 단위 트리거로 거절한다.
  - 모두 추가만 한다. 직전 버전 앱은 새 표를 모르고 그대로 돈다.
- Better Auth 구성(`src/auth/auth.ts`)
  - `better-auth/minimal`, `@better-auth/drizzle-adapter/relations-v2`, `usePlural`, `transaction: true`, `advanced.database.generateId: "uuid"`(DB가 `gen_random_uuid()`로 만든다), `advanced.cookiePrefix: "tic"`, `telemetry: { enabled: false }`, 쿠키 캐시 끔.
  - username 플러그인: 검사·키는 shared `parseLoginId`, `displayUsername: false`, `immutableUsername: true`, `name`에 입력한 모양.
  - admin 플러그인: `createAccessControl` 역할 player(기본)·gm·dev·admin. 계정 관리 동작은 admin만. 대리 로그인·삭제·이메일 바꾸기는 누구에게도 없다.
  - `minPasswordLength: 1`: 새 비밀번호 규칙(8자 등)은 우리 코드가 본다. 관리 명령 `--allow-weak`가 그 규칙만 건너뛴다.
  - 시작할 때 `verifyAuth`: `auth.$context`를 기다리고(운영에서 비밀값이 없으면 실패) 표 정의를 Better Auth 기대값과 비교한다. 틀리면 서버가 뜨지 않는다.
- HTTP
  - `/api/auth/*` 다리(`bridge.ts`): `GET get-session`, `POST sign-out` 두 경로만 만든다. 나머지는 404. 본문은 문자열 그대로 넘긴다(빈 JSON 본문이 Fastify 400에 막히지 않게). 응답은 상태와 Set-Cookie만 넘기고 본문은 다시 만든다.
  - `POST /api/account/enter`, `POST /api/account/reset-password`(`account.ts`): 같은 출처·JSON만, 엄격한 Zod 본문, 시도 제한, 계정 생성 상한, `AUTH_OPEN_SIGNUP`, 흔한 비밀번호 목록, 동시 생성 처리, 감사 기록. 응답에 `Cache-Control: no-store`.
  - Better Auth에 넘기는 접속 주소는 `request.ip`(믿는 프록시를 거친 값)로 덮어쓴다.
  - 서버를 켠 뒤 첫 인증 요청에서 `request.ips`를 info 로그로 한 번 남긴다(`proxyCheck`, `ops/nas-setup.md` 11장).
- tRPC
  - 맥락: `viewer()`(세션을 처음 부를 때 한 번만 조회, 연장은 끔), `admin`(요청한 관리자의 머리글로 Better Auth를 부르는 기능). 맥락 타입은 우리 타입만 쓴다. 게임 앱 타입 검사는 서버 선언 파일 2개(`router.d.ts`, `context.d.ts`)만 읽는다(`--listFiles`로 확인).
  - `account.me`, `admin.users.list`, `admin.users.setRoles`. 권한 미들웨어(`permissionProcedure`)는 기본 거부다.
- 관리 명령 `src/cli.ts` → `dist/cli.js`(Vite 서버 빌드에 진입 파일 추가): `create-user`, `set-roles`, `set-password`. 비밀번호는 `TIC_PASSWORD`로만, 실행자는 `TIC_ACTOR`로 감사 기록에 남긴다.
- 운영
  - `ops/deploy.sh` 1단계 `ensure_secret`: 이미 있는 `.env`에 빠진 키만 무작위 16진수로 덧붙인다(POSTGRES_PASSWORD 24바이트, BETTER_AUTH_SECRET 32바이트).
  - `ops/compose.yml`: `BETTER_AUTH_SECRET`(필수), `BETTER_AUTH_URL: https://riversun7.synology.me:4443`, `AUTH_OPEN_SIGNUP`(기본 true).
  - `.github/workflows/account-admin.yml`: 수동 실행, NAS 실행기, `deploy-nas` 줄, main에서만.
  - `ops/nas-setup.md` 10장(계정 만들기·역할), 11장(프록시 경로 확인).
- 설정(`src/auth/config.ts`, `src/config.ts`): 운영 + DB면 `BETTER_AUTH_SECRET`(32자 이상)·`BETTER_AUTH_URL`(https, 출처만)이 필수. DB가 없으면 인증을 켜지 않는다(CI 이미지 확인).

## 화면 작업용 API
경로·형식·오류 코드는 `@terra/shared`의 `ACCOUNT_API_PATHS`·`AUTH_SESSION_PATHS`·`EnterRequest`·`EnterResponse`·`ResetPasswordRequest`·`SessionResponse`·`ACCOUNT_ERROR_CODES`에 있다. 오류 응답 본문은 `{ "error": "<코드>" }`(429는 `retryAfterSec`와 `Retry-After` 머리글도).

| 요청 | 본문 | 성공 응답 | 오류(HTTP 상태 → error) |
|---|---|---|---|
| `POST /api/account/enter` | `{ id, password }` | `200 { status: "signed_in", user }` + 쿠키, 또는 `200 { status: "new_id", loginId }`(쿠키 없음, 계정 없음) | 400 `INVALID_REQUEST`·`INVALID_ID`, 401 `INVALID_PASSWORD`, 403 `BANNED`·`FORBIDDEN_ORIGIN`, 415 `UNSUPPORTED_MEDIA_TYPE`, 429 `TOO_MANY_REQUESTS`, 500 `INTERNAL_ERROR` |
| 같은 경로(확인 화면에서 만들기) | `{ id, password, create: true, passwordConfirm, email? }` | `200 { status: "created", user }` + 쿠키. 같은 아이디가 그새 생겼고 비밀번호가 맞으면 `signed_in` | 위에 더해 400 `PASSWORD_MISMATCH`·`PASSWORD_TOO_SHORT`·`PASSWORD_TOO_LONG`·`PASSWORD_SAME_AS_ID`·`PASSWORD_TOO_COMMON`·`INVALID_EMAIL`, 403 `SIGNUP_CLOSED`, 409 `ID_TAKEN`, 429 `SIGNUP_LIMIT` |
| `POST /api/account/reset-password` | `{ id, email, newPassword, newPasswordConfirm }` | `200 { status: "password_reset" }`. 그 계정의 세션이 모두 끊긴다 → 새 비밀번호로 다시 들어가기 | 400 `RESET_FAILED`(아이디·이메일이 틀리거나 복구 이메일 없음, 구분하지 않음)·`INVALID_ID`·`INVALID_EMAIL`·비밀번호 규칙 코드·`PASSWORD_MISMATCH`, 429 `TOO_MANY_REQUESTS` |
| `GET /api/auth/get-session` | 없음(쿠키) | `200 { user, expiresAt }` 또는 `200 null`. 하루 넘게 쓴 세션이면 쿠키를 새로 준다 | — |
| `POST /api/auth/sign-out` | `{}` 또는 빈 본문, `Content-Type: application/json` | `200 { success: true }` + 쿠키 지우기 | 403 `FORBIDDEN_ORIGIN` |
| tRPC `account.me`(조회) | 없음 | `{ id, loginId, roles } \| null` | — |
| tRPC `admin.users.list`(조회) | `{ search?: "", limit?: 20(1~100), offset?: 0 }` | `{ users: [{ id, loginId, roles, banned, createdAt }], total }`(아이디 순, 이메일 없음) | `error.data.code`: UNAUTHORIZED, FORBIDDEN, BAD_REQUEST |
| tRPC `admin.users.setRoles`(변경) | `{ userId: UUID, roles: Role[] }`(배열만, 1개 이상) | 바뀐 사용자 한 줄 | UNAUTHORIZED, FORBIDDEN, BAD_REQUEST, NOT_FOUND, PRECONDITION_FAILED(message `LAST_ADMIN`) |

- `user`(AccountView) = `{ id, loginId, roles }`. 이메일·세션 토큰은 어디에도 나오지 않는다.
- 모든 POST는 같은 출처(`Origin` = `BETTER_AUTH_URL`)와 `Content-Type: application/json`이어야 한다. 브라우저 `fetch`는 자동으로 붙는다.
- 화면 흐름: 들어가기 → `new_id`면 확인 화면(아이디 크게, 비밀번호 한 번 더, 이메일 선택, "이메일이 없으면 비밀번호를 잊었을 때 관리자에게 문의" 안내) → `create: true`로 다시 보낸다. 성공하면 `account.me`를 다시 읽는다.
- 세션 연장: tRPC로는 쿠키를 새로 줄 수 없다. 앱을 열 때와 하루에 한 번쯤 `GET /api/auth/get-session`을 부른다.
- 메시지 키 제안(ko·en은 화면 작업에서): `auth_err_invalid_request`, `_forbidden_origin`(보통 안 보임), `_invalid_id`, `_invalid_password`, `_banned`, `_id_taken`, `_signup_closed`, `_signup_limit({seconds})`, `_password_mismatch`, `_password_too_short`, `_password_too_long`, `_password_same_as_id`, `_password_too_common`, `_invalid_email`, `_reset_failed`, `_too_many({seconds})`, `_unknown`.
- 개발: Vite 개발 서버(5173)를 거치면 서버에 `BETTER_AUTH_URL=http://localhost:5173`을 준다. 브라우저도 같은 주소(`localhost`, `127.0.0.1` 아님)로 연다. 주소가 다르면 `FORBIDDEN_ORIGIN`. 서버만 띄우면 기본값은 `http://localhost:<PORT>`. DB가 없으면 인증 경로는 404다.

## 확인 (Verified: 이 컨테이너, Node 24.22.1, pnpm 11.28.9, TS 7.0.2, PostgreSQL 16 임시 클러스터)
| 항목 | 결과 |
|---|---|
| `pnpm install --frozen-lockfile` | 바뀐 것 없음 |
| `TEST_DATABASE_URL=… pnpm check` | 통과. 시험 198개(이번에 추가 75개: 아이디 규칙 13, 역할 표 9, 요청·비밀번호·시도 제한·설정 16, HTTP 경로·표 정의 15, 시도 제한기 1, DB 통합 21). DB 없이는 25개 건너뜀 |
| Better Auth 타입(TS 7.0.2) | 통과. `auth.api.*` 입력·출력이 실제로 추론된다(틀린 필드·모르는 역할 이름을 넣으면 TS2769로 실패하는 것을 임시 파일로 확인) |
| 표 정의 확인 | `verifyAuth` 통과. 대조군(열을 뺀 표)은 `SchemaMismatchError`로 실패. Better Auth 생성기(`adapter.createSchema`)가 만든 정의와 열 이름·종류가 같다. 다른 점: timestamptz, `username`·`role`·`banned` NOT NULL(+기본값), 인덱스 이름 snake_case, 검사 조건 |
| `pnpm build` | 통과. `dist/main.js`·`migrate.js`·`cli.js` + `dist/assets/` 공용 조각. 기기 번들 318.61kB 그대로 |
| `db:generate` 다시 | "No schema changes" |
| 빌드한 서버 + 새 DB(운영 모드, https 주소) | 마이그레이션 1회차 4개 적용·2회차 없음. `ops/smoke.mjs` 통과(`db ok`). 들어가기 200 + `__Secure-tic.session_token`(HttpOnly·Secure·SameSite=Lax), get-session·`account.me`에 토큰·이메일 없음, 로그아웃 뒤 null |
| 빌드한 관리 명령 | 7자 비밀번호: `--allow-weak` 없으면 코드 2, 있으면 경고 + 생성. 마지막 admin 내리기 코드 3. `--password=…` 인자는 값을 찍지 않고 거절 |
| 운영 모드 DB 없음 | 뜬다(`db: off`), `/api/account/*`·`/api/auth/*` 404, `account.me` null |
| 운영 모드 DB 있음 + 비밀값 없음 | `BETTER_AUTH_SECRET is required in production`, 코드 1 |
| 마지막 admin 보호 | DB 잠금을 지우면 "둘이 동시에 서로를 내림" 시험이 실패한다(admin 0명). 되돌리면 통과 |
| `ensure_secret` | 새 파일·빈 파일·줄바꿈 없는 기존 파일에서 빠진 키만 덧붙임(64자), 권한 600, 두 번 불러도 그대로 |
| 로그 | 비밀번호·쿠키·이메일 없음. 실패한 로그인은 사용자 UUID와 결과만 |

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/{loginId,roles,accountApi}.ts`(+시험), `index.ts` | 아이디 규칙, 역할 목록, 화면과의 API 약속 |
| `apps/server/src/db/schema.ts`, `apps/server/drizzle/20261028112454_auth/`, `…112504_audit_log_append_only/` | 인증 표, 감사 기록 보호 트리거 |
| `apps/server/src/auth/*`(새) | Better Auth 구성, 다리, 계정 경로, 시도 제한, 비밀번호 규칙, 권한 표, DB 작업, 관리자 기능, 설정 |
| `apps/server/src/trpc/{context,createContext,init,account,admin,router,plugin}.ts`, `zod.test.ts` | 세션 맥락(타입과 만들기를 나눔), 권한 미들웨어, 프로시저 |
| `apps/server/src/{app,config,main}.ts` | 인증 켜기(DB가 있을 때만), 설정, 시작 때 확인 |
| `apps/server/src/rateLimit.ts`(+시험) | `retryAfterMs`(Retry-After 안내) |
| `apps/server/src/cli.ts`, `src/cli/commands.ts`, `vite.config.ts` | 관리 명령, 빌드 진입 파일 |
| `apps/server/src/testDb.ts`, `tsconfig.api.json` | DB 시험 도우미(게임 앱 선언 파일에서 뺌) |
| `ops/deploy.sh`, `ops/compose.yml`, `Dockerfile`, `.github/workflows/account-admin.yml`, `ops/nas-setup.md` | 비밀값, 인증 환경 변수, 계정 관리 작업, 안내 |

## 함께 바꿔야 하는 파일
- 표 정의(`schema.ts`)의 인증 표를 바꾸면: `db:generate`, Better Auth 표 정의 확인 시험(`src/auth/routes.test.ts`), `authSchema`(어댑터에 넘기는 표).
- 아이디 규칙을 바꾸면: `packages/shared/src/loginId.ts`(+시험), DB 검사 조건 `users_username_format`(새 마이그레이션), username 플러그인 길이(`auth.ts`), 관리자 검색(`adminServices.ts`의 `searchKey`).
- 역할을 늘리면: `packages/shared/src/roles.ts`, `src/auth/permissions.ts`(`roles` 표), 마지막 admin 확인(`store.ts`).
- 오류 코드를 늘리면: `packages/shared/src/accountApi.ts`의 `ACCOUNT_ERROR_CODES`와 화면 메시지 키(ko·en).
- 앱 주소를 바꾸면: `ops/compose.yml`의 `BETTER_AUTH_URL`(같은 출처 검사·Secure 쿠키 기준).
- Better Auth를 올리면: 허용 목록 시험(404 목록), 표 정의 확인, `toSessionResponse`가 읽는 필드.

## 건드리지 말 것
- `/api/auth/*`에 경로를 늘리지 않는다(허용 목록, ADR). 새 기능은 우리 경로나 tRPC로 만든다.
- 세션 쿠키 캐시(`session.cookieCache`)를 켜지 않는다: 비밀번호 찾기 뒤 끊은 세션이 캐시 동안 살아 있다.
- get-session 응답을 Better Auth 본문 그대로 보내지 않는다(세션 토큰이 화면 스크립트에 보인다).
- `BETTER_AUTH_TELEMETRY*` 환경 변수를 넣지 않는다. 운영 `.env`의 `BETTER_AUTH_SECRET`을 바꾸지 않는다(모든 로그인이 풀린다).
- 올라간 마이그레이션(`drizzle/`)과 감사 기록 트리거를 고치지 않는다.

## 미검증·TODO·알려진 문제
- CI(PostgreSQL 18.6)·Docker 이미지·NAS는 푸시 뒤 확인한다. 이 컨테이너에는 Docker가 없다.
- `account-admin.yml`은 실행해 보지 않았다(미실행). 첫 단계는 실행기 이미지에 `jq`가 있다고 본다(Assumed: myoung34/github-runner). 없으면 값을 찍지 않고 실패한다.
- NAS 프록시 경로(`proxyCheck` 로그)는 배포 뒤 한 번 본다(`ops/nas-setup.md` 11장).
- 계정을 만든 뒤 복구 이메일·감사 기록 쓰기가 실패하면(DB가 그 사이 끊김) 계정은 남고 500을 돌려준다. 다시 들어가면 로그인된다(복구 이메일은 빠짐). 드문 경우라 감수했다.
- 관리 명령 create-user도 계정 생성과 감사 기록이 한 트랜잭션이 아니다(Better Auth `createUser`가 따로 쓴다).
- Better Auth `listUsers`는 DB 오류를 빈 목록으로 바꾼다(그대로 둠).
- 시도 제한 숫자는 처음 값이다(Assumed). 메모리에 있어 다시 켜면 초기화된다.
- 다음 작업: 로그인·관리자 화면(게임 앱), WebSocket 접속에 세션 연결, 로그인한 뒤 복구 이메일 넣기·바꾸기, CSP.

## 사용자 결정 대기
- 없음. 첫 관리자 계정은 메인 세션이 배포 뒤 `account-admin` 작업으로 만든다.
