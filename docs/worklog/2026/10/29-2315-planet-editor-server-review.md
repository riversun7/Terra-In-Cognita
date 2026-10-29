# 행성 편집기 서버(WP-B) 검토 고침: 지적 14개 확인·처리

- 일시: 2026-10-29 23:15 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-planet-editor-stage1.md`(38, 제안) 9·11절과 "구현하며 정한 것" WP-B, 작업 기록 `29-2210-planet-editor-server.md`(WP-B 첫 구현), `29-2013-planet-editor-core.md`(WP-C `DraftClient`), ADR `2026-10-28-auth-and-accounts.md`(29), `2026-10-28-db-access-and-migrations.md`(22)
- 가지: `work/editor-server`(작업 트리 `.claude/worktrees/editor-server`). 커밋은 아래 "커밋". 푸시·머지하지 않음.

## 한 일
검토 지적 14개를 다시 확인했다. 13개를 고쳤고, 1개(4번)는 이 가지 밖의 일이라 미뤘다.

| # | 지적(무게) | 판정 | 처리 |
|---|---|---|---|
| 1 | 로그인한 계정이면 `multipart/form-data` 본문을 끝없이 보낼 수 있다(major) | 맞음. Verified: 어댑터가 multipart를 본문 상한 없이 넘기고 tRPC가 `Request.formData()`로 모은다(패키지 코드). 고치기 전 진짜 소켓 시험은 본문이 열린 동안 답하지 않았다 | tRPC 범위 `onRequest`: GET·HEAD가 아닌 요청의 본문이 JSON이 아니면 본문을 읽기 전에 415(`connection: close`). 진짜 소켓 시험(끝나지 않는 multipart에도 415가 바로 옴) |
| 2 | GET 정의 조회는 출처를 안 봐서 다른 사이트 링크로 감사 기록을 쌓을 수 있다(minor) | 맞음(코드 확인) | 조회도 `Sec-Fetch-Site` cross-site·same-site·모르는 값, 다른 `Origin`이면 403 `cross_origin`(tRPC 전체, 맥락 만들 때). `none`(주소창)·same-origin·머리글 없음은 받는다. DB 시험: 403이고 감사 기록이 늘지 않는다 |
| 3 | 묶음·속도 제한이 없다(minor) | 맞음 | 묶음 상한 10개(`TRPC_MAX_BATCH_SIZE`, 서버 `maxBatchSize`·기기 `maxItems`). 편집기 사용자별 제한(호출 순간 60·분당 120, 정의 조회 순간 10·분당 10, 429 `rate_limited`). 두 번째 권한 확인은 요청마다 동작별 한 번. 판 목록은 저장 때 잰 크기 열(`bytes`)을 읽는다(항목을 읽지 않는다) |
| 4 | 공개 정의 해시로 시드를 찾을 수 있다(minor) | 맞음(코드로 확인: 키 없는 SHA-256, 시드 2^32가지. 지적의 계산은 다시 돌리지 않았다) | 미룸. 아래 "미검증·TODO" |
| 5 | `/api/trpc` 아래 Fastify 404에 `no-store`가 없다(nit) | 맞음 | 범위에 404 처리기를 두어 그 404에도 `no-store`(앞머리 범위로 등록) |
| 6 | 편집기 권한 확인이 DB 세션만 늘리고 새 쿠키는 버린다(major) | 맞음. Verified: 고치기 전 새 시험이 실패했다(편집기 호출 뒤 만료가 늘었다) | `userHasPermission`에 `disableRefresh`(편집기·관리자 역할 바꾸기). 관리자 목록(`listUsers`)은 끌 수 없어 새 쿠키를 tRPC 응답에 함께 싣는다. DB 시험 2개 |
| 7 | 두 번째 권한 겹을 라우터에서 보는 시험이 없다(minor) | 맞음 | `trpc/planetEditorRouter.test.ts`(DB 없음, 24개): 6개 프로시저 × 맞는·틀린 입력에서 Better Auth 거절이면 FORBIDDEN이고 서비스·제한은 불리지 않는다, read·write 구분, 차례(우리 표 → Better Auth → 제한 → 입력). 고장 넣어 보기: `ensurePermission`을 빼면 18개 실패(되돌림) |
| 8 | 지운 뒤 다시 만든 초안이 판 1부터라 옛 기기 저장이 덮는다(ABA)(minor) | 맞음(코드 확인) | 판 번호를 모든 초안이 함께 쓰는 시퀀스(`planet_draft_revision_seq`)로. 다시 쓰지 않는다. ADR 38 WP-B에 결정으로 적음. DB 시험: 다시 만든 초안의 판 > 옛 판 모두, 옛 판 기대 저장은 늘 409 |
| 9 | WP-D 약속 두 곳이 틀리거나 빠졌다(minor) | 맞음 | 되돌리기 `BAD_REQUEST` 맞춤을 고침(받지 않음 코드는 보통 오류, `unknown_planet`만 `DraftAccessError`). 항목 id = 저장 행성 규칙을 공용 약속 주석과 기기 `checkDraftForPack(항목, 팩, 열린 행성 ID)`에 넣음 |
| 10 | 확인 면 레벨 5가 두 곳에 따로 있다(nit) | 맞음 | `@terra/shared` `PLANET_EDITOR_CHECK_FACE_LEVEL` 하나를 서버 확인 해시와 기기 빠른 줄(`QUICK_LEVEL`)이 쓴다 |
| 11 | 팩에서 빠진 행성의 초안은 못 지운다(nit) | 맞음 | 지우기는 모양만 맞으면 받는다(조회·판 목록·되돌리기는 그대로 팩 행성만). DB 시험 |
| 12 | 응답 크기 숫자가 틀렸다(nit) | 맞음. Verified: 다시 잼 | 4,359바이트(UTF-8, tRPC 응답 전체)로 고침. 자료만은 4,339바이트·4,044자 |
| 13 | AGENTS 7장 `PLANET_CACHE_DIR` 줄이 낡았다(nit) | 맞음 | 지금 고침(행성 둘·시간·확인 해시). 생성기 다양성 가지는 이 줄을 고치지 않아 겹치지 않는다. 생성기 판 문구(판 2)는 그 가지를 합칠 때 고친다 |
| 14 | 면 레벨·바이옴 표를 바꾼 항목도 저장된다(nit) | 맞음(동작 확인) | 막지 않기로 하고 ADR 38 WP-B에 결정으로 적음(이유: 팩이 바뀐 뒤 옛 초안의 자동 저장·옛 판 되돌리기가 막히지 않게). 가져오기 화면이 알리고, 반영하는 에이전트가 팩과 견준다. 시험으로 고정 |

## WP-D가 쓸 약속 (지금 약속, 첫 기록의 표를 바꾼다)
모두 dev·admin만(권한 `planetEditor:read`·`write`). 타입은 `apps/server/src/planetEditor/types.ts`, 기기 쪽 추론은 `apps/server/src/trpc/planetEditor.test.ts`가 고정한다.

| 프로시저 | 종류 | 입력 | 출력 |
|---|---|---|---|
| `planetEditor.definitions` | query | 없음 | `PlanetEditorDefinitions` = `{ contentVersion; placeholder; generatorVersion; planets: { id; entry; definitionHash; check: { faceLevel; hash } }[]; biomes }` |
| `planetEditor.drafts.get` | query | `{ planetId }` | `PlanetDraftView \| null` = `{ planetId; revision; entry; base; createdAt; updatedAt }` |
| `planetEditor.drafts.revisions` | query | `{ planetId }` | `{ revision; savedAt; bytes }[]`(새 판부터, 최대 50) |
| `planetEditor.drafts.save` | mutation | `{ planetId; entry; base: PlanetDraftBase \| null; expectedRevision }` | `{ revision; updatedAt }` |
| `planetEditor.drafts.restore` | mutation | `{ planetId; revision }` | `PlanetDraftView`(새 판) |
| `planetEditor.drafts.remove` | mutation | `{ planetId }` | `{ removed: boolean }` |

- 판 번호: 1 이상이고 커지기만 한다. 띄엄띄엄이다(모든 초안이 함께 쓰는 번호). `+1`을 기대하지 않는다(WP-C `draftSync`도 기대하지 않는다). 판 목록을 "판 N"으로 그대로 보이면 큰 수와 빠진 번호가 보인다. 시각이나 차례(몇 번째 전)로 보이는 것을 권한다(WP-D가 정한다).
- `PlanetDraftBase` = `{ contentVersion: "<팩 ID>@<판>"; definitionHash: 16진수 64자; generatorVersion: u32 }` = 기기 `DraftBase`.
- 오류(`TRPCClientError.data.code`, 이유는 `data.reason`) → WP-C `DraftClient`(`editorApi.ts`) 맞춤:

| 오류 | 언제 | `DraftClient` |
|---|---|---|
| `UNAUTHORIZED` | 로그인 안 함·정지 | `DraftAccessError("unauthorized")` |
| `FORBIDDEN` | 권한 없음, 다른 사이트에서 온 요청(`reason: "cross_origin"`) | `DraftAccessError("forbidden")` |
| `TOO_MANY_REQUESTS` | 속도 제한(`"rate_limited"`) | 보통 오류로 던진다(다시 시도 1초→30초) |
| `CONFLICT` | 저장의 기대 판 ≠ 지금 판(초안이 지워진 경우 포함, `"revision_conflict"`) | `save` → `{ kind: "conflict" }` |
| `BAD_REQUEST` + 받지 않음 코드 | 저장·되돌리기 검사(`PLANET_DRAFT_REJECT_CODES`) | `save` → `{ kind: "rejected", code }`. `restore` → 보통 오류로 던진다(`exclusive()`가 앞 상태로 돌아가 자동 저장이 이어진다. 화면은 코드를 보인다) |
| `BAD_REQUEST` + `"unknown_planet"` | 조회·판 목록·되돌리기의 팩에 없는 행성 | `DraftAccessError("invalid_request")` |
| `BAD_REQUEST`(이유 없음) | 입력 형식(zod, 예: 기준 모양) | `save` → `{ kind: "rejected", code: <화면이 정할 일반 코드> }`, 나머지 → `DraftAccessError("invalid_request")` |
| `NOT_FOUND` + `"draft_not_found"`·`"revision_not_found"` | 되돌릴 초안·판 없음 | 보통 오류로 던진다(판 목록을 다시 읽게) |
| `NOT_FOUND`(message `PLANET_EDITOR_UNAVAILABLE`) | 편집기 자료 없이 띄운 서버(시험 등) | `DraftAccessError("invalid_request")` |
| 그 밖(500, 닿지 못함) | | 보통 오류로 던진다(다시 시도) |

- 지우기는 팩에 없는 행성 ID도 받는다(초안이 없으면 `{ removed: false }`, 감사 기록 없음).
- 묶음: 기기 `api.ts`는 10개씩 나눠 보낸다(`maxItems`). 정의 조회는 열 때 한 번 부른다(사용자별 분당 10번, 부를 때마다 감사 기록).
- 가져오기: `checkDraftForPack(항목, 팩, 열린 행성 ID)`. 다른 행성의 항목은 `invalid_entry`다(서버도 같다). 따로 알리려면 화면이 먼저 `항목.id !== 열린 행성 ID`를 본다. 면 레벨·바이옴 표가 팩 항목과 다르면 알린다(서버는 받는다, ADR 38 WP-B).
- 확인 해시: `check.faceLevel` = min(`PLANET_EDITOR_CHECK_FACE_LEVEL`, 행성 면 레벨). 기기 빠른 줄이 같은 상수를 쓴다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/trpc/plugin.ts`(+시험) | 쓰기 본문 JSON만(그 밖 415, 본문 읽기 전), 묶음 상한, 앞머리 범위 + 404 처리기(`no-store`) |
| `apps/server/src/auth/requestGuard.ts`, `apps/server/src/trpc/createContext.ts` | 조회(GET)의 출처 규칙 `isAllowedReadRequest`. 맥락에 응답(`res`)을 넘김(관리자 목록 쿠키) |
| `packages/protocol/src/api.ts`, `src/index.ts` | `TRPC_MAX_BATCH_SIZE`(서버·기기 같은 값) |
| `apps/game/src/net/api.ts`(+시험) | `httpBatchLink` `maxItems`(상한에서 나눠 보냄) |
| `apps/server/src/planetEditor/services.ts`, `apps/server/src/trpc/context.ts`, `apps/server/src/trpc/planetEditor.ts` | 두 번째 권한 확인 `disableRefresh`·요청마다 한 번, 속도 제한(`admit`, `createPlanetEditorShared`), 지우기는 팩 밖 ID도 |
| `apps/server/src/trpc/planetEditorRouter.test.ts` | 라우터 차례 시험(두 겹 권한·제한·입력·서비스) |
| `apps/server/src/auth/adminServices.ts` | 역할 바꾸기 `disableRefresh`, 목록은 새 쿠키를 응답에 |
| `apps/server/src/app.ts` | 편집기 공유 자료(속도 제한기)를 켤 때 한 번 만듦, 시험용 `limits` |
| `apps/server/src/db/schema.ts`, `apps/server/drizzle/20261029135300_planet_drafts/` | 판 번호 시퀀스, 판 기록 `bytes` 열. 합치지 않은 이 가지의 마이그레이션(`20261029123713_planet_drafts`)을 지우고 `db:generate`로 다시 만들었다(표 더하기만, 하나) |
| `apps/server/src/planetEditor/store.ts`, `validate.ts`(+시험) | 시퀀스 판 번호, 최근 50개 남기기(띄엄띄엄 번호), 크기를 검사 때 재서 저장 |
| `apps/server/src/planetEditor/testSupport.ts`, `planetEditor.db.test.ts`, `planetEditorHistory.db.test.ts`, `planetEditorGuards.db.test.ts`(새) | 판 번호를 응답에서 읽게 고침, 많이 부르는 시험은 제한을 넉넉히, 세션·출처·제한·묶음 DB 시험 |
| `apps/server/src/planetEditor/definitions.ts`(+시험), `packages/shared/src/planetDraftApi.ts`·`index.ts`, `apps/game/src/editor/planet/previewJobs.ts` | 확인 면 레벨 상수 하나, 공용 약속에 ID 규칙 |
| `apps/game/src/editor/planet/draftExport.ts`(+시험) | 가져오기 앞 검사에 열린 행성 ID |
| `apps/server/src/trpc/system.test.ts` | 묶음 상한(기기처럼 나눠 보내기, 안 나누면 거절) |
| `docs/adr/2026-10-29-planet-editor-stage1.md` | 9절 판 번호 가리킴, WP-B "구현하며 정한 것" 고침·추가 |
| `docs/worklog/2026/10/29-2210-planet-editor-server.md` | 틀린 숫자·WP-D 맞춤 고침, 이 기록 가리킴 |
| `AGENTS.md` | 6장 tRPC·Better Auth 확인 사항, 7장 `PLANET_CACHE_DIR` 줄 |
| `docs/worklog/2026/10/29-2315-planet-editor-server-review.md`, `docs/WORKLOG.md` | 이 기록, 목차 |

