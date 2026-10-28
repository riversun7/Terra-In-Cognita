> 조사 보고서 원본 (작성: Claude Code 조사 서브에이전트, 2026-10-28). 저장소 파일은 고치지 않고 패키지 코드(better-auth 1.7.14)와 v1.7.14 문서(`plugins/username.mdx`)를 읽었다. 실행한 것은 정규식·유니코드 동작을 본 Node 확인뿐이고, 아래 설계 코드는 미실행. 이 보고서 뒤에 나온 사용자 결정(2026-10-28)으로 바뀐 점은 맨 아래 "보고 뒤 사용자 결정"에 적었다. 확정 내용은 ADR `docs/adr/2026-10-28-auth-and-accounts.md`.

# Username login with auto-register on Better Auth 1.7.14: research from 2026-10-28

Better Auth 1.7.14 can't auto-create accounts from a login, and it still requires an email on every user. The fix is a server-set non-routable email plus one small Fastify route that only calls the public `auth.api`.

In source paths, `ba/` = `better-auth/dist/` and `core/` = `@better-auth/core/dist/`.

## (a) Findings

**1. Username plugin (Verified: `ba/plugins/username/index.mjs`, `schema.mjs`)**
- **Endpoints:**
  - `POST /sign-in/username` takes `{username, password, rememberMe?, callbackURL?}`.
  - `POST /is-username-available` checks whether an ID is free.
  - Sign-up is the core `POST /sign-up/email` with an extra `username` field.
- **Defaults:**
  - Length 3–30 (counted with `.length`).
  - Allowed characters `^[a-zA-Z0-9_.]+$`: no Hangul, dots allowed.
  - Stored lowercase; `displayUsername` keeps the typed form.
  - Options exist for `immutableUsername` and `displayUsername: false`.
- **Uniqueness:** the `username` column is unique, and the CLI emits `.unique()`. A pre-check returns 400 `USERNAME_IS_ALREADY_TAKEN`.
- **Quirk:** in `/sign-in/username` the `validationOrder` option works the opposite way to sign-up. Don't set it; normalize input before calling.
- **Email is mandatory:**
  - The core `email` column is required and unique (`core/db/get-tables.mjs:160`).
  - `/sign-up/email` requires `email` (Zod email check) and `name`; admin create-user also requires email.
  - Better Auth already uses non-routable `<id>@<ns>.placeholder.invalid` addresses for anonymous, SIWE and Twitter users (`core/utils/email.mjs`). Use `<randomUUID>@id.placeholder.invalid`, set server-side.
  - Zod 4.6.7 accepts that format but rejects a Hangul local part (checked in Node), so the ID must never go into the email.
- **Pitfalls of the placeholder email (Verified):**
  - Nothing in Better Auth treats these addresses specially. A future mail sender must skip `.invalid` itself.
  - `requireEmailVerification` must stay off, or every sign-in fails with `EMAIL_NOT_VERIFIED`. All users have `email_verified = false`.
  - Never enable `changeEmail.updateEmailWithoutVerification`: unverified users could then attach any address (`ba/api/routes/update-user.mjs:445`). Real-email linking later = `changeEmail` plus a verification sender.
  - The email is returned in session and user payloads, so the UI must never show it.
  - The admin user list can only search email or name, but its `filterField` accepts any column, so filter on `username`.

**2. Auto-register (Verified)**
- There is no built-in option. `disableImplicitSignUp` and `requestSignUp` exist only for social/OAuth logins (`ba/api/routes/sign-in.mjs:98-196`).
- **HTTP-only protections:** `disabledPaths`, the rate limiter and the origin check run only when a request comes in over HTTP (`ba/api/index.mjs:151-173`). Server-side `auth.api.*` calls run hooks only (`ba/api/dispatch.mjs`).
- **`disableSignUp` blocks the server too:** it is checked inside the sign-up handler, so it would also block `auth.api.signUpEmail`. Close HTTP sign-up with `disabledPaths` instead.
- **Built-in limiter:**
  - Keyed by IP plus path; `/sign-in*` and `/sign-up*` get 3 per 10 s, everything else 100 per 10 s.
  - That makes `/is-username-available` a fast way to list which IDs exist.
  - There is no per-account or global limit.
- **Sign-up transaction:** sign-up runs in a transaction, and a DB unique-constraint error becomes 422 `FAILED_TO_CREATE_USER`.
- **Admin plugin:** bans (403 `BANNED_USER`) and the default role are applied in database hooks, so they cover every way of creating a user or session (`ba/plugins/admin/admin.mjs:26-50`). `role` can't be set by a client.
- **Passwords:** 8–128 characters by default. Passwords are NFKC-normalized before hashing (`@better-auth/utils` `password.node.mjs:11`), so Hangul typed on different keyboards still matches.
- **Session IP:** the IP stored on a session comes from the `x-forwarded-for` header passed in.

