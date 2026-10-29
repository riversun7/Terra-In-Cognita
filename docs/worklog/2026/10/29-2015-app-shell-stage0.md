# 앱 뼈대 0단계: 주소 표·메뉴·홈 카드·처리할 일 계약, 개발 도구 권한, 화면 경로 대조

- 일시: 2026-10-29 20:15 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-app-shell.md`(37, 제안) 1·3·5·6·7·13·14절과 "구현하며 정한 것 (0단계)", ADR `2026-10-29-planet-editor-stage1.md`(38, 제안) 1절, 작업 기록 `29-1700-app-shell-design.md`·`29-1920-planet-editor-decisions.md`·`29-2100-app-shell-stage0-review.md`(검토 반영), 기획 D-6001~D-6038·D-257·D-7009
- 작업 자리: 작업 트리 `.claude/worktrees/app-shell-stage0`, 가지 `work/app-shell-stage0`, main `5b37544`에서 시작했다.

## 한 일
- ADR 37 14절의 0단계 계약을 코드로 만들었다. 줄기 W1~W5가 이 모양을 쓴다.
  - 서버 권한 문장 `home: ["preview", "template"]`·`planetEditor: ["read", "write"]`. dev·admin에게만 준다(기본 거부). 역할 4개마다 시험했다.
  - `packages/shared`
    - `routes.ts`: 주소 표 14줄(ADR 37 1절 11줄 + ADR 38 개발자 영역 3줄). `buildPath`·`matchPath`는 표에서 타입이 나온다(틀린 주소 ID·검색어·매개변수는 타입 오류). 경로 예, 여는 역할(`canOpenRoute`), 가리키는 화면 확인(`isRouteTarget`·`targetPath`).
    - `navigation.ts`: 메뉴 항목 6개, 배치 C·A, 기본 탭, `parseNavigation`(모르는 ID 남기기, 빈 칸 채우기, 겹침 지우기).
    - `dashboard.ts`(진입점 `@terra/shared/dashboard`): 카드 9장(크기·자료 출처), 템플릿 6개, 역할별 기본 카드, `parseHome`, 카드 상태 전송 타입과 `dashboard.cards` 요청·응답 타입.
    - `inbox.ts`(진입점 `@terra/shared/inbox`): 분류 5개와 순위, 종류 표(시안 자료용 8개, 모두 planned), 항목 ID 규칙, `inbox.list`·`summary.get` 요청·응답 타입.
    - `savedId.ts`: 계정·주소에 남는 ID 모양(콘텐츠 ID와 같은 `^[a-z][a-z0-9_]{1,47}$`).
    - `index.ts`는 주소 표·메뉴만 내보낸다. 홈 카드·처리할 일은 진입점이 따로라 첫 화면 묶음에 들어가지 않는다.
  - 서버 `src/spaFallback.ts`: `isPagePath`를 `app.ts`에서 꺼냈다(`app.ts`가 부른다).
  - 서비스 워커 검사: `scripts/pwa-build.mjs`가 `packages/shared/src/routes.ts`를 상대 경로로 읽어(Node 24 타입 지우기) 경로 예 17개를 `ALLOWED_NAVIGATIONS`에 더한다. CI의 `check-pwa.mjs`가 빌드된 `sw.js` 제외 목록에 대 본다.
  - `tokens.css`: "화면 틀"(위 띠·하단 탭·레일·사이드 메뉴·넓은 본문·배지) 블록과 "홈 카드" 블록. 처음 값이고 색은 더하지 않았다.
  - 메시지 키 32개(ko·en 함께, `account_settings` 뒤): `nav_<항목>`·`nav_<항목>_desc` 12개, `template_` 6개, `card_` 9개, `inbox_category_` 5개. 게임 앱 시험이 공용 ID마다 키가 있는지 본다.
- ADR 37(제안)을 고쳤다. 다른 ADR 본문은 건드리지 않았다.
  - 1절 표에 "검색어"·"누가" 칸과 개발자 영역 3줄, 3절 사이드 메뉴 시스템 묶음(설정 · 개발자(dev·admin) · 관리자(admin) · 로그아웃, ADR 38).
  - 기획 6-3~6-5 답에서 나온 후보 15개(저장소 밖 후보 메모, 기획 원본 커밋 e4041f2·이 저장소 미러 755f202 기준. 아래에 절마다 요약)를 넣었다. 확인 표기(Verified·Assumed·Unknown)는 그대로 옮겼다.
    - 1절: `/map` 검색어(`?at=`·`?focus=`)와 사이보그 위치로 열기, 사이보그가 2차맵에 없을 때, `map_planet` 부모 `home`으로 닫기, 한 화면·한 캔버스, 예약 주소(거래창·내 주문·유닛 경매·공성·전투·다시 보기·공유 보고서·`/dev/:tool`·성인 인증 자리), 구독 도우미, 지도 모드와 `setTelemetryView`.
    - 2절: 지도 안 바꾸기(replace), 명령 흐름 시트, 전투 배너 [들어가기].
    - 3절: 지도 안 단추와 1차맵 [임시] 링크 지우는 때, 전투 시작 배너 층. 5절: 지도 층·렌즈는 기기, 핀은 서버. 6절: `maps` 카드.
    - 7절: 처리할 일 예약 ID(`battle_started`·`siege_rsvp_reminder`·`human_poaching`, 포로 `captive_held`·`captive_ransom`, 경매 `unit_auction_outbid`·`unit_auction_won`·`unit_auction_sold`). 코드에 들어간 적 없는 이름이라 지금 바꿨다.
    - 12번 후보의 `/admin/:section`은 ADR 38대로 `/dev/:tool`로 적었다.
  - "결정을 반영할 때 할 일(0단계)"에 한 일을 적고, 끝에 "구현하며 정한 것 (0단계)"를 더했다.

## 정한 것 (ADR 37·계획서가 정하지 않은 것. ADR 37 끝 "구현하며 정한 것 (0단계)"에도 적었다)
- 주소 표 칸: `path`·`search`·`parent`·`frame`(`shown`|`hidden`)·`access`(`everyone`|`dev_admin`|`admin`)·`params`(값 규칙 `id` = 숫자·영문 소문자·`_` 1~64자, `digits` = 숫자 1~16자).
- `matchPath`: 글자 그대로 비교, 끝의 `/` 하나 무시, 왼쪽 조각부터 정적 조각이 이긴다(표 순서와 상관없이). 검색어는 표에 있는 것만, 같은 이름은 처음 것.
- 검색어 읽기·쓰기는 직접 한다. `URLSearchParams`가 `packages/shared` 타입(ES만)에 없다.
- 서버 `isPagePath`가 `/health` 앞머리도 화면으로 보지 않는다(전에는 `/api`·`/ws`만). `/healthz`·`/health/…`는 index.html 대신 404가 된다. 서비스 워커 제외 목록·경로 규칙과 같은 셋이다.
- 메뉴: C 칸에는 지도를 넣지 않는다. 빈 칸 = 그 배치의 기본 탭 → 항목 목록 순서. 사이드 메뉴 상한을 넘으면 모르는 ID부터 뺀다.
- 홈: 카드 크기 처음 값, 자료 출처 칸(서버 카드 4장), ready 자료는 지금 모두 `never`. `cards`가 배열이 아니면 기본, 빈 배열은 그대로, 카드 안의 모르는 칸도 남긴다.
- 처리할 일: 분류 ID `threat`·`money_survival`·`stalled`·`decision`·`done`. 시각은 서버 UTC ms 숫자. 항목 ID 키 1~64자, 하나뿐인 종류는 `all`. 전송 타입의 종류·동작·칸·배지 키는 문자열(더 새 서버). 시안 자료 8종과 동작은 60_UX 3.1의 예만 썼다.
- 디자인 값 처음 값: `--topbar-h` 56px, `--tabbar-h` 64px, `--tabbar-map-size` 60px, `--rail-w` 80px, `--sidebar-w` 272px, `--content-max-wide` 1120px, `--badge-size` 20px, `--card-min` 136px(320px 폭 2열), `--card-row` 128px, `--card-gap` 12px.
- 영어 문구: 카드 "To Do"·"Coming Up"·"Aide's Report", 분류 "Threats"·"Money & Survival"·"Stalled"·"Offers & Decisions"·"Done", 사이보그 한 줄 설명 "Your avatar". W1·W4가 화면에서 `break-ui`로 다시 본다. (검토 반영: "To Do" → "To-dos", "Your avatar" → "Your cyborg body")

## 확인 (Verified: 이 작업 트리, Node 24.22.1, pnpm 11.28.9, PostgreSQL 16 시험 클러스터 `127.0.0.1:55432`)
아래 두 `pnpm check`를 어느 트리에서 돌렸는지(0단계 커밋 `654a01d`~`57ea42d`의 앞인지 뒤인지)는 적지 않았다(Unknown). 검토 반영까지 마친 마지막 트리의 결과는 `29-2100-app-shell-stage0-review.md`에 있다.

| 명령 | 결과 |
|---|---|
| `pnpm check`(두 번째, 부하 평균 3.4~4.6) | 통과: 포맷·린트·타입(전체, 게임 앱 `tsc -b` 포함)·경계·크기·다국어 323개 키·대비 136쌍·콘텐츠 `core@2 (14495d30db2e)`, 시험 파일 115개 통과·6개 건너뜀(DB), 시험 1,044개 통과·40개 건너뜀 |
| `pnpm check`(첫 번째, 부하 평균 약 9.8) | 시험 파일 3개만 5초 시간 초과로 실패했다(`packages/sim` A* 결정성, 서버 행성 굽기 워커, 게임 앱 셰이더 측정 자료). 셋 다 이번에 건드리지 않은 파일이다. 세 파일만 다시 돌리면 시험 36개 모두 통과했다 |
| `TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm exec vitest run apps/server` | 시험 파일 28개, 시험 225개 모두 통과(DB 시험 포함, 건너뜀 없음) |
| `pnpm build`, `node scripts/check-pwa.mjs` | 통과. "sw.js(화면 주소 경로 예 17개를 index.html로 엶)" |
| `node scripts/pwa-build.mjs`를 Node로 바로 가져오기 | `routes.ts`를 경고 없이 읽고 경로 예 17개 + 닮은 경로 5개를 낸다 |
| 첫 화면 JS(빌드한 `index.html`의 모듈 + modulepreload, 파일마다) | 368,388B(gzip -9 합 113,744B, 4파일). AGENTS 6장의 main 값(368,388B)과 같다. 게임 앱이 새 모듈을 아직 가져오지 않는다. 빌드한 JS 어디에도 새 ID(`dev_planet_editor`·`money_survival` 등)가 없다 |
| 새·고친 시험 파일 | `packages/shared` routes 17·navigation 12·dashboard 13·inbox 10, 서버 권한 13(4개 새로)·`spaFallback` 4, `pwa-build` 15(1개 새로), 게임 앱 메시지 키 1. 모두 통과 |

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/auth/permissions.ts`·`permissions.test.ts` | 권한 문장 `home`·`planetEditor`(dev·admin), 역할마다 시험 |
| `packages/shared/src/routes.ts`·`routes.test.ts` | 주소 표와 만들기·맞추기·경로 예·여는 역할. 표 규칙 검사(점·소문자·서버 앞머리·겹침·부모) |
| `packages/shared/src/navigation.ts`·`navigation.test.ts` | 메뉴 항목·배치·기본 탭·`parseNavigation` |
| `packages/shared/src/dashboard.ts`·`dashboard.test.ts` | 카드·크기·템플릿·기본 카드·`parseHome`·카드 상태 타입 |
| `packages/shared/src/inbox.ts`·`inbox.test.ts` | 분류·종류 표·항목 ID·전송 타입 |
| `packages/shared/src/savedId.ts` | 저장되는 ID 모양 하나(서버 입력 검사도 쓴다) |
| `packages/shared/src/index.ts`, `package.json`, `tsconfig.json` | 주소 표·메뉴 내보내기, 진입점 `./dashboard`·`./inbox`, tsconfig 주석(`erasableSyntaxOnly`는 이미 켜져 있었다) |
| `apps/server/src/spaFallback.ts`·`spaFallback.test.ts`, `apps/server/src/app.ts` | `isPagePath`를 꺼내고 주소 표의 모든 경로 예를 함수·실제 서버에 넣어 본다 |
| `scripts/pwa-build.mjs`·`pwa-build.test.mjs`, `scripts/check-pwa.mjs` | 주소 표 경로 예를 서비스 워커 제외 목록에 대 본다 |
| `apps/game/src/styles/tokens.css` | "화면 틀"·"홈 카드" 블록 |
| `apps/game/messages/ko.json`·`en.json`, `apps/game/src/ui/sharedIdMessages.test.ts` | 0단계 메시지 키 자리와 키 빠짐 시험 |
| `docs/adr/2026-10-29-app-shell.md` | 개발자 영역 줄, 후보 15개, 0단계 한 일, 구현하며 정한 것 |
| `docs/worklog/2026/10/29-2015-app-shell-stage0.md`, `docs/WORKLOG.md` | 이 기록, 목차(`pnpm docs:index`) |