## 함께 바꿔야 하는 파일
- WP-D `editorApi.ts`: 위 "WP-D가 쓸 약속". 가져오기에서 `checkDraftForPack`에 열린 행성 ID를 넘긴다.
- 생성기 다양성 가지(`work/generator-variety`)를 합칠 때: `AGENTS.md` 7장 `PLANET_CACHE_DIR` 줄의 "출력 판 2(`GENERATOR_VERSION` 2)"를 그 판으로 고친다(이 가지는 행성 둘·시간만 고쳤다). 확인 해시·`fieldsHash` 값은 바뀌지만 새 시험은 값을 적지 않아 고칠 것이 없다.
- 앱 뼈대 W2의 마이그레이션: 늦게 합치는 쪽이 main 위에서 `db:generate`로 다시 만든다(ADR 22). 이 가지의 마이그레이션 이름이 `20261029123713_planet_drafts`에서 `20261029135300_planet_drafts`로 바뀌었다(시퀀스 하나 + 표 둘).
- 지적 4 후속(새 ADR): 정의 해시를 서버 비밀 키로 만든다. 목록 정보·타일 주소·타일 머리·디스크 캐시 열쇠가 함께 바뀐다(ADR 36 전송).

## 건드리지 말 것
- 판 번호를 초안마다 1부터 세는 쪽으로 되돌리지 않는다(지운 뒤 다시 만든 초안에서 ABA).
- tRPC 쓰기 본문 JSON만(415) 규칙과 묶음 상한을 빼지 않는다(로그인한 아무 계정이나 서버 메모리를 채울 수 있다).
- 두 번째 권한 확인의 `disableRefresh`(빼면 자동 저장이 쿠키 연장을 가로챈다).
- 올라간 뒤의 마이그레이션 `20261029135300_planet_drafts`(ADR 22).

