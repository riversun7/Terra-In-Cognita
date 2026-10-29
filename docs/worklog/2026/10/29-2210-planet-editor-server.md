# 행성 편집기 서버(WP-B): 초안 표·planetEditor tRPC·확인 해시·fieldsHash·편집 전용 행성·tRPC 같은 출처 확인

- 일시: 2026-10-29 22:10 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-planet-editor-stage1.md`(38, 제안) 4·6·9·10·11·14·15절(WP-B), `2026-10-28-auth-and-accounts.md`(29), `2026-10-28-db-access-and-migrations.md`(22), `2026-10-28-content-pack-format.md`(24), 작업 기록 `29-2013-planet-editor-core.md`(WP-C: 기기 쪽 `DraftClient`·공용 초안 API)
- 가지: `work/editor-server`(작업 트리 `.claude/worktrees/editor-server`, main `507e645`에서 시작). 커밋은 아래 "커밋". 푸시·머지하지 않음.

## 한 일
- 편집 전용 행성 `s2_editor_planet`을 팩에 더했다(`content/core/planets.json`). 값은 `s2_test_planet`과 같고 시드·이름·설명만 다르다(시험이 견준다). 팩 판 2 → 3.
- 행성 목록 정보(GET `/api/planets/<ID>`)에 생성 결과 해시 `fieldsHash`(선택 칸)를 더했다. 굽기가 끝난 뒤(status `ready`)에만 있다. 갓 구운 길과 디스크 캐시 길이 같은 값을 낸다. 프로토콜 판은 그대로다(앞선 예 `maxElevationM`). 캐시 목록의 `fieldsHash`도 목록 정보 모양(소문자 16진수 8~64자)이어야 쓴다. 틀리면 다시 굽는다.
- DB 표 2개와 마이그레이션 하나(`apps/server/drizzle/20261029123713_planet_drafts/`, 표 더하기만): `planet_drafts`(사람마다·행성마다 하나, (owner_id, planet_id) 고유, 계정을 지우면 함께), `planet_draft_revisions`(초안을 지우면 함께, (draft_id, revision) 고유). 열은 ADR 38 9절 그대로다.
- tRPC `planetEditor` 6개(아래 "WP-D가 쓸 약속"). 두 겹 권한(우리 권한 표 → Better Auth `userHasPermission`), 저장 검사(공용 차례·코드), 기대 판 충돌, 판 기록 50개, 되돌리기·지우기, 감사 기록 4종.
- 서버가 켤 때(요청을 받기 전) 정의 조회 자료를 한 번 만든다: 팩 버전·임시 여부·서버 생성기 판, 행성마다 원본 항목(팩 파일 JSON)·정의 해시·F5 확인 해시, 바이옴 항목 전부(`src/planetEditor/definitions.ts`, `main.ts`). 시작 로그 한 줄 `planet editor definitions ready`에 행성마다 확인 레벨·해시·걸린 시간을 남긴다(시드·항목은 남기지 않는다).
- tRPC 전체: 쓰기(GET·HEAD가 아닌 요청)는 같은 출처만 받는다(계정 경로와 같은 규칙 `isSameOriginRequest`). 모든 tRPC 응답에 `cache-control: no-store`. 오류 `data.reason`에 기계가 읽는 이유 코드를 싣는 길(`reasonedError`, errorFormatter).
- 시험: 단위 시험 파일 4개 새로(`definitions.test.ts` 8개, `validate.test.ts` 26개, `trpc/plugin.test.ts` 13개, `trpc/planetEditor.test.ts` 타입 약속 3개), DB 통합 시험 2개(`planetEditor.db.test.ts` 9개, `planetEditorHistory.db.test.ts` 7개), 기존 시험에 더한 것(`planet/service.test.ts` 1개 + fieldsHash 확인, `protocol` `planetManifest.test.ts` 1개). 해시·시드 값은 적지 않고 생성기·팩에서 다시 만들어 견준다(생성기 판이 올라도 그대로 돈다).
- 빌드한 앱 + 서버를 Playwright로 한 번 돌렸다(아래 "확인").

## WP-D가 쓸 약속 (tRPC 프로시저 이름·타입)
> 검토 고침(`29-2315-planet-editor-server-review.md`)에서 바뀐 것이 있다(판 번호, 속도 제한, 되돌리기 오류 맞춤, 지우기, 가져오기 ID 검사). 그 기록의 "WP-D가 쓸 약속"이 지금 약속이다.

모두 dev·admin만(권한 `planetEditor:read`·`write`). 타입은 `apps/server/src/planetEditor/types.ts`, 기기 쪽 추론은 `trpc/planetEditor.test.ts`가 고정한다.

| 프로시저 | 종류 | 입력 | 출력 |
|---|---|---|---|
| `planetEditor.definitions` | query | 없음 | `PlanetEditorDefinitions` = `{ contentVersion: string; placeholder: boolean; generatorVersion: number; planets: { id; entry: Record<string, unknown>; definitionHash: string; check: { faceLevel: number; hash: string } }[]; biomes: Record<string, unknown>[] }` |
| `planetEditor.drafts.get` | query | `{ planetId }` | `PlanetDraftView \| null` = `{ planetId; revision; entry; base: PlanetDraftBase \| null; createdAt; updatedAt }`(시각은 ISO 문자열) |
| `planetEditor.drafts.revisions` | query | `{ planetId }` | `{ revision; savedAt; bytes }[]`(새 판부터, 최대 50) |
| `planetEditor.drafts.save` | mutation | `{ planetId; entry: unknown; base: PlanetDraftBase \| null; expectedRevision: number }` | `{ revision; updatedAt }` |
| `planetEditor.drafts.restore` | mutation | `{ planetId; revision }` | `PlanetDraftView`(새 판) |
| `planetEditor.drafts.remove` | mutation | `{ planetId }` | `{ removed: boolean }` |

- `PlanetDraftBase` = `{ contentVersion: "<팩 ID>@<판>"; definitionHash: 16진수 64자; generatorVersion: u32 }` = 기기 `DraftBase`. 정의 조회의 `contentVersion`·행성 `definitionHash`·`generatorVersion`으로 만든다.
- 오류(`TRPCClientError.data.code`, 이유는 `data.reason`): 로그인 안 함·정지 → `UNAUTHORIZED`. 권한 없음 → `FORBIDDEN`. 다른 사이트에서 보낸 쓰기 → `FORBIDDEN`(`reason: "cross_origin"`). 저장의 기대 판 불일치(초안이 지워진 경우 포함) → `CONFLICT`(`"revision_conflict"`). 저장 검사 → `BAD_REQUEST`(`reason` = `PLANET_DRAFT_REJECT_CODES` 하나, message `PLANET_DRAFT_REJECTED`). 조회·되돌리기·지우기의 팩에 없는 행성 → `BAD_REQUEST`(`"unknown_planet"`). 되돌리기의 초안·판 없음 → `NOT_FOUND`(`"draft_not_found"`·`"revision_not_found"`). 되돌릴 항목이 지금 팩으로 틀림 → `BAD_REQUEST`(받지 않음 코드). 입력 형식(zod) → 이유 없는 `BAD_REQUEST`. 편집기 자료 없이 띄운 서버 → `NOT_FOUND`(message `PLANET_EDITOR_UNAVAILABLE`).
- WP-C `DraftClient` 맞춤(`editorApi.ts`): `get` → 뷰를 `{ revision, document: { entry, base }, updatedAt }`로. `save` → `CONFLICT`면 `{ kind: "conflict" }`, `BAD_REQUEST`면 `{ kind: "rejected", code: data.reason ?? <화면이 정할 일반 코드> }`. `restore`의 `NOT_FOUND`는 던진다(판 목록을 다시 읽게). `restore`의 `BAD_REQUEST`는 검토 고침에서 바꿨다: 받지 않음 코드면 보통 오류로 던지고(앞 상태로 돌아간다), `DraftAccessError("invalid_request")`는 `unknown_planet`일 때만이다. `UNAUTHORIZED`·`FORBIDDEN` → `DraftAccessError`.
- 확인 해시는 `check.faceLevel`(= min(5, 행성 면 레벨))로 만든 것이다. 기기는 같은 레벨의 공개본 결과 해시와 견준다. 굽기 결과는 목록 정보의 `fieldsHash`(행성 면 레벨, 굽기가 끝난 뒤)와 견준다.

## 구현하며 정한 것 (ADR 38에 없던 것)
1. 저장 입력에 행성 ID(`planetId`)를 따로 받는다. 항목의 `id`가 다르면 `invalid_entry`다. 열린 행성과 다른 항목이 다른 행성 초안에 말없이 저장되는 일을 서버가 막는다(WP-C 가져오기는 다른 ID를 막지 않는다).
2. `invalid_entry`에 DB(jsonb)가 담지 못하는 글자를 더했다: U+0000, 짝 없는 대리 문자(Verified: PostgreSQL 16이 둘 다 거절한다). 그대로 두면 500이다. 직렬화하지 못하는 항목(본문 1MiB 안의 아주 깊은 배열, `JSON.stringify` 호출 스택 넘침)은 `entry_too_large`다.
3. 이유 코드 칸 이름은 `data.reason`이다(tRPC `data.code`는 이미 오류 종류). 다른 오류에도 같은 칸을 쓴다(`cross_origin`·`revision_conflict`·`draft_not_found`·`revision_not_found`·`unknown_planet`). message는 고정 대문자 낱말이다.
4. 조회·판 목록·되돌리기·지우기도 팩에 있는 행성만 받는다(`unknown_planet`). 지우기는 초안이 없으면 `{ removed: false }`다(감사 기록 없음, 같은 요청을 두 번 보내도 된다).
5. 되돌리기도 저장과 같은 검사를 지금 팩으로 한다. 지금 초안은 늘 검사를 통과한 것이 된다. 옛 판이 지금 팩에 없는 바이옴을 쓰면 되돌리지 않는다.
6. 두 겹 권한은 6개 프로시저 모두에 건다(ADR은 정의 조회에 적었다). 두 겹 모두 입력 검사보다 먼저 돈다: 로그인 안 함·권한 없음이 형식 오류보다 먼저 나온다.
7. 같은 출처 확인은 tRPC 맥락을 만들 때 한다. 모든 프로시저(앞으로 생길 것 포함)를 덮고, 묶음 요청은 프로시저마다 같은 오류를 받는다. GET·HEAD(조회)는 보지 않는다. 앱 출처를 모르는 서버(인증 꺼짐)는 보지 않는다. 세션이 없어 모든 쓰기가 `UNAUTHORIZED`이기 때문이다.
8. `no-store`는 tRPC 범위의 Fastify 훅으로 붙인다. 오류·없는 프로시저(404)·조회에 POST(405)·형식 오류에도 붙는다. (검토 고침: 처음에는 tRPC 경로 밖의 404(`/api/trpc`, `/api/trpc/a/b`)에는 붙지 않았다. 지금은 범위 404 처리기가 있어 붙는다.)
9. 감사 기록 행위자는 `user`다(자기 초안·팩 정의를 다루는 계정). 그때의 역할은 `meta.roles`에 둔다. 항목·시드는 넣지 않는다: 정의 조회 `after {contentVersion, generatorVersion, planetIds}`, 만들기 `after {planetId, revision: 1, base}`, 되돌리기 `before {planetId, revision}`·`after {planetId, revision, restoredFrom}`, 지우기 `before {planetId, revision}`.
10. 확인 해시는 기기와 같은 길로 만든다: 원본 항목 + 원본 바이옴 항목 → `planetInputFromDefinition(…, 확인 레벨)` → 생성기. 원본 항목은 팩 파일 JSON이다(`loadServerContent`가 `raw`로 준다). 확인 레벨 상수 `PLANET_EDITOR_CHECK_FACE_LEVEL = 5`는 기기 빠른 줄(`previewJobs.ts` `QUICK_LEVEL`)과 같아야 한다. 응답에 레벨이 함께 가므로 달라져도 잘못 견주지는 않는다.
11. jsonb는 키 순서를 지키지 않는다. 읽은 항목의 키 순서는 보낸 것과 다를 수 있다(같은지는 키를 정렬해 본다: 기기 `sameDocument`). 판 목록의 크기는 저장한 항목을 `planetDraftEntryBytes`로 다시 잰다. 키 순서가 바뀌어도 직렬화 길이는 같다.
12. 기준(`base`)은 모양을 엄격히 본다: `contentVersion` `^[a-z][a-z0-9_]{1,47}@[1-9][0-9]{0,8}$`, `definitionHash` 16진수 64자, `generatorVersion` u32, 또는 null. 틀리면 이유 없는 `BAD_REQUEST`.
13. 판 기록의 `id`는 bigint 자동 번호다. 고유 색인 이름 `planet_drafts_owner_planet_idx`·`planet_draft_revisions_draft_revision_idx`, 검사 조건(행성 ID 형식, 판 ≥ 1). 행성 ID가 팩에 있는지는 DB 조건에 넣지 않았다(팩이 바뀌어도 옛 앱이 읽게).
14. 판 기록 지우기 = 같은 트랜잭션에서 `revision <= 새 판 − 50` 지우기. 판 번호는 저장·되돌리기마다 1씩 늘어 빈틈이 없으므로 늘 최근 50개가 남는다.

## 잰 값 (Verified: 개발 컨테이너 4코어 공유, Node 24.22.1, 생성기 판 2)
- 시작 때 확인 해시(F5) — 새 프로세스 5번(스크립트, 1분 부하 4~6): `s2_test_planet` 185~288ms(처음 생성이라 JIT 데우기 포함), `s2_editor_planet` 90~123ms, 합계(복사 포함) 276~402ms. 이만큼 시작이 늘어난다(요청을 받기 전에 같은 스레드에서 한다).
- 빌드한 서버(`node apps/server/dist/main.js`) 시작 로그: 빈 캐시 첫 시작 412 + 204ms = 618ms(부하 약 5), 다시 시작 598 + 327ms = 940ms(부하 약 6). `Server listening`은 프로세스 시작 뒤 2.0초·2.7초.
- 정의 조회 응답 본문 4,359바이트(UTF-8, tRPC 응답 전체. 행성 2개 + 바이옴 14개). 처음 적은 4,044는 자료만의 글자 수였다(검토 고침에서 다시 잼: 자료만 4,339바이트·4,044자, 응답 4,064자).
- 같은 서버의 빈 캐시 굽기(F9, 워커, 차례로): `s2_test_planet` 19.5초(생성 18.7초, 워커 최대 216.5MB, RSS 최대 434MB), `s2_editor_planet` 20.9초(생성 20.2초, 187.8MB, 445MB). 시작 뒤 42.7초에 둘 다 준비. 캐시로 다시 켜면 시작 뒤 2.7초에 준비(캐시 읽기 192.5ms·27ms). NAS는 재지 않았다(Unknown, ADR 38 10절 추정 약 37초).

## 확인 (Verified: 이 작업 트리)
| 항목 | 결과 |
|---|---|
| DB 시험(`TEST_DATABASE_URL`, PostgreSQL 16) | 새 DB 시험 16개 통과(전체 결과는 아래 "최종 확인"). 권한(익명 401, player·gm 403 — 6개 프로시저 × 맞는 입력·틀린 입력), dev·admin 통과, Better Auth 두 번째 확인(진짜 Fastify 요청으로 dev·dev 단독·admin 참, player·gm 거짓, 세션 없음 401, 가짜 거절이면 FORBIDDEN), 정의 조회 = 시작 때 자료·감사 기록(시드 없음), 만들기·저장·판 기록·크기, 충돌(옛 판·0·99, 동시 저장 3개 중 1개만, 동시 만들기 2개 중 1개만), 다른 사람 초안(안 보임·되돌리기 404·지우기 false·내 초안 따로), 받지 않음 코드 9가지와 차례, 입력 형식, 팩에 없는 행성, 판 기록 55번 → 50개, 되돌리기(새 판·감사 기록·지운 판 404·지금 팩으로 다시 검사), 지우기(판 기록 함께·감사 기록·두 번째 false·다시 만들면 판 1), 감사 기록을 못 쓰게 한 트리거(정의 조회·만들기·되돌리기·지우기 500, 바뀐 것 없음, 자동 저장은 됨), 다른 사이트 쓰기 403(세션 있음, 관리자·설정 쓰기 포함), 같은 출처는 됨 |
| 고장 넣어 보기(되돌림) | 읽기의 owner 거르기를 빼면·판 기록 지우기를 빼면·되돌리기 검사를 빼면·출처 확인을 빼면 시험 14개가 실패했다(다시 되돌렸다) |
| 빌드한 앱 + 서버 + Playwright 1.63(헤드리스 Chromium 153, 스크립트는 저장소 밖) | 화면으로 로그인 → 설정에서 테마 바꾸기(`settings.set` 200) → 관리자 화면에서 역할 바꾸고 저장(`admin.users.setRoles` 200, "저장했습니다.") → 같은 페이지에서 fetch로 편집기(정의 조회 200, 저장 200, 다시 기대 판 0 → 409 `revision_conflict`, 호수 없는 바이옴 표 → 400 `generator_rejected`). 브라우저가 붙인 머리글: POST `Origin: http://127.0.0.1:4321`·`Sec-Fetch-Site: same-origin`, GET은 `Sec-Fetch-Site: same-origin`. tRPC 응답은 모두 `no-store`. 다른 출처 페이지(`http://localhost:4321`)에서: `text/plain` no-cors fetch → 415(tRPC가 맥락 전에 거절), multipart HTML 폼 → 403 `cross_origin`(쿠키 없음: SameSite=Lax). DB의 테마는 화면에서 고른 값 그대로 |
| 빌드한 서버 목록 정보 | 갓 구운 뒤와 캐시로 다시 켠 뒤 두 행성 모두 `fieldsHash`가 있고 같다. 캐시 목록 파일의 값과 같다. 정의 조회의 `definitionHash` = 목록 정보의 `definitionHash` |
| `pnpm check:content 507e645` | 통과(`core@3`, 단계 1·2·4a·4b, main 기준 호환) |
| `pnpm check` | 아래 "최종 확인" |

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `content/core/planets.json`, `content/core/manifest.json` | 편집 전용 행성(ADR 38 10절), 팩 판 3 |
| `packages/protocol/src/planetManifest.ts`(+시험), `src/index.ts` | 목록 정보 `fieldsHash`(선택), 해시 모양 `PLANET_FIELDS_HASH_PATTERN` |
| `apps/server/src/planet/service.ts`(+시험), `cache.ts` | 준비된 목록 정보에 `fieldsHash`(굽기·캐시 두 길), 캐시 목록 모양 검사 |
| `apps/server/src/db/schema.ts`, `apps/server/drizzle/20261029123713_planet_drafts/` | 초안 표 2개(`db:generate`로 만든 마이그레이션, 더하기만) |
| `apps/server/src/planetEditor/types.ts` | API 모양(Node 타입 없음, AppRouter에 들어간다) |
| `apps/server/src/planetEditor/definitions.ts`(+시험) | 시작 때 정의 조회 자료·확인 해시·로그 줄 |
| `apps/server/src/planetEditor/validate.ts`(+시험) | 저장 검사(공용 차례·코드, jsonb 글자, 행성 ID 일치) |
| `apps/server/src/planetEditor/store.ts` | 초안 DB 작업(조건부 UPDATE 충돌, 판 기록 50개, 감사 기록 같은 트랜잭션) |
| `apps/server/src/planetEditor/services.ts` | 요청 처리(두 번째 권한 확인, 이유 코드 오류, 감사 기록 행위자) |
| `apps/server/src/planetEditor/testSupport.ts`, `planetEditor.db.test.ts`, `planetEditorHistory.db.test.ts` | 시험 도우미·DB 시험(`tsconfig.api.json`에서 뺀다) |
| `apps/server/src/trpc/planetEditor.ts`(+타입 시험), `router.ts`, `context.ts` | `planetEditor` 라우터, 맥락의 편집기 서비스 |
| `apps/server/src/trpc/init.ts` | 이유 코드(`ErrorReason`·`reasonedError`, errorFormatter `data.reason`) |
| `apps/server/src/trpc/createContext.ts` | 쓰기 같은 출처 확인, 편집기 서비스 만들기 |
| `apps/server/src/trpc/plugin.ts`(+시험) | tRPC 응답 `no-store` |
| `apps/server/src/app.ts`, `main.ts`, `content.ts` | 편집기 자료 넘기기, 시작 때 확인 해시·로그, 팩 파일 원본 항목(`raw`) |
| `apps/server/src/auth/adminServices.ts` | `callBetterAuth`를 편집기 권한 확인도 쓰게 내보냄 |
| `apps/server/src/testDb.ts` | 시험 쓰기가 같은 출처 브라우저처럼 보낸다(`SAME_ORIGIN_HEADERS`), 머리글을 바꿔 보낼 수 있게 |
| `apps/server/tsconfig.api.json` | 새 시험 도우미를 게임 앱 선언 파일에서 뺀다 |
| `docs/adr/2026-10-29-planet-editor-stage1.md` | "구현하며 정한 것"에 WP-B |
| `docs/worklog/2026/10/29-2210-planet-editor-server.md`, `docs/WORKLOG.md` | 이 기록, 목차 |

