# 앱 뼈대 W2 검토 고침: 계정이 바뀐 뒤의 계정 요청, 저장할 수 없는 글자, 마이그레이션 갈래 다시 확인

- 일시: 2026-10-30 00:20 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-app-shell.md`(37, 제안) 5·6절, ADR `2026-10-28-design-system.md`("맞추는 규칙"), ADR `2026-10-28-db-access-and-migrations.md`, 작업 기록 `29-2220-app-shell-w2.md`(검토한 W2), main의 `29-2210-planet-editor-server.md`·`29-2315-planet-editor-server-review.md`(같은 부모 마이그레이션, tRPC 요청 지키기)
- 작업 자리: W2와 같은 작업 트리·가지(`.claude/worktrees/app-shell-w2`, `work/app-shell-w2`). W2 끝 커밋 `b9b790d` 위에서 고쳤다. 가지의 바탕은 그대로 main `507e645`다(main 위로 옮기지 않았다). 푸시·합치기는 하지 않았다.

## 한 일
- W2 검토 지적 4개를 다시 확인했다. 검토 탐침 4개를 이 작업 트리에 잠깐 넣어 돌렸고(끝나고 지움), 고치기 전 코드에서 실패하는 시험을 먼저 썼다. 지적 3은 지금 main(`dbe87c2`, `work/editor-server`가 합쳐짐)과 합친 저장소 밖 트리에서 다시 쟀다.
- 지적 1(계정 요청 줄): 줄의 올리기·로그인 맞추기는 차례가 왔을 때 그 요청의 사용자가 지금 로그인한 사용자가 아니면 보내지 않는다. 로그인 맞추기 안의 읽기 → 올리기 사이에 계정이 바뀌어도 읽은 값을 버린다.
- 지적 2(저장할 수 없는 글자): 공용 `hasUnstorableText`를 두고 서버는 400, 기기는 저장하지 않음(`false`)으로 막았다.
- 지적 3·4: 작업 기록 `29-2220-app-shell-w2.md`를 고쳤다(마이그레이션 줄, 같은 출처 확인 줄, `utf8ByteLength` 옮기기, 꽂는 줄, 정한 것, AGENTS 후보).
- 화면은 바꾸지 않았다. 그래서 사진·`web-design-guidelines`·`break-ui`·화면 시험은 하지 않았다.

## 지적별 처리
| # | 지적(무게) | 처리 | 커밋 |
|---|---|---|---|
| 1 | 줄에서 기다리던 올리기가 계정이 바뀐 뒤 앞 계정 id로 돌아, A의 바꿈이 B 계정에 저장된다(minor) | 고침. 다시 확인: 검토 탐침이 이 트리에서도 버그를 재현했다(B 세션에서 `upload(user-a)`). 확인 자리는 고침 안과 조금 다르다(아래). 새 시험 5개(설정 저장소 3, `accountSync` 2) | `83b5fce`, `73a76d0` |
| 2 | NUL·짝 없는 대리 문자가 든 nav·home이 500이고, 기기는 저장해 그 묶음이 영영 맞춰지지 않는다(minor) | 고침. 다시 확인: PG 16에서 네 값 모두 500, 기기 저장은 null 없이 통과. 고침 안대로 공용 도우미 + 서버 400 + 기기 null, 꽂는 줄 한 줄. 새 시험 6개(공용 4, 기기 저장 1, DB 1)와 설정 저장소 시험 1개 넓힘 | `be5c273`, 이 기록의 커밋 |
| 3 | 마이그레이션 다시 만들기 안내가 필요 없고 한쪽 방향만 적었다(nit) | 작업 기록 고침. 지금 main으로 다시 확인했다(아래 "마이그레이션 갈래"). 고침 안의 "고를 일"에 하나를 더했다: 다시 만들면 이 가지를 적용한 DB가 실패하므로 다시 만들지 않는 쪽을 권한다 | 이 기록의 커밋 |
| 4 | 공용 설정 계약이 행성 편집기 초안 API 파일에서 `utf8ByteLength`를 가져온다(nit) | 이 가지에서는 고치지 않았다. 그 파일 주인이 아니다(계획서 원칙: 남의 파일은 꽂는 줄만). 통합 세션 줄에 적었다. 세는 규칙은 설정 시험(한글 3바이트·그림 문자 4바이트·4096/4097바이트 경계)이 묶어 두어 말없이 바뀌지는 않는다 | 이 기록의 커밋 |

## 고침 안과 다르게 한 것
- 지적 1
  - 확인 자리를 작업 맨 앞이 아니라 `await loadAccountSync()` 다음(보내기 바로 앞)으로 했다. 조각을 처음 받는 동안(느린 네트워크)에도 계정이 바뀔 수 있어서다.
  - 로그인 맞추기 안(`accountSync.ts` `syncAtSignIn`)의 읽기와 올리기 사이도 막았다. 지적 범위 밖이고 main부터 있던 좁은 틈(읽기 요청 하나의 시간)이지만 같은 종류다. settings.ts가 기기 저장소와 함께 지금 로그인한 사용자를 넘긴다(`DeviceStore.signedInUserId`, 없으면 바뀌지 않은 것으로 본다 = 시험의 가짜 저장소).
- 지적 2
  - 도우미는 `JSON.stringify`의 replacer로 훑는다. JSON에 쓰이는 값(toJSON 뒤 값)을 보고, 값이 undefined라 JSON에서 빠지는 칸의 이름은 보지 않는다(저장되지 않는 칸 때문에 막지 않게).
  - 서버의 크기 검사에 `abort: true`를 걸었다. 4KB를 넘는 본문은 글자를 다시 훑지 않는다(Zod 4.6.7 `refine`의 `abort`, 패키지 타입 `checks.d.ts`에서 확인).

## 확인 (Verified: 이 작업 트리, Node 24.22.1, pnpm 11.28.9, PostgreSQL 16 시험 클러스터 `127.0.0.1:55432`)
| 명령 | 결과 |
|---|---|
| 검토 탐침 4개(고치기 전) | 줄 탐침: B 로그인 뒤 `{ fn: "upload", userId: "user-a", sessionAtCall: "user-b" }`가 불렸다. 기기 탐침: NUL·`\uD800`·`a\uDC00`(값·칸 이름)을 null 없이 돌려줬다. 서버 탐침: `"\u0000"`·`"a\u0000b"`·`"\ud800"`·`"\udc00"` 네 값 모두 500 `INTERNAL_SERVER_ERROR` |
| 새 시험을 고치기 전 코드에서 | 지적 1: `settings.test.ts` 계정 바꿈 3개와 `accountSync.test.ts` "읽는 사이에 다른 계정으로 바뀜" 1개가 실패했다(GET 뒤 POST가 감). 지적 2: 공용 4개, `storage.test.ts` 1개, `settings.test.ts` 1개, DB 시험 1개(500)가 실패했다 |
| 고친 뒤 | 위 시험 모두 통과. 줄 탐침은 이제 실패한다: 부른 차례 `[sync(user-a), sync(user-b)]`, 기기 표시 `{ nav: { by: "user-a" } }`가 남음. 서버 탐침: 네 값 모두 400 `BAD_REQUEST`(`UNSTORABLE_TEXT`). 기기 탐침: null |
| 더 본 가장자리(저장소 밖 탐침) | 4KB 안의 2,040단 중첩 배열, `1e308`·`5e-324`·`-0`은 200이고 저장된다(PG 16). 고칠 것 없음 |
| 이 줄기 시험만(`TEST_DATABASE_URL` 포함) | 공용 `settings.test.ts` 15개, 기기 settings 폴더 6파일, 서버 settings 1파일: 8파일 99개 통과(마지막 시험 하나 더하기 전). 기기 `settings.test.ts`는 마지막에 9개 |
| `pnpm check`(첫 번째, 지적 1·2 커밋 뒤, `TEST_DATABASE_URL` 포함, 00:07 KST 시작, 부하 평균 5.2→10.7, 2분 21초) | 통과. 시험 파일 140개·시험 1,327개 |
| `pnpm check`(마지막 트리 = 이 기록·목차까지, `TEST_DATABASE_URL` 포함, 00:15 KST 시작, 부하 평균 1.6→7.9, 1분 38초) | 통과: 포맷·린트·타입(전체)·경계·크기·다국어 325개 키·대비 136쌍·콘텐츠 `core@2 (14495d30db2e)`, 시험 파일 140개·시험 1,328개 통과(DB 포함, 건너뜀 없음). W2 기록의 1,266개 + DB 51개 + 새 시험 11개 |
| 고치기 전 `settings.ts`로 바꿔 돌리기(마지막 시험 더한 뒤) | 계정 바꿈 시험 3개 실패. 파일은 되돌렸다(`cmp`로 HEAD와 같음 확인) |

## 마이그레이션 갈래 (지적 3, 2026-10-30 00:00 KST 무렵)
- 합친 트리: 이 가지 `be5c273` + main `dbe87c2`를 `git merge-tree --write-tree`로 합쳐(`6b99356`) 저장소 밖에 풀었다. 겹친 파일은 `docs/WORKLOG.md` 하나다. `schema.ts`·`packages/shared/src/index.ts`는 저절로 합쳐졌다. `pnpm install --frozen-lockfile --offline --ignore-scripts`.
- 확인한 것(모두 Verified)
  - `pnpm --filter @terra/server db:generate` → "No schema changes, nothing to migrate". CI의 "표 정의와 마이그레이션 일치" 단계(생성 뒤 `apps/server/drizzle`에 바뀐 것이 없어야 함)가 통과한다.
  - 시험용 열 하나를 더해 만든 다음 마이그레이션: `prevIds` = `b322ea4a-…`(main planet_drafts)·`ccf9558d-…`(이 가지). SQL은 그 열 한 줄뿐이다(두 갈래를 합쳐 본다). 만든 것은 지웠다.
  - 적용(서버와 같은 `runMigrations`, 새 DB 5개)
    - A. main 폴더 먼저 → 합친 폴더: 두 번째에 `20261029125339_user_settings_nav_home`(이름이 앞) 적용. 운영 DB에 main이 먼저 배포된 경우다.
    - B. 이 가지 폴더 먼저 → 합친 폴더: 두 번째에 `20261029135300_planet_drafts` 적용.
    - C. 새 DB → 합친 폴더: 7개를 이름 차례로 적용.
    - 셋 모두 `user_settings`에 `nav`·`home`이 있고 `planet_draft*` 표 2개가 생겼다.
    - D. (다시 만든 경우) main 먼저 → 다시 만든 폴더: `20261029150239_user_settings_nav_home` 적용. 다시 만든 SQL은 같은 `ADD COLUMN` 두 줄, 부모는 planet_drafts 하나다.
    - E. (다시 만든 경우) 이 가지 폴더 먼저 → 다시 만든 폴더: `column "nav" of relation "user_settings" already exists`로 실패. 밀린 것이 한 트랜잭션이라 planet_drafts도 적용되지 않았다(표 0개, 적용 기록 6개 그대로).
  - 패키지 코드(drizzle-orm 1.0.0-rc.5): `migrator.js`는 폴더를 이름 차례(`localeCompare`)로 읽고, `migrator.utils.js` `getMigrationsToRun`은 적용 기록에 없는 이름을 모두 고른다.
- 그래서 다시 만들지 않고 합치는 쪽을 권한다. 다시 만들면 E처럼 이 가지를 적용한 DB(이 가지로 띄운 개발 DB)가 막힌다. 운영 DB에는 이 가지가 올라간 적이 없다. 시험 DB는 시험마다 만들고 지운다.
- 같은 합친 트리에서: `pnpm typecheck` 통과, `TEST_DATABASE_URL=… vitest run apps/server apps/game/src/settings packages/shared/src/settings.test.ts` → 43파일(서버 36파일 전부 + 기기 settings 6 + 공용 settings 1) 428개 통과. main의 tRPC 요청 지키기(쓰기는 같은 출처·JSON 본문만, 묶음 10개까지) 아래에서도 이 가지 시험이 돈다. 기기 올리기 묶음은 많아야 4개라 `maxItems: TRPC_MAX_BATCH_SIZE`(10)에 걸리지 않는다.
- 정리: 새 DB 5개(`terra_w2fix_a`~`e`)를 지웠다. 풀어 둔 트리는 저장소 밖 임시 폴더다.

## 잰 값 (첫 화면 JS, W5 `scripts/check-bundle.mjs`를 저장소 밖에 복사해 돌림: 모듈 + modulepreload, 파일마다 Node zlib 9단계)
| 빌드 | 첫 화면 JS(gzip) | 원본 |
|---|---|---|
| main `507e645`(W5 기록) | 114,171 B | 368,388 B |
| W2 고치기 전 `b9b790d`(W2 기록, 같은 방법) | 114,478 B | 369,367 B |
| W2 고친 뒤 `be5c273`(이 작업 트리) | 114,501 B(+23 B) | 369,416 B |
| 지금 main `dbe87c2` | 114,168 B | 368,388 B |
| `be5c273` + main `dbe87c2`(합친 트리) | 114,496 B(main보다 +328 B) | 369,416 B(+1,028 B) |
| 위 트리에서 `main.tsx`가 `chooseNavigation`·`chooseHome`을 쓰게 한 흉내(W1·W4가 부를 때) | 114,829 B(+333 B) | 370,219 B |
- 4파일이다. 상한 136,000 B(W5 `bundle-budget.json`) 안이다. `be5c273` 뒤 커밋(`73a76d0`, 이 기록)은 시험·문서만이라 앱 묶음은 `be5c273`과 같다.
- 첫 화면 조각의 원본(소스 맵 `sources`): 공용 `settings.ts`, 기기 `storage.ts`·`syncRules.ts`·`settings.ts`. `planetDraftApi.ts`와 `hasUnstorableText`는 없다. 아무도 `chooseNavigation`·`chooseHome`을 부르지 않아 빠졌다. 부르는 흉내에서는 `planetDraftApi.ts`의 `utf8ByteLength` 하나와 `hasUnstorableText`가 들어왔다(소스 맵 `names`).
- 지연 조각 `accountSync`: 1,048 B · gzip 590 B(W2 기록 957 B · 575 B).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/settings/settings.ts` | 줄의 올리기·로그인 맞추기가 보내기 바로 앞에 지금 로그인한 사용자를 본다(지적 1). 기기 저장소와 함께 `signedInUserId`를 넘긴다 |
| `apps/game/src/settings/accountSync.ts` | `DeviceStore.signedInUserId`(선택), 로그인 맞추기의 읽기 뒤 계정이 바뀌면 읽은 값을 버린다(지적 1) |
| `apps/game/src/settings/settings.test.ts` | 계정 바꿈 시험 3개(지적 1), 저장할 수 없는 글자 `false`(지적 2) |
| `apps/game/src/settings/accountSync.test.ts` | 가짜 서버에 답한 뒤 부르는 갈고리, 읽는 사이 계정 바뀜·그대로 2개(지적 1) |
| `packages/shared/src/settings.ts`·`settings.test.ts` | `hasUnstorableText`와 시험 4개(지적 2) |
| `packages/shared/src/index.ts` | 설정 내보내기 줄에 `hasUnstorableText` |
| `apps/game/src/settings/storage.ts`·`storage.test.ts` | `storableSettingsObject`가 저장할 수 없는 글자면 null(지적 2) |
| `apps/server/src/trpc/settings.ts` | `settingsObjectInput`: 크기(넘으면 abort) → `UNSTORABLE_TEXT` → 아는 칸(지적 2) |
| `apps/server/src/settings/settings.db.test.ts` | 400 16가지(값 4개 × 자리 4곳)와 그림 문자·U+0001·U+FFFF 저장(지적 2) |
| `docs/worklog/2026/10/29-2220-app-shell-w2.md` | 정한 것·꽂는 줄·통합 세션 줄·AGENTS 후보·건드리지 말 것(지적 1~4) |
| 새 `docs/worklog/2026/10/30-0020-app-shell-w2-review.md`, `docs/WORKLOG.md` | 이 기록, 목차(`pnpm docs:index`) |