**3. Hangul IDs (Verified)**
- Hangul works with a custom validator.
- Node checks:
  - Decomposed "한글" differs from the composed form.
  - NFKC turns full-width "ａｄｍｉｎ" into "admin".
  - The Kelvin sign lowercases to "k".
- So: normalize, then validate, then derive the stored key.

**4. Roles (Verified: `ba/plugins/admin/routes.mjs:25-79`, `has-permission.mjs`)**
- `setRole` checks each role against the configured list and joins them with `,`.
- A single string `"player,admin"` is rejected because it is looked up as one role name, so always send an array.
- Server-side `auth.api.createUser` with no headers skips permission checks, which makes it usable from a CLI.

## (b) Design

**ID rule (`packages/shared/src/loginId.ts`)**
- Display form = input with `trim()` and `normalize("NFKC")`. It must match `^[A-Za-z가-힣][A-Za-z0-9_가-힣]{1,15}$` (2–16 characters).
- Stored key = the display form in lowercase, kept in `users.username`, so login and uniqueness ignore case. The display keeps exactly what was typed.
- **Reserved:**
  - The key with digits and `_` removed is one of admin, root, system, sys, gm, dev, mod, staff, support, official, terra, guest, null, 관리자, 운영자, 운영진, 시스템, 공식, 개발자, 지엠.
  - Or the key contains admin, 관리자, 운영자 or official.
- **Reasons:**
  - Complete Hangul syllables only, so no look-alikes from decomposed or jamo forms.
  - No dots, because screen routes must not contain dots (worklog 28-1935).
  - Case folding, so "Alice" can't impersonate "alice".

**Better Auth config (changes from the earlier research)**
- Username plugin: `{minUsernameLength: 2, maxUsernameLength: 16, usernameValidator, usernameNormalization, displayUsername: false, immutableUsername: true}`. The display form goes in `name`.
- Add to `disabledPaths`: `/sign-in/username`, `/sign-up/email`, `/sign-in/email`, `/is-username-available`, `/update-user`, `/change-email`, `/request-password-reset`, `/reset-password`, `/send-verification-email`, `/delete-user`, `/admin/create-user`.
- Add a `hooks.before` on `/admin/set-role` that refuses to remove the last admin.

**Endpoint: Fastify `POST /api/account/enter`**
It only calls the public `auth.api`; password checks, sessions and cookies stay Better Auth's own.
1. **Request checks:** `Origin` (or `Sec-Fetch-Site: same-origin`) must match; JSON only; strict Zod body `{id, password, create?, rememberMe?}`.
2. **Rate limits:** use the existing `createRateLimiter` per IP (10/min), per ID (10 per 15 min) and globally (10/s). The global limit also keeps password hashing from swamping Node's worker threads.
3. **Existing ID:** `auth.api.isUsernameAvailable`; if the ID is taken, call `signInUsername`. Result: `signed_in`, 401 `INVALID_PASSWORD`, or 403 `BANNED`.
4. **Free ID, no `create` flag:** return `{status: "new_id"}`.
5. **Free ID with `create`:**
   - Check the `AUTH_OPEN_SIGNUP` switch, then the password (8–128 characters, not equal to the ID, not on a common-password list), then the creation caps (3 per hour per IP, 30 per hour overall).
   - Then `signUpEmail({email: placeholder, name: display, username: display, password})`, write an `account.create` audit row, and return `created`.
6. **Race:** if creation fails with `USERNAME_IS_ALREADY_TAKEN`, or `FAILED_TO_CREATE_USER` while the ID now exists, try sign-in once. Success means the same person submitted twice; otherwise return 409 `ID_TAKEN`.
7. **Response:** forward only the Set-Cookie headers, with body `{status, user: {id, username, role}}`, never the session token or email. Pass `x-forwarded-for: request.ip` and the user agent to every `auth.api` call.

The alternative is a Better Auth plugin endpoint. It would inherit the built-in limiter and origin check, but it would have to re-implement credential checks through internal APIs and add `@better-auth/core` as a direct dependency.

**Client**
- **Step 1:** ID and password fields (`autocomplete=username` / `current-password`, `autocapitalize=none`).
- **On `new_id`, a confirm screen:**
  - the ID shown large;
  - a second password field (`new-password`);
  - a notice that there is no password recovery;
  - then resend with `create: true`.
- **On success:** refresh the session.
- **Message keys (ko/en):**
  - `auth_id_label` 아이디/ID
  - `auth_password_label` 비밀번호/Password
  - `auth_enter` 들어가기/Enter
  - `auth_id_hint` 한글·영문·숫자·_ 2~16자 / 2–16 chars: Hangul, letters, digits, _
  - `auth_new_id_title` 새 아이디입니다 / New ID
  - `auth_new_id_body({id})` ‘{id}’(으)로 계정을 만들까요? / Create an account as “{id}”?
  - `auth_password_confirm` 비밀번호 확인 / Confirm password
  - `auth_create` 만들기 / Create
  - `auth_back` 다시 입력 / Go back
  - `auth_no_recovery` 비밀번호를 잊으면 관리자에게 문의해야 합니다 / If you forget your password, ask an admin