## 함께 바꿔야 하는 파일
- WP-D 화면(`editorApi.ts`): 위 "WP-D가 쓸 약속"대로 `DraftClient`에 맞춘다. 정의 조회는 열 때 한 번 부른다(부를 때마다 감사 기록이 한 줄 는다). 저장의 `BAD_REQUEST`에 `data.reason`이 없으면(기준 모양 등 입력 형식) 화면이 정한 일반 문구로 보인다.
- 기기 빠른 미리보기 레벨(`apps/game/src/editor/planet/previewJobs.ts` `QUICK_LEVEL`)을 바꾸면 서버 `PLANET_EDITOR_CHECK_FACE_LEVEL`(`apps/server/src/planetEditor/definitions.ts`)도 바꾼다.
- `AGENTS.md` 7장 `PLANET_CACHE_DIR` 줄: 이제 팩 행성이 둘이라 빈 캐시에서 차례로 두 번 굽는다(개발 컨테이너 행성마다 약 19~21초, 위 잰 값). 생성기 다양성 고침이 같은 줄의 생성기 판을 고치므로 합칠 때 함께 고친다(이 가지는 `AGENTS.md`를 고치지 않았다).
- `AGENTS.md` 6장에 더할 만한 것(Verified 2026-10-29, 이 작업의 시험·실행): tRPC 11.19.0은 맥락 만들기(`createContext`)가 던지면 묶음의 프로시저마다 그 오류를 주고(errorFormatter를 거친다), 없는 프로시저(404)·조회에 POST(405)는 그보다 먼저 나온다. `text/plain`·`application/x-www-form-urlencoded` 본문은 맥락 전에 415, `multipart/form-data`는 맥락까지 온다. Fastify 5.12.7 `reply.send(Response)`는 Response 머리글을 앞서 단 머리글 위에 덮는다(같은 이름만). PostgreSQL jsonb는 U+0000·짝 없는 대리 문자를 거절하고 키 순서를 지키지 않는다.
- 생성기 다양성 고침(`GENERATOR_VERSION` 3): 확인 해시·`fieldsHash` 값이 바뀐다. 새 시험은 값을 적지 않아 고칠 것이 없다. 서버 캐시는 판이 바뀌어 다시 굽는다(이제 행성 둘).
- 앱 뼈대 W2의 마이그레이션: 늦게 합치는 쪽이 main 위에서 `db:generate`로 다시 만든다(ADR 22, ADR 38 15절). 이 가지의 마이그레이션은 초안 표 둘만 만든다.
- PLAN 6.2·13장, ADR 36 줄(WP-G): 서버 초안·정의 조회가 생겼다.