## 함께 바꿔야 하는 파일
- main에 합칠 때(통합 세션)
  - PLAN 14장 "화면 흐름·첫 화면" 줄의 "다음은 0단계 코드 → W1~W5"를 "0단계 코드 끝"으로. 다른 줄기가 PLAN을 고치는 중이라 이 가지에서는 고치지 않았다.
  - PROTECTED의 주소 표·계정 ID 줄에 "(0단계 코드와 함께 생긴다)"가 남아 있다. 처리할 일 분류·동작 ID도 나중의 푸시 설정에 남으므로 "계정에 저장되는 ID" 줄에 더할지 본다.
- W1: `shell/menuItems.ts`는 `NAV_ITEM_IDS`마다 주소 ID·`nav_<항목>`·`nav_<항목>_desc`·아이콘을 `satisfies Record<NavItemId, …>`로 적는다. 사이드 메뉴 시스템 묶음의 "개발자" 이름 키는 W1이 `shell_` 자리에 더한다(계획의 메시지 키 자리, ADR 38 화면 쪽은 더하지 않는다). 메뉴 설정을 저장할 때는 읽은 값에 바꾼 칸만 덮어 쓴다(`mergeNavigation`, 검토 반영).
- 화면이 아닌 경로 앞머리(`/api`·`/ws`·`/health`)는 네 곳에 적혀 있다: `apps/server/src/spaFallback.ts`(`NON_PAGE_PREFIXES`), `apps/game/vite.config.ts`(`navigateFallbackDenylist`), `scripts/pwa-build.mjs`(`DENIED_NAVIGATIONS`), `packages/shared/src/routes.test.ts`(`RESERVED_PREFIXES`). 하나를 바꾸면 넷을 함께 고친다.
- `packages/shared/src/routes.ts` ↔ `scripts/pwa-build.mjs`: 서비스 워커 검사가 `routes.ts`를 Node로 바로 읽는다. 그래서 `routes.ts`는 상대 경로의 지울 수 있는 TS 파일(`.ts` 확장자를 적은 것)만 가져온다. 작업공간 꾸러미 이름(`@terra/…`)이나 지울 수 없는 문법을 넣으면 `check-pwa.mjs`·`pwa-build.test.mjs`가 깨진다.
- W2: 서버 Zod 검사가 `SAVED_ID_PATTERN`·`NAV_TAB_SLOTS`·`NAV_MENU_MAX`·`HOME_CARDS_MAX`·`DEFAULT_HOME_TEMPLATE`을 쓴다. 템플릿 저장 규칙은 `rolesAllow(roles, { home: ["template"] })`.
- W3: 시안 자료 권한은 `{ home: ["preview"] }`. 종류 표 8개의 `inbox_<종류>_title`과 동작 이름 키는 W3 자리에 더한다. 기기는 `isRouteTarget`으로 target을 다시 본다.
- W4: 카드 크기·기본값을 바꾸면 `dashboard.ts`와 시험을 함께 고친다(크기는 저장 ID가 아니라 바꿔도 된다). `card_<카드>_empty`는 W4 자리.
- ADR 38 WP-H: `dev`·`dev_planet_editor`·`dev_gpu_bench` 줄을 쓴다. `ADMIN_ONLY_CHUNK` → `DEV_ONLY_CHUNK` 이름 바꾸기는 WP-H가 한다(이 가지는 건드리지 않았다).