## 미검증·TODO·알려진 문제
- 지적 4(미룸): 공개 정의 해시(목록 정보 `definitionHash` 64자, 타일 주소 버전의 앞 16자, 타일 머리 32바이트, `packages/protocol/src/planetTile.ts`)는 키 없는 SHA-256이다. 시드 말고 나머지 정의를 아는 사람은 시드를 찾을 수 있다. 지적이 제안한 "목록 정보·타일 주소만 키로"는 모자란다: 타일 머리에도 같은 해시가 있다. 그래서 정의 해시 자체를 서버 비밀 키(예: `BETTER_AUTH_SECRET`에서 이름 붙여 끌어낸 키)의 HMAC으로 바꾸고, 디스크 캐시·굽기 워커·타일이 그 값을 쓰게 해야 한다. 키를 바꾸면 다시 굽는다. ADR 36 전송의 결정이고 생성기 다양성 가지가 고치는 굽기·캐시 시험과 겹쳐서 이 가지에서 하지 않았다. 지금 두 행성은 임시 팩(`placeholder`)이고, 시드로 만드는 것은 지형·기후 값뿐이다. 강수(타일에 넣지 않음) 말고는 모두 타일로 이미 나간다. 자원·조우처럼 시드로 숨기는 게임 자료는 아직 없다(Verified: `packages/planet/src/tiles/fields.ts` `PlanetFields`, `packages/protocol/src/planetTile.ts`). 플레이어에게 처음 공개하는 행성 전, 또는 시드로 숨기는 자료가 생기기 전에 새 ADR로 정한다. 저장소는 비공개다(Verified: GitHub API `private: true`), 그래서 팩 파일의 시드는 플레이어에게 보이지 않는다.
- 속도 제한 숫자는 추정이다(Assumed: 기기마다 2초에 한 번 자동 저장, 기기 둘). 휴대폰·데스크톱에서 실제로 써 보지 않았다(미실행).
- 관리자 목록이 새 쿠키를 싣는 것은 Fastify `inject` 시험으로만 봤다. 브라우저(같은 출처 fetch)가 그 쿠키를 받는 것은 돌려 보지 않았다(Assumed).
- 조회 출처 규칙: Safari·Firefox의 `Sec-Fetch-Site`는 돌려 보지 않았다(Unknown). 지원 기준(iOS 16.4 이상)은 보낸다고 본다(Assumed). 보내지 않는 브라우저는 머리글 없음으로 받는다.
- 판 번호 시퀀스 상한(integer 2,147,483,647): 다 쓰면 저장이 실패한다. 한 기기가 쉬지 않고 2초마다 저장해도 약 136년이다.
- 옛 마이그레이션 이름(`20261029123713_planet_drafts`)으로 표를 만든 로컬 DB(첫 구현의 Playwright 실행 등)에 새 마이그레이션을 적용하면 표가 이미 있어 실패한다. 그런 DB는 지우고 새로 만든다. 공유 DB에는 올라가지 않았다(Assumed: 이 가지는 푸시하지 않았다).
- 첫 기록의 미검증 항목(WP-D와 실제 연결, NAS 시간)은 그대로다.

