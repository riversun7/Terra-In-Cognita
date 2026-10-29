# 앱 뼈대 W2: 계정 설정에 메뉴(nav)·홈(home) 묶음 — 기기 저장·맞추기·서버 저장·템플릿 저장 규칙

- 일시: 2026-10-29 22:20 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-app-shell.md`(37, 제안) 5절·6절(템플릿 저장 규칙)·"구현하며 정한 것 (0단계)", ADR `2026-10-28-design-system.md`("맞추는 규칙"), ADR `2026-10-28-db-access-and-migrations.md`, 작업 기록 `29-2015-app-shell-stage0.md`·`29-2100-app-shell-stage0-review.md`, 기획 D-6001·D-6005·D-6007·D-6008·D-265
- 작업 자리: 작업 트리 `.claude/worktrees/app-shell-w2`, 가지 `work/app-shell-w2`, main `507e645`에서 시작했다. 푸시하지 않았다.

## 한 일
- 계정 설정에 묶음 두 개를 더했다: 메뉴(`nav`)와 홈(`home`). 화면(테마·기기 설정 따르기)·언어와 같은 길로 기기와 계정에 저장한다(ADR 37 5절).
- 두 값은 모양을 모르는 JSON 객체다(`SettingsObject`). 기기 저장·맞추기·서버 저장은 안쪽을 읽지 않는다. 읽기는 쓰는 곳이 한다: 틀(W1)은 `parseNavigation`, 홈 조각(W4)은 `parseHome`. 칸이 없으면 정하지 않은 것이다.
- `packages/shared/src/settings.ts`
  - `UserSettings`에 `nav?`·`home?`를 더했다. 없으면 칸이 생기지 않는다. 그래서 전에 있던 시험이 고치지 않고 그대로 통과한다.
  - `SETTINGS_OBJECT_MAX_BYTES`(4096), `settingsObjectBytes`(JSON.stringify의 UTF-8 바이트), `isSettingsObject`.
  - `parseUserSettings`는 `nav`·`home`이 JSON 객체일 때만 남긴다(안쪽은 그대로, 크기는 보지 않는다).
- 게임 앱 `apps/game/src/settings/`
  - `storage.ts`: 묶음 4개(`appearance`·`locale`·`nav`·`home`)의 "올릴 것" 표시. 저장 판은 `v: 1` 그대로다. `storableSettingsObject`: 저장할 값을 JSON으로 한 번 복사하고 4KB를 넘으면 `null`.
  - `syncRules.ts`: 두 갈래 삼항식을 묶음 표(`GROUPS`: 칸, 정한 값이 있는지, 값 고르기) 하나로 바꿨다. `splitByGroup`(올릴 값을 묶음마다 나눔). 메뉴·홈은 JSON 글자가 같으면 같은 값으로 본다. 값이 없는 메뉴·홈 표시는 보지 않는다.
  - `accountSync.ts`: 올리기를 묶음마다 따로 부른다(같은 틱이라 HTTP 요청은 하나). 성공한 묶음만 표시를 지운다. 시험용으로 클라이언트를 넘길 수 있다(기본은 `api`).
  - `settings.ts`: `chooseNavigation(nav)`·`chooseHome(home)`(기기에 복사본 저장 → 로그인했으면 계정에 올림, 4KB를 넘으면 저장하지 않고 `false`). 계정 요청(로그인 맞추기·올리기)을 한 줄로 세워 하나씩 보낸다. `chooseLocale`은 줄에서 기다리는 시간을 합쳐 최대 3초만 기다린다.
- 서버
  - `src/db/schema.ts`: `user_settings`에 `nav jsonb`, `home jsonb`(둘 다 빈 값 허용, 검사 조건 없음).
  - 마이그레이션 `drizzle/20261029125339_user_settings_nav_home/`: `ALTER TABLE "user_settings" ADD COLUMN` 두 줄뿐이다.
  - `src/trpc/settings.ts`: 바깥은 `z.strictObject` 그대로. `nav`·`home`은 JSON 객체 → 크기(4096바이트) → 아는 칸 모양 순서로 본다. 안쪽 객체는 `z.looseObject`라 모르는 칸도 저장한다.
    - 메뉴 아는 칸: `layout`(짧은 값), `menu`(저장 ID 모양, 32개까지).
    - 홈 아는 칸: `template`(저장 ID 모양), `cards`(24장까지, 카드마다 `id` 저장 ID 모양, `size`는 있으면 짧은 값).
    - 목록에 있는지는 보지 않는다(되돌림 배포 때 더 새 기기의 값을 막지 않게).
  - 템플릿 저장 규칙(ADR 37 6절, 사용자 결정 2): 권한 `home: ["template"]`(dev·admin)이 없는 계정이 보낸 `home.template`이 `dt_hybrid`가 아니면 그 칸만 `dt_hybrid`로 바꿔 저장한다(`mergeHome`). 거절하지 않는다. `cards`와 모르는 칸은 그대로다.
  - `src/settings/store.ts`: 보낸 묶음만 jsonb 열에 통째로 쓴다.
- 시험
  - 공용: 메뉴·홈 읽기(모르는 칸·ID가 남음, 객체가 아니면 칸 없음), 크기 재기(한글 3바이트, 그림 문자 4바이트, JSON으로 못 바꾸면 무한대).
  - 기기 저장: 묶음 4개 왕복, 값이 없으면 전과 같은 저장 모양, 객체가 아닌 값, 복사본, 4KB 경계(영문·한글).
  - 맞추기 규칙: 계정 값이 덮기, 로그인 전 바꾼 값 올리기, 다른 계정 표시 버리기, 계정에 값이 없으면 올리기, 묶음 4개가 따로, 묶음 나누기, 다시 읽은 객체로 표시 지우기, 값 없는 표시.
  - 올리기·맞추기(가짜 서버): 실제 tRPC 클라이언트(`httpBatchLink`)가 tRPC fetch 어댑터로 만든 가짜 서버와 HTTP 묶음 요청을 주고받는다. 옛 서버(바깥 칸을 엄격히 봄)와 새 서버(받은 칸 저장) 둘. 기기 저장소는 바꿀 때마다 저장 문자열로 쓰고 읽는다.
  - 설정 저장소(`settings.ts`): 계정 요청 줄(하나씩, 기다리는 동안의 바꿈은 한 번에, 로그인 맞추기 뒤에 올리기, 앞의 실패 뒤에도 줄이 돎), 복사본 저장, 4KB 넘음, 로그인 전 바꿈.
  - DB(`settings.db.test.ts`): 저장·읽기, 묶음만 바꾸기, 4KB 경계, 아는 칸 모양·길이 400 18가지, 템플릿 저장 규칙, 역할 바꿈, DB의 객체 아닌 값, 실제 서버의 묶음 요청(207), 직전 판 서버의 읽기·쓰기 흉내.

## 통과 기준 (계획서 W2)
| # | 기준 | 결과 | 근거 |
|---|---|---|---|
| 1 | `pnpm check` + DB 시험(`TEST_DATABASE_URL`) 통과 | 충족 | 아래 "확인" 표: `pnpm check` 통과, 서버 시험 28파일 236개 통과(DB 포함, 세 번) |
| 2 | 묶음 4개가 따로 맞춰진다. 기존 시험 그대로 통과, 새 묶음 시험(계정 값이 덮기, 로그인 전 바꾼 값 올리기, 다른 계정 표시 버리기) | 충족 | `syncRules.test.ts` "메뉴·홈 묶음" 10개(셋 모두 + "묶음 4개가 따로 맞춰진다"). 기존 시험 파일 다섯 개(`settings.test.ts`·`storage.test.ts`·`syncRules.test.ts`·`settings.db.test.ts`·`themeSources.test.ts`)에서 지운 줄은 DB 시험 머리 주석 한 줄뿐이다(`git diff -U0`로 확인). 가져오는 이름만 더했다 |
| 3 | 옛 서버 흉내(새 칸 400)에서 화면·언어는 올라가고 새 묶음은 "올릴 것"으로 남는다(가짜 fetch). tRPC 묶음 응답이 부른 것마다 따로인지 확인 | 충족 | `accountSync.test.ts`: 묶음 4개 = HTTP 요청 1개(`settings.set,settings.set,settings.set,settings.set?batch=1`), 응답 207, 옛 서버에 화면·언어 저장, 기기 표시는 `{ nav, home }`만 남음. 로그인 맞추기도 같은 결과. 실제 서버(Fastify 어댑터)도 묶음 안 하나가 400이면 207이고 나머지는 저장된다(`settings.db.test.ts`) |
| 4 | 모르는 ID가 지워지지 않는다. `nav.extra`가 기기 저장 → 올리기 → 서버 저장 → 읽기를 거쳐도 남는다. 4KB를 넘으면 400. `themeSources.test.ts` 그대로 통과 | 충족 | 기기 쪽: `accountSync.test.ts` "기기 저장 → 올리기 → 서버 → 다른 기기에서 읽기"(가짜 서버). 서버 쪽: DB 시험 "저장하고 그대로 읽는다"·"크기"(4096바이트 200, 4097바이트 400, 한글 4095·4098바이트). 손 확인: 빌드하지 않은 실제 서버 두 판으로 `nav.extra`·`home.extra`가 남았다(아래). `themeSources.test.ts`는 고치지 않았고 `pnpm check`에서 통과 |
| 5 | 마이그레이션은 열 더하기만. 직전 판 서버가 새 DB에서 설정을 읽고 쓴다 | 충족 | `migration.sql`은 `ADD COLUMN` 두 줄. DB 시험이 직전 판 표 정의·읽기·쓰기를 그대로 돌린다. 손 확인: main `507e645` 원본 서버를 새 DB에 띄워 봤다(아래) |
| 6 | 템플릿 저장 규칙: dev·admin이 아닌 계정의 기본값이 아닌 `home.template`은 `dt_hybrid`로 저장(거절 없음), `cards`·모르는 칸 그대로. dev·admin 것은 그대로 | 충족 | DB 시험: player의 `dt_city`·`dt_grid`·`dt_future` → `dt_hybrid`(200, `cards`·`extra` 그대로), 기본값·템플릿 칸 없음은 그대로, dev·admin·player+dev는 그대로, 역할을 player로 바꾸면 다음 저장부터 바뀜 |

## 확인 (Verified: 이 작업 트리, Node 24.22.1, pnpm 11.28.9, PostgreSQL 16 시험 클러스터 `127.0.0.1:55432`)
| 명령 | 결과 |
|---|---|
| `pnpm check`(첫 번째, `settings.test.ts`(게임 앱) 더하기 전, 부하 평균 4.1~7.2, 2분 2초) | 통과: 포맷·린트·타입(전체)·경계·크기·다국어 325개 키·대비 136쌍·콘텐츠 `core@2 (14495d30db2e)`, 시험 파일 133개 통과·6개 건너뜀(DB), 시험 1,260개 통과·51개 건너뜀 |
| `pnpm check`(마지막 트리, 22:22 시작, 부하 평균 4.9~8.1, 1분 22초) | 통과: 위와 같은 검사, 시험 파일 134개 통과·6개 건너뜀(DB), 시험 1,266개 통과·51개 건너뜀 |
| `TEST_DATABASE_URL=… pnpm exec vitest run apps/server`(서버 코드 마지막 고침 뒤) | 시험 파일 28개, 시험 236개. 첫 번째(부하 평균 약 10.5)에서 1개 실패했다. 출력을 남기지 않아 어느 시험인지 모른다(Unknown). 그 뒤 세 번(부하 평균 15.8~17.0)은 모두 통과했다 |
| 이 줄기 시험 파일만(`TEST_DATABASE_URL` 포함) | 공용 `settings.test.ts` 11개, 기기 `storage` 9·`syncRules` 25·`accountSync` 6·`settings` 6, 서버 `settings.db.test.ts` 20개. 모두 통과 |
| 요청 줄 시험이 정말 줄을 보는지 | `settings.ts`의 줄을 빼고(바로 보내기) 돌리면 줄 시험 2개가 실패하는 것을 봤다. 파일은 되돌렸다(`cmp`로 같음 확인) |
| `pnpm --filter @terra/server db:generate --name user_settings_nav_home` | 위 마이그레이션. 스냅샷 `prevIds`는 `user_settings`의 `52ee1e81-…` |
| 첫 화면 JS(빌드한 `index.html`의 모듈 + modulepreload, 파일마다 gzip 9단계(Node zlib)) | 바꾸기 전(같은 트리에서 바꾼 것을 잠시 빼고 빌드) 368,388B·gzip 114,171B → 뒤 369,367B·gzip 114,478B(+979B·gzip +307B), 4파일. `chooseNavigation`·`chooseHome`을 아직 아무도 가져오지 않아 `storableSettingsObject`·`utf8ByteLength`는 묶음에서 빠졌다(빌드 소스 맵에 `planetDraftApi.ts` 없음). W1이 부르면 그만큼 는다(Assumed: 수백 바이트) |
| 지연 조각 `accountSync` | 910B·gzip 539B → 957B·gzip 575B |
| `node scripts/check-pwa.mjs`(위 빌드) | 통과 |
| 손 확인: 되돌림(새 DB에 직전 판 서버) | 아래 |

### 손 확인: 직전 판 서버가 새 DB에서 (2026-10-29 22:05 무렵)
- 준비: main `507e645`를 `git archive`로 저장소 밖 임시 폴더에 풀고 `pnpm install --frozen-lockfile --offline --ignore-scripts`. 새 DB `terra_w2_rollback`. 가짜 계정 `Fake_W2Rollback`(player). 포트 4537(새 판)·4538(직전 판). 4471은 다른 작업이 쓰고 있어 옮겼다.
- 순서와 결과
  1. 이 가지의 `src/migrate.ts`로 마이그레이션 6개 적용(`nav`·`home` 열 생김).
  2. 직전 판 `src/migrate.ts`: "적용할 마이그레이션 없음". 오류 없이 끝났다.
  3. 새 판 서버(`tsx src/main.ts`): `settings.set { theme: dark, nav, home(template dt_city) }` → 200. `home.template`은 `dt_hybrid`로 저장됐고 `cards`·`extra`는 그대로였다.
  4. 직전 판 서버: `settings.get` → `{ theme: dark, followSystem: false, locale: null }`(nav·home 칸 없음). `settings.set { theme: station }` → 200. `settings.set { nav }` → 400 `BAD_REQUEST`.
  5. 새 판 서버 다시: `settings.get` → `theme: station`, `nav`·`home`은 3번 값 그대로(`extra` 포함).
- 정리: 서버 세 번을 모두 멈췄고 DB를 지웠다. 임시 폴더는 저장소 밖에 있다.

## 정한 것 (ADR 37·계획서가 정하지 않은 것. 통합 세션이 ADR 37 "구현하며 정한 것"으로 옮긴다)
- 정하지 않음 = 칸 없음. `nav`·`home`에 `null`을 보내 지우는 길은 두지 않았다(서버가 400). [기본값으로]는 기본값을 적은 값을 저장한다(W1 `resetNavMenu`, W4 `mergeHome`). 읽기 응답에도 저장한 적이 있을 때만 칸이 있다. 그래서 옛 기기·전에 있던 시험이 그대로다.
- 크기 상한(4096바이트, `settingsObjectBytes`)은 쓸 때만 본다. 서버는 받는 값을 보고(400), 기기는 `chooseNavigation`·`chooseHome`에서 본다(저장하지 않고 `false`). 읽을 때(기기 저장소·DB)는 보지 않는다. 더 새 판이 상한을 올려 저장한 값을 되돌림 배포 동안 버리지 않으려고다.
  - 템플릿 저장 규칙은 값을 2바이트까지 늘릴 수 있다(`dt_grid`·`dt_city` 7자 → `dt_hybrid` 9자). 그래서 저장값이 4096바이트를 조금 넘을 수 있다. 읽을 때 크기를 보지 않으므로 지워지지 않는다. 다만 그 값을 기기가 받아 다시 바꾸면 `chooseHome`이 `false`를 줄 수 있다(카드 24장이 약 0.9KB라 닿기 어렵다, Assumed).
- 메뉴 입력 검사의 아는 칸은 `layout`·`menu`뿐이다. 0단계 `navigation.ts`의 탭 칸(`tabs`, 탭 4개)은 검사하지 않는다. D-265로 W1이 `tabs`와 `NAV_TAB_SLOTS`를 없애는 중이라서다(Verified: W1 작업 트리 `navigation.ts` 바꾼 내용 읽기, 22:00 무렵). 그래서 이 가지는 `NAV_TAB_SLOTS`를 가져오지 않는다. `tabs`가 오면 모르는 칸처럼 그대로 저장한다.
- 짧은 값(배치·카드 크기) 모양: `^[a-z0-9][a-z0-9_]{0,15}$`. 카드 `size`는 없어도 된다(`parseHome`이 아는 카드는 기본 크기로 읽는다). 카드 `id`는 있어야 한다.
- 템플릿 칸이 없으면 규칙이 칸을 더하지 않는다(읽을 때 기본값이다). 목록에 없는 템플릿 값(`dt_future`)도 기본값이 아니므로 바꾼다.
- 서버가 템플릿을 바꿔 저장해도 기기 값은 바로 바꾸지 않는다. 올리기가 성공하면 표시가 지워지고, 다음 로그인 때 계정 값이 기기를 덮는다. 플레이어 화면은 저장값과 상관없이 DT-HYBRID라 그사이 보이는 차이는 없다(ADR 37 6절).
- 올리기는 묶음마다 `settings.set`을 따로 부르고 `AbortSignal` 하나를 같이 쓴다(묶음 전체가 함께 시간 넘음).
- 계정 요청 줄(`settings.ts`): 로그인 맞추기와 올리기를 앞의 것이 끝난 뒤 보낸다. 줄에서 기다리는 올리기는 하나만 둔다. 차례가 오면 그때의 "올릴 것"을 모두 보낸다. 빨리 잇달아 바꿀 때(홈 편집의 ↑·↓) 먼저 보낸 값이 늦게 저장되어 나중 값을 덮는 일을 막으려는 것이다. 바꿀 때마다 저장하는 홈 편집(ADR 37 6절)의 "다른 기기에도 남는다"가 여기에 기댄다.
- 메뉴·홈 값은 JSON 글자가 같으면 같은 값으로 본다(`afterUpload`). 다른 탭이 저장소를 바꾸면 기기 값이 새 객체가 되어서다.
- 값이 없는 메뉴·홈 "올릴 것" 표시(다른 판이 남긴 것 등)는 보지 않는다. 그런 표시가 계정 값을 막지 않게.
- DB 열에 검사 조건을 두지 않았다(열 더하기만). 읽을 때 JSON 객체가 아니면 칸 없이 읽는다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/settings.ts`·`settings.test.ts` | `nav`·`home` 칸, 크기 상한·재기, 읽기 |
| `packages/shared/src/index.ts` | 설정 내보내기 줄만(`SETTINGS_OBJECT_MAX_BYTES`·`isSettingsObject`·`settingsObjectBytes`·`SettingsObject`) |
| `apps/game/src/settings/storage.ts`·`storage.test.ts` | 묶음 4개 표시, 메뉴·홈 저장, 저장할 모양(복사·상한) |
| `apps/game/src/settings/syncRules.ts`·`syncRules.test.ts` | 묶음 표, 묶음 나누기, 객체 비교, 값 없는 표시 |
| `apps/game/src/settings/accountSync.ts`, 새 `accountSync.test.ts` | 묶음마다 올리기, 시험용 클라이언트, 옛 서버·새 서버 흉내 시험 |
| `apps/game/src/settings/settings.ts`, 새 `settings.test.ts` | `chooseNavigation`·`chooseHome`, 계정 요청 줄 |
| `apps/server/src/db/schema.ts` | `user_settings.nav`·`home` jsonb |
| 새 `apps/server/drizzle/20261029125339_user_settings_nav_home/` | 열 더하기 마이그레이션(`db:generate`로 만듦) |
| `apps/server/src/trpc/settings.ts` | 입력 검사(크기·아는 칸), 템플릿 저장 규칙 |
| `apps/server/src/settings/store.ts`·`settings.db.test.ts` | 메뉴·홈 쓰기, DB 시험 |
| `docs/worklog/2026/10/29-2220-app-shell-w2.md`, `docs/WORKLOG.md` | 이 기록, 목차(`pnpm docs:index`) |