## 함께 바꿔야 하는 파일 (꽂는 줄)
- W1·W4: W2 기록의 꽂는 줄 그대로다. 더한 것 두 가지.
  - `chooseNavigation`·`chooseHome`이 `false`면 저장하지 않은 것이다: 4KB 넘음, JSON으로 못 바꿈, 계정에 저장할 수 없는 글자(NUL·짝 없는 대리 문자). 화면이 이 값을 사용자에게 알릴지는 W1·W4가 정한다(지금 그런 값을 만드는 화면은 없다. 메뉴·카드는 ID만 쓴다).
  - `mergeNavigation`·`mergeHome`이 만든, 아는 칸이 서버 모양(`navInput`·`homeInput`)에 맞는 값만 넘긴다. 새 서버가 400을 주는 값은 기기가 옛 서버의 400(모르는 바깥 칸)과 구별하지 못해 "올릴 것"이 영영 남고, 로그인 때 그 묶음의 계정 값이 그 기기에 다시 오지 않는다.
- 통합 세션(합치는 순서 0 → W2 → W5 → W1 → W3 → W4에서 W2가 다음이다)
  - 겹치는 파일: `docs/WORKLOG.md` 하나(`pnpm docs:index`로 다시 만든다). `schema.ts`·`packages/shared/src/index.ts`는 저절로 합쳐진다(Verified: `git merge-tree`, main `dbe87c2`).
  - 마이그레이션은 다시 만들지 않고 그대로 합치기를 권한다(위 "마이그레이션 갈래").
  - `utf8ByteLength`를 중립 모듈(예: `packages/shared/src/utf8.ts`)로 옮기기: `planetDraftApi.ts` 주인(행성 편집기)이나 통합 세션. `settings.ts`·`planetDraftApi.ts`가 거기서 가져오고 `index.ts` 내보내기 이름은 그대로 둔다.
  - 첫 화면 JS 상한: W2를 합친 main은 114,496 B다(지금 main + 328 B). W1이 `chooseNavigation`을 첫 화면에서 부르면 약 +333 B가 더 붙는다(위 흉내). 상한은 계획대로 W1을 합칠 때 W1이 잰 값 + 8,000 B로 정한다. W2만으로는 상한(136,000 B)을 바꿀 까닭이 없다.
  - ADR 37 "구현하며 정한 것"으로 옮길 것: W2 기록의 "정한 것"(이번에 더한 두 줄 포함: 계정이 바뀐 뒤 줄의 요청을 보내지 않음, 저장할 수 없는 글자).
  - AGENTS.md 6장 후보: W2 기록에 더한 두 줄(Drizzle 갈래, PG 16 jsonb 글자).