## 사용자 결정 대기
- 없음(지적 4의 키 출처는 새 ADR에서 정한다).

## 확인 (Verified: 이 작업 트리, Node 24.22.1, pnpm 11.28.9, PostgreSQL 16)
- 고치기 전 빨간 시험: 진짜 소켓 multipart(415 막기를 끄면 5초 안에 답이 없다), 세션 연장(`disableRefresh`를 빼면 실패), 라우터 차례(`ensurePermission`을 빼면 18개 실패). 셋 다 고친 코드로 되돌린 뒤 통과.
- 서버 시험 전체(DB 포함): 파일 36개·시험 337개 통과.
- 정의 조회 응답 크기: 4,359바이트(UTF-8, `rawPayload`), 4,064자. 자료만 4,339바이트·4,044자.
- `/api/trpc` 아래 404: 정적 파일을 켠 앱(`staticDir`)에서도 범위 404 처리기가 답한다(`{"error":"not_found"}`, `no-store`). 화면 주소(SPA)·다른 `/api/*` 404는 그대로다(시험 스크립트로 확인, 저장소에 두지 않음).

## 최종 확인 (Verified: 이 작업 트리, Node 24.22.1, pnpm 11.28.9, PostgreSQL 16)
- `TEST_DATABASE_URL=… pnpm check`: 통과(2분 15초, 1분 부하 6~9). 포맷·린트·타입(게임 앱 `tsc -b` 포함)·경계·크기·다국어(325키)·대비(136쌍)·콘텐츠(`core@3`)·시험 파일 146개·시험 1,390개(DB 시험 포함, 건너뜀 없음). 부하로 시간이 넘친 시험은 없었다.
- 커밋마다(저장소 밖에 내보내 `pnpm install --offline` 뒤): `3ed35af` 서버 타입 검사 + tRPC·편집기·게임 `net` 시험 파일 11개·시험 108개(DB 포함), `b559c34` 서버 타입 검사 + tRPC·편집기·인증 시험 파일 15개·시험 187개(DB 포함) 통과. `daf378c`는 위 전체 확인과 같은 코드다.
- `pnpm check:content 507e645`: 통과(단계 1·2·4a·4b, main 기준 호환). `pnpm docs:index --check`: 최신. `pnpm check:docs 507e645`: 이 기록 커밋 뒤 통과.

## 커밋
- `3ed35af` fix(server): tRPC 요청 지키기(쓰기 본문 JSON만, 묶음 10개, 다른 사이트 조회 403, 404 no-store) — 지적 1·2·3(묶음)·5
- `b559c34` fix(server): 편집기 검토 고침(세션을 늘리지 않는 권한 확인, 속도 제한, 판 번호 시퀀스, 판 크기 열, 팩 밖 초안 지우기, 마이그레이션 다시 만듦) — 지적 3·6·7·8·11·14(시험)
- `daf378c` refactor(shared,game,server): 확인 면 레벨 상수 하나, 가져오기 앞 검사에 열린 행성 ID — 지적 9(코드)·10
- 이 기록 커밋(작업 기록 둘, ADR 38 WP-B, AGENTS 6·7장, 목차) — 지적 4(미룸)·9(약속)·12·13·14(결정)
