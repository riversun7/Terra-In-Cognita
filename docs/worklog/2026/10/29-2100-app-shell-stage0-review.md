# 앱 뼈대 0단계 검토 반영: 주소 표 타입·값 규칙, 부모 화면·검색어 바꾸기, 설정 쓰기 도우미, 완료 종류, ADR 37 문장

- 일시: 2026-10-29 21:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-app-shell.md`(37, 제안) 1·2·3·4·5·6·7·13절과 "결정을 반영할 때 할 일"·"구현하며 정한 것 (0단계)", 작업 기록 `29-2015-app-shell-stage0.md`(검토한 0단계), ADR `2026-10-29-planet-editor-stage1.md`(38) 1절, `2026-10-29-combat-map-instances.md`(35) 질문 35·47, 기획 D-6006·D-6015·D-6023·D-6029·D-6033·D-6038·D-187·D-244·D-257·D-7009
- 작업 자리: 0단계와 같은 작업 트리·가지(`work/app-shell-stage0`). 0단계 끝 커밋 `57ea42d` 위에서 고쳤다.

## 한 일
- 0단계 검토 지적 29개를 다시 확인했다(파일 읽기, 시험 코드 컴파일, Node로 직접 실행). 큰 것 1개와 분명히 맞는 작은 것은 고쳤다. 지적의 고침 안 가운데 맞지 않는 부분 2개는 다르게 고쳤다(아래 "고침 안과 다르게 한 것").
- `packages/shared`
  - `routes.ts`
    - 검색어 타입이 `string | undefined`를 받는다. `exactOptionalPropertyTypes`라서 지금 주소에서 읽은 값을 넘기면 TS2375였다(Verified: 시험 코드 컴파일).
    - `digits` 값: 0 또는 0으로 시작하지 않는 10진수, 안전 정수(2^53 − 1) 이하. `/x/007`과 `/x/7`이 한 화면을 두 주소로 가리키지 않는다.
    - `isRouteTarget`·`buildPath`·`targetPath`는 자기 칸만 읽고, 값·`params`·`search`는 배열이 아닌 객체여야 한다(전에는 원형의 `route`, 배열 `search`, 문자열 `params`를 받았다. Verified: Node 실행). 표에 없는 칸은 받되 무시한다.
    - `parentTarget(match)`: 바로 연 주소에서 화면 안 [뒤로]가 갈 부모 화면. 부모 경로의 매개변수는 자식 주소의 같은 이름 값을 쓴다. 표 규칙 시험에 "부모의 매개변수는 모두 자식 경로에 같은 이름·같은 값 규칙으로 있다"를 더했다.
    - `replaceSearch(url, changes)`: 바꾼 검색어만 고치고 경로·#조각·다른 검색어는 글자 그대로 둔다("모르는 검색어는 무시하되 지우지 않는다").
    - `buildPath` 주석: 주소 ID가 합(union) 타입이면 검색어·매개변수 타입이 맞지 않으므로 값으로 정해지는 곳은 `RouteTarget`·`targetPath`를 쓴다.
  - `navigation.ts`: `visibleTabs`(모르는 ID 칸을 기본 탭으로 채워 보이기, 저장값은 그대로), `mergeNavigation`(원래 값에 바꾼 칸만 덮어쓰기), `parseMenu` 선형 시간.
  - `dashboard.ts`: `parseHome`(아는 카드의 크기가 없거나 문자열이 아니면 기본 크기, 비지 않은 목록에 남는 카드가 없으면 역할의 기본 카드), `mergeHome`.
  - `inbox.ts`: `craft_done`을 묶지 않는다(완료 항목 ID는 사건 ID). 바로 처리 0개의 근거를 기술 해석으로 고쳐 적었다(D-6015는 1~2개).
  - 시험: 매개변수 주소의 타입 오류(시험용 표의 타입 있는 만들기 함수), `undefined` 검색어, `digits` 경계(셀 키 16자리, 안전 정수 넘음, 앞의 0), 자기 칸, 부모 화면, 검색어 바꾸기, `visibleTabs`, `mergeNavigation`·`mergeHome`, 긴 메뉴 목록, 완료 종류 묶지 않기.
- 서버 `spaFallback.ts` 주석: 서버와 서비스 워커는 앞머리 셋만 같고 맞추는 법이 다르다(서버는 글자 앞부분, 서비스 워커는 조각 단위). 같은 앞머리가 적힌 네 곳을 적었다.
- 영어 문구 2개: `card_inbox` "To-dos"(nav_home_desc와 같은 말), `nav_cyborg_desc` "Your cyborg body".
- ADR 37(제안) 본문: 코드와 어긋난 문장, 기획에 없는 뜻·빠진 확인 표기, 커밋 표기(원본·미러), 주소 예약 정리(`/map/:mapKey` 지움, 개발자 도구는 정적 줄), 권한 없음 줄·화면 시험에 `/dev`, "남은 것"을 고쳤다. "구현하며 정한 것"에 바뀐 모양을 합쳐 적었다. 다른 ADR 본문은 건드리지 않았다.
- 작업 기록 `29-2015-app-shell-stage0.md`: 작업 도구 칸(`Claude Code`만), `dashboard.cards` 타입이 있는 파일, 검사를 돌린 작업 트리, 함께 바꿔야 하는 파일 두 쌍, "개발자" 이름 키 주인(W1), PostgreSQL 16 시험.

## 지적별 처리
번호는 검토 지적 목록의 차례다.

| # | 지적(무게) | 처리 | 커밋 |
|---|---|---|---|
| 1 | 검색어 타입이 `undefined`를 안 받음(minor) | 고침. 타입이 `string \| undefined`를 받고 컴파일 시험 줄을 더했다 | `0d630ff` |
| 2 | 매개변수 주소의 타입 회귀 시험 없음(minor) | 고침. 시험용 표의 타입 있는 만들기 함수와 `@ts-expect-error` 8줄(params 빠짐·cityId 빠짐·남는 칸·이름 오타·검색어 오타·params 없는 target 등) | `0d630ff` |
| 3 | 매개변수 있는 부모 주소를 만드는 규칙 없음(minor) | 고침. 표 규칙 + `parentTarget`·`parentTargetIn` + 시험용 표의 `/economy/market/:itemId` 줄 | `26bae3e` |
| 4 | `craft_done`이 묶는 종류(minor) | 고침. `grouped: false`와 "완료는 묶지 않는다" 표 시험 | `c1082fe` |
| 5 | 모르는 검색어·설정 칸을 남기는 쓰기 도우미 없음(minor) | 고침. `replaceSearch`, `mergeNavigation`, `mergeHome`과 시험 | `26bae3e`, `e0aa68b` |
| 6 | 합 타입 주소 ID가 모든 검색어를 받음(nit) | 주석으로 고침(타입으로 막지 않음, 아래) | `0d630ff` |
| 7 | 모르는 ID가 탭 칸을 모두 채움, `parseMenu` 이차 시간(nit) | 고침. `visibleTabs`, `parseMenu`를 Set으로 | `e0aa68b` |
| 8 | `/health` 바꿈의 "같은 셋" 표현(nit) | 고침. 주석과 ADR | `e4bbe17`, `f67efd8` |
| 9 | `parseHome`이 크기가 문자열이 아닌 아는 카드를 버림(nit) | 고침. 기본 크기로 읽고, 남는 카드가 없으면 기본 카드 | `e0aa68b` |
| 10 | `isRouteTarget`이 원형 칸·배열을 받음(nit) | 고침 | `0d630ff` |
| 11 | 매개변수 값 규칙(nit) | 일부 고침. 앞의 0·안전 정수는 고치고, 15자리 상한은 하지 않았다(아래). `/dev/:tool`은 정적 줄로 정했다 | `0d630ff`, `f67efd8` |
| 12 | 영어 이름 두 갈래(nit) | 고침 | `e2f339b` |
| 13 | 작업 기록 틀린 곳(nit) | 고침 | 이 기록의 커밋 |
| 14 | ADR 본문이 코드·D-6015와 어긋남(major) | 고침. 검토한 판의 264·209·95·100줄, 구현하며 정한 것, `inbox.ts` 주석 | `f67efd8`, `c1082fe` |
| 15 | 처리할 일 예약 뜻(minor) | 고침. `captive_held`, `battle_started`·`siege_rsvp_reminder` 표기, `convoy_raided`와 나눔, `siege_declared` 이동 화면 | `f67efd8` |
| 16 | `/dev`가 권한 없음 줄·화면 시험에 없음(minor) | 고침(ADR). 계획 파일의 W1 기준은 저장소 밖이라 고치지 않았다(통합 세션 몫) | `f67efd8` |
| 17 | 원본·미러 커밋 표기(minor) | 고침 | `f67efd8` |
| 18 | "남은 것"이 모자람(minor) | 고침. PROTECTED 두 줄, 기획에 물을 두 가지 | `f67efd8` |
| 19 | 서버·서비스 워커 맞추는 법(minor) | 고침. ADR, 주석, 0단계 기록의 함께 바꿀 파일 | `f67efd8`, `e4bbe17` |
| 20 | 공유 보고서가 ADR 35 질문 35에 달림(minor) | 고침 | `f67efd8` |
| 21 | `/map/:mapKey`와 `?at=` 겹침(minor) | 고침. `/map/:mapKey` 예약을 지우고 `?at=` 하나, 디바운스, `replaceSearch` | `f67efd8` |
| 22 | 작업 기록 타입 위치·검사 표·짝 파일·주인·PG16(minor) | 고침 | 이 기록의 커밋 |
| 23 | 작업 도구 칸(nit) | 고침. 목차도 다시 만들었다 | 이 기록의 커밋 |
| 24 | `map_planet` 부모 이유(nit) | 고침 | `f67efd8` |
| 25 | 틀을 숨긴 화면의 연결 줄(nit) | 고침. 틀을 숨긴 화면에서는 화면 맨 위 전역 층(해석) | `f67efd8` |
| 26 | 따라갈 수 없는 출처(nit) | 고침 | `f67efd8` |
| 27 | 빠진 확인 표기(nit) | 고침 | `f67efd8` |
| 28 | uuid 매개변수(nit) | 고침. ADR, `routes.ts`·`inbox.ts` 주석 | `f67efd8`, `0d630ff`, `c1082fe` |
| 29 | 말 다듬기(nit) | 고침 | `f67efd8` |

## 고침 안과 다르게 한 것 (근거)
- 지적 11의 `digits` 상한 `^(0|[1-9][0-9]{0,14})$`(15자리)는 쓰지 않았다. 셀 키(2차맵 키)가 16자리까지 가기 때문이다. `MAX_CELL_KEY` = 6 × 2^49 − 10 = 3,377,699,720,527,862(Verified: `packages/planet/src/cellKey.ts`). 그래서 `^(?:0|[1-9][0-9]{0,15})$`에 `Number.isSafeInteger`를 더했다. 시험이 이 값과 `Number.MAX_SAFE_INTEGER`를 받고 9007199254740992를 막는지 본다.
- 지적 6의 "합 타입이면 막기"는 하지 않고 주석만 적었다. 막는 두 모양(인자를 `never`로, 나머지 인자를 `[never]`로)을 TS 7.0.2로 컴파일해 보니 합 타입은 막혔지만, Id를 받아 그대로 넘기는 제네릭 감싸기 함수도 TS2345로 막혔다(Verified: 저장소 밖 시험 코드). W1의 `AppLink` 같은 감싸기가 막히면 안 된다.

## 정한 것 (ADR 37 "구현하며 정한 것"에도 적었다)
- `/map/:mapKey` 예약을 지웠다. 지도 자리는 `?at=` 하나다(어느 2차맵의 어디인지를 함께 담는다, 모양은 6-3).
- 개발자 도구는 도구마다 정적 줄 `/dev/<도구>`다. 매개변수 줄 `/dev/:tool`은 두지 않는다(값 규칙 `id`가 `-`를 받지 않아 `/dev/planet-editor`와 모양이 갈린다). ADR 38 본문의 "예약: `/dev/:tool`"은 고치지 않았다(다른 줄기의 ADR).
- 틀을 숨긴 화면에서 연결 줄은 화면 맨 위(안전 영역 아래)의 전역 층에 뜬다(해석).
- 바로 처리 0개는 기술 해석이다(완료, 그 화면에서만 처리하는 종류). 그 시스템을 만들 때 다시 본다.

## 확인 (Verified: 이 작업 트리, Node 24.22.1, pnpm 11.28.9)
| 명령 | 결과 |
|---|---|
| `pnpm check`(마지막 커밋 `f67efd8` 트리, 부하 평균 15~24: 다른 줄기의 Chromium·vitest와 함께, 4분 23초) | 포맷·린트·타입(전체, 게임 앱 `tsc -b` 포함)·경계·크기·다국어 323개 키·대비 136쌍·콘텐츠 `core@2 (14495d30db2e)` 통과. 시험은 1,054개 통과·40개 건너뜀(DB), 7개 실패: 시험 파일 5개(`packages/planet` 이웃 전수 비교, 서버 행성 굽기 2개, `packages/engine` 가짜 행성, `packages/sim` A* 해시, 게임 앱 셰이더 측정 자료 2개)가 기본 제한 시간 5초를 넘겼다(5.1~14.6초). 모두 이 가지가 건드리지 않은 파일이다 |
| `pnpm exec vitest run --testTimeout=30000 --hookTimeout=30000`(같은 트리. main `43e24ce`이 `vitest.config.ts`에 넣은 30초와 같은 값, 2분 5초) | 시험 파일 115개 통과·6개 건너뜀(DB), 시험 1,061개 통과·40개 건너뜀. main 위로 옮기면(rebase) `pnpm check`가 이 설정으로 돈다 |
| 고친 시험 파일만(`packages/shared`의 routes·navigation·dashboard·inbox, `apps/server/src/spaFallback.test.ts`, `scripts/pwa-build.test.mjs`, `apps/game/src/ui/sharedIdMessages.test.ts`) | 커밋마다 통과. 마지막 트리에서 routes 25·navigation 16·dashboard 17·inbox 11·spaFallback 4·pwa-build 15·sharedIdMessages 1(모두 89개 통과) |
| `@ts-expect-error` 줄 확인 | 지시문을 지운 사본을 컴파일해 13줄 모두 뜻한 타입 오류(TS2345·TS2322·TS2353·TS2554·TS2741·TS2561)인지 봤다 |
| `parseMenu` 전·후 대조 | 옛 함수와 새 함수를 무작위 입력 2만 건에 넣어 결과가 모두 같았다. 5만 개 목록 약 5ms(옛 함수는 4만 개에 약 2.6초) |
| `node`로 `scripts/pwa-build.mjs` 가져오기 | `routes.ts`를 그대로 읽고 경로 예 17개(전과 같다) |
| 하지 않은 것 | `pnpm build`·`check-pwa.mjs`(경로 예가 전과 글자까지 같아 결과가 바뀔 수 없다), DB 시험(DB 코드를 바꾸지 않았다) |

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/routes.ts`·`routes.test.ts` | 검색어 `undefined` 타입, `digits` 규칙, 자기 칸 읽기, `parentTarget`·`replaceSearch`, 합 타입 주석, 예약 주소 주석, 시험 |
| `packages/shared/src/navigation.ts`·`navigation.test.ts` | `visibleTabs`, `mergeNavigation`, `parseMenu` 선형 시간 |
| `packages/shared/src/dashboard.ts`·`dashboard.test.ts` | `parseHome` 크기·빈 결과, `mergeHome` |
| `packages/shared/src/inbox.ts`·`inbox.test.ts` | 완료 종류 묶지 않기, 동작 0개 근거, uuid 키 |
| `packages/shared/src/index.ts` | `parentTarget`·`replaceSearch`·`visibleTabs`·`mergeNavigation`·`NavigationPatch` 내보내기 |
| `apps/server/src/spaFallback.ts` | 서버·서비스 워커 맞추는 법 차이와 같은 앞머리 네 곳(주석만) |
| `apps/game/messages/en.json` | 영어 문구 2개 |
| `docs/adr/2026-10-29-app-shell.md` | 검토 반영(위 표) |
| `docs/worklog/2026/10/29-2015-app-shell-stage0.md` | 0단계 기록의 틀린 곳 |
| `docs/worklog/2026/10/29-2100-app-shell-stage0-review.md`, `docs/WORKLOG.md` | 이 기록, 목차(`pnpm docs:index`) |

