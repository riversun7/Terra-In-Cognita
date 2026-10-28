# M0 골격의 검사·빌드 도구 구성

- 상태: 확정 (일부 대체됨: 2026-10-28-trpc-type-sharing.md — 모듈 경계 검사: 타입 전용 의존은 소스의 import 형태도 검사)
- 날짜: 2026-10-28
- 관련: PLAN 3장·4.1·10.2·10.4, `2026-10-28-dev-workflow.md`(모듈 경계 도구 부분을 대체), `2026-10-28-stack-baseline.md`, `2026-10-28-i18n.md`

## 배경
M0 골격을 실제로 만들어 보니 계획서의 도구 몇 가지가 맞지 않거나, 더 단순한 방법이 있었다.

## 선택지
- 모듈 경계: dependency-cruiser / **자체 검사 스크립트 + pnpm 엄격 의존성**
- 메시지 위치: `packages/i18n` / **`apps/game/messages`**
- 커밋 훅의 비밀값 검사: gitleaks 바이너리 / **자체 스크립트(훅) + gitleaks(CI)**
- 서버 빌드: tsc로 패키지별 빌드 / **Vite SSR 빌드 한 번**

## 결정
| 항목 | 계획서 | 결정 |
|---|---|---|
| 모듈 경계 검사 | dependency-cruiser | `scripts/check-boundaries.mjs`가 package.json의 내부 패키지 의존을 허용 목록과 비교하고, `packages/sim`의 결정성 금지 API(Math.random, Date.now, 초월함수)를 검사. 깊은 경로 import는 패키지 `exports`로 막는다 |
| 메시지(다국어) | `packages/i18n` | `apps/game/messages/{ko,en}.json`. ko·en 키와 `{변수}` 일치는 `scripts/check-i18n.mjs` |
| Paraglide 플러그인 | — | `@inlang/plugin-message-format`를 개발 의존성으로 설치해 로컬 경로로 불러온다(CDN 미사용) |
| 커밋 훅 비밀값 | gitleaks | `scripts/check-secrets.mjs`(흔한 형태만). 저장소 전체 이력은 CI의 gitleaks 8.30.1(Docker 이미지) |
| 서버 빌드 | — | Vite SSR 빌드로 `dist/main.js` 하나. `@terra/*`·zod는 묶고, fastify 계열은 node_modules에서 읽는다. 운영 이미지는 `pnpm deploy --prod` |
| 공급망 보호 | — | pnpm `minimumReleaseAge: 1440`(공개 1일 미만 버전 설치 안 함), 설치 스크립트는 `allowBuilds` 목록만 |
| 포맷 범위 | Biome 전체 | Markdown 제외 |

## 이유
- dependency-cruiser는 골격에서 시험했을 때 작업공간 패키지 import를 해석하지 못했다(Verified: 실행 결과). TS 7에 JS 컴파일러 API가 없어서로 보인다(Assumed). pnpm은 package.json에 적지 않은 패키지를 import하면 찾지 못하므로(Verified: pnpm 엄격 node_modules 구조), package.json을 검사하면 실제 의존 그래프를 검사하는 셈이다.
- 메시지를 쓰는 곳은 게임 앱 하나다. 서버는 문장 대신 코드를 보낸다(i18n ADR). 패키지를 따로 두면 설정만 늘어난다.
- Paraglide 기본 설정은 플러그인을 CDN(jsdelivr)에서 받는다(Verified: paraglide-js 2.29.2 `dist/cli/defaults.js`). 빌드가 외부 CDN 상태에 흔들리지 않게 로컬로 고정한다.
- gitleaks는 npm 패키지가 아니라 기기마다 따로 설치해야 한다. 커밋 훅은 설치 없이 돌아야 에이전트가 우회하지 않는다.
- Vite SSR 빌드를 쓰면 내부 패키지를 따로 빌드할 필요가 없고, 게임 앱과 같은 빌드 도구를 쓴다.
- 악성 패키지 버전은 보통 공개 직후 발견돼 내려간다(Assumed). 하루 지연은 개발에 지장이 거의 없다. 이 규칙 때문에 oxlint는 1.90 대신 1.89.0으로 고정했다(1.90은 공개 1일 미만이었음, Verified: 2026-10-28 설치).
- Biome가 Markdown까지 포맷하면 보호 문서(DECISION_LOG, ADR)가 바뀐다(Verified: 골격 작업 중 27개 파일이 바뀌어 되돌렸다).

## 결과
- dev-workflow ADR의 "모듈 경계는 dependency-cruiser로" 항목은 이 ADR로 대체된다.
- 새 패키지를 만들면 `scripts/check-boundaries.mjs`의 `ALLOWED` 표에 넣어야 검사를 통과한다(빠뜨리면 실패하도록 했다).
- `packages/sim`의 DOM 금지는 그 패키지의 tsconfig `lib`에서 DOM을 빼서 지킨다(패키지를 만들 때).
- 커밋 훅의 비밀값 검사는 흔한 형태만 잡는다. 놓친 것은 CI의 gitleaks가 잡는다.
