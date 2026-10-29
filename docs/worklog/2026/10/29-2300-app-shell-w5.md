# 앱 뼈대 W5: 화면 시험 틀(e2e/)과 첫 화면 JS 크기 검사

- 일시: 2026-10-29 23:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-app-shell.md`(37, 제안) 11절·13절·[결정 3]·"구현하며 정한 것 (0단계)", 계획의 W5 줄기(저장소 밖 계획 파일), 작업 기록 `29-2015-app-shell-stage0.md`·`29-2100-app-shell-stage0-review.md`, ADR `2026-10-28-dev-workflow.md`(야간 E2E는 ADR 37이 대체)
- 작업 자리: 작업 트리 `.claude/worktrees/app-shell-w5`, 가지 `work/app-shell-w5`, main `507e645`에서 시작했다.

## 한 일
- 화면 시험 틀 `e2e/`를 만들었다. `@playwright/test` 1.63.0을 루트 개발 의존성으로 정확히 고정했다(새 런타임 의존성 없음). CI에서는 돌리지 않는다([결정 3]).
  - 실행: `TEST_DATABASE_URL=postgres://… pnpm e2e [시험 파일·--grep …]`(= `playwright test -c e2e/playwright.config.ts`).
  - 전역 준비 `e2e/global-setup.ts`
    1. 앞 실행이 정리하지 못한 서버·DB·임시 폴더를 정리한다(실행 기록 파일).
    2. 브라우저를 한 번 띄워 본다. 개발 환경의 Chromium(`PLAYWRIGHT_BROWSERS_PATH`)만 쓰고 내려받지 않는다.
    3. 빌드 결과가 없거나 소스보다 오래되었으면 `pnpm build`(이 기계에서 약 17초).
    4. 새 DB `terra_e2e_<무작위>` → `dist/migrate.js` → 가짜 계정 player·admin(`dist/cli.js create-user`, 실행마다 무작위 비밀번호).
    5. 빌드한 서버(`dist/main.js`): `NODE_ENV` 비움, `STATIC_DIR=apps/game/dist`, 127.0.0.1의 빈 포트(4400~4599), `BETTER_AUTH_URL` = 그 주소.
    6. 계정마다 API로 한 번 들어가 세션 파일을 남긴다. 콘텐츠 팩 행성이 준비될 때까지 기다린다.
    7. 돌려주는 함수가 정리다: 서버 끄기, DB 지우기, 서버 기록을 `e2e/test-results/server.log`로 옮기기.
  - 도우미 `e2e/helpers/`
    - `test.ts`: 시험 파일이 쓰는 `test`·`expect`. 선택 `account`·`theme`·`language`, 고정 `baseURL`·`deviceErrors`, 두 번째 기기용 `deviceOptions`·`watchDeviceErrors`. 머리 주석이 시험 쓰는 법이다(AGENTS.md 7장이 가리킨다).
    - `auth.ts`: `login()`(로그인 화면의 칸 이름 `username`·`password`로 들어간다).
    - `screen.ts`: `horizontalOverflow()`(가로 넘침), `smallTapTargets()`(44px보다 작은 누르는 곳), `shot()`(사진, 폴더는 `E2E_SHOTS_DIR`).
    - `viewports.ts`: 기본 `phone` 390×844(DPR 3, 터치), `phoneLandscape` 844×390, `tablet` 820×1180, `desktop` 1440×900.
    - `harness.ts`: 전역 준비가 시험 작업자에 넘기는 값(환경 변수 `E2E_HARNESS`).
  - `e2e/smoke.spec.ts`: 화면 문구가 아니라 바뀌지 않는 것만 본다. 로그인 뒤 주소 `/`, `main` 표지 하나, 기기 오류 없음. 화면에서 로그인(player)과 저장한 세션(admin) 두 시험이다.