## 건드리지 말 것
- W2 기록의 "건드리지 말 것" 그대로다.
- 줄의 확인 자리(`settings.ts`의 `upload`·`onSessionChange` 작업에서 `await loadAccountSync()` 다음)를 작업 맨 앞으로 옮기지 않는다. 조각을 받는 동안의 계정 바꿈을 놓친다.
- 서버 `settingsObjectInput`의 검사 차례(객체 → 크기 → 글자 → 아는 칸). 글자 검사는 DB에 닿기 전에 돌아야 한다(뒤로 가면 다시 500).

## 미검증·TODO·알려진 문제
- 실제 브라우저에서 로그아웃 → 다른 계정 로그인 중의 올리기는 돌려 보지 않았다(미실행). 시험은 node 환경의 흉내(가짜 세션·가짜 accountSync, 실제 tRPC 클라이언트 + 가짜 서버)다.
- 건너뛴 앞 계정의 바꿈은 지금 계정의 로그인 맞추기 규칙(ADR 30 "맞추는 규칙", 전부터 같음)을 따른다. 지금 계정에 그 묶음 값이 있으면 그 값이 기기를 덮고 앞 계정의 바꿈은 버려진다. 없으면 기기 값(앞 계정이 바꾼 값)이 지금 계정에 올라간다. 같은 기기를 여럿이 쓰면 테마에서도 이미 그렇다. 이번에 바꾸지 않았다.
- 화면 쪽 `false` 알림은 W1·W4 몫이다(위 꽂는 줄).
- DB 시험·갈래 확인은 PostgreSQL 16에서만 했다. 운영은 18이다(Unknown: 18의 jsonb 글자 규칙은 재지 않았다. 문서상 같다고 보지만 Assumed).
- `utf8ByteLength` 옮기기(지적 4)는 남았다.

## 사용자 결정 대기
- 없음.
