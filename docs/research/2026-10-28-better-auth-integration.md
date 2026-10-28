> 조사 보고서 원본 (작성: Claude Code 조사 서브에이전트, 2026-10-28). 저장소 파일은 고치지 않고 패키지 코드를 읽었으며 실행하지 않았다. better-auth.com이 이 세션에서 막혀 있어 문서는 v1.7.14 태그의 GitHub 원본을 읽었다. TS 7 타입 검사는 권한 검사로 막혀 Unknown. 결정은 구현 때 ADR(인증)에 남긴다.

# Better Auth 1.7.14 integration plan for Terra In-Cognita

Sources (read 2026-10-28):
- **pkg** = npm tarballs extracted to the scratchpad (`ba-1714/x/`)
- **docs** = `better-auth/better-auth` at v1.7.14, `docs/content/docs/*.mdx`
- **issues** = GitHub issue search

## (a) Findings

**1. Mounting on Fastify**
- **Verified** (docs `integrations/fastify`): the official way is a Fetch bridge. Register `route({ method: ["GET","POST"], url: "/api/auth/*" })` and call `auth.handler(new Request(...))`. 1.7.14 only has GET and POST endpoints (grep of pkg).
- **Verified**: `toNodeHandler` reads the raw stream or an Express-style `req.body`. Fastify has already consumed the stream by then, so it doesn't fit.
- **Verified** pitfalls in Fastify 5.12.7:
  - An empty JSON body is rejected with 400 (`FST_ERR_CTP_EMPTY_JSON_BODY`) before Better Auth sees it.
  - Form bodies get 415. Better Auth accepts them on `/sign-in/email`, `/sign-up/email` and `/callback/:id`.
  - Fix: in an encapsulated plugin, call `removeAllContentTypeParsers()` and `addContentTypeParser("*", { parseAs: "string" })`, then pass the raw string to the Request.
  - `reply.send(response)` accepts a Web `Response` and appends each `Set-Cookie` separately.
- CORS is not needed: same origin, and the baseURL origin is trusted automatically.

**2. Database (Verified)**
- Import from `@better-auth/drizzle-adapter/relations-v2` (docs `adapters/drizzle`). `better-auth/adapters/drizzle` is the old v1 adapter. It expects `db._.fullSchema`, which drizzle-orm rc.5 doesn't have (its `db._` only holds `{relations, session}`).
- Pass `schema` explicitly, set `transaction: true` (default is false), and keep `advanced.database.joins` off.
- No runtime table creation:
  - `runMigrations` only runs if you call it.
  - `better-auth/minimal` doesn't load Kysely, and calling `runMigrations` there throws.
  - The Drizzle schema check reads local metadata only, with no DB connection. A mismatch makes auth requests fail.
  - The CLI's `migrate` command refuses Drizzle.