- 첫 화면 JS 크기 검사 `scripts/check-bundle.mjs`와 시험 `scripts/check-bundle.test.mjs`(9개)를 만들었다.
  - 첫 화면 JS = 빌드한 `index.html`의 모듈 스크립트 + `modulepreload` 조각, 파일마다 gzip 9단계 크기의 합(ADR 11절).
  - 상한은 `apps/game/bundle-budget.json` 한 곳(`firstScreenJsGzipBytes` 136,000).
  - `pnpm check:bundle`. CI는 빌드·PWA 검사 다음 한 단계로 돈다.
- 루트 `package.json`: `e2e`·`check:bundle` 명령, `typecheck`에 `tsc -p e2e/tsconfig.json`, `lint` 대상에 `e2e`.
- AGENTS.md 7장 명령 표에 두 줄(`pnpm check:bundle`, `pnpm e2e`)을 더했다. 다른 줄은 건드리지 않았다.

## 정한 것 (ADR 37·계획이 정하지 않은 것. 통합 세션이 ADR "구현하며 정한 것"으로 옮긴다)
- 크기 검사
  - gzip은 Node 내장 zlib level 9다. GNU `gzip -9`와 결과가 조금 다르다(main `507e645`: zlib 114,171 B, `gzip -9` 113,744 B, 427 B·0.4% 차이). 0단계 기록의 113,744 B는 GNU `gzip -9` 값과 같다(Verified: 같은 파일 4개를 다시 쟀다). ADR 37 11절·ADR S2의 115,427 B(옛 빌드 372,600 B)는 Python `gzip` 9단계(zlib 1.3) 값이다. 같은 빌드를 검사(Node zlib)로 재면 115,550 B다(Verified: 검토 고침에서 남아 있던 그 빌드를 다시 쟀다, `30-0045-app-shell-w5-review.md`). 앞으로는 `pnpm check:bundle`이 찍는 값을 적는다.
  - 상한 136,000 B는 ADR 11절 처음 값 그대로다(지금 main보다 21,829 B 여유). W1을 합칠 때 통합 세션이 W1 잰 값 + 8,000 B로 다시 정한다.
  - 모듈이 아닌 스크립트(`theme-init.js` 2,211 B)와 지연 로딩 조각은 넣지 않는다(정의가 "모듈 + modulepreload"다).
  - 빠진 파일, 다른 출처 스크립트, 모듈 스크립트가 없는 `index.html`은 실패로 본다(0바이트로 통과하지 않게).
- 시험 틀 설정: 작업자 1개(서버·DB·계정을 함께 쓰고 시험이 계정 설정을 바꾼다), 다시 시도 없음, 시험 하나 60초·`expect` 10초, 실패한 시험만 trace·사진.
- 세션: 전역 준비가 API(`/api/account/enter`, `origin` 머리글 = 서버 주소)로 한 번 들어가 저장하고, 시험은 `test.use({ account })`로 쓴다.
  - 까닭: 들어가기 시도 제한이 아이디마다 15분에 10번, 주소마다 분당 10번이다(`apps/server/src/auth/limits.ts`, 서버를 켤 때마다 처음부터).
  - 세션은 시험끼리 함께 쓰므로, 로그아웃하는 시험은 `login()`으로 새 세션을 만든다.
- 설정 미리 넣기(테마·언어, 검토 고침에서 메뉴·홈을 더함): 맥락을 만들 때 `storageState`의 localStorage(`terra.settings` 판 1, `PARAGLIDE_LOCALE`)로 한 번만 넣는다. 시험 안에서 바꾼 값은 새로고침해도 남는다.
  - "로그인 전에 고른 값"(`pending.<묶음>.by: null`)으로 표시한다. 그래서 로그인할 때 기기 값이 계정에 올라가 시험마다 계정 설정이 되돌아간다(`apps/game/src/settings/syncRules.ts` 규칙 1).
  - 기본은 파스텔·ko·`{}`·`{}`다(메뉴·홈은 W2가 합쳐진 뒤부터 효과). `null`이면 넣지 않고, 그 묶음은 앞 시험이 계정에 남긴 값이 온다. 브라우저 언어(`locale`)도 맞춘다(ko-KR·en-US).