## 건드리지 말 것
- 저장 검사의 차례와 코드(`@terra/shared` `PLANET_DRAFT_REJECT_CODES`, 기기 가져오기와 같은 약속).
- 감사 기록에 항목·시드를 넣지 않는다. 자동 저장(있는 초안 저장)마다 감사 기록을 쓰지 않는다(ADR 38 9절).
- 같은 출처 확인은 tRPC 맥락 만들기 한 곳에 둔다(프로시저마다 따로 걸지 않는다, ADR 38 "이유").
- 올라간 뒤의 마이그레이션 `20261029123713_planet_drafts`(ADR 22).

## 미검증·TODO·알려진 문제
- 화면(WP-D)과 실제로 이어 보지 않았다(미실행). 기기 `draftSync.ts`의 충돌 처리와 서버 CONFLICT는 위 약속으로만 맞췄다.
- Safari·Firefox의 `Origin`·`Sec-Fetch-Site`는 돌려 보지 않았다(Unknown). 명세대로면 같은 출처 fetch에 Origin이 붙는다(Assumed). NAS DSM 역방향 프록시가 `Origin`을 그대로 넘기는지는 계정 경로가 같은 규칙으로 NAS에서 되므로 같다고 본다(Assumed).
- 직전 버전 앱이 이 마이그레이션을 적용한 DB에서 도는 것은 돌려 보지 않았다(표를 더하기만 해서 영향이 없다고 본다, Assumed).
- (검토 고침에서 고침) 지운 뒤 다시 만든 초안은 판 번호가 1부터라, 지우기 전 판을 들고 있던 다른 기기의 저장이 우연히 같은 판이면 충돌 없이 들어간다(ABA). → 판 번호를 표 전체 시퀀스로 바꿨다.
- (검토 고침에서 고침) 정의 조회·저장에 속도 제한이 없다. → 사용자별 속도 제한과 묶음 상한을 넣었다.
- Better Auth 두 번째 확인이 우리 권한 표와 다른 답을 내는 경우는 만들 수 없었다(두 겹이 같은 역할 표를 쓴다). 가짜 거절로 FORBIDDEN만 시험했다.
- NAS 시작 시간(확인 해시)·굽기 시간은 재지 않았다(Unknown).

