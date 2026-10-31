# 앱 뼈대 W3 합치기(처리할 일·종 배지·받은 편지 화면·돌아오면 요약)

- 일시: 2026-10-30 02:10 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-app-shell.md`(37) 6·7·8절, 머지 `af78803`(가지 `work/integrate-w3`), 작업 기록 `29-2240-app-shell-w3.md`·`30-0030-app-shell-w3-review.md`·`30-0140-app-shell-w125-integration.md`

## 한 일
- `work/app-shell-w3`(0단계 `507e645` 위, 커밋 16개)을 main `51ddd5f` 위에 합쳤다.
- 충돌 3곳(`apps/server/src/trpc/context.ts`·`createContext.ts`·`router.ts`)은 둘 다 남겼다. 편집기 서버(WP-B)가 먼저 main에 들어가서 겹쳤다.
  - 맥락: `planetEditor`(편집기)와 `home`(홈 자료) 칸을 둘 다 둔다. 홈 자료는 앱에 하나만 만든다(W3 그대로).
  - 맥락 만들기의 출처 확인(다른 사이트 요청은 FORBIDDEN, WP-B)은 그대로다. 홈 조회도 이 확인을 지난다.
  - 라우터: `planetEditor`·`inbox`·`summary`·`dashboard`.
- W3가 남긴 꽂는 줄 3곳을 W1 화면 틀에 붙였다(W3 고침 보고의 패치를 W1 고친 판에 손으로 옮김).
  - `shell/TopBar.tsx`: 종 배지 `useInboxBellCount()`.
  - `shell/Shell.tsx`: 메뉴 배지 `useInboxMenuBadges()`(빈 배지 상수 `NO_BADGES` 지움), 틀 밖에 `<ReturnSummary onNavigate={navigate} />`.
  - `shell/routeViews.tsx`: `/inbox` = `inbox/InboxScreen.tsx`(`?item=`, `navigate`, 제목 줄 끝 [뒤로]).
- W3 보고의 "W1 뒤에 할 일"
  - 분류 아이콘: `inbox/icons.tsx`의 그림 5개를 지우고 화면 틀 아이콘(`ui/icons.tsx`, 분류 ID와 같은 이름)을 쓴다. "그 밖의 알림"은 `bell`이다. 크기 규칙은 `.icon.inbox-icon`(두 칸 선택자)으로 바꿨다. 스타일 파일 순서와 상관없이 틀의 `.icon` 크기를 이긴다.
  - 폭 경계 시험: `shell/layout.test.ts`가 `summary/summary.css`의 미디어 쿼리도 본다. 루트 `vitest.config.ts`의 `css.include`에 넣었다.
  - 하지 않은 것: `followInApp` → `AppLink` 바꾸기(선택이라고 적힌 것). `sections/ComingSoon.tsx`의 `inbox` 줄은 이제 쓰이지 않지만 남겼다. 개발자 홈(WP-H)이 같은 파일을 고치는 중이라 그 가지를 합칠 때 함께 지운다.
- 시험 두 개를 합친 결과에 맞췄다.
  - `apps/server/src/trpc/planetEditorRouter.test.ts`: 직접 만든 맥락에 `home: createHomeServices()`(제공 함수 0개)를 넣었다(타입 오류).
  - `apps/game/src/inbox/InboxList.test.ts`: 아이콘 클래스가 `icon inbox-icon`이 됐다.
- 확인(Verified)
  - `pnpm check`: 시험 하나(위 InboxList)만 실패했다(1,632개 통과, 81개 건너뜀). 고친 뒤 관련 시험 8파일 83개 통과. 전체 `pnpm check`는 푸시 전 검사가 다시 돈다.
  - 화면 시험: 17개 모두 통과(2.4분, 기존 `e2e/shell.spec.ts`·`smoke.spec.ts`). W3 기능을 직접 보는 시험은 아직 없다(아래 TODO).
  - 첫 화면 JS: 126,188B(gzip 9단계, 파일 5개, 원본 409,811B) / 상한 131,416B. W2·W5·W1만일 때 123,416B(파일 2개)였다. 공용 조각(`react`·`runtime`·`jsx-runtime`·`schemas`)이 따로 나뉘어 미리 받는 파일이 늘었다.
- 배포: 앞 묶음(W2·W5·W1, main `51ddd5f`)은 CI 99에서 NAS에 올라갔다. 마이그레이션 적용·배포 점검 통과, 그 뒤 기기 오류 0건(Verified: 배포 작업 로그·`nas-metrics`, 기록 `30-0140`).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/trpc/context.ts`·`createContext.ts`·`router.ts` | 편집기·홈 자료 둘 다(충돌 풀기) |
| `apps/game/src/shell/Shell.tsx`·`TopBar.tsx`·`routeViews.tsx` | W3 꽂는 줄 |
| `apps/game/src/inbox/InboxList.tsx`·`icons.tsx`·`inbox.css` | 분류 아이콘을 틀 아이콘으로 |
| `apps/game/src/shell/layout.test.ts`, `vitest.config.ts` | summary.css 폭 경계 시험 |
| `apps/server/src/trpc/planetEditorRouter.test.ts`, `apps/game/src/inbox/InboxList.test.ts` | 합친 결과에 맞춤 |
| `docs/worklog/2026/10/30-0210-app-shell-w3-integration.md` | 이 기록 |

## 함께 바꿔야 하는 파일
- tRPC 맥락에 칸을 더하면 직접 맥락을 만드는 시험(`planetEditorRouter.test.ts`)도 함께 고친다(`createContextFactory`를 쓰는 시험은 그대로).
- 처리할 일 분류를 더하면 `ui/icons.tsx`에 같은 이름의 아이콘을 더한다(`InboxList.tsx`가 분류 ID로 고른다. 없으면 타입 오류).

## 건드리지 말 것
- 맥락 만들기의 출처 확인(`createContext.ts` 머리 주석, ADR 38 9절)은 홈 자료 때문에 느슨하게 하지 않는다.

## 미검증·TODO·알려진 문제
- W3 화면 확인 43개(고침 확인 35 + break-ui 8)는 W3 고침 단계가 저장소 밖 스크립트로 돌렸다(W1 고치기 전 판 `571d8a9`와 합친 복제본). 저장소 화면 시험(`e2e/inbox.spec.ts`)으로 옮기는 일을 따로 가지(`work/inbox-e2e`)에서 하는 중이다.
- 휴대폰·Safari·Firefox에서 보지 않았다(헤드리스 Chromium만).
- W4(홈 대시보드)는 다음 기록 `30-0220`에서 합쳤다. 이 기록의 W3 배포(CI 101)도 그 기록에 확인 결과가 있다(마이그레이션 없음, 배포 점검 통과, 기기 오류 0건).

## 사용자 결정 대기
- 없음.