- 기기 오류 = 잡히지 않은 오류(`weberror`, 거부된 약속 포함) + `console.error` + 오류 보고(`/api/telemetry/errors`) 전송. 자동으로 실패시키지 않고 보는 시험이 `expect(deviceErrors).toEqual([])`로 본다(일부러 오류를 내는 시험이 있을 수 있다).
- 빌드 확인은 수정 시각 비교다. `apps/game`·`apps/server`·`packages`·`pnpm-lock.yaml`의 git 파일 목록(새 파일 포함, 시험·문서·`apps/server/drizzle` 제외) 중 하나라도 빌드 결과 4개(`index.html`, `main.js`, `migrate.js`, `cli.js`) 중 가장 오래된 것보다 새면 다시 빌드한다.
- 행성: 서버는 켤 때 콘텐츠 팩 행성을 뒤에서 굽는다. 시험이 짧으면 굽기가 끝나기 전에 서버를 꺼서 캐시가 남지 않고 CPU만 쓴다(Verified: 첫 실행 서버 기록에 "planet ready"가 없고 캐시 폴더도 없었다).
  - 그래서 전역 준비가 목록 정보(`/api/planets/<ID>`)의 `status`가 `ready`가 될 때까지 기다린다. 첫 실행 굽기 28.3초(부하 평균 약 18), 그 뒤에는 캐시라 0.0초.
  - 180초를 넘으면 알리고 계속한다(지도가 아닌 시험까지 막지 않는다).
- 중단된 실행: 실행 기록 파일 `/tmp/terra-e2e-run-<작업 트리 경로 해시>.json`(실행기·서버의 번호와 시작 시각, DB 이름, 임시 폴더)을 남기고 정리 끝에 지운다. 다음 실행이 처음에 남은 것을 정리한다.
  - 검토 고침에서 바꾼 것: 같은 작업 트리의 다른 실행은 설정 파일을 읽을 때 잡는 잠금(`/tmp/terra-e2e-lock-<해시>.json`)이 막는다. 프로세스는 번호와 시작 시각으로 가린다. SIGTERM·SIGHUP을 받으면 서버를 바로 끈다(`30-0045-app-shell-w5-review.md`).
- pg는 `apps/server` 꾸러미의 것을 `createRequire`로 쓴다(루트에 의존성을 더하지 않았다).
- 서버 포트 4400~4599 중 빈 포트를 고른다(`E2E_PORT`로 정할 수 있다). 여러 작업 트리가 함께 돌려도 겹치지 않게 하려는 것이다.

