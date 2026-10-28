> 조사 보고서 원본 (작성: Claude Code 조사 서브에이전트, 2026-10-28). 저장소 파일은 고치지 않고 읽기·임시 시험만 했다. 표기: [V] 저장소에서 읽거나 실행해 확인 / [A] 추정. 결정은 구현 때 ADR(콘텐츠 팩 형식)에 남긴다.

# Content pack validation: M0 plan (stages 1·2·4·7)

## 1. Layout
```
content/core/                  # one live folder per pack; history lives in git, no per-version copies
  manifest.json    {"formatVersion":1,"packId":"core","version":1,"placeholder":true,
                    "note":{"ko":"기획 확정 전 형식 확인용 임시 데이터","en":"Placeholder, not game design"}}
  items.json       {"entries":[{"id":"dev_placeholder","name":{"ko":"임시 아이템","en":"Placeholder item"}}]}
  id-changes.json  {"renamed":[],"removed":[]}      # append-only
packages/content/  (@terra/content, dep zod 4.6.7)
  src/index.ts  version.ts (CONTENT_FORMAT_VERSION)  canonical.ts
  src/schema/{common,manifest,idChanges,categories}.ts
  src/validate/{schema,references,idChanges,compat}.ts + *.test.ts
  src/node/{load,hash}.ts      # exported as "@terra/content/node" (fs, crypto)
  fixtures/valid/
scripts/check-content.mjs      # CLI: git, base commit, output (same style as the other check-*.mjs)
```
- **Pure core.** `validatePack(files: Map<name,text>, registry) → ContentIssue[]`, where each issue has stage, level, file, id, path and message. The CLI, the server boot and the later browser editor share it. Node-only code stays in `./node`.
- **IDs.** English snake_case matching `^[a-z][a-z0-9_]{1,47}$`. Unique within a category (category = file stem). Never reused. No namespace in M0.
- **Entries are arrays, not objects keyed by ID.** `JSON.parse` silently keeps the last duplicate key, so duplicates would be invisible [V ran].
- **Text.** `strictObject({ko, en})`, both non-empty. `name` is required, `description` optional.
- **References.** `ref("items")` = id `.transform(id => new ContentRef("items", id))`, with `toJSON() → id`. Each reference is declared once in the schema; stage 2 walks the parsed data and collects every `ContentRef` with its path [V probe on zod 4.6.7].
- **Numbers.** Default to `z.int()`. Money is a digit string converted to BigInt (AGENTS 4장).
- **Versions.** `contentVersion = "core@<version>"`; the protocol accepts any non-empty string [V]. `generatorVersion` stays a code constant stamped on generated outputs (PLAN 5.5), not a manifest field.
- **No tsx needed.** Use only erasable TS (no enum, namespace or constructor parameter properties) and plain `node` runs it. Node 22.22 here ran workspace `.ts` through pnpm symlinks and from `.mjs`, zod included [V]. Node 24 in CI [A].
- **M0 pack.** Only `items`, base fields only, `dev_` IDs, `placeholder: true`. No rules or numbers; the design session owns those.

**Server boot — recommended for M0.**
- **Problem:** the NAS currently reports `contentVersion: "dev"`. compose defaults `TERRA_CONTENT_VERSION` to `dev` and `deploy.sh` never sets it [V].
- **Config:** replace `CONTENT_VERSION` with `CONTENT_DIR`.
- **Boot:** run stages 1·2·4a. On any error, log the Korean messages and exit 1. The container never turns healthy and the existing rollback runs [V].
- **Health:** `/health` gains `contentHash` (sha256 of the canonical JSON). The welcome message is unchanged, so no protocol bump.
- **Dockerfile:** copy `content/` to `/app/content` and set `ENV CONTENT_DIR=/app/content/core`.
- **Later:** deploy content on its own by versioned path, and apply renames to live tables as a deploy step.

## 2. Stages
- **1 Schema** (working tree):
  - JSON syntax errors (V8 reports line and column [V]).
  - Strict objects, so typo'd keys fail.
  - Zod messages come out in Korean per parse via `{ error: ko().localeError }` from `zod/locales` [V]. The `en` and ID rules get custom messages.
  - `formatVersion` must equal the code constant, and `packId` must equal the folder name.
  - Errors here stop the later stages.
- **2 Integrity:**
  - Duplicate IDs.
  - Missing references, with a "혹시 …?" suggestion (edit distance ≤ 2).
  - Orphans: unknown files in the pack folder, and unreferenced entries of categories flagged `mustBeReferenced` (none in M0; a test registry covers it).
- **4a id-changes** (no git):
  - Rename chains `{category, from, to, since}` must end at an existing ID, with no cycles.
  - `removed {category, id, since, compensation}`, where compensation is `none` or `replace{with}` in M0.
  - A removed or renamed ID must not reappear in the pack.
- **4b against the previous version** (git):
  - **Base commit:** found the same way as check-docs: argument (`pull_request.base.sha || event.before`) → `@{u}` → `HEAD~1` → none means skip [V].
  - **Why not release tags:** every main push deploys, and tags only feed the changelog [V].
  - **Reading:** read both sides with `git show`. Parse loosely (`entries[].id`, manifest, id-changes) so a schema change in the same commit can't break the comparison.
  - **Fail if:** a base ID vanished with no record; a base record was edited or removed; content changed but `version` didn't go up (formatting or reordering doesn't count); or a new record's `since` is outside (base, head].
  - **Coverage:** because records are append-only and IDs are never reused, successive checks add up, so the deployed (possibly older) pack is covered too [A; the gap is a force-push that removes the base commit].