## 건드리지 말 것
- 주소 표의 경로(PROTECTED): 바꾸면 옛 경로를 새 경로로 넘긴다. 저장되는 ID(메뉴 항목·카드·템플릿·처리할 일 종류·분류)는 다시 쓰지 않는다.
- `packages/shared`에 지울 수 없는 TS 문법(enum·namespace·생성자 매개변수 속성)과 맨 위에서 부르는 코드를 넣지 않는다. `pwa-build.mjs`가 Node로 바로 읽고, 묶음은 `sideEffects: false`다.
- `index.ts`에서 `dashboard.ts`·`inbox.ts`를 내보내지 않는다(첫 화면 묶음).

## 미검증·TODO·알려진 문제
- 게임 앱 화면은 아직 이 모듈을 쓰지 않는다(W1~W4). 그래서 디자인 값·영어 문구는 화면에서 본 적이 없다(미실행).
- 단위 시험 3개(위)는 부하가 클 때(부하 평균 약 9.8) 5초 기본 시간 상한에 걸렸다. 이번 변경과 상관없고 부하가 낮을 때는 통과했다. 다른 줄기와 함께 돌 때 또 걸릴 수 있다. 시간 상한을 늘릴지는 그 파일 주인이 본다.
- 공유 보고서 토큰(ADR 35 "URL 문자 22자", base64url로 보임 — Assumed)은 매개변수 값 규칙(소문자)과 맞지 않는다. 6-4에서 토큰 글자를 정할 때 본다(ADR 37 1절).
- 전투 주소의 부모(`map?focus=battle:<ID>`)는 부모에 검색어가 붙는 첫 경우다. 주소 표의 `parent`는 지금 주소 ID만 받는다. 6-4에서 넓힌다.
- `human_poaching` 분류(위협)는 Assumed다. 기획(D-257)은 위협 또는 제안·결정으로 열어 두었다.
- DB 시험은 PostgreSQL 16 시험 클러스터에서만 돌렸다. 운영 대상은 18이다(AGENTS.md 6장). 0단계는 DB 표를 바꾸지 않았다.

## 사용자 결정 대기
- 없음.