- `apps/server/src/trpc/context.ts`는 고치지 않았다. `UserSettingsPatch`·`SettingsServices`가 `UserSettings`에서 나오므로 저절로 넓어졌다(W3이 같은 파일을 고친다).

## 함께 바꿔야 하는 파일 (꽂는 줄)
- W1(`shell/shellPrefs.ts`, W2가 합쳐진 뒤)
  - 읽기: `parseNavigation(useSettings().device.nav)`(`../settings/settings.ts`의 `useSettings`).
  - 쓰기: `chooseNavigation(mergeNavigation(getSettingsSnapshot().device.nav, 바꾼 칸))`. [기본값으로]도 같은 길로 값을 저장한다. 돌려준 값이 `false`면 저장하지 않은 것이다(4KB 넘음).
  - 메뉴에 검사할 아는 칸이 새로 생기면(`layout`·`menu` 밖) `apps/server/src/trpc/settings.ts`의 `navInput` 한 곳을 고치고 `settings.db.test.ts`에 400 경우를 더한다.
- W4(홈 조각)
  - 읽기: `parseHome(useSettings().device.home, 역할)`. 쓰기: `chooseHome(mergeHome(getSettingsSnapshot().device.home, 바꾼 칸))`.
  - 홈 카드 아는 칸(`template`·`cards`의 `id`·`size`)을 바꾸면 `homeInput`을 함께 본다. 카드 상한(`HOME_CARDS_MAX`)을 바꾸면 서버 검사도 따라간다(같은 상수).