## 확인 (Verified: 이 작업 트리, Node 24.22.1, pnpm 11.28.9, `@playwright/test` 1.63.0 + Chromium 153.0.8010.12(chromium-1243, `/opt/pw-browsers`), PostgreSQL 16 `127.0.0.1:55432`)
| 명령 | 결과 |
|---|---|
| `node scripts/check-bundle.mjs`(main `507e645` 빌드) | 통과. 첫 화면 JS 114,171 B(파일 4개, 원본 368,388 B) / 상한 136,000 B, 남음 21,829 B. `index` 81,999 B, `json` 1,416 B, `useMountFocus` 4,781 B, `reporter` 25,975 B |
| 같은 빌드, 상한 114,170 B 파일(`--budget`) | 코드 1, "상한을 넘었습니다: 114,171 B > 114,170 B (+1 B…)" |
| 빌드 없는 폴더 | 코드 1, "빌드 결과가 없습니다" |
| `pnpm exec vitest run scripts/check-bundle.test.mjs` | 9개 통과 |
| `TEST_DATABASE_URL=… pnpm e2e`(첫 실행, 빌드가 오래되어 다시 빌드) | 2개 통과, 22초 |
| 같은 명령(두 번째, 빌드 최신) | 2개 통과, 15초 |
| 같은 명령(행성 기다림을 넣은 뒤, 캐시 없음 → 굽기) | 통과, 굽기 28.3초 뒤 캐시 생김 |
| 대조 시험(저장소 밖으로 옮김, 커밋하지 않음) | 6개 통과: 기기 오류 3갈래(console·잡히지 않은 오류·거부된 약속, 오류 보고 전송 2번)를 잡음, 다크·영어 미리 넣기가 새로고침 뒤에도 남음, 넘침 검사가 3000px 상자를 찾음, 누르는 곳 검사가 20×20px 링크를 찾음, 두 번째 기기 맥락(`deviceOptions`)·`login()` |
| 실행기를 SIGKILL로 끊기(내가 띄운 세션만) | 남은 것: 서버(살아 있음), DB, 임시 폴더, 실행 기록. 다음 `pnpm e2e`가 "앞 실행이 남긴 것을 정리했습니다(서버 pid 31386, DB terra_e2e_5b83ad45)"를 찍고 2개 통과, 끝난 뒤 서버·DB·임시 폴더·실행 기록 0개 |
| Ctrl+C(SIGINT)로 끊기 | 서버는 남지 않았다. DB·임시 폴더가 남았다(정리 기능을 넣기 전이라 손으로 지웠다). 검토 고침에서 다시 해 보니 실행기만·무리 전체 모두 남은 것이 없었다 |
| `pnpm check`(마지막 트리, 부하 평균 9~12, 130초) | 통과: 포맷·린트(`e2e` 포함)·타입(`tsc -p e2e/tsconfig.json` 포함)·경계·크기·다국어 325개 키·대비 136쌍·콘텐츠 `core@2 (14495d30db2e)`, 시험 파일 133개 통과·6개 건너뜀(DB), 시험 1,243개 통과·40개 건너뜀 |
| `TEST_DATABASE_URL=… pnpm e2e`(마지막, 커밋할 파일만) | 2개 통과, 14초(서버 뜨기 1.8초, 행성 캐시 0.1초). 끝난 뒤 이 작업 트리의 서버·`terra_e2e_` DB·임시 폴더 0개 |
| 사진 도우미(임시 시험, 커밋하지 않음, 390×844 DPR 3) | 4개 통과, 기기 오류 없음. 파스텔·다크 × 로그인 화면·로그인한 첫 화면 사진(아래 "사진") |

## 통과 기준 (계획의 W5)
| # | 기준 | 결과 | 근거 |
|---|---|---|---|
| 1 | `TEST_DATABASE_URL=… pnpm e2e`가 smoke를 통과한다 | 충족 | 위 표: 여러 번 2개 통과(새 빌드·최신 빌드·굽기·앞 실행 정리 뒤) |
| 2 | 크기 검사가 지금 main에서 통과하고, 상한을 낮추면 실패한다(시험) | 충족 | main 114,171 B ≤ 136,000 B 통과, 114,170 B로 낮추면 코드 1. `check-bundle.test.mjs`가 명령줄을 상한 = 합(코드 0)·합 − 1(코드 1)로 돌려 본다 |
| 3 | CI에서 Playwright를 돌리지 않는다. 화면 시험 워크플로를 만들지 않는다. 크기 검사만 CI에 넣는다 | 충족 | `ci.yml`은 `pnpm check:bundle` 한 단계만 더했다. 새 워크플로 없음. `pnpm check`에는 e2e 타입 검사·린트만 들어가고 브라우저는 띄우지 않는다 |
| 4 | 브라우저를 내려받는 단계가 없다. `@playwright/test` 1.63.0 고정 | 충족 | `package.json` `"@playwright/test": "1.63.0"`(잠금 파일 3개 꾸러미). `@playwright/test`·`playwright`·`playwright-core` 1.63.0에 설치 스크립트가 없다. 전역 준비는 띄워 보기만 하고, 없으면 `PLAYWRIGHT_BROWSERS_PATH`를 보라고 알린다 |
| 공통 | `pnpm check` 통과, 작업 기록 1개 + `pnpm docs:index`, 새 런타임 의존성 없음 | 충족 | 위 표 `pnpm check`. 이 기록과 목차. 더한 것은 개발 의존성 하나(`@playwright/test`) |
| 공통 | 화면을 바꿨으면 사진·`web-design-guidelines`·`break-ui` | 해당 없음 | 게임 앱 화면을 바꾸지 않았다. 사진 도우미 확인용으로 파스텔·다크 사진을 찍었다(저장소 밖, 아래) |