- **Error keys (from the server's `code`):** `auth_err_invalid_id`, `_id_reserved`, `_invalid_password`, `_password_mismatch`, `_password_weak`, `_id_taken`, `_too_many({seconds})`, `_signup_closed`, `_banned`, `_unknown`.

**Admin page**
- Search with `listUsers` filtered on `username` (contains).
- Set roles with `setRole` and an array of roles, audited via hooks.

**DB changes from the earlier research's table list**
- `users.username`: text, NOT NULL, unique, with a pattern check. This is allowed: Better Auth's schema check only flags missing columns or required columns it never writes (`core/db/schema-diff.mjs`).
- **Other `users` columns:** `name` holds the display ID; there is no `display_username` column; `email` is always the placeholder; `role` defaults to `player`.
- **Audit table:** `admin_audit_log` becomes `audit_log`, with a nullable `actor_id` and an `actor_kind` of user, admin, cli or system.
- **Failed logins** go to logs and metrics, not DB rows.

**First admin, options compared**
- **psql update:** no code, but no audit row and easy to mistype.
- **`BOOTSTRAP_ADMIN_ID` env var:** would promote whoever registered that ID first. Unsafe while sign-up is open.
- **Recommended: a CLI command.** `docker compose exec server node dist/main.js grant-role <id> admin`, run after the owner has logged in with that ID (which proves they hold the password).
  - It shows the account's creation time and last session and asks for confirmation.
  - It then sets `player,admin` and writes the audit row in one transaction.
- Never make the first sign-up an admin.

**Tests**
- **Shared ID rule:** decomposed Hangul, full-width letters, Kelvin sign, reserved names, lengths 1/2/16/17, dots, emoji.
- **Route tests (`app.inject`):** foreign Origin or cross-site → 403; rate limits → 429 using a fake clock; `SIGNUP_CLOSED`.
- **DB tests (`TEST_DATABASE_URL`):**
  - `new_id` creates no rows; create writes the rows, the cookie and the audit row.
  - Different-case login works; a wrong password gives 401.
  - Two parallel creates leave exactly one user.
  - A banned user gets 403; the disabled stock paths return 404.
  - `setRole` with an array works, a comma string gives 400, a player gets 403, and the last-admin guard holds.
  - The CLI writes its audit row.

**Security notes**
- **Typos:** the confirm screen plus case-insensitive IDs.
- **Credential stuffing:** limits per IP, per ID and global, plus the common-password list. The Have I Been Pwned plugin could be added later; it already covers `/sign-up/email` but needs outbound HTTPS.
- **Squatting and bot sign-ups:** the creation caps, reserved names, and the `AUTH_OPEN_SIGNUP` off switch.
- **Login CSRF:** JSON-only plus the Origin check.
- **ID existence:** revealing that an ID exists is built into the decision, but there is no cheap way to check it: every probe costs the same as a login attempt.
- This keeps a small internet-exposed dev server acceptable.

**Assumed / Unknown**
- The limit numbers and the hashing cost on the NAS are Assumed.
- Whether a race surfaces as 400 or 422 is Assumed; the DB test settles it.
- Byte-wise uniqueness depends on Postgres's default collation being deterministic (Assumed).
- TypeScript 7 type-check: Unknown.

## (c) Decisions for the user (as reported)
1. **Show a confirm screen before creating an account?** Recommendation: a confirm screen with the password typed twice, because there is no password reset.
2. **Is the login ID visible to other players?** Recommendation: keep it private, with the public name from the character system.

Not asked, recommendations stand unless the user objects: the ID rule, the 8-character password minimum, and the CLI for the first admin.

## 보고 뒤 사용자 결정 (2026-10-28, 메인 세션이 덧붙임)
- 확인 화면: "확인 거치고 이메일 주소 입력을 하면 비밀번호 찾기 가능기능. 현재 확인메일 보내기구현안할거라, 비번찾기에서 이메일 일치만 하면 비밀번호 변경 가능하게만."
- 아이디 공개: "로그인 아이디와 사이보그 캐릭터 생성시 캐릭터 이름과는 다른것이다." → 로그인 아이디는 다른 플레이어에게 보이지 않는다. 그래서 사칭 방지용 예약어 목록은 로그인 아이디에는 쓰지 않는다.
- 아이디 글자 규칙: 사용자가 고르지 않았다. 메인 세션이 영문·숫자·_ 3~20자로 정했다(이유는 ADR).
- 첫 관리자: 사용자가 정한 계정 2개를 바로 만든다. 비밀번호는 저장소에 넣지 않는다.
- 갱신(2026-10-28 20:35): 아이디 글자 규칙을 다시 물었고, 사용자가 "영문·숫자·_ 3~20자"를 골랐다. 다계정은 "지금은 상한만, 정책은 기획에서"를 골랐다.