## 사용자 결정 대기
- 없음.

## 커밋
- `227f949` feat(content): 편집 전용 행성, 팩 판 3
- `49276bd` feat(protocol,server): 목록 정보 `fieldsHash`
- `ac2c7f2` feat(server): tRPC 쓰기 같은 출처 확인·`no-store`·`data.reason`(관리자·설정 쓰기에도 걸리는 변경이라 따로 둔다)
- `1c8be96` feat(server): 초안 표·마이그레이션·`planetEditor` tRPC·시작 때 확인 해시
- 이 기록 커밋(작업 기록, ADR 38 "구현하며 정한 것" WP-B, 목차)

## 최종 확인 (Verified: 이 작업 트리, Node 24.22.1, pnpm 11.28.9, PostgreSQL 16)
- `TEST_DATABASE_URL=… pnpm check`: 통과(2분 57초, 그동안 1분 부하 5.6 → 15.3). 포맷·린트·타입(게임 앱 `tsc -b` 포함)·경계·크기·다국어(325키)·대비(136쌍)·콘텐츠(`core@3`)·시험 파일 144개·시험 1,342개(DB 시험 포함, 건너뜀 없음). 부하로 시간이 넘친 시험은 없었다.
- 위 실행은 커밋을 나누기 전의 같은 내용이다. 나눈 뒤 커밋한 파일이 모두 그때와 같은지 파일마다 견줬다. `ac2c7f2` 상태(편집기 전)도 따로 서버 타입 검사·린트·tRPC·인증·설정·앱 시험 파일 10개·시험 107개(DB 포함)를 통과했다.
- `pnpm check:content 507e645`: 통과(단계 1·2·4a·4b, main 기준 호환). `pnpm check:docs 507e645`: 통과(작업 기록·ADR·마이그레이션). `pnpm docs:index --check`: 최신.
- 커밋한 뒤(HEAD) `TEST_DATABASE_URL=… pnpm check`를 다시 돌렸다(3분 36초, 1분 부하 15.5): 시험 1,342개 중 1개 실패. `apps/server/src/auth/account.db.test.ts` "계정 만들기 상한"이 `retryAfterSec` 3600을 바랐는데 3599였다(실제 시계를 쓰는 시도 제한이라 부하로 두 요청 사이가 1초를 넘으면 그렇다). 그 파일만 다시 돌리면 13개 모두 통과했다(부하 16.4). 이 가지는 그 시험과 계정 경로·시도 제한 코드를 고치지 않았다.