## 사진 (저장소 밖, 세션 임시 폴더 `shell-w5/shots/`)
- 파스텔: `w5-login-pastel-ko-390.png`(로그인 화면), `w5-home-pastel-ko-390.png`(player 첫 화면)
- 다크: `w5-login-dark-ko-390.png`, `w5-home-dark-ko-390.png`
- 대조 시험: `scratch-dark-en-390.png`(admin, 다크·영어), `scratch-desktop.png`(1440×900 로그인 화면)
- 게임 앱 화면은 바꾸지 않았다. 사진은 도우미(`shot()`)와 테마·언어 미리 넣기가 되는지 본 것이다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `e2e/playwright.config.ts` | 시험 설정(Chromium 하나, 기본 휴대폰 세로, 작업자 1, 다시 시도 없음) |
| `e2e/global-setup.ts` | 빌드 확인 → 새 DB → 마이그레이션 → 가짜 계정 → 빌드한 서버 → 세션 → 행성 기다림, 정리, 앞 실행 정리 |
| `e2e/helpers/test.ts`·`auth.ts`·`screen.ts`·`viewports.ts`·`harness.ts` | 시험 도우미(위 "한 일") |
| `e2e/smoke.spec.ts` | 바뀌지 않는 것만 보는 시험 2개 |
| `e2e/tsconfig.json` | 루트 `typecheck`가 `tsc -p e2e/tsconfig.json`으로 본다(DOM 타입 포함: `page.evaluate` 안은 브라우저) |
| `scripts/check-bundle.mjs`·`check-bundle.test.mjs` | 첫 화면 JS 크기 검사와 시험 |
| `apps/game/bundle-budget.json` | 첫 화면 JS 상한 한 곳(136,000 B) |
| `package.json`, `pnpm-lock.yaml` | `@playwright/test` 1.63.0 개발 의존성, `e2e`·`check:bundle` 명령, `typecheck`·`lint`에 `e2e` |
| `.github/workflows/ci.yml` | 빌드·PWA 검사 다음에 `pnpm check:bundle` |
| `AGENTS.md` | 7장 명령 표 두 줄 |
| `docs/worklog/2026/10/29-2300-app-shell-w5.md`, `docs/WORKLOG.md` | 이 기록, 목차(`pnpm docs:index`) |

## 함께 바꿔야 하는 파일
- W1·W3·W4(꽂는 줄 없음): 화면 시험은 새 파일 `e2e/<줄기>.spec.ts`(`shell`·`inbox`·`home`)에 쓰고, `e2e/helpers/test.ts`에서 `test`·`expect`를 가져온다. W5 파일은 고치지 않는다. 결과(통과·실패, 잰 값)는 각 작업 기록에 남긴다.
  - 도우미가 더 필요하면 그 줄기 시험 파일 안에 둔다. 여럿이 같이 쓸 것은 합친 뒤 통합 세션이 `e2e/helpers/`로 옮긴다.