- The CLI is now the npm package `auth` (`npx auth@1.7.14 generate`); `@better-auth/cli` stopped at 1.4.x.
  - With the relations-v2 adapter it generates `pgTable` with explicit snake_case column names and `defineRelationsPart`, so no `casing` option is needed.
  - It emits `timestamp()` without time zone (open issue #9920). Switching to `withTimezone: true` is fine.
- The built-in Kysely + `pg.Pool` option would make a second schema owner, so the Drizzle adapter fits the "Drizzle owns migrations" ADR.
- Tables with `usePlural: true` (core plus admin plugin):

| Table | Columns |
|---|---|
| `users` | id, name, email (unique), email_verified, image, created_at, updated_at, role, banned, ban_reason, ban_expires |
| `sessions` | id, expires_at, token (unique), created_at, updated_at, ip_address, user_agent, user_id → users (cascade), impersonated_by |
| `accounts` | id, account_id, provider_id, user_id → users (cascade), access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at |
| `verifications` | id, identifier, value, expires_at, created_at, updated_at |

**3. Cookies and origins behind the proxy (Verified unless marked)**
- Secure flag and `__Secure-` prefix come from an https `baseURL`, not from `x-forwarded-proto` per request.
- Defaults: SameSite=Lax, HttpOnly, Path=/. Cookies are named `better-auth.session_token` (HMAC-signed with the secret), `better-auth.session_data`, `better-auth.dont_remember`.
- CSRF:
  - Non-GET requests that carry cookies need an Origin or Referer in the trusted list.
  - Sign-in without cookies is checked with Fetch-Metadata headers.
  - `callbackURL` and redirect targets are validated.
- Under `NODE_ENV=test`, the origin check and rate limiting are off unless you set them explicitly.
- **Assumed**: cookies are not separated by port, and other apps share `riversun7.synology.me`. Use `cookiePrefix: "tic"`.
- **Fastify trustProxy (Verified)**:
  - `trustProxy: true` makes `request.ip` the leftmost `X-Forwarded-For` value. That value can be spoofed behind an appending proxy.
  - A numeric `trustProxy` now trusts nothing in 5.12.7.
  - This already affects the existing telemetry rate limiter.

**4. Telemetry (Verified)**: off by default, and it can't send anything anyway.
- The published `@better-auth/core` sets `BETTER_AUTH_TELEMETRY_ENDPOINT` to `""`. With no endpoint, `createTelemetry` returns a do-nothing publisher.
- If someone enabled it and set an endpoint, it would send: a hashed project id, runtime, OS/CPU/RAM/Docker info, DB and framework versions, and a redacted config.
- Set `telemetry: { enabled: false }`. Never set `BETTER_AUTH_TELEMETRY` (it overrides the config) or `BETTER_AUTH_TELEMETRY_ENDPOINT`.

**5. Admin plugin (Verified)**
- Roles live in one text column `role`. Multiple roles are comma-separated (docs). A user gets a permission if any of their roles has it. Arrays are joined with `","`, with no trimming.
- Custom roles: `createAccessControl({ ...defaultStatements, ... })` and `ac.newRole()`, passed as `admin({ ac, roles, defaultRole: "player", adminRoles: ["admin"] })`. Unknown role names are rejected.
- `disabledPaths` matches exact paths and returns 404; server-side `auth.api` calls still work. Disable `/admin/impersonate-user`, `/admin/stop-impersonating` and `/admin/remove-user`, and don't use `adminUserIds` (it bypasses every check).
- Banning a user revokes their sessions.
- `hooks.after` receives the result or the error for both HTTP and `auth.api` calls, so it is the hook point for the audit log.

**6. Email and password (Verified unless marked)**
- Hashing is scrypt N=16384, r=16, p=1 (about 32 MiB per hash) on async `node:crypto`.
- The NAS CPU is an **AMD Ryzen Embedded R1600, 4 threads** (`ops/nas-facts.md`). Measured 106 ms per hash on a 2.1 GHz Xeon in the research container; on the NAS expect 100–200 ms (**Assumed**). Keep the default.
- Rate limiting is on in production:
  - 100 requests per 10 s by default; sign-in/sign-up 3 per 10 s; reset and verification mail 3 per 60 s.
  - Storage: memory (default), database, or secondary storage. Use memory.
  - Only a single-value `X-Forwarded-For` is trusted. Otherwise every client falls into one shared bucket.
- Without an email sender:
  - `requireEmailVerification: true` means nobody can sign in, so keep it false.
  - Password reset returns 400 `RESET_PASSWORD_DISABLED`.
  - Default sign-up returns 422 for an existing email, which reveals that the email is registered.

**7. Social login (Verified)**
- Kakao, Naver and LINE are built-in providers.
- Kakao only returns email for a Biz App. With no email, sign-in fails with `email_not_found`.

**8. Secrets (Verified)**
- Better Auth only warns if the secret is under 32 characters or below a 120-bit entropy estimate.
- The default secret throws only in production, and only when `auth.$context` resolves. Await it at startup so a missing secret fails fast.
- Rotation: `BETTER_AUTH_SECRETS="2:new,1:old"`.
- 32 random bytes as hex (64 characters) passes all checks.

**9. Known issues**
- No open issues found for Fastify, Node 24 or Zod 4.6. Installing gives a single shared zod 4.6.7 (**Verified**).
- Upstream uses TS 7.0.2 (#11899, fixed 10-18). Issue #10077 (TypeScript running out of memory when inferring `createAuthClient` types) is still open.
- Our own type-check: **Unknown**.
- All dependencies are MIT and none have install scripts (**Verified**).

**10. React client (Verified)**
- Use `createAuthClient` from `better-auth/react` with `adminClient()`. The default baseURL is the page origin plus `/api/auth`.
- It adds `nanostores`, `nanostores/react` and `defu` to the bundle, and no zod.

## (b) Implementation plan
1. **Docs**: an ADR `docs/adr/<date>-auth.md` (`scripts/check-docs.mjs` requires an ADR whenever runtime dependencies are added). Update PLAN §13, and AGENTS §6 (CLI is the `auth` package, relations-v2 import, test-mode defaults).
2. **Dependencies, exact versions**: server `better-auth@1.7.14` and `@better-auth/drizzle-adapter@1.7.14`; game `better-auth@1.7.14`.
3. **Schema**: add the auth tables to `apps/server/src/db/schema.ts` (timestamptz; `updated_at` with `.defaultNow().$onUpdate(...)`).
   - Add `admin_audit_log` (identity id, at, actor_id, action, target_id, before/after jsonb, ip, status; no foreign keys).
   - Run `db:generate --name auth`, then `drizzle-kit generate --custom --name audit_immutable` for a trigger that rejects UPDATE/DELETE/TRUNCATE (`--custom` exists in rc.5).
4. **`src/auth/permissions.ts`**: statements (defaults plus world, content, game, audit) and roles player, gm, dev, admin. Only admin gets set-role, ban, create and set-password.
5. **`src/auth/auth.ts`**, `createAuth({ db, cfg })`:
   - `betterAuth` from `better-auth/minimal`
   - adapter options `{ provider: "pg", schema, usePlural: true, transaction: true }`
   - `baseURL`, `secret`, `emailAndPassword: { enabled: true }`, `admin(...)`, `disabledPaths`
   - `telemetry: { enabled: false }`, `advanced.cookiePrefix: "tic"`
   - audit `hooks`: snapshot the "before" value in `hooks.before`, write the row in `hooks.after`, strip passwords
6. **`src/auth/routes.ts`** (the bridge):
   - Use the scoped raw-string parser with a 64 KiB `bodyLimit`.
   - Build the URL from baseURL plus `request.url`.
   - Convert headers with `fromNodeHeaders`, then `headers.set("x-forwarded-for", request.ip)`.
   - `return reply.send(await auth.handler(req))`.
   - Consider redacting tokens in query strings from the logs.
7. **`src/auth/guard.ts`**: a `requirePermission()` preHandler (`getSession` plus role check, deny by default). Later reuse it for the `/ws` preValidation and the tRPC context.
8. **`config.ts`, `app.ts`, `main.ts`**:
   - New env vars: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `TRUSTED_ORIGINS`, `TRUST_PROXY` (default `127.0.0.1,::1,172.16.0.0/12`).
   - Register auth only when there is a DB: the CI image smoke test runs in production mode with no DB and no secret.
   - In production with a DB, require the secret and URL, and await `auth.$context` before `listen`.
9. **Game app**: `src/auth/client.ts` exporting a narrowed type (guards against #10077), plus sign-up/in/out UI. Map Better Auth error `code`s to ko/en message keys. In dev, set `BETTER_AUTH_URL=http://localhost:5173`.
10. **Ops**:
    - `ops/compose.yml`: `BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:?...}` and `BETTER_AUTH_URL: https://riversun7.synology.me:4443`.
    - `ops/deploy.sh` step 1: an `ensure_secret NAME BYTES` helper that appends missing keys to the already-existing `.env` (`head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'`).
    - `ops/nas-setup.md`: first admin = sign up, then promote with a `psql` update to `role='player,admin'`. Log `request.ips` once behind DSM to confirm the proxy setup.
11. **Tests**:
    - Unit: `explicitSchemaCheck()` passes (with `drizzle.mock`); role matrix including combined and unknown roles; disabled paths return 404.
    - Bridge via `app.inject`: empty JSON body, form body, two Set-Cookie headers kept, spoofed `X-Forwarded-For` ignored.
    - DB tests (`TEST_DATABASE_URL`): sign-up, sign-in, get-session, sign-out; a foreign Origin gets 403 (set `disableOriginCheck: false` in the test); rate limit, enabled explicitly (the memory store is shared across the whole module); a player gets 403 on admin routes; an audit row is written, and UPDATE/DELETE on the audit table fails.

## (c) Decisions for the user, and risks
**Decisions:**
1. **Primary key type**: DB-generated UUIDs (`generateId: "uuid"`, `gen_random_uuid()`; smaller keys for the many game tables that will point at users) or Better Auth's default 32-character text ids. Recommendation: UUID. Hard to change later.
2. **Sign-up until an email sender exists**:
   - Open sign-up: existing emails are revealed by the 422, and there is no self-service password reset. The only recovery path is an admin setting the password, which is audited.
   - Invite-only: `disableSignUp` plus admin create-user.

**Risks:**
- The relations-v2 adapter and the Drizzle RC are both still changing (many fixes Aug–Oct 2026). The DB tests above are the safeguard.
- TypeScript 7 compatibility is unverified.
- How the DSM reverse proxy sets forwarding headers is **Assumed**; the one-time `request.ips` check confirms it.
- The memory rate limiter resets on restart and only covers a single process.