## 함께 바꿔야 하는 파일
- W1(화면 길·틀)
  - 화면 안 [뒤로]가 바로 연 주소에서 부모로 바꿀 때 `parentTarget(match)`를 쓴다. 지도 안 `?at=` 같은 제자리 바꾸기는 `replaceSearch`를 쓴다(`buildPath`로 다시 만들면 모르는 검색어가 빠진다).
  - 하단 탭은 `visibleTabs(설정)`으로 그린다. 메뉴 설정 저장은 `mergeNavigation(원래 값, 바꾼 칸)`.
  - 메뉴 표처럼 주소 ID가 값인 곳은 `RouteTarget`(`{ route: "units" }`)과 `targetPath`를 쓴다. 권한 없음은 `canOpenRoute`(`/admin`, `/dev`·`/dev/…`).
- W2(계정 설정): 기기·계정에 `nav`·`home`을 쓸 때 `mergeNavigation`·`mergeHome`을 쓴다(더 새 버전의 칸이 남는다).
- W3(처리할 일): 완료 종류는 묶지 않는다(시험이 막는다). 바로 처리 동작 수를 1 이상으로 검사하지 않는다(0~2개).
- W4(홈): 카드 저장은 `mergeHome`. `parseHome`은 크기가 틀린 아는 카드를 버리지 않고, 남는 카드가 없는 목록은 기본 카드로 읽는다.
- 화면이 아닌 경로 앞머리를 바꾸면 네 곳을 함께 고친다: `apps/server/src/spaFallback.ts`, `apps/game/vite.config.ts`, `scripts/pwa-build.mjs`, `packages/shared/src/routes.test.ts`.