- W1: 합치기 전에 `pnpm check:bundle` 값을 작업 기록에 적는다. 통합 세션이 그 값 + 8,000 B로 `apps/game/bundle-budget.json`을 고친다.
- 통합 세션
  - `.github/dependabot.yml`의 `ignore`에 `@playwright/test`를 더했다(검토 고침 `f5b7ceb`, 이 가지에 있다. 다시 넣지 않는다). 묶음 PR이 1.64.x로 올리면 chromium-1248이 필요해 화면 시험이 깨진다. 판은 개발 환경 브라우저와 함께 손으로 올린다.
  - ADR 37 "구현하며 정한 것"에 위 "정한 것"을 옮긴다. ADR 37 11절의 "115,427"은 검사(Node zlib)와 잰 도구가 다르다는 것도 적는다(113,744는 GNU `gzip -9`, 115,427은 Python `gzip` 9. 검토 고침 기록의 표).
  - AGENTS.md 6장 후보(이 가지는 7장 두 줄만 고쳤다. 2026-10-29 확인)
    - Playwright 1.63: 전역 준비에서 넣은 `process.env`는 시험 작업자에 간다. 전역 준비가 함수를 돌려주면 전역 정리로 쓴다. 실행기가 SIGKILL로 끝나면 정리는 돌지 않는다. SIGTERM·SIGHUP도 Node 기본 동작으로는 돌지 않는다(전역 준비가 받아 서버를 끈다, 검토 고침).
    - Playwright 1.63: `context.on("request")`는 `navigator.sendBeacon` 요청도 잡지만 본문(Blob)은 `postData()`·`postDataBuffer()`가 비어 있었다.
    - Node 24.22.1 zlib level 9와 GNU `gzip -9`는 같은 파일에도 크기가 다르다(위 427 B).
    - oxlint 1.89.0 `no-empty-pattern`(correctness, 오류)이 Playwright 고정물 `async ({}, use) =>`를 잡는다. Playwright는 첫 인자 구조 분해로 기대는 고정물을 읽어서 `{}`가 필요하다 → 그 줄만 `oxlint-disable-next-line no-empty-pattern`.
    - 앱 CSS가 `button`에 최소 크기(누르는 곳)를 준다. 그래서 대조용 작은 단추는 `min-width`·`min-height`를 0으로 덮어야 작아진다.
    - pnpm 11.28.9 + lefthook: 커밋 전 훅의 `pnpm exec`가 `package.json`과 설치 상태가 다르면 설치를 다시 돌린다. `package.json`을 나눠 커밋하려고 의존성 줄을 뺀 중간 판을 두었더니 `node_modules`에서 그 꾸러미를 지우고 `pnpm-lock.yaml`도 되돌렸다(이 작업에서 겪음, `pnpm install --no-frozen-lockfile`로 같은 무결성 값으로 되살림). 의존성 줄과 잠금 파일은 같은 커밋에 넣는다.

## 건드리지 말 것
- `e2e/smoke.spec.ts`는 바뀌지 않는 것만 본다(주소 `/`, `main` 하나, 기기 오류 없음). 화면 문구·배치 시험은 각 줄기 파일에 둔다.
- `@playwright/test` 판은 개발 환경 브라우저 판(chromium-1243)과 함께만 바꾼다. 브라우저 내려받기(`playwright install`) 단계를 두지 않는다.
- 화면 시험은 CI 밖이다([결정 3]). CI에는 크기 검사만 있다.

## 미검증·TODO·알려진 문제
- 미실행 갈래: `E2E_PORT`로 포트를 정하기, git이 없을 때의 빌드 확인(결과가 있는지만 본다), 행성 기다림 180초 넘김, 서버가 뜨지 않을 때의 기록 끝 줄 안내.
- Ctrl+C로 끊었을 때 DB·임시 폴더가 남은 까닭은 모른다(Unknown, 그때 코드에서만 겪었다). 검토 고침에서는 SIGINT(실행기만·무리 전체)가 정리를 끝까지 돌렸다(Verified). 남은 것은 다음 실행이 정리한다.
- 첫 화면 JS 상한 136,000 B은 처음 값이다(Assumed, ADR 11절). W1 뒤 다시 정한다.
- 시험 시간은 공유 기계(4 vCPU, 부하 평균 2.5~21)에서 잰 값이라 흔들린다.
- 사진 비교(눈으로 보는 확인)는 이 줄기 범위가 아니다. 사진 도우미만 확인했다.

## 사용자 결정 대기
- 없음.