- **"Live data" in M0:**
  - No table holds content IDs yet [V schema.ts], so every ID counts as used and any deletion needs a record.
  - Provide a `LiveUsage(category, ids) → counts` interface now.
  - The stronger check comes later and runs in `deploy.sh` on the NAS runner, against the running container's pack and the DB. The DB has no host port, so CI can't reach it [V].

Message format: `✗ [단계] 파일 › ID › 경로: 문제. 고칠 방법.`
- `✗ [스키마] content/core/items.json › dev_placeholder › name.en: 영어 이름이 없습니다. ko·en을 함께 적으세요.`
- `✗ [참조] buildings.json › hq › cost[0].item: 없는 items ID "iron_oer". 혹시 "iron_ore"?`
- `✗ [호환] items ID "iron": 기준 커밋(abc1234, core@3)에는 있는데 지금은 없습니다. 이름을 바꿨으면 id-changes.json renamed에, 지웠으면 removed에 적으세요.`
- In Actions, also print `::error file=…::`.

## 3. Stage 7
The NAS stack took over the old test environment's slot and has no real users [V PLAN 1.4]. So it *is* staging, and "운영 반영" has no target yet.
- **Smoke script.** New `ops/smoke.mjs`, standard library only:
  - Checks `/health`: status, db, contentVersion, contentHash.
  - Checks the WebSocket `hello` → `welcome` exchange returns the same version.
  - Runs inside the container: `docker exec -i -e EXPECT_… tic-app node --input-type=module - < ops/smoke.mjs`. The runner needs no curl, jq or node [V Node 22 has global fetch/WebSocket and stdin ESM; A for the Node 24 image].
- **Image job:** run the smoke script after the existing wait loop, with `EXPECT_DB=off`.
- **`deploy.sh <tag> [version] [hash]`:** step 7 becomes "healthy **and** smoke passes", otherwise the existing rollback [V]. `rollback-drill` passes one argument and still fails at the health check, so it needs no change [V].
- **No separate staging stack now.**
  - The new stack's limits are 1 GB app + 1 GB DB [V].
  - The NAS has 3,890 MB, with about 2,000 MB free alongside the old production and two other DBs [V].
  - **User decision (deferred, not blocking):** before real users arrive, either add a production stack plus a `promote` workflow (deploys a verified tag; refuses `placeholder: true`), or retire the old production first.

## 4. CI and local
- **Scripts:**
  - Add `"check:content": "node scripts/check-content.mjs"`.
  - `check` appends `pnpm check:content --no-compat` (stages 1·2·4a).
  - lefthook pre-push adds `pnpm check:content` (stage 4b against `@{u}`).
  - Move `resolveBase()` from `check-docs.mjs` into `scripts/lib.mjs` and share it.
- **ci.yml `check` job:**
  - Add a step "콘텐츠 검증 (content-check)" using the same base-commit expression as check-docs.
  - Then `--print >> "$GITHUB_OUTPUT"` publishes version and hash as job outputs.
  - Change deploy to `needs: [check, image]`.
  - Make it a step, not a separate job, to save free-plan minutes [V ADR 21].
- **Content-only pushes** still build and deploy, because the skip filter covers only docs and skills [V]. That is required, since the pack ships inside the image.
- **Tests (vitest).** It already picks up `packages/*/src/**/*.test.ts` [V]. A `fixture()` helper returns a valid in-memory pack, and each failure gets one case:
  - **Stage 1:** bad JSON, missing en, empty ko, unknown key, bad ID, formatVersion/packId mismatch.
  - **Stage 2:** duplicate, missing reference with suggestion, unknown file, orphan.
  - **Stage 4a:** valid chain, cycle, missing target, reused ID.
  - **Stage 4b:** deletion without a record, edited record, no version bump, version decrease, formatting-only change passes, base without a pack is skipped, base pack invalid under the new schema is still compared.
  - Plus a loader test on `fixtures/valid`, and a server test that loads the real `content/core`.

## 5. Dependencies
- No new external package; zod 4.6.7 is already in the lockfile [V].
- A new workspace entry for `packages/content`, plus links from `apps/server` and the root (devDependency, for the script). Run `pnpm install` and commit `pnpm-lock.yaml`; CI uses `--frozen-lockfile` [V].
- **ADR required:** check-docs will count `zod` in the new `packages/content/package.json` as a new runtime dependency, because the file doesn't exist at the base commit [V logic]. So the same push needs `docs/adr/<date>-content-pack-format.md`. It's needed anyway to record the ID, version, id-changes and image-baked-pack decisions.
- **Boundaries:** `@terra/content` is already in `scripts/check-boundaries.mjs` ALLOWED (it may use shared; server, game and sim may use it) [V], so no edit. `packages/content` must not import protocol.
- **Dockerfile:** the install layer needs `COPY packages/content/package.json packages/content/` [V m0 worklog rule].
- **Docs:**
  - Add a PLAN 7 note, AGENTS 4·7장 (rule and command), a PROTECTED entry (`content/*/id-changes.json` is append-only), and a worklog.
  - Content-only commits need no worklog, since check-docs' code pattern excludes `content/` [V]. Keep it that way so editor exports stay cheap.

## 6. Open questions
**Blocking:** none.

**Defaults to confirm in the ADR:**
- The pack is baked into the image, so code and content deploy and roll back together. That satisfies "롤백 = 이전 팩" through the image tag.
- `ko` is also required; PLAN only mandates `en`.

**Design session, before any live data:**
- The real categories and their fields.
- What compensation means for removed IDs (refunds, amounts).
