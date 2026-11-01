# 첫 화면 JS 줄이기: zod(메시지 스키마)를 첫 화면에서 뺌

- 일시: 2026-11-01 13:45 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-10-29-app-shell.md` 11절(이번에 "첫 화면 줄이기" 항목을 더함). 가지 `work/bundle-slim`(origin/main `5981da7`에서)

## 한 일
- 왜: `pnpm check:bundle`이 131,145B / 상한 131,416B(남음 271B)라 새 화면마다 CI가 깨질 수 있었다. 상한을 올리지 않고 첫 화면이 실제로 받는 JS를 줄였다.
- 소스 맵으로 본 것(Verified: 빌드 소스 맵을 원본 파일별 바이트로 나눠 봄, 스크립트는 저장소 밖 임시 폴더)
  - 첫 화면 9파일 중 `schemas-*.js` 24,526B(gzip 9단계)가 zod 전부였다(`core/schemas` 22KB·`classic/schemas` 12KB·`to-json-schema`+`json-schema-processors` 15KB 등, 원본 86,854B).
  - zod가 첫 화면에 온 길은 둘이다.
    1. 텔레메트리 보고(`telemetry/reporter.ts`)가 `@terra/protocol`의 `TELEMETRY_LIMITS`·`TELEMETRY_PATHS`·`clip`만 쓰는데, 이 값이 스키마와 한 파일(`telemetry.ts`)에 있어 맨 위의 `z.object(…)`가 남았다.
    2. 서버 연결(`net/connection.ts`)이 받은 메시지를 `decodeServerMessage`(메시지 스키마 전체 + zod)로 검사한다. 연결은 `main.tsx` → `net/connectionStatus.ts`가 정적으로 가져왔다.
  - 나머지(react-dom 약 203KB 원본, 틀·로그인 화면, 메시지 147개 약 15KB 원본, 주소 표 2,002B)는 첫 그리기에 쓰여서 두었다.
- 바꾼 것
  - `@terra/protocol`: zod 없는 값을 따로 된 파일로 뺐다(`errors.ts`를 뺀 것과 같은 까닭). 텔레메트리 상한·경로·자르기 → `telemetryLimits.ts`, 보내기 `encodeMessage` → `encode.ts`. `index.ts`는 이 두 파일에서 바로 내보내고, `telemetry.ts`·`codec.ts`는 같은 이름을 다시 내보낸다(기존 import 그대로). 형식·검사·이름은 그대로다(프로토콜 판 그대로).
  - `encode.ts`를 뺀 까닭: 기능 통로(`net/serverLink.ts`, 첫 화면)가 `encodeMessage`를 쓰고 지연 조각이 같은 파일의 `decodeServerMessage`를 쓰면, 조각이 파일 단위로 나뉘어 `codec.ts`째(→ 스키마 → zod) 첫 화면에 들어온다(Verified: 나누기 전 빌드).
  - 기기: 연결 모듈을 시작할 때 동적으로 받는다. `net/lazyConnection.ts`(새 파일)가 `connection.ts`의 `connect`와 같은 모양의 함수를 주고, 연결 상태 저장소(`connectionStatus.ts`)가 원래 넣던 자리(`deps.connect`)에 그것을 넣는다. 새로고침 전 정상 종료(`closeForReload`)는 `connectionStatus.ts`가 내보내고 `pwa/updates.ts`가 그쪽을 가져온다. `connection.ts`의 연결 동작(인사·시계·다시 연결·메시지 검사)은 고치지 않았다(주석만).
- 결과(Verified: `pnpm build` 뒤 `pnpm check:bundle`)

| | 첫 화면 JS(gzip 9단계) | 파일 | 원본 |
|---|---|---|---|
| 전(origin/main `5981da7`) | 131,145B | 9 | 421,146B |
| 뒤 | 104,014B | 8 | 327,484B |

  - 상한 131,416B는 그대로다. 남음 27,402B(전 271B). 상한을 낮추지 않았다.
  - 뒤 파일: `index` 95,227(전 97,617) · `react` 3,124 · `utf8` 210 · `settings` 509 · `json` 134 · `session` 1,665 · `routes` 2,002 · `reporter` 1,143(전 1,358). `schemas`(zod)는 빠졌다.
  - 옮겨 간 모듈(첫 화면 → 지연 조각): zod 전체, `protocol/src/{messages,codec,cyborg,secondMap,version}.ts`, `shared/src/clock.ts`, `net/connection.ts`. 남은 프로토콜 모듈은 `encode.ts`(40B)·`telemetryLimits.ts`(159B)뿐이다.
- 연결 조각 묶음: 시작할 때 `connection` 2,131B + `errors` 24,557B(zod. rolldown이 zod `core/errors.js` 이름을 붙였다, 프로토콜 `errors.ts`와 무관) + `secondMap` 1,041B = 27,729B(gzip 9단계)를 동적으로 받는다(index.html의 modulepreload가 아니다. 세 조각은 Vite가 한꺼번에 받는다). 그래서 첫 그리기(첫 화면 조각 받기·읽기·실행)는 zod를 기다리지 않지만, 켤 때 받는 전체 바이트는 거의 같다(약 +600B: 27,729 − 27,131). 세 조각 모두 미리 캐시에 든다(Verified: 빌드한 `sw.js`).
- 동작
  - 연결은 연결 조각을 받은 뒤 열린다(전: 시작하자마자). 받는 동안 연결 상태는 저장소 처음 값 "연결 중" 그대로이고, 2초 연결 줄 타이머도 전처럼 시작 때부터 센다. 그 뒤(인사·시계·다시 연결·거절 → 새 버전)는 같다.
  - 받기에 실패하면 Vite가 `vite:preloadError`를 내서 기존 처리(`pwa/updates.ts` `forceUpdate("auto")`, 새 버전 찾기·새로고침)가 돈다. 그 사이 연결이 열리지 않은 채 남지 않게 다시 연결과 같은 간격(500ms에서 두 배씩, 상한 15초)으로 다시 받는다.
  - 받기 전에 새로고침(`closeForReload`)하면 연결을 열지 않는다. 받은 뒤면 `connection.ts`의 정상 종료(1000)를 그대로 부른다.
  - 로그인 사용자가 바뀌면 다시 맺는 규칙(`serverLink.followIdentity`)은 붙은 연결이 없으면 아무것도 하지 않는다(전과 같다). 연결이 늦게 열리면 그때의 쿠키로 연다.
- 시험: `net/lazyConnection.test.ts` 6개 — 받은 뒤 같은 인자로 연결·멈춤, 받기 전 멈춤·새로고침이면 연결 안 함, 받은 뒤 새로고침은 정상 종료, 실패하면 500·1,000·…·15,000ms로 다시 받고 받으면 연결, 기다리는 중 멈추면 타이머를 지움.
- 검사 결과
  - `TEST_DATABASE_URL=… pnpm check` 통과(시험 파일 306·시험 2,623, DB 시험 포함).
  - `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 104,014B ✓.
  - `TEST_DATABASE_URL=… pnpm e2e` 전체: 197 통과·1 건너뜀(`E2E_MEASURE=1` 측정 시험), 15.4분. 다시 돌린 시험 없음. 연결을 쓰는 시험(2차맵·시야·사이보그 만들기·첫 접속, `vision.spec.ts`의 `routeWebSocket` 가로채기)도 통과. 서버 거절(protocol_unsupported) → 새 버전 길은 화면 시험이 없다(연결 단위 시험 `connection.test.ts`는 그대로 통과)

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/protocol/src/telemetryLimits.ts`(새 파일) | 텔레메트리 상한·경로·`clip` — 기기 보고 모듈이 zod 없이 쓰게 |
| `packages/protocol/src/telemetry.ts` | 상한을 위 파일에서 가져와 스키마만 둠, 같은 이름 다시 내보냄 |
| `packages/protocol/src/encode.ts`(새 파일) | `encodeMessage`(JSON) — 기능 통로가 스키마 없이 보내게 |
| `packages/protocol/src/codec.ts` | `encodeMessage`를 위 파일에서 다시 내보냄, 머리 주석 |
| `packages/protocol/src/index.ts` | zod 없는 값을 새 두 파일에서 바로 내보냄 |
| `apps/game/src/net/lazyConnection.ts`(새 파일)·`lazyConnection.test.ts` | 연결 모듈을 받은 뒤 연결, 새로고침·멈춤·다시 받기 |
| `apps/game/src/net/connectionStatus.ts` | 저장소의 `connect`에 지연 연결을 넣음, `closeForReload` 내보냄 |
| `apps/game/src/pwa/updates.ts` | `closeForReload`를 `connectionStatus.ts`에서 가져옴(정적 import가 연결 모듈을 첫 화면에 넣지 않게) |
| `apps/game/src/net/connection.ts` | 주석만(정적으로 가져오지 말 것) |
| `docs/adr/2026-10-29-app-shell.md` | 11절에 "첫 화면 줄이기" 항목 |

## 함께 바꿔야 하는 파일
- `net/connection.ts`는 값으로 정적 import하지 않는다(타입만). 가져오면 메시지 스키마와 zod가 첫 화면에 돌아온다(약 +27KB). 연결 모듈의 새 값이 필요하면 `lazyConnection.ts`의 `ConnectionModule`에 더한다.
- 첫 화면 모듈이 `@terra/protocol`에서 새 값을 가져오면 그 값이 든 파일이 zod를 쓰지 않는지 본다(`pnpm check:bundle`의 파일 목록에 `errors-*`·`schemas-*` 같은 zod 조각이 다시 보이면 소스 맵부터).
- 메시지 형식을 MessagePack으로 바꾸면 `codec.ts`(읽기)와 `encode.ts`(보내기) 둘을 함께 고친다.

## 건드리지 말 것
- 상한(`apps/game/bundle-budget.json` 131,416B)은 그대로 두었다. 낮추려면 사용자와 정한다.
- zod 조각 이름(지금 `errors-*.js`)은 rolldown이 정한다. 미리 캐시 규칙(`vite.config.ts` `globIgnores`, `scripts/pwa-build.mjs`)에 이 이름을 넣지 않는다.

## 미검증·TODO·알려진 문제
- 휴대폰에서 첫 그리기 시간·연결이 열리는 시각은 재지 않았다(Unknown). 연결 조각을 받는 시간만큼 연결이 늦게 열릴 수 있다(첫 방문, 미리 캐시 전). 헤드리스 화면 시험으로만 봤다.
- 실패한 동적 import를 브라우저가 다시 받는지(모듈 맵이 실패를 기억하는지)는 브라우저마다 확인하지 않았다(Unknown). 다시 받지 못하면 `vite:preloadError` 길(새 버전 찾기·새로고침)이 맡는다.

## 사용자 결정 대기
- 상한을 낮춰 이번에 줄인 몫을 묶을지(지금은 그대로, 남음 27,402B).