## 건드리지 말 것
- 0단계 기록의 "건드리지 말 것"과 같다(주소 표 경로, 저장되는 ID, `packages/shared`의 지울 수 있는 문법·맨 위 코드 없음, `index.ts`에서 `dashboard.ts`·`inbox.ts`를 내보내지 않기).
- `digits` 상한을 15자리로 줄이지 않는다(셀 키 16자리).

## 미검증·TODO·알려진 문제
- 브라우저의 기록 바꾸기 횟수 제한(WebKit 30초에 약 100번, Chromium 10초에 약 200번)은 기억에 기댄 값이다(Assumed, 확인하지 않음). 6-3에서 `?at=`을 만들 때 확인한다.
- ADR 38 본문의 "예약: `/dev/:tool`"은 이 결정(도구마다 정적 줄)과 말이 다르다. 그 ADR을 고칠 때 맞춘다(행성 편집기 줄기).
- 계획 파일(저장소 밖)의 W1 통과 기준 2는 아직 `/admin`만 적었다. 통합 세션이 `/dev`도 넣는다.
- 기획에 물을 두 가지(`/economy/orders` 휴대폰 자리, `human_poaching` 분류)는 질문 파일에 아직 넣지 않았다. main에 들어온 기획 미러(원본 f0e0e71, main `8fca8a2`)에도 답이 없다(Verified: D-6039~D-6049와 60_UX 2.2 표를 찾아봄). 다음 기획 질문 묶음에 넣는다(통합 세션).
- 이 가지는 main `5b37544`에서 갈라졌다. main의 새 기획 미러는 ADR 37에 닿는 결정을 더 담았다: D-6044(게임 안 성인 인증 없음, 필요하면 로그인 웹 → 1절 성인 인증 줄), D-6042(정착 안내 목표 카드 = 처리할 일 종류), D-6045(홈 화면 추가·알림 안내 때 → 9절), D-6047(관리자 화면 4구역), D-6048(개발자 페이지 공통 틀), D-6049(결제는 상점 한 곳). 이 검토의 범위가 아니라 고치지 않았다. 기획 반영 줄기(`work/planning-f0e0e71`)나 통합 세션이 main 위로 옮긴 뒤 반영한다.
- 영어 문구는 화면에서 본 적이 없다(W1·W4가 `break-ui`로 본다).

## 사용자 결정 대기
- 없음.