- 통합 세션
  - 마이그레이션: 가지 `work/editor-server`도 `user_settings` 스냅샷(`52ee1e81-…`)을 부모로 하는 마이그레이션(`20261029123713_planet_drafts`, 그 가지 커밋 `1c8be96`. 부모가 같은 것은 22:20 무렵 그 작업 트리의 스냅샷에서 확인)을 만들고 있다. 그쪽이 먼저 main에 들어가면 이 가지의 `apps/server/drizzle/20261029125339_user_settings_nav_home/`를 지우고 main 위에서 `pnpm --filter @terra/server db:generate --name user_settings_nav_home`으로 다시 만든다. SQL은 같아야 한다(`ADD COLUMN` 두 줄). 같은 부모를 둔 스냅샷 둘을 Drizzle 1.0 RC가 받는지는 확인하지 않았다(Unknown, 계획서와 같다).
  - `schema.ts`는 두 가지 모두 고친다. 이 가지는 `user_settings` 정의 안과 `import` 한 줄만 바꿨다.
  - `work/editor-server`의 tRPC 쓰기 같은 출처 확인(`ac2c7f2`)이 들어오면: 이 가지의 DB 시험은 `trpcMutation`(그쪽이 같은 출처 머리글을 넣는다)과 `JSON_HEADERS`(`origin` 있음)로 쓰기를 보내므로 그대로 돌 것이다(Assumed: 합친 뒤 돌려 보지 않음). 기기 쪽 `accountSync.test.ts`는 가짜 서버라 상관없다.
  - ADR 37 "구현하며 정한 것"에 위 "정한 것"을 옮긴다. 5절의 "목록 길이 상한(탭 4, …)"은 D-265 뒤 "메뉴 32, 카드 24"가 된다.
  - AGENTS.md 6장에 더할 만한 확인 사항(모두 2026-10-29 이 작업에서 실행으로 확인)
    - tRPC 11.19.0 묶음 요청: 묶음 안의 부르기는 함께 돈다(차례를 보장하지 않는다). 성공과 실패가 섞이면 응답은 207이고, 기기에서는 부른 것마다 따로 끝난다(fetch 어댑터·Fastify 어댑터 둘 다).
    - tRPC 11.19.0 출력 타입: `{ readonly [key: string]: unknown }`은 기기 쪽 출력 타입에서 `Record<string | number, unknown>`이 된다. 입력 타입은 Zod 입력 타입 그대로다(`z.custom<T>().pipe(…)`면 `T`).
    - Zod 4.6.7 `z.looseObject`: 이름이 `__proto__`인 칸은 출력에서 빠진다(원형은 바뀌지 않는다). 그래서 서버는 그 칸을 저장하지 않는다.
    - Drizzle 1.0.0-rc.5 마이그레이터: 더 새 마이그레이션이 적용된 DB에 직전 판 폴더로 돌려도 "적용할 것 없음"으로 끝난다(오류 없음).

