# PWA·인증 의존성 먼저 추가, 인증 ADR(제안), 아이디 로그인 조사 원본

- 일시: 2026-10-28 20:10 (KST)
- 작업 도구: Claude Code (클라우드 세션)
- 관련: ADR `2026-10-28-pwa-and-browser-baseline.md`(제안), `2026-10-28-auth-and-accounts.md`(제안), 조사 `docs/research/2026-10-28-username-login.md`

## 한 일
- PWA와 인증을 서브에이전트 둘이 동시에 만들 수 있게, 둘 다 쓰는 잠금 파일(`pnpm-lock.yaml`)을 먼저 한 번에 바꿨다. 이 커밋에는 코드 변경이 없다(의존성만).
  - 게임 앱: `vite-plugin-pwa` 2.0.0(개발 의존성), `workbox-window` 7.4.1.
  - 서버: `better-auth` 1.7.14, `@better-auth/drizzle-adapter` 1.7.14.
- 인증 ADR을 제안으로 썼다. 사용자 결정(2026-10-28)을 원문으로 남겼다.
- 아이디 로그인 조사 결과를 원본으로 남기고, 그 뒤의 사용자 결정을 끝에 덧붙였다.

## 확인 (Verified)
- npm(2026-10-28): 네 패키지 모두 최신 안정판, MIT. 가장 최근 공개는 `better-auth`·어댑터 1.7.14(2026-10-26) → `minimumReleaseAge`(하루) 통과.
- 잠금 파일: 패키지 423개 → 758개. 지워진 패키지 0개, 추가 335개(대부분 `workbox-build`가 쓰는 Babel·Rollup 계열, 게임 앱 개발 의존성).
  - 기존 항목 15줄은 Vite의 선택 peer(`terser`)가 생겨 이름 뒤 꼬리표만 바뀌었다.
- 설치 스크립트를 새로 허용할 패키지는 없다(`allowBuilds` 그대로).
- `glob@11.1.0` 사용 중단 경고 1건: `workbox-build` 7.4.1이 쓴다(빌드 때만, 기기·서버 실행에는 들어가지 않음).
- `drizzle-orm`은 1개 버전(1.0.0-rc.5)만 깔린다. Better Auth 어댑터도 같은 것을 쓴다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/package.json`, `apps/server/package.json`, `pnpm-lock.yaml` | 의존성 추가 |
| `docs/adr/2026-10-28-auth-and-accounts.md` | 인증 결정(제안) |
| `docs/research/2026-10-28-username-login.md` | 조사 원본 + 이후 사용자 결정 |

## 함께 바꿔야 하는 파일
- 두 ADR은 구현을 확인한 뒤 "확정"으로 바꾸고, `docs/PLAN.md` 13장 목록에 넣는다.

## 건드리지 말 것
- 이 의존성은 아직 코드에서 쓰지 않는다. 지우지 않는다(다음 작업이 쓴다).

## 미검증·TODO·알려진 문제
- PWA 플러그인이 Vite 8.3.5에서 실제로 빌드되는지는 다음 작업(PWA)에서 확인한다.
- Better Auth가 TS 7.0.2에서 타입 검사를 통과하는지는 다음 작업(인증)에서 확인한다(Unknown).

## 사용자 결정 대기
- 없음. 아이디 글자 규칙은 사용자가 고르지 않아 영문·숫자·_ 3~20자로 정했다(ADR 이유 참조). 바꾸려면 말해 달라.