## 건드리지 말 것
- 기기 저장 판 `v: 1`과 `public/theme-init.js`(판을 올리면 저장된 테마를 버린다). `themeSources.test.ts`가 지킨다.
- 바깥 입력 검사 `z.strictObject`(옛 서버가 새 칸을 막는 것이 묶음마다 올리기의 전제다).
- 마이그레이션 `20261029125339_user_settings_nav_home`은 main에 올라간 뒤에는 고치지 않는다(PROTECTED). 올라가기 전에는 위처럼 다시 만들 수 있다.
- `settings.ts`가 `@terra/shared/dashboard`를 가져오지 않는 것(첫 화면 묶음).

## 미검증·TODO·알려진 문제
- 화면을 바꾸지 않았다. 그래서 사진·`web-design-guidelines`·`break-ui`·화면 시험(`pnpm e2e`)은 하지 않았다. `chooseNavigation`·`chooseHome`을 부르는 화면은 W1·W4가 만든다(미실행).
- 브라우저(실제 `localStorage`·`storage` 이벤트·여러 탭)에서는 돌려 보지 않았다. 시험은 node 환경의 흉내다.
- 서버 시험 첫 번째 실행의 실패 1개는 무엇이었는지 모른다(위). 이 가지가 고친 시험 파일들은 따로 여러 번 돌려 모두 통과했다.
- 4KB 상한은 계획대로 Assumed다. 템플릿 규칙으로 저장값이 2바이트까지 늘 수 있는 것은 위 "정한 것"에 적었다.
- DB 시험·손 확인은 PostgreSQL 16에서만 했다. 운영은 18이다(AGENTS.md 6장).
- 기기는 서버 응답을 그대로 믿는다(전과 같다). 더 새 서버가 모르는 테마를 보내는 경우는 이번 범위가 아니다.

## 사용자 결정 대기
- 없음.
